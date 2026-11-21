/**
 * #1188: automated v1 happy-path booking coverage.
 *
 * Drives the real flights and bookings routers through search, offer
 * selection, passenger entry, simulated payment, on-chain submission and
 * booking retrieval. External systems are mocked; the HTTP contracts and the
 * route wiring are not.
 */
jest.mock('../../src/services/errorTracking', () => ({
  captureException: jest.fn(),
  initializeErrorTracking: jest.fn(),
  isErrorTrackingInitialized: jest.fn(() => false),
  shutdownErrorTracking: jest.fn(),
  getSentryRelease: jest.fn(() => 'test'),
  checkSentryReleaseHealth: jest.fn(() => ({ healthy: false })),
  scrubEvent: jest.fn((event: unknown) => event),
}));

jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { walletAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA' };
    next();
  },
}));

jest.mock('../../src/middleware/rate-limit-tiers', () => ({
  excludingPaths: (middleware: any) => middleware,
  bookingRateLimit: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/websockets/server', () => ({
  getWebSocketServer: () => ({ broadcastBookingStatus: jest.fn() }),
}));

jest.mock('../../src/services/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (body: Buffer) => JSON.parse(body.toString('utf8')),
    },
    paymentIntents: { create: jest.fn() },
  }),
  stripeWebhookSecret: 'whsec_happy_path_test',
}));

jest.mock('../../src/services/soroban', () => ({
  submitSignedSorobanXdr: jest.fn().mockResolvedValue({
    txHash: 'txhash_happy_path',
    innerTxHash: 'txhash_happy_path',
    isFeeBump: false,
  }),
  buildCreateBookingUnsignedXdr: jest.fn(),
  getTransactionStatus: jest.fn().mockResolvedValue({
    status: 'success',
    txHash: 'txhash_happy_path',
    result: 'onchain-booking-1',
    isFeeBump: false,
  }),
}));

jest.mock('../../src/services/idempotency', () => ({
  hashObject: (value: unknown) => JSON.stringify(value),
  getOrCreateIdempotencyKey: jest.fn(async ({ key, requestHash }: { key: string; requestHash: string }) => ({
    id: `idem-${key}`,
    key,
    method: 'POST',
    path: '/api/v1/bookings',
    requestHash,
    resourceId: null,
  })),
}));

const mockStores: Record<string, Map<string, any>> = {
  Booking: new Map(),
  Passenger: new Map(),
  IdempotencyKey: new Map(),
};

const mockMakeRepo = (store: Map<string, any>) => ({
  create: (data: any) => ({ ...data }),
  save: async (entity: any) => {
    entity.id = entity.id || `generated-${store.size + 1}`;
    store.set(entity.id, entity);
    return entity;
  },
  findOne: async ({ where }: any) => {
    const id = where.id || where.stripePaymentIntentId;
    if (!id) return null;
    if (where.id) return store.get(id) || null;
    return [...store.values()].find((item) => item.stripePaymentIntentId === id) || null;
  },
  count: async () => store.size,
  clear: async () => store.clear(),
});

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: (entity: any) => mockMakeRepo(mockStores[entity.name]),
  },
  initDataSource: jest.fn(),
}));

const mockCreateBooking = jest.fn(async (input: any) => {
  const booking = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    flightId: input.flightId,
    passenger: input.passenger,
    status: 'awaiting_payment',
    amountCents: 45000,
    stripePaymentIntentId: 'pi_happy_path',
    stripeClientSecret: 'cs_happy_path',
    sorobanUnsignedXdr: 'unsigned_xdr_happy_path',
  };
  mockStores.Booking.set(booking.id, booking);
  return booking;
});

jest.mock('../../src/services/bookingOrchestrationService', () => ({
  BookingOrchestrationService: jest.fn().mockImplementation(() => ({
    createBooking: mockCreateBooking,
    getTransactionStatus: jest.fn(async () => ({
      bookingStatus: 'onchain_submitted',
      transactionStatus: { status: 'success' },
    })),
  })),
}));

