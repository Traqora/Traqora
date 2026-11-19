import crypto from 'crypto';
import express from 'express';
import request from 'supertest';

import { AppDataSource } from '../src/db/dataSource';
import { bookingRoutes } from '../src/api/routes/bookings';
import { Booking } from '../src/db/entities/Booking';
import { Flight } from '../src/db/entities/Flight';
import { IdempotencyKey } from '../src/db/entities/IdempotencyKey';
import { Passenger } from '../src/db/entities/Passenger';
import { confirmBookingTx } from '../src/services/bookingConfirmRetry';
import { BookingOrchestrationService } from '../src/services/bookingOrchestrationService';
import { getStripe } from '../src/services/stripe';
import { signAndSubmitCreateBooking } from '../src/services/soroban';
import { errorHandler } from '../src/utils/errorHandler';

jest.mock('../src/db/dataSource', () => {
  const getRepository = jest.fn();
  return { AppDataSource: { getRepository }, getRepositoryMock: getRepository };
});

jest.mock('../src/middleware/authMiddleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { walletAddress: 'GCUSTOMERCHECKOUTTEST' };
    next();
  },
}));

jest.mock('../src/middleware/rate-limit-tiers', () => ({
  bookingRateLimit: (_req: any, _res: any, next: any) => next(),
  excludingPaths: () => (_req: any, _res: any, next: any) => next(),
  searchRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/services/stripe', () => ({
  getStripe: jest.fn(),
  stripeWebhookSecret: 'whsec_checkout_test',
}));

jest.mock('../src/services/soroban', () => ({
  signAndSubmitCreateBooking: jest.fn(),
  submitSignedSorobanXdr: jest.fn(),
  getTransactionStatus: jest.fn(),
}));

jest.mock('../src/services/bookingConfirmRetry', () => ({
  confirmBookingTx: jest.fn(),
}));

jest.mock('../src/websockets/server', () => ({
  getWebSocketServer: () => ({ broadcastBookingStatus: jest.fn() }),
}));

jest.mock('../src/services/errorTracking', () => ({
  captureException: jest.fn(),
}));

interface StoredRow {
  id?: string;
  [key: string]: any;
}

/** Minimal repository surface used by the routes and orchestration service. */
class InMemoryRepository<T extends StoredRow> {
  private readonly rows = new Map<string, T>();

  create(data: Partial<T>): T {
    return { ...data } as T;
  }

  async save(entity: T): Promise<T> {
    const saved = { ...entity };
    if (!saved.id) saved.id = crypto.randomUUID();
    this.rows.set(saved.id!, saved);
    return saved;
  }

  async findOne(options: { where?: Record<string, unknown> } = {}): Promise<T | null> {
    const where = options.where ?? {};
    for (const row of this.rows.values()) {
      if (Object.entries(where).every(([key, value]) => row[key] === value)) {
        return row;
      }
    }
    return null;
  }

  async increment(criteria: { id: string }, property: string, amount: number) {
    const row = this.rows.get(criteria.id);
    if (!row) return { affected: 0 };
    row[property] = Number(row[property] ?? 0) + amount;
    return { affected: 1 };
  }

  async clear() {
    this.rows.clear();
  }

  createQueryBuilder() {
    let whereId: string | undefined;
    let hasSeatsGuard = false;
    let values: Record<string, unknown> = {};

    const builder: any = {
      update: () => builder,
      set: (nextValues: Record<string, unknown>) => {
        values = nextValues;
        return builder;
      },
      where: (_sql: string, params: { id: string }) => {
        whereId = params.id;
        return builder;
      },
      andWhere: (sql: string) => {
        hasSeatsGuard = sql.includes('seatsAvailable > 0');
        return builder;
      },
      execute: async () => {
        const row = whereId ? this.rows.get(whereId) : undefined;
        if (!row) return { affected: 0 };
        if (hasSeatsGuard && Number(row.seatsAvailable) <= 0) return { affected: 0 };
        for (const [key, value] of Object.entries(values)) {
          row[key] =
            typeof value === 'function'
              ? Number(row.seatsAvailable) - 1
              : value;
        }
        return { affected: 1 };
      },
    };
    return builder;
  }
}

const getRepositoryMock = (AppDataSource.getRepository as unknown as jest.Mock);
const signAndSubmitMock = signAndSubmitCreateBooking as jest.Mock;
const getStripeMock = getStripe as jest.Mock;
const confirmBookingTxMock = confirmBookingTx as jest.Mock;

const repositories = new Map<any, InMemoryRepository<any>>([
  [Flight, new InMemoryRepository<Flight & StoredRow>()],
  [Passenger, new InMemoryRepository<Passenger & StoredRow>()],
  [Booking, new InMemoryRepository<Booking & StoredRow>()],
  [IdempotencyKey, new InMemoryRepository<IdempotencyKey & StoredRow>()],
]);

const FLIGHT_ID = '11111111-1111-4111-8111-111111111111';

const basePayload = () => ({
  flightId: FLIGHT_ID,
  passenger: {
    email: 'checkout@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    sorobanAddress: 'GPASSENGERCHECKOUTTEST',
  },
});

const createTestApp = () => {
  const app = express();
  app.use(
    '/api/v1/bookings/webhook/stripe',
    express.raw({ type: 'application/json' }),
  );
  app.use(express.json());
  app.use('/api/v1/bookings', bookingRoutes);
  app.use(errorHandler);
  return app;
};

