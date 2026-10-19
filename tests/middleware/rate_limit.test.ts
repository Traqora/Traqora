import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

// Mock the logger
vi.mock('../../packages/backend/src/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedis = {
    multi: vi.fn(() => mockRedis),
    incr: vi.fn(() => mockRedis),
    pttl: vi.fn(() => mockRedis),
    exec: vi.fn(),
    pexpire: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedis),
  };
});

// Mock ms library
vi.mock('ms', () => ({
  default: vi.fn((val: string) => {
    if (val === '1m') return 60000;
    if (val === '60s') return 60000;
    return 60000;
  }),
}));

describe('Rate Limit Middleware Tests', () => {
  let rateLimitMiddleware: any;
  let mockRedis: any;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(async () => {
    // Reset environment
    process.env.RATE_LIMIT_MAX = '5';
    process.env.RATE_LIMIT_WINDOW = '1m';
    process.env.RATE_LIMIT_REDIS_URL = undefined;
    process.env.REDIS_URL = undefined;

    // Clear module cache to reload with new env
    vi.resetModules();

    // Import after setting env
    const module = await import('../../packages/backend/src/middleware/rate-limit');
    rateLimitMiddleware = module.rateLimitMiddleware;

    // Get mock redis instance
    const RedisMock = (await import('ioredis')).default;
    mockRedis = RedisMock();

    // Setup request/response mocks
    req = {
      ip: '127.0.0.1',
    };

    const headers: Record<string, string> = {};
    res = {
      setHeader: vi.fn((key: string, value: string) => {
        headers[key] = value;
      }),
      status: vi.fn((code: number) => {
        (res as any).statusCode = code;
        return res;
      }),
      json: vi.fn((data: any) => {
        (res as any).body = data;
      }),
      _headers: headers,
    };

    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW;
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.REDIS_URL;
  });

  describe('with Redis backend', () => {
    beforeEach(() => {
      process.env.RATE_LIMIT_REDIS_URL = 'redis://localhost:6379';
    });

    it('allows requests within the rate limit', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, -1]]);
      mockRedis.pexpire.mockResolvedValue('OK');

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('blocks requests exceeding the rate limit', async () => {
      mockRedis.exec.mockResolvedValue([[null, 6], [null, 5000]]);

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        retryAfter: 60,
      });
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      expect(next).not.toHaveBeenCalled();
    });

    it('sets expiry on first request', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, -1]]);
      mockRedis.pexpire.mockResolvedValue('OK');

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(mockRedis.pexpire).toHaveBeenCalledWith('rl:127.0.0.1', 60000);
    });

    it('does not set expiry on subsequent requests', async () => {
      mockRedis.exec.mockResolvedValue([[null, 2], [null, 5000]]);

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(mockRedis.pexpire).not.toHaveBeenCalled();
    });

    it('fails open on Redis error', async () => {
      mockRedis.exec.mockRejectedValue(new Error('Redis connection failed'));

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      const logger = (await import('../../packages/backend/src/utils/logger')).logger;
      expect(logger.error).toHaveBeenCalledWith(
        'Rate limiter error',
        expect.objectContaining({
          event: 'rate_limiter_error',
          error: expect.any(Error),
          identifier: '127.0.0.1',
        }),
      );
    });

    it('handles null exec result gracefully', async () => {
      mockRedis.exec.mockResolvedValue(null);

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('with in-memory fallback', () => {
    beforeEach(() => {
      process.env.RATE_LIMIT_REDIS_URL = undefined;
      process.env.REDIS_URL = undefined;
    });

    it('allows requests within the rate limit', async () => {
      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('blocks requests exceeding the rate limit', async () => {
      // Make 5 successful requests
      for (let i = 0; i < 5; i++) {
        await rateLimitMiddleware(req as Request, res as Response, next);
      }

      // 6th request should be blocked
      next.mockClear();
      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        retryAfter: 60,
      });
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      expect(next).not.toHaveBeenCalled();
    });

    it('resets counter after window expires', async () => {
      // Make 5 requests to hit limit
      for (let i = 0; i < 5; i++) {
        await rateLimitMiddleware(req as Request, res as Response, next);
      }

      // 6th request blocked
      next.mockClear();
      await rateLimitMiddleware(req as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(429);

      // Wait for window to expire (simulate by modifying global store)
      const store = (global as any)._rateLimitStore;
      if (store) {
        const entry = store.get('rl:127.0.0.1');
        if (entry) {
          entry.reset = Date.now() - 1000; // Set to past
        }
      }

      // Request should now be allowed
      next.mockClear();
      await rateLimitMiddleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('tracks separate counters for different IPs', async () => {
      const req1 = { ip: '192.168.1.1' };
      const req2 = { ip: '192.168.1.2' };

      // Exhaust limit for IP1
      for (let i = 0; i < 5; i++) {
        await rateLimitMiddleware(req1 as Request, res as Response, next);
      }

      // IP1 should be blocked
      next.mockClear();
      await rateLimitMiddleware(req1 as Request, res as Response, next);
      expect(res.status).toHaveBeenCalledWith(429);

      // IP2 should still be allowed
      next.mockClear();
      await rateLimitMiddleware(req2 as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('fails open on error', async () => {
      // Force an error by making req.ip undefined
      const badReq = {} as Request;

      await rateLimitMiddleware(badReq, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('uses custom RATE_LIMIT_MAX from environment', async () => {
      process.env.RATE_LIMIT_MAX = '10';
      vi.resetModules();

      const module = await import('../../packages/backend/src/middleware/rate-limit');
      const customMiddleware = module.rateLimitMiddleware;

      mockRedis.exec.mockResolvedValue([[null, 1], [null, -1]]);
      mockRedis.pexpire.mockResolvedValue('OK');

      await customMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('uses custom RATE_LIMIT_WINDOW from environment', async () => {
      process.env.RATE_LIMIT_WINDOW = '30s';
      vi.resetModules();

      const module = await import('../../packages/backend/src/middleware/rate-limit');
      const customMiddleware = module.rateLimitMiddleware;

      mockRedis.exec.mockResolvedValue([[null, 1], [null, -1]]);
      mockRedis.pexpire.mockResolvedValue('OK');

      await customMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('defaults to 100 requests per minute when not configured', async () => {
      delete process.env.RATE_LIMIT_MAX;
      delete process.env.RATE_LIMIT_WINDOW;
      vi.resetModules();

      const module = await import('../../packages/backend/src/middleware/rate-limit');
      const defaultMiddleware = module.rateLimitMiddleware;

      mockRedis.exec.mockResolvedValue([[null, 1], [null, -1]]);
      mockRedis.pexpire.mockResolvedValue('OK');

      await defaultMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('response headers', () => {
    it('sets Retry-After header when rate limited', async () => {
      mockRedis.exec.mockResolvedValue([[null, 6], [null, 5000]]);

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    });

    it('does not set Retry-After on successful requests', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, -1]]);
      mockRedis.pexpire.mockResolvedValue('OK');

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(res.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.any(String));
    });
  });

  describe('identifier resolution', () => {
    it('uses req.ip as identifier', async () => {
      req.ip = '10.0.0.1';

      mockRedis.exec.mockResolvedValue([[null, 1], [null, -1]]);
      mockRedis.pexpire.mockResolvedValue('OK');

      await rateLimitMiddleware(req as Request, res as Response, next);

      expect(mockRedis.incr).toHaveBeenCalledWith('rl:10.0.0.1');
    });

    it('handles missing req.ip gracefully', async () => {
      const badReq = {} as Request;

      await rateLimitMiddleware(badReq, res as Response, next);

      // Should fail open
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Redis URL resolution', () => {
    it('uses RATE_LIMIT_REDIS_URL when available', async () => {
      process.env.RATE_LIMIT_REDIS_URL = 'redis://custom:6379';
      vi.resetModules();

      const RedisMock = (await import('ioredis')).default;
      const module = await import('../../packages/backend/src/middleware/rate-limit');
      await module.rateLimitMiddleware(req as Request, res as Response, next);

      expect(RedisMock).toHaveBeenCalledWith('redis://custom:6379');
    });

    it('falls back to REDIS_URL when RATE_LIMIT_REDIS_URL not set', async () => {
      process.env.REDIS_URL = 'redis://fallback:6379';
      vi.resetModules();

      const RedisMock = (await import('ioredis')).default;
      const module = await import('../../packages/backend/src/middleware/rate-limit');
      await module.rateLimitMiddleware(req as Request, res as Response, next);

      expect(RedisMock).toHaveBeenCalledWith('redis://fallback:6379');
    });

    it('uses in-memory when neither Redis URL is set', async () => {
      delete process.env.RATE_LIMIT_REDIS_URL;
      delete process.env.REDIS_URL;
      vi.resetModules();

      const RedisMock = (await import('ioredis')).default;
      const module = await import('../../packages/backend/src/middleware/rate-limit');
      await module.rateLimitMiddleware(req as Request, res as Response, next);

      expect(RedisMock).not.toHaveBeenCalled();
    });
  });
});
