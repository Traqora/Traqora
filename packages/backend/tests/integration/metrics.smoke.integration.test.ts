import request from 'supertest';
import { createApp } from '../../src/app';

describe('GET /metrics', () => {
  it('exposes backend Prometheus metrics', async () => {
    const app = createApp({
      globalRateLimit: false,
      tieredRateLimit: false,
    });

    await request(app).get('/health');

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('traqora_http_requests_total');
    expect(response.text).toContain('traqora_http_request_duration_seconds');
    expect(response.text).toContain('traqora_service_operation_duration_seconds');
  });
});
