import request from 'supertest';
import express from 'express';
import { rateLimitMetricsRouter } from '../../src/api/routes/admin/rateLimitMetrics';
import * as rateLimitMetricsService from '../../src/services/analytics/rateLimitMetricsService';

const ADMIN_KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', rateLimitMetricsRouter);
  return app;
};

describe('rate-limit metrics dashboard route (issue #371)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    rateLimitMetricsService.resetRateLimitAbuseMetrics();
  });

  it('returns 401 when missing admin API key', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/v1/security/rate-limits/metrics');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 and metrics summary on happy path', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/api/v1/security/rate-limits/metrics')
      .set(ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totals');
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data.totals).toEqual({ allowed: 0, blocked: 0 });
  });

  it('returns 500 internal server error when service fails', async () => {
    jest
      .spyOn(rateLimitMetricsService, 'getRateLimitAbuseMetrics')
      .mockRejectedValueOnce(new Error('Database error'));

    const app = createTestApp();
    const res = await request(app)
      .get('/api/v1/security/rate-limits/metrics')
      .set(ADMIN_KEY);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error.message).toBe('Database error');
  });
});
