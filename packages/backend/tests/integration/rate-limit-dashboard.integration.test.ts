import request from 'supertest';
import { createApp } from '../../src/app';
import { __resetRateLimitSnapshot } from '../../src/services/metrics';

const ADMIN_KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

const createRateLimitedApp = () =>
  createApp({
    globalRateLimit: false,
    tieredRateLimit: {
      redisUrl: undefined,
      public: { points: 2, durationSeconds: 60 },
      user: { points: 4, durationSeconds: 60 },
      premium: { points: 6, durationSeconds: 60 },
      ddos: { points: 100, durationSeconds: 60 },
      blockDurationSeconds: 120,
      blockAfterViolations: 10,
      captchaAfterViolations: 10,
    },
  });

describe('rate limit throttling dashboard (issue #371)', () => {
  beforeEach(() => {
    __resetRateLimitSnapshot();
  });

  it('rejects requests to the metrics endpoint without an admin key', async () => {
    const app = await createRateLimitedApp();

    const res = await request(app).get('/api/v1/security/rate-limits/metrics');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('counts its own request when queried with no prior traffic', async () => {
    // The dashboard endpoint is itself behind the tiered limiter, so reading
    // it is traffic too — this asserts that self-consistency rather than an
    // artificial "nothing happened yet" state.
    const app = await createRateLimitedApp();

    const res = await request(app)
      .get('/api/v1/security/rate-limits/metrics')
      .set(ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ allowed: 1, blocked: 0 });
  });

  it('reflects allowed and blocked requests after traffic against the public tier', async () => {
    const app = await createRateLimitedApp();
    const ip = '203.0.113.77';

    // public tier limit is 2/min: first two allowed, third blocked.
    // /api/v1/security/rate-limits/lists is admin-gated but still passes
    // through the app-level tiered limiter before that check runs.
    await request(app)
      .get('/api/v1/security/rate-limits/lists')
      .set('x-forwarded-for', ip);
    await request(app)
      .get('/api/v1/security/rate-limits/lists')
      .set('x-forwarded-for', ip);
    await request(app)
      .get('/api/v1/security/rate-limits/lists')
      .set('x-forwarded-for', ip);

    const res = await request(app)
      .get('/api/v1/security/rate-limits/metrics')
      .set(ADMIN_KEY)
      .set('x-forwarded-for', ip);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.allowed).toBeGreaterThanOrEqual(2);
    expect(res.body.data.totals.blocked).toBeGreaterThanOrEqual(1);

    const publicEntry = res.body.data.byEndpoint.find(
      (e: { tier: string }) => e.tier === 'public'
    );
    expect(publicEntry).toBeDefined();
    expect(publicEntry.blocked).toBeGreaterThanOrEqual(1);
    expect(publicEntry.lastBlockedAt).toEqual(expect.any(String));
  });
});
