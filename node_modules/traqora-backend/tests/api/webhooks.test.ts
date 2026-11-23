import request from 'supertest';
import express from 'express';
import { webhookRouter } from '../../src/api/routes/webhooks';
import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { errorHandler } from '../../src/utils/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/v1/webhooks', webhookRouter);
app.use(errorHandler);

describe('Webhook Idempotency API & Failure Modes', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it('handles first-time webhook delivery successfully (happy path)', async () => {
    const eventPayload = {
      id: 'evt_test_happy_001',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123' } },
    };

    const res = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('x-webhook-event-id', 'evt_test_happy_001')
      .send(eventPayload)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('payment_intent.succeeded');
  });

  it('prevents duplicate processing on duplicate event delivery (failure mode / idempotency replay)', async () => {
    const eventPayload = {
      id: 'evt_test_duplicate_002',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_456' } },
    };

    // First delivery
    const firstRes = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('x-webhook-event-id', 'evt_test_duplicate_002')
      .send(eventPayload)
      .expect(200);

    expect(firstRes.body.success).toBe(true);

    // Second (duplicate) delivery
    const secondRes = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('x-webhook-event-id', 'evt_test_duplicate_002')
      .send(eventPayload)
      .expect(200);

    expect(secondRes.body.success).toBe(true);
    expect(secondRes.body.idempotentReplay).toBe(true);
  });
});
