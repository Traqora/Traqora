import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { initDataSource, AppDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Booking } from '../src/db/entities/Booking';
import { Passenger } from '../src/db/entities/Passenger';
import { config } from '../src/config';
import { AmadeusAnalyticsClient } from '../src/services/amadeus/amadeusClient';

type MockAmadeus = jest.Mocked<AmadeusAnalyticsClient>;

const validToken = jwt.sign(
  { walletAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA', walletType: 'freighter' },
  config.jwtSecret,
  { expiresIn: '1h' }
);

jest.mock('../src/services/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn(async () => ({ id: 'pi_flow_test', client_secret: 'cs_flow_test' })),
    },
    webhooks: {
      constructEvent: jest.fn((body: Buffer) => {
        const parsed = JSON.parse(body.toString('utf8'));
        return {
          type: parsed.type,
          data: { object: parsed.data?.object || parsed.data },
        };
      }),
    },
  },
  stripeWebhookSecret: 'whsec_flow_test',
}));

jest.mock('../src/services/soroban', () => ({
  buildCreateBookingUnsignedXdr: jest.fn(async () => ({ xdr: 'unsigned_xdr_flow' })),
  submitSignedSorobanXdr: jest.fn(async (signedXdr: string) => {
    if (signedXdr === 'signed_xdr_success') {
      return { txHash: 'txhash_flow_success' };
    }
    if (signedXdr === 'signed_xdr_fail') {
      throw new Error('Soroban transaction failed');
    }
    return { txHash: 'txhash_flow_' + Date.now() };
  }),
  getTransactionStatus: jest.fn(async (txHash: string) => {
    if (txHash === 'txhash_flow_fail') {
      return { status: 'failed', error: 'Insufficient funds' };
    }
    if (txHash === 'txhash_flow_pending') {
      return { status: 'pending' };
    }
    if (txHash === 'txhash_flow_not_found') {
      return { status: 'not_found' };
    }
    return { status: 'success', result: { bookingId: '42' } };
  }),
  signAndSubmitCreateBooking: jest.fn(async () => ({ txHash: 'txhash_flow', bookingId: '42' })),
}));

const mockAmadeusSearch = jest.fn();
jest.mock('../src/services/amadeus/amadeusClient', () => {
  return {
    AmadeusAnalyticsClient: jest.fn().mockImplementation(() => ({
      authenticate: jest.fn().mockResolvedValue('mock-token'),
      searchFlights: mockAmadeusSearch,
      getFlightStatus: jest.fn(),
      getAirportDetails: jest.fn(),
      normalizeFlightData: jest.fn(),
      healthCheck: jest.fn(),
      getAnalytics: jest.fn(),
    })),
  };
});

