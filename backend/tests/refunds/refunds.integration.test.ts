import request from 'supertest';
import { app } from '../../src/app';
import { AppDataSource } from '../../src/db/dataSource';
import { Flight } from '../../src/db/entities/Flight';
import { Passenger } from '../../src/db/entities/Passenger';
import { Booking } from '../../src/db/entities/Booking';

describe('Refunds API Integration Tests', () => {
  let testBooking: Booking;
  let testFlight: Flight;
  let testPassenger: Passenger;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await AppDataSource.query('DELETE FROM refunds WHERE 1=1');
    await AppDataSource.query('DELETE FROM bookings WHERE 1=1');
    await AppDataSource.query('DELETE FROM flights WHERE 1=1');
    await AppDataSource.query('DELETE FROM passengers WHERE 1=1');

    // Create test data
    const flightRepo = AppDataSource.getRepository(Flight);
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const bookingRepo = AppDataSource.getRepository(Booking);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    testFlight = flightRepo.create({
      flightNumber: 'TEST456',
      fromAirport: 'SFO',
      toAirport: 'NYC',
      departureTime: futureDate,
      priceCents: 35000,
      seatsAvailable: 50,
      airlineSorobanAddress: 'GTEST456',
    });
    await flightRepo.save(testFlight);

    testPassenger = passengerRepo.create({
      email: 'integration@test.com',
      firstName: 'Integration',
      lastName: 'Test',
      phone: '+1987654321',
      sorobanAddress: 'GINTEGRATION123',
    });
    await passengerRepo.save(testPassenger);

    testBooking = bookingRepo.create({
      flight: testFlight,
      passenger: testPassenger,
      status: 'confirmed',
      amountCents: 35000,
      stripePaymentIntentId: 'pi_integration_test',
      sorobanBookingId: '100',
    });
    await bookingRepo.save(testBooking);
  });

  describe('POST /api/v1/refunds/request', () => {
    it('should create a refund request successfully', async () => {
      const response = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'customer_request',
          reasonDetails: 'Testing refund flow',
          requestedBy: 'integration@test.com',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.reason).toBe('customer_request');
      expect(response.body.data.booking.id).toBe(testBooking.id);
    });

    it('should return 400 for invalid booking ID', async () => {
      const response = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: 'invalid-uuid',
          reason: 'customer_request',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when refund already exists', async () => {
      // Create first refund
      await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'customer_request',
        });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'customer_request',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('already exists');
    });
  });

  describe('GET /api/v1/refunds/:id', () => {
    it('should get refund details by ID', async () => {
      const createResponse = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'flight_cancelled',
        });

      const refundId = createResponse.body.data.id;

      const response = await request(app).get(`/api/v1/refunds/${refundId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(refundId);
      expect(response.body.data.reason).toBe('flight_cancelled');
    });

    it('should return 404 for non-existent refund', async () => {
      const response = await request(app).get(
        '/api/v1/refunds/00000000-0000-0000-0000-000000000000'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('REFUND_NOT_FOUND');
    });
  });

  describe('GET /api/v1/refunds/booking/:bookingId', () => {
    it('should get all refunds for a booking', async () => {
      await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'customer_request',
        });

      const response = await request(app).get(
        `/api/v1/refunds/booking/${testBooking.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should return empty array for booking with no refunds', async () => {
      const response = await request(app).get(
        `/api/v1/refunds/booking/${testBooking.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/refunds/:id/status', () => {
    it('should get refund status', async () => {
      const createResponse = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'customer_request',
        });

      const refundId = createResponse.body.data.id;

      const response = await request(app).get(`/api/v1/refunds/${refundId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('refundStatus');
    });
  });

  describe('POST /api/v1/refunds/:id/submit-onchain', () => {
    it('should submit on-chain refund transaction', async () => {
      const createResponse = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'customer_request',
        });

      const refundId = createResponse.body.data.id;

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await request(app)
        .post(`/api/v1/refunds/${refundId}/submit-onchain`)
        .send({
          signedXdr: 'mock_signed_xdr_data',
        });

      // May be 202 or 400 depending on refund state
      expect([202, 400]).toContain(response.status);
    });

    it('should return 400 for missing signedXdr', async () => {
      const createResponse = await request(app)
        .post('/api/v1/refunds/request')
        .send({
          bookingId: testBooking.id,
          reason: 'customer_request',
        });

      const refundId = createResponse.body.data.id;

      const response = await request(app)
        .post(`/api/v1/refunds/${refundId}/submit-onchain`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Admin Endpoints', () => {
    const adminApiKey = process.env.ADMIN_API_KEY || 'dev-admin-key';

    describe('GET /api/v1/refunds/admin/review-queue', () => {
      it('should get manual review queue with valid API key', async () => {
        const response = await request(app)
          .get('/api/v1/refunds/admin/review-queue')
          .set('X-Admin-API-Key', adminApiKey);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should return 403 without API key', async () => {
        const response = await request(app).get('/api/v1/refunds/admin/review-queue');

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      });

      it('should return 403 with invalid API key', async () => {
        const response = await request(app)
          .get('/api/v1/refunds/admin/review-queue')
          .set('X-Admin-API-Key', 'invalid-key');

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/v1/refunds/admin/all', () => {
      it('should get all refunds with pagination', async () => {
        await request(app)
          .post('/api/v1/refunds/request')
          .send({
            bookingId: testBooking.id,
            reason: 'customer_request',
          });

        const response = await request(app)
          .get('/api/v1/refunds/admin/all?limit=10&offset=0')
          .set('X-Admin-API-Key', adminApiKey);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('limit');
        expect(response.body).toHaveProperty('offset');
      });

      it('should filter refunds by status', async () => {
        await request(app)
          .post('/api/v1/refunds/request')
          .send({
            bookingId: testBooking.id,
            reason: 'customer_request',
          });

        const response = await request(app)
          .get('/api/v1/refunds/admin/all?status=approved')
          .set('X-Admin-API-Key', adminApiKey);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('POST /api/v1/refunds/:id/review', () => {
      it('should approve refund with manual review', async () => {
        // Create booking requiring manual review
        const nearFutureDate = new Date();
        nearFutureDate.setHours(nearFutureDate.getHours() + 12);
        testBooking.flight.departureTime = nearFutureDate;
        await AppDataSource.getRepository(Booking).save(testBooking);

        const createResponse = await request(app)
          .post('/api/v1/refunds/request')
          .send({
            bookingId: testBooking.id,
            reason: 'customer_request',
          });

        const refundId = createResponse.body.data.id;

        const response = await request(app)
          .post(`/api/v1/refunds/${refundId}/review`)
          .set('X-Admin-API-Key', adminApiKey)
          .send({
            approved: true,
            reviewedBy: 'admin@test.com',
            reviewNotes: 'Approved for testing',
            customRefundPercentage: 75,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.reviewedBy).toBe('admin@test.com');
      });

      it('should reject refund with manual review', async () => {
        const nearFutureDate = new Date();
        nearFutureDate.setHours(nearFutureDate.getHours() + 12);
        testBooking.flight.departureTime = nearFutureDate;
        await AppDataSource.getRepository(Booking).save(testBooking);

        const createResponse = await request(app)
          .post('/api/v1/refunds/request')
          .send({
            bookingId: testBooking.id,
            reason: 'customer_request',
          });

        const refundId = createResponse.body.data.id;

        const response = await request(app)
          .post(`/api/v1/refunds/${refundId}/review`)
          .set('X-Admin-API-Key', adminApiKey)
          .send({
            approved: false,
            reviewedBy: 'admin@test.com',
            reviewNotes: 'Does not meet criteria',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('rejected');
      });

      it('should return 403 without admin API key', async () => {
        const response = await request(app)
          .post('/api/v1/refunds/00000000-0000-0000-0000-000000000000/review')
          .send({
            approved: true,
            reviewedBy: 'admin@test.com',
            reviewNotes: 'Test',
          });

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/v1/refunds/:id/audit-trail', () => {
      it('should get audit trail for a refund', async () => {
        const createResponse = await request(app)
          .post('/api/v1/refunds/request')
          .send({
            bookingId: testBooking.id,
            reason: 'customer_request',
          });

        const refundId = createResponse.body.data.id;

        const response = await request(app)
          .get(`/api/v1/refunds/${refundId}/audit-trail`)
          .set('X-Admin-API-Key', adminApiKey);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should return 403 without admin API key', async () => {
        const response = await request(app).get(
          '/api/v1/refunds/00000000-0000-0000-0000-000000000000/audit-trail'
        );

        expect(response.status).toBe(403);
      });
    });
  });
});
