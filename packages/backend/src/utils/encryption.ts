import crypto from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * Ciphertext format: `v<version>:iv:tag:content` (all but version base64).
 * Legacy ciphertext written before key rotation support has no version
 * prefix — `iv:tag:content` — and is always version 0, since it predates
 * every rotation and was encrypted with the oldest key in the history.
 */
const VERSIONED_FORMAT = /^v(\d+):([^:]+):([^:]+):([^:]+)$/;

/**
 * Utility for AES-256-GCM encryption/decryption with key rotation support
 * (issue #385): the current key encrypts new values; previous keys remain
 * available so already-encrypted data keeps decrypting after a rotation.
 */
export class EncryptionUtils {
  /**
   * Index 0 is the current (encrypting) key; later entries are previous
   * keys, most-recently-retired first. Version numbers increase with age
   * of rotation: version 0 is the oldest key (`keys[keys.length - 1]`),
   * `currentVersion` is the newest (`keys[0]`).
   */
  private readonly keys: Buffer[];

  constructor(encryptionKey: string, previousKeys: string[] = []) {
    if (!encryptionKey) {
      throw new Error('Encryption key is required');
    }

    this.keys = [encryptionKey, ...previousKeys].map((key) =>
      crypto.scryptSync(key, 'traqora-salt', KEY_LENGTH),
    );
  }

  /** The version of the key currently used for new encryptions. */
  get currentVersion(): number {
    return this.keys.length - 1;
  }

  private keyForVersion(version: number): Buffer | undefined {
    return this.keys[this.keys.length - 1 - version];
  }

  /**
   * Encrypts a string with the current key.
   * Output format: v<version>:iv:tag:content (base64)
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.keys[0], iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag();
    const version = this.currentVersion;

    this.audit('encrypt', version, true);

    return `v${version}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypts a string. Resolves the key version from the ciphertext prefix
   * when present (post-rotation format); legacy `iv:tag:content` ciphertext
   * (written before rotation support existed) is always version 0.
   */
  decrypt(encryptedText: string): string {
    const versioned = VERSIONED_FORMAT.exec(encryptedText);

    let version: number;
    let ivBase64: string;
    let tagBase64: string;
    let contentBase64: string;

    if (versioned) {
      version = Number(versioned[1]);
      [, , ivBase64, tagBase64, contentBase64] = versioned;
    } else {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        if (!encryptedText.includes(':')) {
          // Not encrypted at all — pass through for transition periods.
          return encryptedText;
        }
        this.audit('decrypt', null, false);
        throw new Error('Invalid encrypted text format');
      }
      [ivBase64, tagBase64, contentBase64] = parts;
      version = 0;
    }

    const key = this.keyForVersion(version);
    if (!key) {
      this.audit('decrypt', version, false);
      throw new Error(`No encryption key available for version ${version}`);
    }

    try {
      const iv = Buffer.from(ivBase64, 'base64');
      const tag = Buffer.from(tagBase64, 'base64');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

      decipher.setAuthTag(tag);

      let decrypted = decipher.update(contentBase64, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      this.audit('decrypt', version, true);

      return decrypted;
    } catch (error) {
      this.audit('decrypt', version, false);
      throw error;
    }
  }

  /**
   * Structured audit log for every encrypt/decrypt call (issue #385).
   * Never logs the plaintext or ciphertext value — only metadata about
   * the operation — so this is safe to ship to centralized logging
   * (the existing Loki stack under monitoring/) as a real audit trail.
   */
  private audit(operation: 'encrypt' | 'decrypt', keyVersion: number | null, success: boolean): void {
    logger.debug('encryption audit', {
      operation,
      keyVersion,
      success,
      at: new Date().toISOString(),
    });
  }
}

// Singleton instance for use in TypeORM transformers
let instance: EncryptionUtils | null = null;

/**
 * Reads the current key from ENCRYPTION_KEY and any previous keys from
 * ENCRYPTION_KEY_PREVIOUS (comma-separated, most-recently-retired first)
 * so ciphertext encrypted before a rotation keeps decrypting. To rotate:
 * prepend the old ENCRYPTION_KEY value to ENCRYPTION_KEY_PREVIOUS, set
 * ENCRYPTION_KEY to a newly generated key, and restart the service.
 */
export const getEncryptionUtils = (key?: string) => {
  if (!instance) {
    const finalKey = key || process.env.ENCRYPTION_KEY;
    if (!finalKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    const previousKeys = (process.env.ENCRYPTION_KEY_PREVIOUS || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    instance = new EncryptionUtils(finalKey, previousKeys);
  }
  return instance;
};

/** Test hook: force re-reading ENCRYPTION_KEY / ENCRYPTION_KEY_PREVIOUS on next call. */
export const __resetEncryptionUtilsForTesting = () => {
  instance = null;
};

/**
 * TypeORM transformer for automatic encryption/decryption
 */
export const encryptionTransformer = {
  to: (value: string | null | undefined): string | null | undefined => {
    if (!value) return value;
    return getEncryptionUtils().encrypt(value);
  },
  from: (value: string | null | undefined): string | null | undefined => {
    if (!value) return value;
    return getEncryptionUtils().decrypt(value);
  },
};