function generateIdempotencyKey(): string {
  return `flow-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function createBookingPayload(flightId: string, sorobanSuffix: string = '1') {
  return {
    flightId,
    passenger: {
      email: `flow${sorobanSuffix}@example.com`,
      firstName: 'Flow',
      lastName: `Test${sorobanSuffix}`,
      sorobanAddress: `GPASSENGERFLOW${sorobanSuffix}`,
    },
  };
}

describe('Booking Flow Integration Tests', () => {
  let testFlight: Flight;
  let lowInventoryFlight: Flight;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initDataSource();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const flightRepo = AppDataSource.getRepository(Flight);
    testFlight = await flightRepo.save(
      flightRepo.create({
        flightNumber: 'FLOW100',
        airlineCode: 'DL',
        fromAirport: 'JFK',
        toAirport: 'LAX',
        departureTime: new Date(Date.now() + 86400000 * 14),
        arrivalTime: new Date(Date.now() + 86400000 * 14 + 3600000 * 6),
        priceCents: 45000,
        seatsAvailable: 100,
        airlineSorobanAddress: 'GAAIRLINEFLOW',
        status: 'SCHEDULED',
      })
    );
    lowInventoryFlight = await flightRepo.save(
      flightRepo.create({
        flightNumber: 'FLOW101',
        airlineCode: 'UA',
        fromAirport: 'SFO',
        toAirport: 'ORD',
        departureTime: new Date(Date.now() + 86400000 * 7),
        arrivalTime: new Date(Date.now() + 86400000 * 7 + 3600000 * 4),
        priceCents: 25000,
        seatsAvailable: 1,
        airlineSorobanAddress: 'GAAIRLINEFLOW2',
        status: 'SCHEDULED',
      })
    );
  });

  afterEach(async () => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const flightRepo = AppDataSource.getRepository(Flight);
    const passengerRepo = AppDataSource.getRepository(Passenger);
    await bookingRepo.delete({});
    await passengerRepo.delete({});
    await flightRepo.delete({});
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  describe('Flight Search (mocked Amadeus)', () => {
    it('should return flights from search with mocked Amadeus data', async () => {
      const mockFlights = [
        {
          id: '1',
          type: 'flight-offer',
          source: 'GDS',
          itineraries: [{
            duration: 'PT6H15M',
            segments: [{
              departure: { iataCode: 'JFK', at: '2026-05-01T09:00:00' },
              arrival: { iataCode: 'LAX', at: '2026-05-01T12:15:00' },
              operatingCarrier: { carrierCode: 'DL' },
              number: '100',
              aircraft: { code: '738' },
            }],
          }],
          price: { currency: 'USD', total: '450.00', base: '400.00', grandTotal: '450.00' },
          numberOfBookableSeats: 50,
          pricingOptions: { fareType: ['published'], includedCheckedBagsOnly: true },
          validatingAirlineCodes: ['DL'],
          travelerPricings: [{
            travelerId: '1', fareOption: 'PUBLISHED', travelerType: 'ADULT',
            price: { currency: 'USD', total: '450.00' },
            fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY' }],
          }],
        },
      ];

      mockAmadeusSearch.mockResolvedValueOnce(mockFlights);

      const response = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LAX', date: '2026-05-01', passengers: 1 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });

    it('should handle Amadeus search returning empty results', async () => {
      mockAmadeusSearch.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LAX', date: '2026-05-01', passengers: 1 });

      expect(response.status).toBe(200);
    });

    it('should validate search parameters', async () => {
      const response = await request(app)
        .get('/api/flights/search')
        .query({ date: '2026-05-01', passengers: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/bookings - Booking Creation', () => {
    it('should create a booking successfully', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, '1'));

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.flightId || response.body.data.flight?.id).toBe(testFlight.id);
      expect(response.body.data.amountCents).toBe(45000);

      const bookingRepo = AppDataSource.getRepository(Booking);
      const saved = await bookingRepo.findOne({ where: { id: response.body.data.id } });
      expect(saved).not.toBeNull();
      expect(saved!.status).toBeDefined();
    });

    it('should reject booking without auth token', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, '2'));

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject booking without idempotency key', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .send(createBookingPayload(testFlight.id, '3'));

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle idempotent requests', async () => {
      const idempotencyKey = generateIdempotencyKey();
      const payload = createBookingPayload(testFlight.id, '4');

      const response1 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(response1.status).toBe(201);
      const bookingId = response1.body.data.id;

      const response2 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

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
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, '5'));

      expect(response.status).toBe(409);
    });

    it('should decrement seat inventory on successful booking', async () => {
      const flightRepo = AppDataSource.getRepository(Flight);
      const initialSeats = testFlight.seatsAvailable;

      await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, '6'));

      const updatedFlight = await flightRepo.findOne({ where: { id: testFlight.id } });
      expect(updatedFlight!.seatsAvailable).toBe(initialSeats - 1);
    });

    it('should save passenger data correctly in database', async () => {
      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, '7'));

      const passengerRepo = AppDataSource.getRepository(Passenger);
      const passengers = await passengerRepo.find();
      const match = passengers.find(p =>
        p.firstName === 'Flow' && p.lastName === 'Test7'
      );
      expect(match).toBeDefined();
      expect(match!.email).toBe('flow7@example.com');
      expect(match!.sorobanAddress).toBe('GPASSENGERFLOW7');
    });

    it('should handle concurrent booking of last seat', async () => {
      const flightRepo = AppDataSource.getRepository(Flight);
      lowInventoryFlight.seatsAvailable = 1;
      await flightRepo.save(lowInventoryFlight);

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', generateIdempotencyKey())
          .send(createBookingPayload(lowInventoryFlight.id, 'conc1')),
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', generateIdempotencyKey())
          .send(createBookingPayload(lowInventoryFlight.id, 'conc2')),
      ]);

      const successes = [res1, res2].filter(r => r.status === 201).length;
      const conflicts = [res1, res2].filter(r => r.status === 409).length;
      expect(successes).toBe(1);
      expect(conflicts).toBe(1);

      const updatedFlight = await flightRepo.findOne({ where: { id: lowInventoryFlight.id } });
      expect(updatedFlight!.seatsAvailable).toBe(0);
    });
  });

  describe('GET /api/v1/bookings/:id - Booking Retrieval', () => {
    it('should retrieve booking by ID', async () => {
      const createResponse = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, '10'));

      const bookingId = createResponse.body.data.id;
      const response = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(bookingId);
    });

    it('should return 404 for non-existent booking', async () => {
      const response = await request(app)
        .get('/api/v1/bookings/00000000-0000-0000-0000-000000000099')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
    });

    it('should verify database state after retrieval matches creation', async () => {
      const payload = createBookingPayload(testFlight.id, '11');
      const createResponse = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(payload);

      const bookingId = createResponse.body.data.id;
      const bookingRepo = AppDataSource.getRepository(Booking);
      const dbBooking = await bookingRepo.findOne({ where: { id: bookingId } });

      expect(dbBooking).not.toBeNull();
      expect(dbBooking!.amountCents).toBe(45000);
      expect(dbBooking!.flight.id).toBe(testFlight.id);
    });
  });

  describe('Stripe Webhook - Payment Processing', () => {
    async function createPaidBooking(): Promise<{ bookingId: string; stripePaymentIntentId: string }> {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'pay1'));

      return {
        bookingId: createRes.body.data.id,
        stripePaymentIntentId: createRes.body.data.stripePaymentIntentId || 'pi_flow_test',
      };
    }

    it('should mark booking as paid via stripe webhook', async () => {
      const { bookingId, stripePaymentIntentId } = await createPaidBooking();

      const webhookRes = await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_flow_test')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(JSON.stringify({
            type: 'payment_intent.succeeded',
            data: { object: { id: stripePaymentIntentId } },
          }))
        );

      expect(webhookRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(getRes.body.data.status).toBe('paid');
    });

    it('should verify database state after payment', async () => {
      const { bookingId, stripePaymentIntentId } = await createPaidBooking();

      await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_flow_test')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(JSON.stringify({
            type: 'payment_intent.succeeded',
            data: { object: { id: stripePaymentIntentId } },
          }))
        );

      const bookingRepo = AppDataSource.getRepository(Booking);
      const dbBooking = await bookingRepo.findOne({ where: { id: bookingId } });
      expect(dbBooking!.status).toBe('paid');
      expect(dbBooking!.stripePaymentIntentId).toBe(stripePaymentIntentId);
    });

    it('should reject webhook with invalid signature', async () => {
      const { stripePaymentIntentId } = await createPaidBooking();

      const webhookRes = await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', '')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(JSON.stringify({
            type: 'payment_intent.succeeded',
            data: { object: { id: stripePaymentIntentId } },
          }))
        );

      expect(webhookRes.status).toBe(400);
    });
  });

  describe('POST /api/v1/bookings/:id/submit-onchain - On-chain Submission', () => {
    async function createPaidBookingForOnchain(): Promise<string> {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'on1'));

      const bookingId = createRes.body.data.id;
      const stripePaymentIntentId = createRes.body.data.stripePaymentIntentId || 'pi_flow_test';

      await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_flow_test')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(JSON.stringify({
            type: 'payment_intent.succeeded',
            data: { object: { id: stripePaymentIntentId } },
          }))
        );

      return bookingId;
    }

    it('should submit signed transaction for paid booking', async () => {
      const bookingId = await createPaidBookingForOnchain();

      const response = await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ signedXdr: 'signed_xdr_success' });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('onchain_submitted');
      expect(response.body.data.sorobanTxHash).toBe('txhash_flow_success');
    });

    it('should reject submission for non-paid booking', async () => {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'on2'));

      const bookingId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ signedXdr: 'signed_xdr_success' });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    it('should verify database state after on-chain submission', async () => {
      const bookingId = await createPaidBookingForOnchain();

      await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ signedXdr: 'signed_xdr_success' });

      const bookingRepo = AppDataSource.getRepository(Booking);
      const dbBooking = await bookingRepo.findOne({ where: { id: bookingId } });
      expect(dbBooking!.status).toBe('onchain_submitted');
      expect(dbBooking!.sorobanTxHash).toBe('txhash_flow_success');
      expect(dbBooking!.contractSubmitAttempts).toBe(1);
    });

    it('should handle Soroban transaction failure during submission', async () => {
      const bookingId = await createPaidBookingForOnchain();

      const response = await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ signedXdr: 'signed_xdr_fail' });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/v1/bookings/:id/transaction-status - Transaction Polling', () => {
    async function createSubmittedBooking(txHash: string): Promise<string> {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const passengerRepo = AppDataSource.getRepository(Passenger);
      const passenger = passengerRepo.create({
        email: 'status@example.com',
        firstName: 'Status',
        lastName: 'Test',
        sorobanAddress: 'GPASSENGERSTATUS',
      });
      await passengerRepo.save(passenger);

      const booking = bookingRepo.create({
        flight: testFlight,
        passenger,
        status: 'onchain_submitted',
        amountCents: 45000,
        sorobanTxHash: txHash,
      });
      await bookingRepo.save(booking);
      return booking.id;
    }

    it('should return success status for confirmed transaction', async () => {
      const bookingId = await createSubmittedBooking('txhash_flow_success');

      const response = await request(app)
        .get(`/api/v1/bookings/${bookingId}/transaction-status`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return null transaction status for booking without tx hash', async () => {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const passengerRepo = AppDataSource.getRepository(Passenger);
      const passenger = passengerRepo.create({
        email: 'notx@example.com',
        firstName: 'No',
        lastName: 'Tx',
        sorobanAddress: 'GPASSENGERNOTX',
      });
      await passengerRepo.save(passenger);

      const booking = bookingRepo.create({
        flight: testFlight,
        passenger,
        status: 'awaiting_payment',
        amountCents: 45000,
      });
      await bookingRepo.save(booking);

      const response = await request(app)
        .get(`/api/v1/bookings/${booking.id}/transaction-status`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
    });

    it('should report failed transaction status', async () => {
      const bookingId = await createSubmittedBooking('txhash_flow_fail');

      const response = await request(app)
        .get(`/api/v1/bookings/${bookingId}/transaction-status`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should report pending transaction status', async () => {
      const bookingId = await createSubmittedBooking('txhash_flow_pending');

      const response = await request(app)
        .get(`/api/v1/bookings/${bookingId}/transaction-status`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Full Booking Lifecycle', () => {
    it('should complete search -> book -> pay -> onchain -> confirm flow', async () => {
      const mockFlights = [{
        id: '1',
        type: 'flight-offer',
        source: 'GDS',
        itineraries: [{
          duration: 'PT6H15M',
          segments: [{
            departure: { iataCode: 'JFK', at: '2026-05-01T09:00:00' },
            arrival: { iataCode: 'LAX', at: '2026-05-01T12:15:00' },
            operatingCarrier: { carrierCode: 'DL' },
            number: '100',
            aircraft: { code: '738' },
          }],
        }],
        price: { currency: 'USD', total: '450.00', base: '400.00', grandTotal: '450.00' },
        numberOfBookableSeats: 50,
        pricingOptions: { fareType: ['published'], includedCheckedBagsOnly: true },
        validatingAirlineCodes: ['DL'],
        travelerPricings: [{
          travelerId: '1', fareOption: 'PUBLISHED', travelerType: 'ADULT',
          price: { currency: 'USD', total: '450.00' },
          fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY' }],
        }],
      }];
      mockAmadeusSearch.mockResolvedValueOnce(mockFlights);

      const searchRes = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LAX', date: '2026-05-01', passengers: 1 });
      expect(searchRes.status).toBe(200);

      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'life1'));
      expect(createRes.status).toBe(201);
      const bookingId = createRes.body.data.id;
      const pid = createRes.body.data.stripePaymentIntentId || 'pi_flow_test';

      const webhookRes = await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_flow_test')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(JSON.stringify({
            type: 'payment_intent.succeeded',
            data: { object: { id: pid } },
          }))
        );
      expect(webhookRes.status).toBe(200);

      const paidRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(paidRes.body.data.status).toBe('paid');

      const submitRes = await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ signedXdr: 'signed_xdr_success' });
      expect(submitRes.status).toBe(202);
      expect(submitRes.body.data.status).toBe('onchain_submitted');

      const txStatusRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}/transaction-status`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(txStatusRes.status).toBe(200);
    });

    it('should preserve database state across the entire lifecycle', async () => {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'life2'));
      const bookingId = createRes.body.data.id;

      const bookingRepo = AppDataSource.getRepository(Booking);
      let dbBooking = await bookingRepo.findOne({ where: { id: bookingId } });
      expect(dbBooking!.status).toBeDefined();

      const pid = createRes.body.data.stripePaymentIntentId || 'pi_flow_test';
      await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_flow_test')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify({
          type: 'payment_intent.succeeded',
          data: { object: { id: pid } },
        })));

      dbBooking = await bookingRepo.findOne({ where: { id: bookingId } });
      expect(dbBooking!.status).toBe('paid');
      expect(dbBooking!.stripePaymentIntentId).toBe(pid);

      await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ signedXdr: 'signed_xdr_success' });

      dbBooking = await bookingRepo.findOne({ where: { id: bookingId } });
      expect(dbBooking!.status).toBe('onchain_submitted');
      expect(dbBooking!.sorobanTxHash).toBe('txhash_flow_success');
    });
  });

  describe('Failure Scenarios', () => {
    it('should handle payment declined scenario', async () => {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'fail1'));
      const bookingId = createRes.body.data.id;

      const webhookRes = await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_flow_test')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(JSON.stringify({
            type: 'payment_intent.payment_failed',
            data: { object: { id: createRes.body.data.stripePaymentIntentId || 'pi_flow_test' } },
          }))
        );
      expect(webhookRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(getRes.body.data.status).toBe('awaiting_payment');
    });

    it('should handle transaction failure on-chain', async () => {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'fail2'));
      const bookingId = createRes.body.data.id;
      const pid = createRes.body.data.stripePaymentIntentId || 'pi_flow_test';

      await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_flow_test')
        .set('Content-Type', 'application/json')
        .send(Buffer.from(JSON.stringify({
          type: 'payment_intent.succeeded',
          data: { object: { id: pid } },
        })));

      const submitRes = await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ signedXdr: 'signed_xdr_fail' });

      expect(submitRes.status).toBe(409);
    });

    it('should handle inventory exhaustion during concurrent booking', async () => {
      const flightRepo = AppDataSource.getRepository(Flight);
      lowInventoryFlight.seatsAvailable = 2;
      await flightRepo.save(lowInventoryFlight);

      const results = await Promise.all([
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', generateIdempotencyKey())
          .send(createBookingPayload(lowInventoryFlight.id, 'race1')),
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', generateIdempotencyKey())
          .send(createBookingPayload(lowInventoryFlight.id, 'race2')),
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${validToken}`)
          .set('Idempotency-Key', generateIdempotencyKey())
          .send(createBookingPayload(lowInventoryFlight.id, 'race3')),
      ]);

      const successes = results.filter(r => r.status === 201).length;
      expect(successes).toBe(2);

      const updatedFlight = await flightRepo.findOne({ where: { id: lowInventoryFlight.id } });
      expect(updatedFlight!.seatsAvailable).toBe(0);
    });

    it('should handle invalid XDR submission', async () => {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'fail3'));
      const bookingId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should reject unauthorized booking access', async () => {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', generateIdempotencyKey())
        .send(createBookingPayload(testFlight.id, 'fail4'));

      const bookingId = createRes.body.data.id;

      const response = await request(app)
        .get(`/api/v1/bookings/${bookingId}`);

      expect(response.status).toBe(401);
    });
  });
});
