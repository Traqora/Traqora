import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import ancillaryRoutes from '../../src/api/routes/ancillary';
import { ancillaryService } from '../../src/services/ancillaryService';
import { config } from '../../src/config';
import { errorHandler } from '../../src/utils/errorHandler';

describe('Ancillary Routes Integration Tests', () => {
  let app: express.Application;

  const validToken = jwt.sign(
    { userId: 'user-1', walletAddress: 'GA_WALLET_1' },
    config.jwtSecret,
  );

  const validAdminToken = jwt.sign(
    { adminId: 'admin-1', email: 'admin@traqora.io', role: 'admin' },
    config.jwtSecret,
  );

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/ancillary', ancillaryRoutes);
    app.use(errorHandler);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/v1/ancillary/catalog', () => {
    it('returns catalog items without requiring auth', async () => {
      const res = await request(app)
        .get('/api/v1/ancillary/catalog')
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('filters catalog items by cabin class', async () => {
      const res = await request(app)
        .get('/api/v1/ancillary/catalog?cabinClass=business')
        .expect(200);

      expect(res.body.data).toBeDefined();
      res.body.data.forEach((item: any) => {
        expect(item.availableCabins).toContain('business');
      });
    });
  });

  describe('GET /api/v1/ancillary/availability/:bookingId/:serviceCode', () => {
    it('requires authentication', async () => {
      await request(app)
        .get('/api/v1/ancillary/availability/b1111111-1111-1111-1111-111111111111/PRIORITY_BOARDING')
        .expect(401);
    });

    it('returns availability status for a valid booking and service code', async () => {
      jest.spyOn(ancillaryService, 'checkAvailability').mockResolvedValue({
        available: true,
        item: {
          code: 'PRIORITY_BOARDING',
          name: 'Priority boarding',
          description: 'Board earlier',
          type: 'priority_boarding',
          priceCents: 2500,
          availableCabins: ['economy', 'premium', 'business', 'first'],
        },
      });

      const res = await request(app)
        .get('/api/v1/ancillary/availability/b1111111-1111-1111-1111-111111111111/PRIORITY_BOARDING')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.data.available).toBe(true);
      expect(res.body.data.item.code).toBe('PRIORITY_BOARDING');
    });

    it('returns available: false when offer is stale or already purchased', async () => {
      jest.spyOn(ancillaryService, 'checkAvailability').mockResolvedValue({
        available: false,
        reason: 'Priority boarding has already been purchased for this booking',
      });

      const res = await request(app)
        .get('/api/v1/ancillary/availability/b1111111-1111-1111-1111-111111111111/PRIORITY_BOARDING')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body.data.available).toBe(false);
      expect(res.body.data.reason).toContain('already been purchased');
    });
  });

  describe('POST /api/v1/ancillary/purchases', () => {
    it('requires authentication', async () => {
      await request(app)
        .post('/api/v1/ancillary/purchases')
        .send({
          bookingId: 'b1111111-1111-1111-1111-111111111111',
          serviceCode: 'PRIORITY_BOARDING',
        })
        .expect(401);
    });

    it('creates purchase when ancillary is available', async () => {
      jest.spyOn(ancillaryService, 'purchase').mockResolvedValue({
        id: 'purchase-1',
        bookingId: 'b1111111-1111-1111-1111-111111111111',
        serviceCode: 'PRIORITY_BOARDING',
        serviceType: 'priority_boarding',
        amountCents: 2500,
        quantity: 1,
        status: 'purchased',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await request(app)
        .post('/api/v1/ancillary/purchases')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          bookingId: 'b1111111-1111-1111-1111-111111111111',
          serviceCode: 'PRIORITY_BOARDING',
        })
        .expect(201);

      expect(res.body.data.id).toBe('purchase-1');
      expect(res.body.data.serviceCode).toBe('PRIORITY_BOARDING');
    });

    it('returns 409 Conflict when ancillary offer is stale or already purchased', async () => {
      const { ConflictError } = await import('../../src/utils/errors');
      jest.spyOn(ancillaryService, 'purchase').mockRejectedValue(
        new ConflictError('Priority boarding has already been purchased for this booking'),
      );

      const res = await request(app)
        .post('/api/v1/ancillary/purchases')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          bookingId: 'b1111111-1111-1111-1111-111111111111',
          serviceCode: 'PRIORITY_BOARDING',
        })
        .expect(409);

      expect(res.body.error).toBeDefined();
    });

    it('returns 400 Bad Request on invalid input format', async () => {
      await request(app)
        .post('/api/v1/ancillary/purchases')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          bookingId: 'not-a-uuid',
          serviceCode: '',
        })
        .expect(400);
    });
  });
});
