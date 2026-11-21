/**
 * #1191: API contract coverage for the documented v1 traveler journey.
 *
 * The tests exercise the real route wiring and validate both request
 * rejection and response envelopes against explicit Zod contracts. External
 * services are mocked so the suite is deterministic.
 */
// @ts-ignore
import { z } from 'zod';

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
const BOOKING_ID = '550e8400-e29b-41d4-a716-446655440000';
const CONFIRMED_BOOKING_ID = '550e8400-e29b-41d4-a716-446655440001';
const FLIGHT_ID = '550e8400-e29b-41d4-a716-446655440010';
const REFUND_ID = '550e8400-e29b-41d4-a716-446655440020';

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
    req.user = { walletAddress: WALLET };
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
    webhooks: { constructEvent: (body: Buffer) => JSON.parse(body.toString('utf8')) },
    paymentIntents: { create: jest.fn() },
  }),
  stripeWebhookSecret: 'whsec_contract_test',
}));

jest.mock('../../src/services/soroban', () => ({
  submitSignedSorobanXdr: jest.fn(),
  buildCreateBookingUnsignedXdr: jest.fn(),
  getTransactionStatus: jest.fn(),
}));

const mockCreateBooking = jest.fn();
const mockProcessCancellation = jest.fn();
const mockConfirmBookingTx = jest.fn();

jest.mock('../../src/services/bookingOrchestrationService', () => ({
  BookingOrchestrationService: jest.fn().mockImplementation(() => ({
    createBooking: mockCreateBooking,
    processCancellation: mockProcessCancellation,
  })),
}));

jest.mock('../../src/services/bookingConfirmRetry', () => ({
  confirmBookingTx: mockConfirmBookingTx,
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

const mockRefundService = {
  createRefundRequest: jest.fn(),
  getRefund: jest.fn(),
  checkOnchainStatus: jest.fn(),
};

const mockAuditService = {
  getAuditTrail: jest.fn(),
};

jest.mock('../../src/services/refundService', () => ({
  RefundService: { getInstance: () => mockRefundService },
}));

jest.mock('../../src/services/refundAuditService', () => ({
  RefundAuditService: { getInstance: () => mockAuditService },
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
    const id = where?.id;
    return id ? store.get(id) || null : null;
  },
  count: async () => store.size,
  clear: async () => store.clear(),
});

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: (entity: any) => mockMakeRepo(mockStores[entity.name] ?? new Map()),
  },
  initDataSource: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { createFlightRoutes } from '../../src/api/routes/flights';
import { bookingRoutes } from '../../src/api/routes/bookings';
import { refundRoutes } from '../../src/api/routes/refunds';
import { errorHandler } from '../../src/utils/errorHandler';

const bookingRecord = {
  id: BOOKING_ID,
  flightId: FLIGHT_ID,
  passenger: { id: '550e8400-e29b-41d4-a716-446655440030', sorobanAddress: WALLET },
  status: 'awaiting_payment',
  amountCents: 45000,
  stripePaymentIntentId: 'pi_contract_test',
  stripeClientSecret: 'cs_contract_test',
  sorobanTxHash: 'txhash_contract_test',
  sorobanUnsignedXdr: 'unsigned_xdr_contract_test',
};

const refundRecord = {
  id: REFUND_ID,
  bookingId: BOOKING_ID,
  status: 'pending_review',
  reason: 'flight_cancelled',
  reasonDetails: 'Airline cancelled the flight.',
  stripeRefundId: 're_contract_test',
  sorobanTxHash: null,
  approvedAmountCents: 45000,
  booking: bookingRecord,
};

const mockSearchFlights = jest.fn().mockResolvedValue({
  success: true,
  data: [
    {
      id: FLIGHT_ID,
      flightNumber: 'CT100',
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
mockApp.use('/api/v1/refunds', refundRoutes);
mockApp.use(errorHandler);

const errorSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string(),
    code: z.string(),
    timestamp: z.string(),
  })
  .passthrough();

const searchResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          origin: z.string().length(3),
          destination: z.string().length(3),
          pricing: z.object({ usd: z.number(), xlm: z.number() }).passthrough(),
        })
        .passthrough(),
    )
    .nonempty(),
  pagination: z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() }).passthrough(),
});

const bookingResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      id: z.string().uuid(),
      flightId: z.string().uuid(),
      status: z.string().min(1),
      amountCents: z.number().int().nonnegative(),
    })
    .passthrough(),
  payment: z.object({
    paymentIntentId: z.string().nullable(),
    clientSecret: z.string().nullable(),
  }),
  soroban: z.object({ unsignedXdr: z.string().nullable() }),
});

const paymentStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      bookingStatus: z.string().min(1),
      transactionStatus: z
        .object({
          status: z.enum(['pending', 'success', 'failed', 'not_found']),
          txHash: z.string().optional(),
        })
        .passthrough()
        .nullable(),
      confirmOutcome: z.enum(['already_confirmed', 'confirmed', 'failed', 'left_pending']).optional(),
    })
    .passthrough(),
});

const cancellationResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      bookingId: z.string().uuid(),
      status: z.string().min(1),
    })
    .passthrough(),
});

const refundRequestResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      id: z.string().uuid(),
      bookingId: z.string().uuid(),
      status: z.string().min(1),
      reason: z.enum(['flight_cancelled', 'flight_delayed', 'customer_request', 'duplicate_booking', 'service_issue', 'other']),
    })
    .passthrough(),
});

const refundStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      refundStatus: z.string().min(1),
      stripeRefundId: z.string().nullable(),
      sorobanTxHash: z.string().nullable(),
      approvedAmount: z.number().int().nonnegative().nullable(),
    })
    .passthrough(),
});