import express from 'express';
import request from 'supertest';
import { createFlightRoutes } from '../../src/api/routes/flights';
import { bookingRoutes } from '../../src/api/routes/bookings';
import { errorHandler } from '../../src/utils/errorHandler';

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
const FLIGHT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockSearchFlights = jest.fn().mockResolvedValue({
  success: true,
  data: [
    {
      id: FLIGHT_ID,
      flightNumber: 'HP100',
      origin: 'JFK',
      destination: 'LAX',
      date: '2026-12-25',
      pricing: { usd: 450, xlm: 3750 },
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1 },
});

const mockApp = express();
mockApp.use('/api/v1/bookings/webhook/stripe', express.raw({ type: '*/*' }));
mockApp.use(express.json());
mockApp.use('/api/v1/flights', createFlightRoutes({ searchFlights: mockSearchFlights } as any));
mockApp.use('/api/v1/bookings', bookingRoutes);
mockApp.use(errorHandler);

describe('v1 booking happy path (#1188)', () => {
  beforeEach(() => {
    Object.values(mockStores).forEach((store) => store.clear());
    mockCreateBooking.mockClear();
    mockSearchFlights.mockClear();
  });

  it('searches, selects an offer, pays, confirms and retrieves the booking', async () => {
    const search = await request(mockApp).get('/api/v1/flights/search').query({
      from: 'JFK',
      to: 'LAX',
      date: '2026-12-25',
      passengers: 1,
    });
    expect(search.status).toBe(200);
    expect(search.body.success).toBe(true);
    expect(search.body.data[0].id).toBe(FLIGHT_ID);

    const created = await request(mockApp)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'happy-path-1')
      .send({
        flightId: search.body.data[0].id,
        passenger: {
          email: 'happy@example.com',
          firstName: 'Happy',
          lastName: 'Path',
          sorobanAddress: WALLET,
        },
      });
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data.status).toBe('awaiting_payment');
    expect(created.body.payment.clientSecret).toBe('cs_happy_path');
    expect(created.body.soroban.unsignedXdr).toBe('unsigned_xdr_happy_path');

    const paid = await request(mockApp)
      .post('/api/v1/bookings/webhook/stripe')
      .set('Stripe-Signature', 'test-signature')
      .send({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_happy_path' } },
      });
    expect(paid.status).toBe(200);
    expect(paid.body).toEqual({ received: true });
    expect(mockStores.Booking.get('550e8400-e29b-41d4-a716-446655440001').status).toBe('paid');

    const submitted = await request(mockApp)
      .post('/api/v1/bookings/550e8400-e29b-41d4-a716-446655440001/submit-onchain')
      .send({ signedXdr: 'signed_xdr_happy_path' });
    expect(submitted.status).toBe(202);
    expect(submitted.body.data.status).toBe('onchain_submitted');
    expect(submitted.body.soroban.txHash).toBe('txhash_happy_path');

    const status = await request(mockApp).get('/api/v1/bookings/550e8400-e29b-41d4-a716-446655440001/transaction-status');
    expect(status.status).toBe(200);
    expect(status.body.data.transactionStatus.status).toBe('success');

    const retrieved = await request(mockApp).get('/api/v1/bookings/550e8400-e29b-41d4-a716-446655440001');
    expect(retrieved.status).toBe(200);
    expect(retrieved.body.data.id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(retrieved.body.data.status).toBe('confirmed');
  });

  it('rejects an invalid search query before reaching the provider', async () => {
    const res = await request(mockApp).get('/api/v1/flights/search').query({
      from: 'JFK',
      date: 'not-a-date',
      passengers: 1,
    });

    expect(res.status).toBe(400);
    expect(mockSearchFlights).not.toHaveBeenCalled();
  });

  it('rejects a booking whose passenger wallet does not match the caller', async () => {
    const res = await request(mockApp)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'happy-path-mismatch')
      .send({
        flightId: FLIGHT_ID,
        passenger: {
          email: 'mismatch@example.com',
          firstName: 'Wrong',
          lastName: 'Wallet',
          sorobanAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        },
      });

    expect(res.status).toBe(400);
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });
});
