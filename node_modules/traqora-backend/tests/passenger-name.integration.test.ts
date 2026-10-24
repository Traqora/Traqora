import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { initDataSource, AppDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Booking } from '../src/db/entities/Booking';
import { Passenger } from '../src/db/entities/Passenger';
import { config } from '../src/config';

const validToken = jwt.sign(
  { walletAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA', walletType: 'freighter' },
  config.jwtSecret,
  { expiresIn: '1h' }
);

jest.mock('../src/services/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn(async () => ({ id: 'pi_name_test', client_secret: 'cs_name_test' })),
    },
    webhooks: {
      constructEvent: jest.fn((body: any) => JSON.parse(body.toString('utf8'))),
    },
  },
  stripeWebhookSecret: 'whsec_test',
}));

jest.mock('../src/services/soroban', () => ({
  buildCreateBookingUnsignedXdr: jest.fn(async () => ({ xdr: 'unsigned_xdr_name' })),
  submitSignedSorobanXdr: jest.fn(async () => ({ txHash: 'txhash_name' })),
  getTransactionStatus: jest.fn(async () => ({ status: 'success', result: { bookingId: '99' } })),
  signAndSubmitCreateBooking: jest.fn(async () => ({ txHash: 'txhash_name', bookingId: '99' })),
}));

describe('Passenger Name Management Integration Tests', () => {
  let testFlight: Flight;
  let testBooking: Booking;
  let testPassenger: Passenger;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initDataSource();
  });

  beforeEach(async () => {
    const flightRepo = AppDataSource.getRepository(Flight);
    testFlight = await flightRepo.save(
      flightRepo.create({
        flightNumber: 'PN100',
        fromAirport: 'JFK',
        toAirport: 'LAX',
        departureTime: new Date(Date.now() + 86400000 * 7),
        priceCents: 45000,
        seatsAvailable: 100,
        airlineSorobanAddress: 'GAAIRLINEPN',
      })
    );

    const passengerRepo = AppDataSource.getRepository(Passenger);
    testPassenger = await passengerRepo.save(
      passengerRepo.create({
        email: 'passenger@test.com',
        firstName: 'John',
        lastName: 'Doe',
        sorobanAddress: 'GPASSENGERPN',
      })
    );

    const bookingRepo = AppDataSource.getRepository(Booking);
    testBooking = await bookingRepo.save(
      bookingRepo.create({
        flight: testFlight,
        passenger: testPassenger,
        status: 'confirmed',
        amountCents: 45000,
      })
    );
  });

  afterEach(async () => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const flightRepo = AppDataSource.getRepository(Flight);
    await bookingRepo.clear();
    await passengerRepo.clear();
    await flightRepo.clear();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  describe('PATCH /api/v1/bookings/:id/passengers/:passengerId', () => {
    it('should update passenger details', async () => {
      const response = await request(app)
        .patch(`/api/v1/bookings/${testBooking.id}/passengers/${testPassenger.id}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ firstName: 'Jonathan', middleName: 'Michael', title: 'Mr' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe('Jonathan');
    });

    it('should return 404 for non-existent passenger', async () => {
      const response = await request(app)
        .patch(`/api/v1/bookings/${testBooking.id}/passengers/nonexistent-id`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ firstName: 'Jane' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/bookings/:id/passengers/:passengerId/correct-name', () => {
    it('should submit a name correction request', async () => {
      const response = await request(app)
        .post(`/api/v1/bookings/${testBooking.id}/passengers/${testPassenger.id}/correct-name`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          correctedName: { firstName: 'Jonathan', lastName: 'Doe' },
          reason: 'typo_in_first_name',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.originalName.firstName).toBe('John');
      expect(response.body.data.correctedName.firstName).toBe('Jonathan');
    });

    it('should reject with invalid reason', async () => {
      const response = await request(app)
        .post(`/api/v1/bookings/${testBooking.id}/passengers/${testPassenger.id}/correct-name`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          correctedName: { firstName: 'Jane', lastName: 'Doe' },
          reason: 'short',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/bookings/:id/passengers/:passengerId/name-history', () => {
    it('should return empty history for new passenger', async () => {
      const response = await request(app)
        .get(`/api/v1/bookings/${testBooking.id}/passengers/${testPassenger.id}/name-history`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/bookings/:id/passengers/:passengerId/name-change-fee', () => {
    it('should return zero fee for minor correction', async () => {
      const response = await request(app)
        .get(`/api/v1/bookings/${testBooking.id}/passengers/${testPassenger.id}/name-change-fee?minor=true`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.feeCents).toBe(0);
    });

    it('should return fee for major correction', async () => {
      const response = await request(app)
        .get(`/api/v1/bookings/${testBooking.id}/passengers/${testPassenger.id}/name-change-fee`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.feeCents).toBeGreaterThan(0);
    });
  });
});
