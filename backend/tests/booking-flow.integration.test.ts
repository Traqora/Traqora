import request from 'supertest';
import { app } from '../src/index';
import { initDataSource, AppDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Booking } from '../src/db/entities/Booking';

describe('Booking Flow Integration Tests', () => {
  let testFlight: Flight;

  beforeAll(async () => {
    await initDataSource();
  });

  beforeEach(async () => {
    // Create a test flight
    const flightRepo = AppDataSource.getRepository(Flight);
    testFlight = flightRepo.create({
      airline: 'Test Airlines',
      flightNumber: 'TA123',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime: new Date(Date.now() + 86400000 * 7), // 7 days from now
      arrivalTime: new Date(Date.now() + 86400000 * 7 + 21600000), // 7 days + 6 hours
      priceCents: 45000,
      currency: 'USD',
      seatsAvailable: 100,
      airlineSorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    });
    await flightRepo.save(testFlight);
  });

  afterEach(async () => {
    // Clean up test data
    const bookingRepo = AppDataSource.getRepository(Booking);
    const flightRepo = AppDataSource.getRepository(Flight);
    await bookingRepo.delete({});
    await flightRepo.delete({});
  });

  describe('POST /api/bookings', () => {
    it('should create a booking with unsigned XDR', async () => {
      const idempotencyKey = `test-${Date.now()}`;
      const response = await request(app)
        .post('/api/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1234567890',
            sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
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
        .post('/api/bookings')
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
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
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        },
      };

      // First request
      const response1 = await request(app)
        .post('/api/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send(bookingData);

      expect(response1.status).toBe(201);
      const bookingId = response1.body.data.id;

      // Second request with same key
      const response2 = await request(app)
        .post('/api/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send(bookingData);

      expect(response2.status).toBe(200);
      expect(response2.body.data.id).toBe(bookingId);
      expect(response2.body.idempotent).toBe(true);
    });

    it('should reject booking for sold out flight', async () => {
      // Update flight to have 0 seats
      const flightRepo = AppDataSource.getRepository(Flight);
      testFlight.seatsAvailable = 0;
      await flightRepo.save(testFlight);

      const response = await request(app)
        .post('/api/bookings')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          },
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('FLIGHT_SOLD_OUT');
    });
  });

  describe('GET /api/bookings/:id', () => {
    it('should retrieve booking by ID', async () => {
      // Create a booking first
      const createResponse = await request(app)
        .post('/api/bookings')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          },
        });

      const bookingId = createResponse.body.data.id;

      // Retrieve the booking
      const response = await request(app).get(`/api/bookings/${bookingId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(bookingId);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app).get('/api/bookings/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('POST /api/bookings/:id/submit-onchain', () => {
    it('should submit signed transaction', async () => {
      // Create a booking and mark as paid
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        },
        status: 'paid',
        amountCents: 45000,
        sorobanUnsignedXdr: 'test-xdr',
      });
      await bookingRepo.save(booking);

      const response = await request(app)
        .post(`/api/bookings/${booking.id}/submit-onchain`)
        .send({
          signedXdr: 'signed-test-xdr',
        });

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
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        },
        status: 'awaiting_payment',
        amountCents: 45000,
      });
      await bookingRepo.save(booking);

      const response = await request(app)
        .post(`/api/bookings/${booking.id}/submit-onchain`)
        .send({
          signedXdr: 'signed-test-xdr',
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('BOOKING_NOT_READY');
    });
  });

  describe('GET /api/bookings/:id/transaction-status', () => {
    it('should return transaction status for booking with tx hash', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        },
        status: 'onchain_submitted',
        amountCents: 45000,
        sorobanTxHash: '0xtest123',
      });
      await bookingRepo.save(booking);

      const response = await request(app).get(
        `/api/bookings/${booking.id}/transaction-status`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('bookingStatus');
      expect(response.body.data).toHaveProperty('transactionStatus');
    });

    it('should return null transaction status for booking without tx hash', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        },
        status: 'awaiting_payment',
        amountCents: 45000,
      });
      await bookingRepo.save(booking);

      const response = await request(app).get(
        `/api/bookings/${booking.id}/transaction-status`
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactionStatus).toBeNull();
    });

    it('should update booking status when transaction succeeds', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = bookingRepo.create({
        flight: testFlight,
        passenger: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        },
        status: 'onchain_submitted',
        amountCents: 45000,
        sorobanTxHash: '0xtest123', // Mock hash that returns success
      });
      await bookingRepo.save(booking);

      const response = await request(app).get(
        `/api/bookings/${booking.id}/transaction-status`
      );

      expect(response.status).toBe(200);
      
      // Verify booking status was updated
      const updatedBooking = await bookingRepo.findOne({
        where: { id: booking.id },
      });
      expect(updatedBooking?.status).toBe('confirmed');
    });
  });

  describe('Complete Booking Flow', () => {
    it('should complete full booking flow from creation to confirmation', async () => {
      // Step 1: Create booking
      const createResponse = await request(app)
        .post('/api/bookings')
        .set('Idempotency-Key', `test-${Date.now()}`)
        .send({
          flightId: testFlight.id,
          passenger: {
            email: 'test@example.com',
            firstName: 'John',
            lastName: 'Doe',
            sorobanAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          },
        });

      expect(createResponse.status).toBe(201);
      const bookingId = createResponse.body.data.id;
      const unsignedXdr = createResponse.body.soroban.unsignedXdr;

      // Step 2: Simulate payment (mark as paid)
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = await bookingRepo.findOne({ where: { id: bookingId } });
      booking!.status = 'paid';
      await bookingRepo.save(booking!);

      // Step 3: Submit signed transaction
      const submitResponse = await request(app)
        .post(`/api/bookings/${bookingId}/submit-onchain`)
        .send({
          signedXdr: `signed-${unsignedXdr}`,
        });

      expect(submitResponse.status).toBe(202);
      expect(submitResponse.body.data.status).toBe('onchain_submitted');
      expect(submitResponse.body.data.sorobanTxHash).toBeDefined();

      // Step 4: Check transaction status
      const statusResponse = await request(app).get(
        `/api/bookings/${bookingId}/transaction-status`
      );

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.transactionStatus).toBeDefined();

      // Step 5: Verify final booking state
      const finalBooking = await bookingRepo.findOne({
        where: { id: bookingId },
      });
      expect(finalBooking?.sorobanTxHash).toBeDefined();
      expect(finalBooking?.contractSubmitAttempts).toBeGreaterThan(0);
    });
  });
});
