import request from 'supertest';
import { createApp } from '../../src/app';

const adminApiKey = 'dev-admin-key';

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
      captchaAfterViolations: 2,
    },
  });

describe('tiered rate limiting and abuse protection', () => {
  it('protects security management endpoints with admin API key', async () => {
    const app = createRateLimitedApp();

    const unauthorized = await request(app)
      .get('/api/v1/security/rate-limits/lists')
      .set('x-forwarded-for', '198.51.100.111');

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error.code).toBe('UNAUTHORIZED');
  });

  it('applies public tier limits and emits rate headers', async () => {
    const app = createRateLimitedApp();

    const first = await request(app)
      .get('/health')
      .set('x-forwarded-for', '203.0.113.10');
    const second = await request(app)
      .get('/health')
      .set('x-forwarded-for', '203.0.113.10');
    const third = await request(app)
      .get('/health')
      .set('x-forwarded-for', '203.0.113.10');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-ratelimit-tier']).toBe('public');
    expect(first.headers['x-ratelimit-limit']).toBe('2');
    expect(first.headers['x-request-fingerprint']).toBeTruthy();

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(third.headers['retry-after']).toBeTruthy();
  });

  it('allows higher limits for authenticated users', async () => {
    const app = createRateLimitedApp();

    const calls = await Promise.all(
      [1, 2, 3].map(() =>
        request(app)
          .get('/health')
          .set('x-forwarded-for', '203.0.113.22')
          .set('x-user-id', 'user-123')
      )
    );

    for (const response of calls) {
      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-tier']).toBe('user');
      expect(response.headers['x-ratelimit-limit']).toBe('4');
    }
  });

  it('applies premium tier when explicitly marked', async () => {
    const app = createRateLimitedApp();

    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        request(app)
          .get('/health')
          .set('x-forwarded-for', '203.0.113.30')
          .set('x-user-tier', 'premium')
          .set('x-user-id', 'premium-007')
      )
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-tier']).toBe('premium');
      expect(response.headers['x-ratelimit-limit']).toBe('6');
    }
  });

  it('supports blacklist management and blocks blacklisted IPs', async () => {
    const app = createRateLimitedApp();

    const addResult = await request(app)
      .post('/api/v1/security/rate-limits/blacklist')
      .set('x-admin-api-key', adminApiKey)
      .set('x-forwarded-for', '198.51.100.100')
      .send({ ip: '198.51.100.77', ttlSeconds: 600 });

    expect(addResult.status).toBe(201);

    const blocked = await request(app)
      .get('/health')
      .set('x-forwarded-for', '198.51.100.77');

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('IP_BLACKLISTED');

    const removeResult = await request(app)
      .delete('/api/v1/security/rate-limits/blacklist/198.51.100.77')
      .set('x-admin-api-key', adminApiKey)
      .set('x-forwarded-for', '198.51.100.100');

    expect(removeResult.status).toBe(200);
  });

  it('supports whitelist management and bypasses limits for whitelisted IPs', async () => {
    const app = createApp({
      globalRateLimit: false,
      tieredRateLimit: {
        redisUrl: undefined,
        public: { points: 1, durationSeconds: 60 },
        user: { points: 1, durationSeconds: 60 },
        premium: { points: 1, durationSeconds: 60 },
        ddos: { points: 100, durationSeconds: 60 },
        blockDurationSeconds: 120,
        blockAfterViolations: 10,
        captchaAfterViolations: 1,
      },
    });

    const whitelistResult = await request(app)
      .post('/api/v1/security/rate-limits/whitelist')
      .set('x-admin-api-key', adminApiKey)
      .set('x-forwarded-for', '198.51.100.100')
      .send({ ip: '203.0.113.200' });

    expect(whitelistResult.status).toBe(201);

    const first = await request(app).get('/health').set('x-forwarded-for', '203.0.113.200');
    const second = await request(app).get('/health').set('x-forwarded-for', '203.0.113.200');
    const third = await request(app).get('/health').set('x-forwarded-for', '203.0.113.200');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);

    const remove = await request(app)
      .delete('/api/v1/security/rate-limits/whitelist/203.0.113.200')
      .set('x-admin-api-key', adminApiKey)
      .set('x-forwarded-for', '198.51.100.100');

    expect(remove.status).toBe(200);
  });

  it('triggers captcha requirement after repeated violations', async () => {
    const app = createApp({
      globalRateLimit: false,
      tieredRateLimit: {
        redisUrl: undefined,
        public: { points: 1, durationSeconds: 60 },
        user: { points: 1, durationSeconds: 60 },
        premium: { points: 1, durationSeconds: 60 },
        ddos: { points: 100, durationSeconds: 60 },
        blockDurationSeconds: 120,
        blockAfterViolations: 10,
        captchaAfterViolations: 1,
      },
    });

    await request(app).get('/health').set('x-forwarded-for', '192.0.2.50');
    const exceeded = await request(app).get('/health').set('x-forwarded-for', '192.0.2.50');

    expect(exceeded.status).toBe(429);
    expect(exceeded.body.captchaRequired).toBe(true);
    expect(exceeded.headers['x-captcha-required']).toBe('true');
  });

  it('detects ddos bursts and blocks IP temporarily', async () => {
    const app = createApp({
      globalRateLimit: false,
      tieredRateLimit: {
        redisUrl: undefined,
        public: { points: 100, durationSeconds: 60 },
        user: { points: 100, durationSeconds: 60 },
        premium: { points: 100, durationSeconds: 60 },
        ddos: { points: 1, durationSeconds: 60 },
        blockDurationSeconds: 60,
        blockAfterViolations: 10,
        captchaAfterViolations: 1,
      },
    });

    const first = await request(app).get('/health').set('x-forwarded-for', '192.0.2.60');
    const second = await request(app).get('/health').set('x-forwarded-for', '192.0.2.60');
    const third = await request(app).get('/health').set('x-forwarded-for', '192.0.2.60');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('DDOS_PROTECTION_TRIGGERED');

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('IP_BLOCKED');
  });
});
