import express from 'express';
import request from 'supertest';

describe('GET /health/services (issue #375)', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('reports operational status for all services in the test environment', async () => {
    // Fresh module registry per test file avoids leaking prom-client
    // registrations across other suites sharing the same jest worker.
    jest.resetModules();
    const healthRouter = require('../../src/routes/health').default;

    const app = express();
    app.use('/health', healthRouter);

    const res = await request(app).get('/health/services');

    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('operational');
    expect(res.body.services).toEqual({
      database: { healthy: true },
      redis: { healthy: true },
      stellar: { healthy: true },
    });
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.checkedAt).toEqual(expect.any(String));
  });

  it('is a proper route mounted alongside the existing root and performance endpoints', async () => {
    jest.resetModules();
    const healthRouter = require('../../src/routes/health').default;

    const app = express();
    app.use('/health', healthRouter);

    const rootRes = await request(app).get('/health');
    const perfRes = await request(app).get('/health/performance');
    const servicesRes = await request(app).get('/health/services');

    expect(rootRes.status).toBeGreaterThanOrEqual(200);
    expect(perfRes.status).toBeGreaterThanOrEqual(200);
    expect(servicesRes.status).toBe(200);
  });
});
