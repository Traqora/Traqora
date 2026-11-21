// @ts-ignore
import {
  challengeSchema,
  verifySchema,
  refreshSchema,
} from '../../src/api/schemas/index';

describe('Authentication Schema Contract Tests', () => {
  describe('challengeSchema', () => {
    it('should accept valid Stellar public key (56 chars, starts with G)', () => {
      const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
      const result = challengeSchema.safeParse({ walletAddress: validWallet });
      expect(result.success).toBe(true);
    });

    it('should reject wallet address shorter than 56 characters', () => {
      const shortWallet = 'GABCDEFGHIJKLMN';
      const result = challengeSchema.safeParse({ walletAddress: shortWallet });
      expect(result.success).toBe(false);
    });

    it('should reject wallet address longer than 56 characters', () => {
      const longWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZAB';
      const result = challengeSchema.safeParse({ walletAddress: longWallet });
      expect(result.success).toBe(false);
    });

    it('should reject wallet address not starting with G', () => {
      const invalidPrefix = 'AABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
      const result = challengeSchema.safeParse({ walletAddress: invalidPrefix });
      expect(result.success).toBe(false);
    });

    it('should reject empty wallet address', () => {
      const result = challengeSchema.safeParse({ walletAddress: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing walletAddress field', () => {
      const result = challengeSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject null walletAddress', () => {
      const result = challengeSchema.safeParse({ walletAddress: null });
      expect(result.success).toBe(false);
    });

    it('should reject non-string walletAddress', () => {
      const result = challengeSchema.safeParse({ walletAddress: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject walletAddress with special characters', () => {
      const invalidChars = 'GABC@#$%^&*()OPQRSTUVWXYZABCDEFGHIJKLMN';
      const result = challengeSchema.safeParse({ walletAddress: invalidChars });
      expect(result.success).toBe(false);
    });

    it('should accept walletAddress with exactly 56 G-prefixed characters', () => {
      const exactLength = 'G' + 'A'.repeat(55);
      const result = challengeSchema.safeParse({ walletAddress: exactLength });
      expect(result.success).toBe(true);
    });
  });

  describe('verifySchema', () => {
    const validWallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';

    it('should accept valid verify payload', () => {
      const result = verifySchema.safeParse({
        walletAddress: validWallet,
        signature: 'abcdef123456',
        walletType: 'freighter',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid wallet types', () => {
      const walletTypes = ['freighter', 'albedo', 'rabet'] as const;
      walletTypes.forEach((walletType) => {
        const result = verifySchema.safeParse({
          walletAddress: validWallet,
          signature: 'test_signature',
          walletType,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid wallet type', () => {
      const result = verifySchema.safeParse({
        walletAddress: validWallet,
        signature: 'test_signature',
        walletType: 'invalid_wallet',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing walletAddress', () => {
      const result = verifySchema.safeParse({
        signature: 'test_signature',
        walletType: 'freighter',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing signature', () => {
      const result = verifySchema.safeParse({
        walletAddress: validWallet,
        walletType: 'freighter',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing walletType', () => {
      const result = verifySchema.safeParse({
        walletAddress: validWallet,
        signature: 'test_signature',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty signature', () => {
      const result = verifySchema.safeParse({
        walletAddress: validWallet,
        signature: '',
        walletType: 'freighter',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid walletAddress in verifySchema', () => {
      const result = verifySchema.safeParse({
        walletAddress: 'INVALID',
        signature: 'test_signature',
        walletType: 'freighter',
      });
      expect(result.success).toBe(false);
    });

    it('should accept signature with length 1', () => {
      const result = verifySchema.safeParse({
        walletAddress: validWallet,
        signature: 'a',
        walletType: 'freighter',
      });
      expect(result.success).toBe(true);
    });

    it('should accept long signature', () => {
      const longSignature = 'a'.repeat(1000);
      const result = verifySchema.safeParse({
        walletAddress: validWallet,
        signature: longSignature,
        walletType: 'albedo',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('refreshSchema', () => {
    it('should accept valid refresh token', () => {
      const result = refreshSchema.safeParse({
        refreshToken: 'valid_refresh_token_12345',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty refresh token', () => {
      const result = refreshSchema.safeParse({ refreshToken: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing refreshToken field', () => {
      const result = refreshSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject null refreshToken', () => {
      const result = refreshSchema.safeParse({ refreshToken: null });
      expect(result.success).toBe(false);
    });

    it('should accept JWT-like refresh token', () => {
      const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test';
      const result = refreshSchema.safeParse({ refreshToken: jwtToken });
      expect(result.success).toBe(true);
    });

    it('should accept long refresh token', () => {
      const longToken = 'a'.repeat(500);
      const result = refreshSchema.safeParse({ refreshToken: longToken });
      expect(result.success).toBe(true);
    });

    it('should reject non-string refreshToken', () => {
      const result = refreshSchema.safeParse({ refreshToken: 12345 });
      expect(result.success).toBe(false);
    });

    it('should reject undefined refreshToken', () => {
      const result = refreshSchema.safeParse({ refreshToken: undefined });
      expect(result.success).toBe(false);
    });
  });
});
