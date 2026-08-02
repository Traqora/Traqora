import { EncryptionUtils, getEncryptionUtils, __resetEncryptionUtilsForTesting } from '../../src/utils/encryption';
import { logger } from '../../src/utils/logger';

describe('EncryptionUtils (issue #385)', () => {
  describe('basic encrypt/decrypt', () => {
    const utils = new EncryptionUtils('test-key-one-at-least-32-chars!!');

    it('round-trips a plaintext string', () => {
      const ciphertext = utils.encrypt('sensitive-passport-number');
      expect(utils.decrypt(ciphertext)).toBe('sensitive-passport-number');
    });

    it('produces ciphertext tagged with the current key version', () => {
      const ciphertext = utils.encrypt('hello');
      expect(ciphertext).toMatch(/^v0:/);
    });

    it('produces different ciphertext for the same plaintext (random IV)', () => {
      const a = utils.encrypt('same-value');
      const b = utils.encrypt('same-value');
      expect(a).not.toBe(b);
    });

    it('passes through plaintext that was never encrypted', () => {
      expect(utils.decrypt('plain-unencrypted-value')).toBe('plain-unencrypted-value');
    });

    it('throws on malformed ciphertext-shaped input', () => {
      expect(() => utils.decrypt('a:b')).toThrow('Invalid encrypted text format');
    });
  });

  describe('legacy (pre-rotation) ciphertext compatibility', () => {
    it('still decrypts iv:tag:content ciphertext with no version prefix', () => {
      const utils = new EncryptionUtils('legacy-key-at-least-32-characters');
      // Simulate ciphertext written by the pre-#385 implementation: no `v0:` prefix.
      const versioned = utils.encrypt('legacy-value');
      const legacyForm = versioned.replace(/^v0:/, '');
      expect(utils.decrypt(legacyForm)).toBe('legacy-value');
    });
  });

  describe('key rotation', () => {
    const OLD_KEY = 'old-key-at-least-32-characters!!';
    const NEW_KEY = 'new-key-at-least-32-characters!!';

    it('decrypts data encrypted under a previous key after rotation', () => {
      const before = new EncryptionUtils(OLD_KEY);
      const oldCiphertext = before.encrypt('data-from-before-rotation');

      const after = new EncryptionUtils(NEW_KEY, [OLD_KEY]);
      expect(after.decrypt(oldCiphertext)).toBe('data-from-before-rotation');
    });

    it('encrypts new data under the current key after rotation', () => {
      const after = new EncryptionUtils(NEW_KEY, [OLD_KEY]);
      const newCiphertext = after.encrypt('data-after-rotation');

      expect(newCiphertext).toMatch(/^v1:/); // version bumped: 2 keys → current is v1
      expect(after.decrypt(newCiphertext)).toBe('data-after-rotation');
    });

    it('supports multiple rotations, keeping every historical key decryptable', () => {
      const v0 = new EncryptionUtils('key-v0-at-least-32-characters!!');
      const ciphertextV0 = v0.encrypt('oldest-value');

      const v1 = new EncryptionUtils('key-v1-at-least-32-characters!!', ['key-v0-at-least-32-characters!!']);
      const ciphertextV1 = v1.encrypt('middle-value');

      const v2 = new EncryptionUtils('key-v2-at-least-32-characters!!', [
        'key-v1-at-least-32-characters!!',
        'key-v0-at-least-32-characters!!',
      ]);

      expect(v2.decrypt(ciphertextV0)).toBe('oldest-value');
      expect(v2.decrypt(ciphertextV1)).toBe('middle-value');

      const newest = v2.encrypt('newest-value');
      expect(newest).toMatch(/^v2:/);
      expect(v2.decrypt(newest)).toBe('newest-value');
    });

    it('rejects decryption when the ciphertext references a version this instance never held', () => {
      // Ciphertext claims key version 5, but this instance only has one key
      // (version 0) — the array index is out of range, which must surface
      // as a clear configuration error rather than an obscure crash.
      const utils = new EncryptionUtils('single-key-at-least-32-characters');
      const forgedCiphertext = 'v5:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA';
      expect(() => utils.decrypt(forgedCiphertext)).toThrow(/No encryption key available for version 5/);
    });

    it('rejects decryption with wrong-key auth failure when a key was rotated out without keeping history', () => {
      const v0 = new EncryptionUtils('missing-key-at-least-32-chars!!!');
      const ciphertext = v0.encrypt('will-be-orphaned');

      // Rotated without keeping the old key in history — data is unrecoverable.
      // AES-GCM's auth tag correctly rejects the wrong key rather than
      // silently returning garbage plaintext.
      const v1NoHistory = new EncryptionUtils('another-key-at-least-32-chars!!');
      expect(() => v1NoHistory.decrypt(ciphertext)).toThrow();
    });
  });

  describe('audit logging', () => {
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
      debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => logger);
    });

    afterEach(() => {
      debugSpy.mockRestore();
    });

    it('logs a structured audit entry on encrypt, without the plaintext', () => {
      const utils = new EncryptionUtils('audit-key-at-least-32-characters');
      utils.encrypt('super-secret-ssn');

      expect(debugSpy).toHaveBeenCalledWith(
        'encryption audit',
        expect.objectContaining({ operation: 'encrypt', keyVersion: 0, success: true }),
      );

      const loggedPayload = JSON.stringify(debugSpy.mock.calls[0]);
      expect(loggedPayload).not.toContain('super-secret-ssn');
    });

    it('logs a structured audit entry on decrypt, without the ciphertext or plaintext', () => {
      const utils = new EncryptionUtils('audit-key-at-least-32-characters');
      const ciphertext = utils.encrypt('another-secret');
      debugSpy.mockClear();

      utils.decrypt(ciphertext);

      expect(debugSpy).toHaveBeenCalledWith(
        'encryption audit',
        expect.objectContaining({ operation: 'decrypt', keyVersion: 0, success: true }),
      );
      const loggedPayload = JSON.stringify(debugSpy.mock.calls[0]);
      expect(loggedPayload).not.toContain('another-secret');
      expect(loggedPayload).not.toContain(ciphertext);
    });

    it('logs a failed audit entry when decryption fails', () => {
      const utils = new EncryptionUtils('audit-key-at-least-32-characters');
      expect(() => utils.decrypt('a:b:c')).toThrow();

      expect(debugSpy).toHaveBeenCalledWith(
        'encryption audit',
        expect.objectContaining({ operation: 'decrypt', success: false }),
      );
    });
  });

  describe('getEncryptionUtils singleton wiring', () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    const originalPrevious = process.env.ENCRYPTION_KEY_PREVIOUS;

    afterEach(() => {
      process.env.ENCRYPTION_KEY = originalKey;
      process.env.ENCRYPTION_KEY_PREVIOUS = originalPrevious;
      __resetEncryptionUtilsForTesting();
    });

    it('reads ENCRYPTION_KEY_PREVIOUS as a comma-separated rotation history', () => {
      __resetEncryptionUtilsForTesting();
      process.env.ENCRYPTION_KEY = 'singleton-current-key-32-chars!!';
      process.env.ENCRYPTION_KEY_PREVIOUS = 'singleton-old-key-at-32-chars!!!, singleton-older-key-32-chars!!';

      const utils = getEncryptionUtils();
      expect(utils.currentVersion).toBe(2); // current + 2 previous keys
    });
  });
});