describe('v1 journey API contracts (#1191)', () => {
  beforeEach(() => {
    mockStores.Booking.clear();
    mockStores.Booking.set(BOOKING_ID, { ...bookingRecord, passenger: { ...bookingRecord.passenger } });
    mockStores.IdempotencyKey.clear();
    mockCreateBooking.mockReset();
    mockProcessCancellation.mockReset();
    mockConfirmBookingTx.mockReset();
    mockSearchFlights.mockClear();
    mockRefundService.createRefundRequest.mockReset();
    mockRefundService.getRefund.mockReset();
    mockRefundService.checkOnchainStatus.mockReset();

    mockCreateBooking.mockResolvedValue({
      id: BOOKING_ID,
      flightId: FLIGHT_ID,
      passenger: { email: 'contract@example.com', firstName: 'Contract', lastName: 'Test', sorobanAddress: WALLET },
      status: 'awaiting_payment',
      amountCents: 45000,
      stripePaymentIntentId: 'pi_contract_test',
      stripeClientSecret: 'cs_contract_test',
      sorobanUnsignedXdr: 'unsigned_xdr_contract_test',
    });
    mockProcessCancellation.mockResolvedValue({
      bookingId: BOOKING_ID,
      status: 'cancelled',
      refundAmountCents: 45000,
    });
    mockConfirmBookingTx.mockResolvedValue({
      outcome: 'confirmed',
      changed: true,
      booking: { id: CONFIRMED_BOOKING_ID, status: 'confirmed' },
      transactionStatus: { status: 'success', txHash: 'txhash_contract_test', result: 'onchain-1' },
    });
    mockRefundService.createRefundRequest.mockResolvedValue(refundRecord);
    mockRefundService.getRefund.mockResolvedValue(refundRecord);
    mockRefundService.checkOnchainStatus.mockResolvedValue(refundRecord);
  });

  describe('flight search', () => {
    it('returns the documented success envelope', async () => {
      const res = await request(mockApp).get('/api/v1/flights/search').query({
        from: 'JFK',
        to: 'LAX',
        date: '2026-12-25',
        passengers: 1,
      });

      expect(res.status).toBe(200);
      expect(() => searchResponseSchema.parse(res.body)).not.toThrow();
    });

    it('rejects malformed query parameters with a problem response', async () => {
      const res = await request(mockApp).get('/api/v1/flights/search').query({
        from: 'JFK',
        date: 'not-a-date',
        passengers: 1,
      });

      expect(res.status).toBe(400);
      expect(() => errorSchema.parse(res.body)).not.toThrow();
      expect(res.body.code).toBe('BAD_REQUEST');
      expect(mockSearchFlights).not.toHaveBeenCalled();
    });
  });

  describe('booking creation', () => {
    const validPayload = {
      flightId: FLIGHT_ID,
      passenger: {
        email: 'contract@example.com',
        firstName: 'Contract',
        lastName: 'Test',
        sorobanAddress: WALLET,
      },
    };

    it('returns the documented success envelope', async () => {
      const res = await request(mockApp)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', 'contract-create-1')
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(() => bookingResponseSchema.parse(res.body)).not.toThrow();
    });

    it('rejects an invalid passenger payload', async () => {
      const res = await request(mockApp)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', 'contract-create-2')
        .send({
          ...validPayload,
          passenger: { ...validPayload.passenger, email: 'not-an-email' },
        });

      expect(res.status).toBe(400);
      expect(() => errorSchema.parse(res.body)).not.toThrow();
      expect(mockCreateBooking).not.toHaveBeenCalled();
    });

    it('requires an idempotency key', async () => {
      const res = await request(mockApp).post('/api/v1/bookings').send(validPayload);

      expect(res.status).toBe(400);
      expect(() => errorSchema.parse(res.body)).not.toThrow();
      expect(mockCreateBooking).not.toHaveBeenCalled();
    });
  });

  describe('payment status', () => {
    it('returns the documented success envelope', async () => {
      const res = await request(mockApp).get(`/api/v1/bookings/${BOOKING_ID}/transaction-status`);

      expect(res.status).toBe(200);
      expect(() => paymentStatusResponseSchema.parse(res.body)).not.toThrow();
    });

    it('rejects a malformed booking id', async () => {
      const res = await request(mockApp).get('/api/v1/bookings/not-a-uuid/transaction-status');

      expect(res.status).toBe(400);
      expect(() => errorSchema.parse(res.body)).not.toThrow();
      expect(mockConfirmBookingTx).not.toHaveBeenCalled();
    });
  });

  describe('booking cancellation', () => {
    it('returns the documented success envelope', async () => {
      const res = await request(mockApp).post(`/api/v1/bookings/${BOOKING_ID}/cancel`).send({});

      expect(res.status).toBe(200);
      expect(() => cancellationResponseSchema.parse(res.body)).not.toThrow();
    });

    it('rejects unexpected request fields', async () => {
      const res = await request(mockApp)
        .post(`/api/v1/bookings/${BOOKING_ID}/cancel`)
        .send({ unexpected: true });

      expect(res.status).toBe(400);
      expect(() => errorSchema.parse(res.body)).not.toThrow();
      expect(mockProcessCancellation).not.toHaveBeenCalled();
    });
  });

  describe('refund request and status', () => {
    it('returns the documented request success envelope', async () => {
      const res = await request(mockApp).post('/api/v1/refunds/request').send({
        bookingId: BOOKING_ID,
        reason: 'flight_cancelled',
        reasonDetails: 'Airline cancelled the flight.',
      });

      expect(res.status).toBe(201);
      expect(() => refundRequestResponseSchema.parse(res.body)).not.toThrow();
    });

    it('rejects an unsupported refund reason', async () => {
      const res = await request(mockApp).post('/api/v1/refunds/request').send({
        bookingId: BOOKING_ID,
        reason: 'not_a_reason',
      });

      expect(res.status).toBe(400);
      expect(() => errorSchema.parse(res.body)).not.toThrow();
      expect(mockRefundService.createRefundRequest).not.toHaveBeenCalled();
    });

    it('returns the documented status success envelope', async () => {
      const res = await request(mockApp).get(`/api/v1/refunds/${REFUND_ID}/status`);

      expect(res.status).toBe(200);
      expect(() => refundStatusResponseSchema.parse(res.body)).not.toThrow();
    });

    it('rejects a malformed refund id', async () => {
      const res = await request(mockApp).get('/api/v1/refunds/not-a-uuid/status');

      expect(res.status).toBe(400);
      expect(() => errorSchema.parse(res.body)).not.toThrow();
      expect(mockRefundService.checkOnchainStatus).not.toHaveBeenCalled();
    });
  });
});