const seedFlight = async (priceCents = 45000) => {
  const repo = repositories.get(Flight)!;
  await repo.save(
    repo.create({
      id: FLIGHT_ID,
      flightNumber: 'CF100',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime: new Date('2027-01-01T10:00:00.000Z'),
      priceCents,
      seatsAvailable: 5,
      airlineSorobanAddress: 'GAIRLINECHECKOUTTEST',
    }),
  );
};

const codeError = (message: string, code: string, statusCode: number, retryable = false) => {
  const error = new Error(message) as Error & {
    code: string;
    statusCode: number;
    retryable: boolean;
  };
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = retryable;
  return error;
};

describe('checkout failure paths (#1189)', () => {
  const app = createTestApp();
  let pollSpy: jest.SpyInstance;

  beforeAll(() => {
    pollSpy = jest
      .spyOn(BookingOrchestrationService.prototype as any, 'pollTransactionStatus')
      .mockResolvedValue(undefined);
  });

  afterAll(() => {
    pollSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const repo of repositories.values()) repo.clear();
    getRepositoryMock.mockImplementation((entity: any) => repositories.get(entity));
    signAndSubmitMock.mockResolvedValue({
      txHash: 'tx_checkout_ok',
      innerTxHash: null,
      feeBumpTxHash: null,
      isFeeBump: false,
      bookingReference: 'CFTEST',
    });
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: (body: Buffer) => JSON.parse(body.toString('utf8')),
      },
    });
    confirmBookingTxMock.mockResolvedValue({
      outcome: 'left_pending',
      changed: false,
      booking: { id: 'booking_pending', status: 'onchain_pending' },
      transactionStatus: { status: 'pending' },
    });
  });

  it('creates a booking on the normal path', async () => {
    await seedFlight();

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'checkout-normal')
      .send(basePayload());

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('onchain_submitted');
    expect(signAndSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired offer with a refresh path', async () => {
    await seedFlight();

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'checkout-expired-offer')
      .send({
        ...basePayload(),
        sessionExpiresAt: '2026-01-01T00:00:00.000Z',
        offerExpiresAt: '2026-01-01T00:00:00.000Z',
        refreshPath: '/api/v1/flights?fresh=1',
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('OFFER_EXPIRED');
    expect(response.body.details.refreshPath).toBe('/api/v1/flights?fresh=1');
    expect(signAndSubmitMock).not.toHaveBeenCalled();
  });

  it('stops when the provider price changed without acceptance', async () => {
    await seedFlight(45000);

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'checkout-price-changed')
      .send({
        ...basePayload(),
        confirmedProviderPriceCents: 47000,
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONFLICT');
    expect(response.body.detail).toContain('Provider price changed');
    expect(response.body.details.reason).toBe('provider_reprice_requires_confirmation');
    expect(signAndSubmitMock).not.toHaveBeenCalled();
  });

  it('reports wallet rejection without creating a booking', async () => {
    await seedFlight();
    signAndSubmitMock.mockRejectedValueOnce(
      codeError('Wallet rejected the signing request', 'WALLET_REJECTED', 409),
    );

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'checkout-wallet-rejected')
      .send(basePayload());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('WALLET_REJECTED');
    expect(response.body.detail).toContain('Wallet rejected');
    expect(await repositories.get(Booking)!.findOne()).toBeNull();
  });

  it('reports a timed-out supplier as retryable upstream failure', async () => {
    await seedFlight();

    // Advance the supplier deadline with fake timers, then restore real timers
    // before supertest opens its HTTP socket. This keeps the timeout case
    // deterministic without faking the transport under test.
    jest.useFakeTimers();
    let failure: unknown;
    const supplierFailure = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(
          codeError(
            'Supplier timed out while reserving the seat',
            'UPSTREAM_UNAVAILABLE',
            504,
            true,
          ),
        );
      }, 1000);
    });
    const capturedFailure = supplierFailure.catch((error) => {
      failure = error;
    });
    await jest.advanceTimersByTimeAsync(1000);
    await capturedFailure;
    jest.useRealTimers();
    signAndSubmitMock.mockRejectedValueOnce(failure);

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'checkout-supplier-timeout')
      .send(basePayload());

    expect(response.status).toBe(504);
    expect(response.body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(response.body.retryable).toBe(true);
  });

  it('keeps a payment-pending booking pending on transaction status checks', async () => {
    const bookingRepo = repositories.get(Booking)!;
    await bookingRepo.save(
      bookingRepo.create({
        id: 'booking_pending',
        status: 'onchain_pending',
        sorobanTxHash: 'tx_checkout_pending',
        amountCents: 45000,
      }),
    );

    const response = await request(app).get(
      '/api/v1/bookings/booking_pending/transaction-status',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.bookingStatus).toBe('onchain_pending');
    expect(response.body.data.confirmOutcome).toBe('left_pending');
    expect(response.body.data.transactionStatus.status).toBe('pending');
    expect(confirmBookingTxMock).toHaveBeenCalledWith('booking_pending');
  });

  it('leaves payment-pending bookings unchanged on Stripe processing events', async () => {
    const bookingRepo = repositories.get(Booking)!;
    await bookingRepo.save(
      bookingRepo.create({
        id: 'booking_stripe_pending',
        status: 'onchain_pending',
        stripePaymentIntentId: 'pi_checkout_pending',
      }),
    );

    const response = await request(app)
      .post('/api/v1/bookings/webhook/stripe')
      .set('Stripe-Signature', 'test_signature')
      .send({
        type: 'payment_intent.processing',
        data: { object: { id: 'pi_checkout_pending' } },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    const booking = await bookingRepo.findOne({ where: { id: 'booking_stripe_pending' } });
    expect(booking?.status).toBe('onchain_pending');
  });
});
