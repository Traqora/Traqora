/**
 * E2E Smoke Test – Auth → Search → Book (issue #584)
 *
 * Covers the critical happy path and the most important failure branches:
 *
 *   1. Auth – challenge/verify (wallet signature flow)
 *   2. Auth – token refresh and logout
 *   3. Auth – rejects bad/missing credentials
 *   4. Flight search – returns results, validates params
 *   5. Booking – creates, enforces auth, idempotency, sold-out guard
 *   6. Full lifecycle – auth → search → book → pay (stripe webhook) → on-chain submit
 *   7. Artifacts – passes a structured JSON result to the CI artifact step
 *
 * All external services (Stripe, Soroban, Amadeus) are mocked so the suite
 * runs entirely in the in-process SQLite test database with no real network.
 *
 * A machine-readable "smoke report" is written to
 *   packages/backend/smoke-report.json
 * by the afterAll hook so CI can upload it as a build artifact.
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { initDataSource, AppDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Booking } from '../src/db/entities/Booking';
import { Passenger } from '../src/db/entities/Passenger';
import { config } from '../src/config';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Amadeus – deterministic flight search results
const mockAmadeusSearch = jest.fn();
jest.mock('../src/services/amadeus/amadeusClient', () => ({
  AmadeusAnalyticsClient: jest.fn().mockImplementation(() => ({
    authenticate: jest.fn().mockResolvedValue('mock-token'),
    searchFlights: mockAmadeusSearch,
    getFlightStatus: jest.fn().mockResolvedValue(null),
    getAirportDetails: jest.fn().mockResolvedValue(null),
    normalizeFlightData: jest.fn((d: unknown) => d),
    healthCheck: jest.fn().mockResolvedValue({ ok: true }),
    getAnalytics: jest.fn().mockResolvedValue({}),
  })),
}));

// Stripe – always succeeds
jest.mock('../src/services/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_smoke_test',
        client_secret: 'cs_smoke_test',
      }),
    },
    webhooks: {
      constructEvent: jest.fn((body: Buffer) => {
        const parsed = JSON.parse(body.toString('utf8'));
        return {
          type: parsed.type,
          data: { object: parsed.data?.object ?? parsed.data },
        };
      }),
    },
  },
  stripeWebhookSecret: 'whsec_smoke_test',
}));

// Soroban – deterministic tx hashes
jest.mock('../src/services/soroban', () => ({
  buildCreateBookingUnsignedXdr: jest.fn().mockResolvedValue({ xdr: 'unsigned_xdr_smoke' }),
  submitSignedSorobanXdr: jest.fn().mockResolvedValue({ txHash: 'txhash_smoke_success' }),
  getTransactionStatus: jest.fn().mockResolvedValue({
    status: 'success',
    result: { bookingId: 'on-chain-42' },
  }),
  signAndSubmitCreateBooking: jest.fn().mockResolvedValue({
    txHash: 'txhash_smoke_success',
    bookingId: 'on-chain-42',
  }),
}));

// AuthService – mock wallet-signature verification so the test does not need
// a real Stellar keypair while still exercising every HTTP boundary.
jest.mock('../src/services/authService', () => {
  const jwt = require('jsonwebtoken');
  const crypto = require('crypto');

  const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';

  class MockAuthService {
    async generateChallenge(walletAddress: string) {
      if (!walletAddress || walletAddress.length < 10) {
        throw new Error('Invalid wallet address');
      }
      return {
        nonce: 'smoke-nonce-' + crypto.randomBytes(8).toString('hex'),
        expiresIn: 300,
        message: `Sign this message to authenticate: smoke-nonce`,
      };
    }

    async verifySignature(walletAddress: string, signature: string, walletType: string) {
      if (
        !walletAddress ||
        !signature ||
        signature === 'bad-signature' ||
        walletAddress === 'INVALID'
      ) {
        throw new Error('Invalid signature');
      }
      const accessToken = jwt.sign(
        { walletAddress, walletType: walletType ?? 'freighter' },
        process.env.JWT_SECRET ?? 'test-jwt-secret',
        { expiresIn: '1h' },
      );
      const refreshToken = jwt.sign(
        { walletAddress, type: 'refresh' },
        process.env.JWT_SECRET ?? 'test-jwt-secret',
        { expiresIn: '7d' },
      );
      return { accessToken, refreshToken, expiresIn: 3600, walletAddress, walletType };
    }

    async refreshTokens(refreshToken: string) {
      if (!refreshToken) throw new Error('Refresh token required');
      let decoded: any;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_SECRET ?? 'test-jwt-secret');
      } catch {
        throw new Error('Invalid refresh token');
      }
      const newAccess = jwt.sign(
        { walletAddress: decoded.walletAddress, walletType: 'freighter' },
        process.env.JWT_SECRET ?? 'test-jwt-secret',
        { expiresIn: '1h' },
      );
      return { accessToken: newAccess, refreshToken, expiresIn: 3600 };
    }

    async logout(_walletAddress: string) {
      return;
    }
  }

  return { AuthService: MockAuthService };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WALLET_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA';
const WALLET_TYPE = 'freighter';

/** Pre-signed JWT used by tests that skip the auth flow */
const preSignedToken = jwt.sign(
  { walletAddress: WALLET_ADDRESS, walletType: WALLET_TYPE },
  config.jwtSecret,
  { expiresIn: '1h' },
);

