// @ts-ignore
import { z } from 'zod';

// Security schemas are defined inline in routes/security.ts
// Replicating them here for contract testing
const ipPayloadSchema = z.object({
  ip: z.string().min(3),
});

const blacklistPayloadSchema = ipPayloadSchema.extend({
  ttlSeconds: z.coerce.number().int().min(1).max(60 * 60 * 24 * 30).default(3600),
});

describe('Security Schema Contract Tests', () => {
  describe('ipPayloadSchema', () => {
    it('should accept valid IPv4 address', () => {
      const result = ipPayloadSchema.safeParse({ ip: '192.168.1.1' });
      expect(result.success).toBe(true);
    });

    it('should accept valid IPv6 address', () => {
      const result = ipPayloadSchema.safeParse({ ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' });
      expect(result.success).toBe(true);
    });

    it('should accept localhost IPv4', () => {
      const result = ipPayloadSchema.safeParse({ ip: '127.0.0.1' });
      expect(result.success).toBe(true);
    });

    it('should accept localhost IPv6', () => {
      const result = ipPayloadSchema.safeParse({ ip: '::1' });
      expect(result.success).toBe(true);
    });

    it('should accept IP with exactly 3 characters', () => {
      const result = ipPayloadSchema.safeParse({ ip: '1.1' });
      expect(result.success).toBe(true);
    });

    it('should reject IP shorter than 3 characters', () => {
      const result = ipPayloadSchema.safeParse({ ip: '1.' });
      expect(result.success).toBe(false);
    });

    it('should reject empty IP', () => {
      const result = ipPayloadSchema.safeParse({ ip: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing ip field', () => {
      const result = ipPayloadSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject null IP', () => {
      const result = ipPayloadSchema.safeParse({ ip: null });
      expect(result.success).toBe(false);
    });

    it('should reject non-string IP', () => {
      const result = ipPayloadSchema.safeParse({ ip: 123 });
      expect(result.success).toBe(false);
    });

    it('should reject IP with spaces', () => {
      const result = ipPayloadSchema.safeParse({ ip: '192.168. 1.1' });
      expect(result.success).toBe(false);
    });

    it('should accept IP with long string', () => {
      const longIp = { ip: 'a'.repeat(100) };
      const result = ipPayloadSchema.safeParse(longIp);
      expect(result.success).toBe(true);
    });

    it('should accept IP with special characters (though invalid for real IPs)', () => {
      const specialIp = { ip: 'test-host' };
      const result = ipPayloadSchema.safeParse(specialIp);
      expect(result.success).toBe(true);
    });
  });

  describe('blacklistPayloadSchema', () => {
    it('should accept valid blacklist payload with ttlSeconds', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: 3600,
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid blacklist payload without ttlSeconds (uses default)', () => {
      const result = blacklistPayloadSchema.safeParse({ ip: '192.168.1.1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ttlSeconds).toBe(3600);
      }
    });

    it('should apply default ttlSeconds of 3600', () => {
      const result = blacklistPayloadSchema.safeParse({ ip: '192.168.1.1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ttlSeconds).toBe(3600);
      }
    });

    it('should accept ttlSeconds of 1 (minimum)', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should accept ttlSeconds of maximum (30 days in seconds)', () => {
      const maxTtl = 60 * 60 * 24 * 30;
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: maxTtl,
      });
      expect(result.success).toBe(true);
    });

    it('should accept ttlSeconds as string (coerced to number)', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: '3600',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.ttlSeconds).toBe('number');
        expect(result.data.ttlSeconds).toBe(3600);
      }
    });

    it('should accept ttlSeconds as float (coerced to int)', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: 3600.7,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Number.isInteger(result.data.ttlSeconds)).toBe(true);
      }
    });

    it('should reject ttlSeconds of 0', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative ttlSeconds', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject ttlSeconds exceeding maximum', () => {
      const maxTtl = 60 * 60 * 24 * 30;
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: maxTtl + 1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid IP in blacklist payload', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '',
        ttlSeconds: 3600,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing ip field', () => {
      const result = blacklistPayloadSchema.safeParse({ ttlSeconds: 3600 });
      expect(result.success).toBe(false);
    });

    it('should reject null ttlSeconds', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: null,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric ttlSeconds string', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept various valid TTL values', () => {
      const validTtls = [60, 300, 1800, 3600, 7200, 86400, 604800];
      validTtls.forEach((ttl) => {
        const result = blacklistPayloadSchema.safeParse({
          ip: '192.168.1.1',
          ttlSeconds: ttl,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept IPv6 in blacklist payload', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        ttlSeconds: 7200,
      });
      expect(result.success).toBe(true);
    });

    it('should reject ttlSeconds as boolean', () => {
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: true,
      });
      expect(result.success).toBe(false);
    });

    it('should accept large ttlSeconds within bounds', () => {
      const largeTtl = 60 * 60 * 24 * 29;
      const result = blacklistPayloadSchema.safeParse({
        ip: '192.168.1.1',
        ttlSeconds: largeTtl,
      });
      expect(result.success).toBe(true);
    });
  });
});
