import request from 'supertest';
import { app } from '../src/index';
import { initDataSource, AppDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Booking } from '../src/db/entities/Booking';

jest.mock('../src/services/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn(async () => ({ id: 'pi_bf_test', client_secret: 'cs_bf_test' })),
    },
    webhooks: {
      constructEvent: jest.fn((body: any) => JSON.parse(body.toString('utf8'))),
    },
  },
  stripeWebhookSecret: 'whsec_test',
}));

jest.mock('../src/services/soroban', () => ({
  buildCreateBookingUnsignedXdr: jest.fn(async () => ({ xdr: 'unsigned_xdr_bf' })),
  submitSignedSorobanXdr: jest.fn(async () => ({ txHash: 'txhash_bf' })),
  getTransactionStatus: jest.fn(async () => ({
    status: 'success',
    result: { bookingId: '42' },
  })),
}));

describe('Booking Flow Integration Tests', () => {
  let testFlight: Flight;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initDataSource();
  });

  beforeEach(async () => {
    const flightRepo = AppDataSource.getRepository(Flight);
    testFlight = await flightRepo.save(
      flightRepo.create({
        flightNumber: 'BF100',
        fromAirport: 'JFK',
        toAirport: 'LAX',
        departureTime: new Date(Date.now() + 86400000 * 7),
        priceCents: 45000,
        seatsAvailable: 100,
        airlineSorobanAddress: 'GAAIRLINEBF',
      })
    );
  });

  afterEach(async () => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const flightRepo = AppDataSource.getRepository(Flight);
    await bookingRepo.clear();
    await flightRepo.clear();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  describe('POST /api/v1/bookings', () => {
    it('should create a booking with unsigned XDR', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            sorobanAddress: 'GPASSENGERBF1',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.status).toBe('awaiting_payment');
      expect(response.body.soroban).toHaveProperty('unsignedXdr');
      expect(response.body.payment).toHaveProperty('clientSecret');
    });

    it('should reject booking without idempotency key', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            sorobanAddress: 'GPASSENGERBF2',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('should handle idempotent requests', async () => {
      const idempotencyKey = `test-${Date.now()}`;
      const bookingData = {
        flightId: testFlight.id,
        passenger: {
          email: 'idem@example.com',
          firstName: 'Idem',
          lastName: 'User',
          sorobanAddress: 'GPASSENGERBF3',
        },
      };

      const response1 = await request(app)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send(bookingData);

      expect(response1.status).toBe(201);
      const bookingId = response1.body.data.id;

      const response2 = await request(app)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send(bookingData);

      expect(response2.status).toBe(200);
      expect(response2.body.data.id).toBe(bookingId);
      expect(response2.body.idempotent).toBe(true);
    });

    it('should reject booking for sold out flight', async () => {
      const flightRepo = AppDataSource.getRepository(Flight);
      testFlight.seatsAvailable = 0;
      await flightRepo.save(testFlight);

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'soldout@example.com',
            firstName: 'Sold',
            lastName: 'Out',
            sorobanAddress: 'GPASSENGERBF4',
          },
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('FLIGHT_SOLD_OUT');
    });
  });

  describe('GET /api/v1/bookings/:id', () => {
    it('should retrieve booking by ID', async () => {
      const createResponse = await request(app)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'gettest@example.com',
            firstName: 'Get',
            lastName: 'Test',
            sorobanAddress: 'GPASSENGERBF5',
          },
        });

      const bookingId = createResponse.body.data.id;
      const response = await request(app).get(`/api/v1/bookings/${bookingId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(bookingId);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app).get(
        '/api/v1/bookings/00000000-0000-0000-0000-000000000099'
      );
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('POST /api/v1/bookings/:id/submit-onchain', () => {
    it('should submit signed transaction for paid booking', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'onchain@example.com',
          firstName: 'On',
          lastName: 'Chain',
          sorobanAddress: 'GPASSENGERBF6',
        },
        status: 'paid',
        amountCents: 45000,
        sorobanUnsignedXdr: 'test-xdr',
      });
      await bookingRepo.save(booking);

      const response = await request(app)
        .post(`/api/v1/bookings/${booking.id}/submit-onchain`)
        .send({ signedXdr: 'signed-test-xdr' });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('onchain_submitted');
      expect(response.body.data.sorobanTxHash).toBeDefined();
    });

    it('should reject submission for non-paid booking', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'notpaid@example.com',
          firstName: 'Not',
          lastName: 'Paid',
          sorobanAddress: 'GPASSENGERBF7',
        },
        status: 'awaiting_payment',
        amountCents: 45000,
      });
      await bookingRepo.save(booking);

      const response = await request(app)
        .post(`/api/v1/bookings/${booking.id}/submit-onchain`)
        .send({ signedXdr: 'signed-test-xdr' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('BOOKING_NOT_READY');
    });
  });

  describe('GET /api/v1/bookings/:id/transaction-status', () => {
    it('should return null transaction status for booking without tx hash', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'notx@example.com',
          firstName: 'No',
          lastName: 'Tx',
          sorobanAddress: 'GPASSENGERBF8',
        },
        status: 'awaiting_payment',
        amountCents: 45000,
      });
      await bookingRepo.save(booking);

      const response = await request(app).get(
        `/api/v1/bookings/${booking.id}/transaction-status`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactionStatus).toBeNull();
    });

    it('should return transaction status for booking with tx hash', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'withtx@example.com',
          firstName: 'With',
          lastName: 'Tx',
          sorobanAddress: 'GPASSENGERBF9',
        },
        status: 'onchain_submitted',
        amountCents: 45000,
        sorobanTxHash: 'txhash_status_test',
      });
      await bookingRepo.save(booking);

      const response = await request(app).get(
        `/api/v1/bookings/${booking.id}/transaction-status`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('bookingStatus');
      expect(response.body.data).toHaveProperty('transactionStatus');
    });
  });
});
