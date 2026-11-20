import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../src/config';
import { requireAuth } from '../src/middleware/authMiddleware';
import { requireAdmin } from '../src/middleware/adminAuth';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../src/middleware/requestValidation';
import { AppError } from '../src/services/ErrorHandlingService';

function errorHandler(err: any, _req: any, res: any, _next: any) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code, details: err.details },
    });
  }
  return res.status(500).json({
    success: false,
    error: { message: err.message || 'Internal server error', code: 'INTERNAL_SERVER_ERROR' },
  });
}

const wallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
const userToken = jwt.sign({ walletAddress: wallet, walletType: 'freighter' }, config.jwtSecret, {
  expiresIn: '1h',
});

function makeAuthedOwnerApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const bookingIdSchema = z.object({ bookingId: z.string().uuid() }).strict();
  const createBookingSchema = z
    .object({
      flightId: z.string().uuid(),
      passenger: z
        .object({
          email: z.string().email().max(256),
          firstName: z.string().min(1).max(100),
          lastName: z.string().min(1).max(100),
          sorobanAddress: z.string().min(1).max(128),
        })
        .strict(),
    })
    .strict();
  const signedXdrSchema = z.object({ signedXdr: z.string().min(1).max(200000) }).strict();
  const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100) }).strict();

  app.get(
    '/bookings/:bookingId',
    requireAuth,
    validateParams(bookingIdSchema),
    (req, res) => {
      if (req.user?.walletAddress !== wallet) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
      }
      return res.json({ success: true, data: { id: req.params.bookingId } });
    },
  );

  app.post(
    '/bookings',
    requireAuth,
    validateBody(createBookingSchema),
    (_req, res) => res.status(201).json({ success: true, data: { id: 'created' } }),
  );

  app.post(
    '/transactions/:bookingId/retry',
    requireAuth,
    validateParams(bookingIdSchema),
    validateBody(signedXdrSchema),
    (req, res) => {
      if (req.user?.walletAddress !== wallet) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
      }
      return res.status(202).json({ success: true, data: { bookingId: req.params.bookingId } });
    },
  );

  app.get('/transactions', requireAuth, validateQuery(listQuerySchema), (_req, res) =>
    res.json({ success: true, data: [] }),
  );

  app.get('/admin/refunds/review-queue', requireAdmin, (_req, res) =>
    res.json({ success: true, data: [] }),
  );

  app.use(errorHandler);
  return app;
}

describe('V1 authz and request validation hardening (focused)', () => {
  const app = makeAuthedOwnerApp();

  it('rejects unauthenticated access to protected booking/transaction routes', async () => {
    expect(
      (await request(app).get('/bookings/550e8400-e29b-41d4-a716-446655440000')).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/transactions/550e8400-e29b-41d4-a716-446655440000/retry')
          .send({ signedXdr: 'x' })
      ).status,
    ).toBe(401);
  });

  it('allows authenticated owner and rejects authenticated non-owner on ownership-checked route', async () => {
    const ok = await request(app)
      .get('/bookings/550e8400-e29b-41d4-a716-446655440000')
      .set('Authorization', `Bearer ${userToken}`);
    expect(ok.status).toBe(200);

    const otherToken = jwt.sign(
      { walletAddress: 'GOTHERWALLETADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', walletType: 'freighter' },
      config.jwtSecret,
      { expiresIn: '1h' },
    );
    const forbidden = await request(app)
      .get('/bookings/550e8400-e29b-41d4-a716-446655440000')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(404);
  });

  it('rejects malformed params/query and malformed/unexpected/oversized bodies before handlers', async () => {
    const badParam = await request(app)
      .get('/bookings/not-a-uuid')
      .set('Authorization', `Bearer ${userToken}`);
    expect(badParam.status).toBe(400);
    expect(badParam.body.error.code).toBe('VALIDATION_ERROR');

    const badQuery = await request(app)
      .get('/transactions?limit=999')
      .set('Authorization', `Bearer ${userToken}`);
    expect(badQuery.status).toBe(400);
    expect(badQuery.body.error.code).toBe('VALIDATION_ERROR');

    const malformedBody = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ flightId: 'not-a-uuid', passenger: {} });
    expect(malformedBody.status).toBe(400);
    expect(malformedBody.body.error.code).toBe('VALIDATION_ERROR');

    const unexpectedBody = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        flightId: '550e8400-e29b-41d4-a716-446655440000',
        passenger: {
          email: 'a@example.com',
          firstName: 'A',
          lastName: 'B',
          sorobanAddress: wallet,
          extra: 'nope',
        },
      });
    expect(unexpectedBody.status).toBe(400);
    expect(unexpectedBody.body.error.code).toBe('VALIDATION_ERROR');

    const oversizedBody = await request(app)
      .post('/transactions/550e8400-e29b-41d4-a716-446655440000/retry')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ signedXdr: 'x'.repeat(210000) });
    expect(oversizedBody.status).toBe(400);
    expect(oversizedBody.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces admin role for privileged admin endpoints', async () => {
    const noAuth = await request(app).get('/admin/refunds/review-queue');
    expect(noAuth.status).toBe(401);

    const userAuth = await request(app)
      .get('/admin/refunds/review-queue')
      .set('Authorization', `Bearer ${userToken}`);
    expect(userAuth.status).toBe(401);

    const adminAuth = await request(app)
      .get('/admin/refunds/review-queue')
      .set('X-Admin-Api-Key', config.adminApiKey);
    expect(adminAuth.status).toBe(200);
  });
});
