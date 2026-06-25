/**
 * Unit tests for the analytics rate-limit middleware — issue #251.
 *
 * These tests mock rate-limiter-flexible so no Redis is needed.
 */

import { Request, Response, NextFunction } from 'express';

// ── Stub rate-limiter-flexible before importing middleware ───────────────────

const consumeMock = jest.fn();

jest.mock('rate-limiter-flexible', () => ({
  RateLimiterMemory: jest.fn().mockImplementation(() => ({ consume: consumeMock })),
  RateLimiterRedis: jest.fn().mockImplementation(() => ({ consume: consumeMock })),
}));

jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({})));

// Import AFTER mocking so the limiter cache picks up the stubs
import { analyticsRateLimit } from '../../../src/middleware/analytics-rate-limit';
import { TIER_QUOTAS } from '../../../src/config/tiers';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    header: (name: string) => (overrides as any)._headers?.[name.toLowerCase()],
    ip: '127.0.0.1',
    method: 'GET',
    baseUrl: '/api/v1/admin/analytics',
    path: '/report',
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  return {
    setHeader: jest.fn((k: string, v: string) => { headers[k] = v; }),
    status: jest.fn((code: number) => { statusCode = code; return res; }),
    json: jest.fn((data: unknown) => { body = data; }),
    _headers: headers,
    _status: () => statusCode,
    _body: () => body,
  } as unknown as Response;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('analyticsRateLimit middleware', () => {
  let middleware: ReturnType<typeof analyticsRateLimit>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = analyticsRateLimit();
    next = jest.fn();
  });

  it('calls next() when both windows pass', async () => {
    consumeMock.mockResolvedValue({ remainingPoints: 50, msBeforeNext: 30_000 });
    const req = makeReq();
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('sets X-RateLimit-Tier header to free by default', async () => {
    consumeMock.mockResolvedValue({ remainingPoints: 50, msBeforeNext: 30_000 });
    const req = makeReq();
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Tier', 'free');
  });

  it('sets X-RateLimit-Tier to pro for pro tier requests', async () => {
    consumeMock.mockResolvedValue({ remainingPoints: 200, msBeforeNext: 30_000 });
    const req = makeReq({ _headers: { 'x-user-tier': 'pro' } } as any);
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Tier', 'pro');
  });

  it('returns 429 with RATE_LIMIT_EXCEEDED when per-minute window exhausted', async () => {
    consumeMock.mockRejectedValueOnce({ msBeforeNext: 5_000 });
    const req = makeReq();
    const res = makeRes();
    await middleware(req, res, next);
    expect((res as any)._status()).toBe(429);
    const body = (res as any)._body() as any;
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 429 with HOURLY_QUOTA_EXCEEDED when hourly window exhausted', async () => {
    // First consume (minute) passes, second (hour) fails
    consumeMock
      .mockResolvedValueOnce({ remainingPoints: 50, msBeforeNext: 30_000 })
      .mockRejectedValueOnce({ msBeforeNext: 3_600_000 });
    const req = makeReq();
    const res = makeRes();
    await middleware(req, res, next);
    expect((res as any)._status()).toBe(429);
    const body = (res as any)._body() as any;
    expect(body.error.code).toBe('HOURLY_QUOTA_EXCEEDED');
    expect(next).not.toHaveBeenCalled();
  });

  it('includes X-RateLimit-Limit, Remaining, and Reset headers on success', async () => {
    consumeMock.mockResolvedValue({ remainingPoints: 42, msBeforeNext: 10_000 });
    const req = makeReq();
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '42');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('enterprise tier uses higher per-minute limit', () => {
    // Just assert the quota config itself — no need to wire up full middleware
    expect(TIER_QUOTAS.enterprise.perMinute).toBeGreaterThan(TIER_QUOTAS.pro.perMinute);
    expect(TIER_QUOTAS.pro.perMinute).toBeGreaterThan(TIER_QUOTAS.free.perMinute);
  });

  it('free tier default per-minute is 100', () => {
    expect(TIER_QUOTAS.free.perMinute).toBe(100);
  });

  it('free tier default per-hour is 1000', () => {
    expect(TIER_QUOTAS.free.perHour).toBe(1_000);
  });
});