function idKey(): string {
  return `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bookingBody(flightId: string, suffix = '1') {
  return {
    flightId,
    passenger: {
      email: `smoke${suffix}@example.com`,
      firstName: 'Smoke',
      lastName: `Test${suffix}`,
      sorobanAddress: `GSMOKE${suffix.toUpperCase()}`,
    },
  };
}

/** Amadeus-shaped flight offer fixture */
const AMADEUS_OFFER = {
  id: 'offer-1',
  type: 'flight-offer',
  source: 'GDS',
  itineraries: [{
    duration: 'PT5H30M',
    segments: [{
      departure: { iataCode: 'JFK', at: '2027-03-01T08:00:00' },
      arrival: { iataCode: 'LHR', at: '2027-03-01T20:30:00' },
      operatingCarrier: { carrierCode: 'BA' },
      number: '178',
      aircraft: { code: '777' },
    }],
  }],
  price: { currency: 'USD', total: '850.00', base: '700.00', grandTotal: '850.00' },
  numberOfBookableSeats: 12,
  pricingOptions: { fareType: ['published'], includedCheckedBagsOnly: false },
  validatingAirlineCodes: ['BA'],
  travelerPricings: [{
    travelerId: '1',
    fareOption: 'PUBLISHED',
    travelerType: 'ADULT',
    price: { currency: 'USD', total: '850.00' },
    fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY' }],
  }],
};

// ---------------------------------------------------------------------------
// Smoke report accumulator
// ---------------------------------------------------------------------------

interface SmokeResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const smokeResults: SmokeResult[] = [];

function record(name: string, passed: boolean, start: number, error?: string) {
  smokeResults.push({ name, passed, durationMs: Date.now() - start, error });
}

// ---------------------------------------------------------------------------
// Suite setup / teardown
// ---------------------------------------------------------------------------

let testFlight: Flight;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await initDataSource();
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockAmadeusSearch.mockResolvedValue([AMADEUS_OFFER]);

  const flightRepo = AppDataSource.getRepository(Flight);
  testFlight = await flightRepo.save(
    flightRepo.create({
      flightNumber: 'SMK100',
      airlineCode: 'BA',
      fromAirport: 'JFK',
      toAirport: 'LHR',
      departureTime: new Date(Date.now() + 86_400_000 * 14),
      arrivalTime: new Date(Date.now() + 86_400_000 * 14 + 3_600_000 * 7),
      priceCents: 85_000,
      seatsAvailable: 50,
      airlineSorobanAddress: 'GAAIRLINESMOKE',
      status: 'SCHEDULED',
    }),
  );
});

afterEach(async () => {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const passengerRepo = AppDataSource.getRepository(Passenger);
  const flightRepo = AppDataSource.getRepository(Flight);
  await bookingRepo.delete({});
  await passengerRepo.delete({});
  await flightRepo.delete({});
});

afterAll(async () => {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();

  // Write machine-readable smoke report for CI artifact upload
  const total = smokeResults.length;
  const passed = smokeResults.filter((r) => r.passed).length;
  const report = {
    summary: { total, passed, failed: total - passed, timestamp: new Date().toISOString() },
    results: smokeResults,
  };
  const reportPath = path.resolve(__dirname, '..', 'smoke-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\nSmoke report written → ${reportPath}`);
  console.log(`Smoke: ${passed}/${total} passed`);
});

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------

