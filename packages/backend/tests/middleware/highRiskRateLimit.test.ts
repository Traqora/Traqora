/**
 * Rate limits on authentication and checkout (issue #1181).
 *
 * Verifies the normal path (requests under the limit pass with rate headers)
 * and the failure path (an over-limit request gets 429, Retry-After and the
 * RATE_LIMIT_EXCEEDED code). Also checks per-IP isolation and that auth and
 * checkout keep independent budgets.
 */
import type { Request, Response, NextFunction } from 'express';
import {
  AUTH_RATE_LIMIT,
  CHECKOUT_RATE_LIMIT,
  createHighRiskRateLimiter,
} from '../../src/middleware/highRiskRateLimit';

interface MockResponse {
  res: Response;
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
}

const makeReq = (ip: string): Request =>
  ({
    ip,
    socket: { remoteAddress: ip },
    header: (name: string) => (name.toLowerCase() === 'x-forwarded-for' ? ip : undefined),
  } as unknown as Request);

const makeRes = (): MockResponse => {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
      return res;
    },
    status: (code: number) => {
      mock.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      mock.body = body;
      return res;
    },
  } as unknown as Response;
  const mock: MockResponse = { res, headers, statusCode: 200, body: undefined };
  return mock;
};

const call = async (
  limiter: ReturnType<typeof createHighRiskRateLimiter>,
  ip: string,
): Promise<{ res: MockResponse; allowed: boolean }> => {
  const res = makeRes();
  let allowed = false;
  const next = (() => {
    allowed = true;
  }) as NextFunction;
  await limiter(makeReq(ip), res.res, next);
  return { res, allowed };
};

describe('high risk endpoint rate limits (#1181)', () => {
  it('defines strict budgets for auth and checkout', () => {
    expect(AUTH_RATE_LIMIT.points).toBeGreaterThan(0);
    expect(AUTH_RATE_LIMIT.durationSeconds).toBeGreaterThan(0);
    expect(CHECKOUT_RATE_LIMIT.points).toBeGreaterThan(0);
    expect(CHECKOUT_RATE_LIMIT.durationSeconds).toBeGreaterThan(0);
    expect(AUTH_RATE_LIMIT.keyPrefix).not.toBe(CHECKOUT_RATE_LIMIT.keyPrefix);
  });

  describe.each([
    ['auth', { ...AUTH_RATE_LIMIT, points: 2 }],
    ['checkout', { ...CHECKOUT_RATE_LIMIT, points: 2 }],
  ])('%s limiter', (_name, config) => {
    const limiter = createHighRiskRateLimiter({
      ...config,
      keyPrefix: `test-${config.keyPrefix}-${Date.now()}-${Math.random()}`,
    });

    it('allows requests under the limit and sets rate headers', async () => {
      const first = await call(limiter, '203.0.113.1');
      expect(first.allowed).toBe(true);
      expect(first.res.statusCode).toBe(200);
      expect(first.res.headers['x-ratelimit-limit']).toBe('2');

      const second = await call(limiter, '203.0.113.1');
      expect(second.allowed).toBe(true);
      expect(second.res.headers['x-ratelimit-remaining']).toBe('0');
    });

    it('returns 429 with Retry-After once the limit is exceeded', async () => {
      await call(limiter, '203.0.113.2');
      await call(limiter, '203.0.113.2');

      const blocked = await call(limiter, '203.0.113.2');
      expect(blocked.allowed).toBe(false);
      expect(blocked.res.statusCode).toBe(429);
      expect(Number(blocked.res.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.res.body).toMatchObject({
        error: { code: 'RATE_LIMIT_EXCEEDED' },
      });
    });

    it('isolates budgets per client IP', async () => {
      for (let i = 0; i < 2; i += 1) {
        await call(limiter, '198.51.100.10');
      }
      const blocked = await call(limiter, '198.51.100.10');
      expect(blocked.allowed).toBe(false);

      const otherIp = await call(limiter, '198.51.100.11');
      expect(otherIp.allowed).toBe(true);
    });
  });

  it('keeps auth and checkout budgets independent', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const auth = createHighRiskRateLimiter({
      ...AUTH_RATE_LIMIT,
      points: 1,
      keyPrefix: `test-auth-${suffix}`,
    });
    const checkout = createHighRiskRateLimiter({
      ...CHECKOUT_RATE_LIMIT,
      points: 1,
      keyPrefix: `test-checkout-${suffix}`,
    });

    expect((await call(auth, '192.0.2.5')).allowed).toBe(true);
    expect((await call(checkout, '192.0.2.5')).allowed).toBe(true);

    expect((await call(auth, '192.0.2.5')).allowed).toBe(false);
    expect((await call(checkout, '192.0.2.5')).allowed).toBe(false);
  });
});