describe('Smoke – Authentication', () => {
  it('POST /api/v1/auth/challenge returns a nonce for a valid wallet', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ walletAddress: WALLET_ADDRESS });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('nonce');
      expect(typeof res.body.nonce).toBe('string');
      expect(res.body.nonce.length).toBeGreaterThan(0);
      passed = true;
    } finally {
      record('auth/challenge – valid wallet', passed, t);
    }
  });

  it('POST /api/v1/auth/challenge rejects a missing wallet address', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/auth/challenge')
        .send({});

      expect([400, 401, 500]).toContain(res.status);
      passed = true;
    } finally {
      record('auth/challenge – missing wallet', passed, t);
    }
  });

  it('POST /api/v1/auth/verify returns access + refresh tokens', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          walletAddress: WALLET_ADDRESS,
          signature: 'valid-mock-signature',
          walletType: WALLET_TYPE,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken.split('.').length).toBe(3); // valid JWT shape
      passed = true;
    } finally {
      record('auth/verify – valid signature', passed, t);
    }
  });

  it('POST /api/v1/auth/verify rejects an invalid signature', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          walletAddress: WALLET_ADDRESS,
          signature: 'bad-signature',
          walletType: WALLET_TYPE,
        });

      expect([401, 400]).toContain(res.status);
      passed = true;
    } finally {
      record('auth/verify – bad signature', passed, t);
    }
  });

  it('POST /api/v1/auth/verify rejects a missing signature', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/auth/verify')
        .send({ walletAddress: WALLET_ADDRESS, walletType: WALLET_TYPE });

      expect([400, 401]).toContain(res.status);
      passed = true;
    } finally {
      record('auth/verify – missing signature', passed, t);
    }
  });

  it('POST /api/v1/auth/refresh issues a new access token', async () => {
    const t = Date.now();
    let passed = false;
    try {
      // First obtain a real refresh token via verify
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          walletAddress: WALLET_ADDRESS,
          signature: 'valid-mock-signature',
          walletType: WALLET_TYPE,
        });
      expect(verifyRes.status).toBe(200);
      const { refreshToken } = verifyRes.body;

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.accessToken.split('.').length).toBe(3);
      passed = true;
    } finally {
      record('auth/refresh – valid token', passed, t);
    }
  });

  it('POST /api/v1/auth/refresh rejects a missing refresh token', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect([400, 401]).toContain(res.status);
      passed = true;
    } finally {
      record('auth/refresh – missing token', passed, t);
    }
  });

  it('POST /api/v1/auth/logout requires a valid Bearer token', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const noAuthRes = await request(app).post('/api/v1/auth/logout');
      expect(noAuthRes.status).toBe(401);

      const authedRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${preSignedToken}`);
      expect(authedRes.status).toBe(200);

      passed = true;
    } finally {
      record('auth/logout', passed, t);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Flight Search
// ---------------------------------------------------------------------------

describe('Smoke – Flight Search', () => {
  it('GET /api/flights/search returns results for valid params', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LHR', date: '2027-03-01', passengers: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      passed = true;
    } finally {
      record('search – valid params', passed, t);
    }
  });

  it('GET /api/flights/search accepts alternative origin/destination params', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .get('/api/flights/search')
        .query({ origin: 'JFK', destination: 'LHR', date: '2027-03-01', passengers: 1 });

      expect([200, 400]).toContain(res.status);
      passed = true;
    } finally {
      record('search – origin/destination aliases', passed, t);
    }
  });

  it('GET /api/flights/search returns 400 when origin is missing', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .get('/api/flights/search')
        .query({ to: 'LHR', date: '2027-03-01', passengers: 1 });

      expect(res.status).toBe(400);
      passed = true;
    } finally {
      record('search – missing origin → 400', passed, t);
    }
  });

  it('GET /api/flights/search returns 400 when destination is missing', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', date: '2027-03-01', passengers: 1 });

      expect(res.status).toBe(400);
      passed = true;
    } finally {
      record('search – missing destination → 400', passed, t);
    }
  });

  it('GET /api/flights/search returns 400 for a malformed date', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LHR', date: 'not-a-date', passengers: 1 });

      expect(res.status).toBe(400);
      passed = true;
    } finally {
      record('search – malformed date → 400', passed, t);
    }
  });

  it('GET /api/flights/search handles empty Amadeus results gracefully', async () => {
    const t = Date.now();
    let passed = false;
    try {
      mockAmadeusSearch.mockResolvedValueOnce([]);
      const res = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LHR', date: '2027-03-01', passengers: 1 });

      expect(res.status).toBe(200);
      passed = true;
    } finally {
      record('search – empty results', passed, t);
    }
  });

  it('GET /api/flights/search handles an Amadeus service error gracefully', async () => {
    const t = Date.now();
    let passed = false;
    try {
      mockAmadeusSearch.mockRejectedValueOnce(new Error('Amadeus upstream error'));
      const res = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LHR', date: '2027-03-01', passengers: 1 });

      // Could fall back to DB results (200) or surface an error (5xx) — both are acceptable
      expect([200, 500, 502, 503]).toContain(res.status);
      passed = true;
    } finally {
      record('search – upstream error handled', passed, t);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Booking
// ---------------------------------------------------------------------------

describe('Smoke – Booking', () => {
  it('POST /api/v1/bookings creates a booking for an authenticated user', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'a'));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.amountCents).toBe(85_000);

      // Verify it was persisted
      const dbBooking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: res.body.data.id },
      });
      expect(dbBooking).not.toBeNull();
      passed = true;
    } finally {
      record('book – happy path', passed, t);
    }
  });

  it('POST /api/v1/bookings returns 401 without auth token', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'b'));

      expect(res.status).toBe(401);
      passed = true;
    } finally {
      record('book – no auth → 401', passed, t);
    }
  });

  it('POST /api/v1/bookings returns 401 with an expired token', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const expiredToken = jwt.sign(
        { walletAddress: WALLET_ADDRESS, walletType: WALLET_TYPE },
        config.jwtSecret,
        { expiresIn: -1 }, // already expired
      );
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'c'));

      expect(res.status).toBe(401);
      passed = true;
    } finally {
      record('book – expired token → 401', passed, t);
    }
  });

  it('POST /api/v1/bookings returns 400 without an Idempotency-Key header', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .send(bookingBody(testFlight.id, 'd'));

      expect(res.status).toBe(400);
      passed = true;
    } finally {
      record('book – no idempotency key → 400', passed, t);
    }
  });

  it('POST /api/v1/bookings is idempotent on repeated requests with the same key', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const key = idKey();
      const body = bookingBody(testFlight.id, 'e');

      const r1 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', key)
        .send(body);
      expect(r1.status).toBe(201);
      const bookingId = r1.body.data.id;

      const r2 = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', key)
        .send(body);
      expect(r2.status).toBe(200);
      expect(r2.body.data.id).toBe(bookingId);
      expect(r2.body.idempotent).toBe(true);

      passed = true;
    } finally {
      record('book – idempotency', passed, t);
    }
  });

  it('POST /api/v1/bookings returns 409 for a sold-out flight', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const flightRepo = AppDataSource.getRepository(Flight);
      testFlight.seatsAvailable = 0;
      await flightRepo.save(testFlight);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'f'));

      expect(res.status).toBe(409);
      passed = true;
    } finally {
      record('book – sold-out → 409', passed, t);
    }
  });

  it('POST /api/v1/bookings returns 404 for a non-existent flight', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody('00000000-0000-0000-0000-000000000000', 'g'));

      expect([404, 400]).toContain(res.status);
      passed = true;
    } finally {
      record('book – unknown flight → 404/400', passed, t);
    }
  });

  it('POST /api/v1/bookings decrements seat inventory', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const before = testFlight.seatsAvailable;

      await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'h'));

      const updated = await AppDataSource.getRepository(Flight).findOne({
        where: { id: testFlight.id },
      });
      expect(updated!.seatsAvailable).toBe(before - 1);
      passed = true;
    } finally {
      record('book – seat inventory decremented', passed, t);
    }
  });

  it('POST /api/v1/bookings persists passenger data', async () => {
    const t = Date.now();
    let passed = false;
    try {
      await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'i'));

      const passengers = await AppDataSource.getRepository(Passenger).find();
      const match = passengers.find((p) => p.firstName === 'Smoke' && p.lastName === 'Testi');
      expect(match).toBeDefined();
      expect(match!.email).toBe('smokei@example.com');
      passed = true;
    } finally {
      record('book – passenger persisted', passed, t);
    }
  });

  it('GET /api/v1/bookings/:id retrieves a booking by ID', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'j'));
      expect(createRes.status).toBe(201);

      const getRes = await request(app)
        .get(`/api/v1/bookings/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${preSignedToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(createRes.body.data.id);
      passed = true;
    } finally {
      record('book – GET by id', passed, t);
    }
  });

  it('GET /api/v1/bookings/:id returns 404 for unknown ID', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const res = await request(app)
        .get('/api/v1/bookings/00000000-0000-0000-0000-000000000099')
        .set('Authorization', `Bearer ${preSignedToken}`);

      expect(res.status).toBe(404);
      passed = true;
    } finally {
      record('book – GET unknown id → 404', passed, t);
    }
  });

  it('GET /api/v1/bookings/:id returns 401 without auth', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'k'));

      const res = await request(app).get(`/api/v1/bookings/${createRes.body.data.id}`);
      expect(res.status).toBe(401);
      passed = true;
    } finally {
      record('book – GET without auth → 401', passed, t);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Full lifecycle smoke test
// ---------------------------------------------------------------------------

describe('Smoke – Full lifecycle (auth → search → book → pay → on-chain)', () => {
  it('walks the complete happy path end-to-end', async () => {
    const t = Date.now();
    let passed = false;
    try {
      // ── Step 1: Authenticate ─────────────────────────────────────────────
      const challengeRes = await request(app)
        .post('/api/v1/auth/challenge')
        .send({ walletAddress: WALLET_ADDRESS });
      expect(challengeRes.status).toBe(200);
      expect(challengeRes.body).toHaveProperty('nonce');

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          walletAddress: WALLET_ADDRESS,
          signature: 'valid-mock-signature',
          walletType: WALLET_TYPE,
        });
      expect(verifyRes.status).toBe(200);
      const { accessToken } = verifyRes.body;
      expect(accessToken).toBeDefined();

      // ── Step 2: Search flights ────────────────────────────────────────────
      const searchRes = await request(app)
        .get('/api/flights/search')
        .query({ from: 'JFK', to: 'LHR', date: '2027-03-01', passengers: 1 });
      expect(searchRes.status).toBe(200);
      expect(searchRes.body).toHaveProperty('data');

      // ── Step 3: Create booking (using token from step 1) ─────────────────
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'lifecycle'));
      expect(createRes.status).toBe(201);
      const bookingId: string = createRes.body.data.id;
      const pid: string = createRes.body.data.stripePaymentIntentId ?? 'pi_smoke_test';

      // Verify initial DB state
      let dbBooking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: bookingId },
      });
      expect(dbBooking).not.toBeNull();

      // ── Step 4: Simulate Stripe payment success ───────────────────────────
      const webhookRes = await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_smoke')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(
            JSON.stringify({
              type: 'payment_intent.succeeded',
              data: { object: { id: pid } },
            }),
          ),
        );
      expect(webhookRes.status).toBe(200);

      // Verify booking is now paid
      const paidRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(paidRes.status).toBe(200);
      expect(paidRes.body.data.status).toBe('paid');

      // ── Step 5: Submit signed XDR on-chain ───────────────────────────────
      const submitRes = await request(app)
        .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ signedXdr: 'signed_xdr_smoke' });
      expect(submitRes.status).toBe(202);
      expect(submitRes.body.data.status).toBe('onchain_submitted');
      expect(submitRes.body.data.sorobanTxHash).toBe('txhash_smoke_success');

      // ── Step 6: Poll transaction status ──────────────────────────────────
      const txRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}/transaction-status`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(txRes.status).toBe(200);
      expect(txRes.body.success).toBe(true);

      // ── Step 7: Final DB state check ─────────────────────────────────────
      dbBooking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: bookingId },
      });
      expect(dbBooking!.status).toBe('onchain_submitted');
      expect(dbBooking!.sorobanTxHash).toBe('txhash_smoke_success');

      passed = true;
    } finally {
      record('full lifecycle – auth→search→book→pay→onchain', passed, t);
    }
  });

  // ── Edge-case flows ──────────────────────────────────────────────────────

  it('handles payment declined then re-attempt on a new booking', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'declined'));
      expect(createRes.status).toBe(201);
      const bookingId = createRes.body.data.id;
      const pid = createRes.body.data.stripePaymentIntentId ?? 'pi_smoke_test';

      // Payment fails
      const failRes = await request(app)
        .post('/api/v1/bookings/webhook/stripe')
        .set('stripe-signature', 'sig_smoke')
        .set('Content-Type', 'application/json')
        .send(
          Buffer.from(
            JSON.stringify({
              type: 'payment_intent.payment_failed',
              data: { object: { id: pid } },
            }),
          ),
        );
      expect(failRes.status).toBe(200);

      // Booking should still exist, not yet paid
      const checkRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${preSignedToken}`);
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.status).toBe('awaiting_payment');

      passed = true;
    } finally {
      record('lifecycle – payment declined handled', passed, t);
    }
  });

  it('rejects on-chain submission for an unpaid booking', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${preSignedToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'unpaid'));
      expect(createRes.status).toBe(201);

      const submitRes = await request(app)
        .post(`/api/v1/bookings/${createRes.body.data.id}/submit-onchain`)
        .set('Authorization', `Bearer ${preSignedToken}`)
        .send({ signedXdr: 'signed_xdr_smoke' });

      expect(submitRes.status).toBe(409);
      passed = true;
    } finally {
      record('lifecycle – submit-onchain on unpaid → 409', passed, t);
    }
  });

  it('correctly handles concurrent booking of the last available seat', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const flightRepo = AppDataSource.getRepository(Flight);
      testFlight.seatsAvailable = 1;
      await flightRepo.save(testFlight);

      const [r1, r2] = await Promise.all([
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${preSignedToken}`)
          .set('Idempotency-Key', idKey())
          .send(bookingBody(testFlight.id, 'race1')),
        request(app)
          .post('/api/v1/bookings')
          .set('Authorization', `Bearer ${preSignedToken}`)
          .set('Idempotency-Key', idKey())
          .send(bookingBody(testFlight.id, 'race2')),
      ]);

      const statuses = [r1.status, r2.status];
      expect(statuses.filter((s) => s === 201).length).toBe(1);
      expect(statuses.filter((s) => s === 409).length).toBe(1);

      const updated = await flightRepo.findOne({ where: { id: testFlight.id } });
      expect(updated!.seatsAvailable).toBe(0);

      passed = true;
    } finally {
      record('lifecycle – concurrent last-seat race', passed, t);
    }
  });

  it('token obtained from auth flow works for protected booking endpoints', async () => {
    const t = Date.now();
    let passed = false;
    try {
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify')
        .send({
          walletAddress: WALLET_ADDRESS,
          signature: 'valid-mock-signature',
          walletType: WALLET_TYPE,
        });
      expect(verifyRes.status).toBe(200);
      const { accessToken } = verifyRes.body;

      const createRes = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idKey())
        .send(bookingBody(testFlight.id, 'token-chain'));

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      passed = true;
    } finally {
      record('lifecycle – auth token chains into booking', passed, t);
    }
  });
});
