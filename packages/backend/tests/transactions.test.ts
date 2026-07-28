import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Passenger } from '../src/db/entities/Passenger';
import { Booking, BookingStatus } from '../src/db/entities/Booking';
import { config } from '../src/config';

const WALLET_OWNER = 'GOWNERWALLET1234567890123456789012345678901234';
const WALLET_OTHER = 'GOTHERWALLET1234567890123456789012345678901234';

const ownerToken = jwt.sign(
  { walletAddress: WALLET_OWNER, walletType: 'freighter' },
  config.jwtSecret,
  { expiresIn: '1h' },
);

jest.mock('../src/services/soroban', () => ({
  getTransactionStatus: jest.fn(),
  submitSignedSorobanXdr: jest.fn(),
  explorerUrlForTx: jest.fn((txHash: string) => `https://stellar.expert/explorer/testnet/tx/${txHash}`),
  generateTransactionReceiptPdf: jest.fn(async () => Buffer.from('%PDF-1.4 mock receipt')),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const soroban = jest.requireMock('../src/services/soroban');

async function seedFlight(): Promise<Flight> {
  const repo = AppDataSource.getRepository(Flight);
  return repo.save(
    repo.create({
      flightNumber: 'TQ200',
      airlineCode: 'TQ',
      fromAirport: 'JFK',
      toAirport: 'CDG',
      departureTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      seatsAvailable: 10,
      priceCents: 45000,
      airlineSorobanAddress: 'G-AIRLINE',
      status: 'SCHEDULED',
      dataSource: 'MANUAL',
      syncStatus: 'EXACT_MATCH',
    }),
  );
}

async function seedBooking(params: {
  walletAddress: string;
  flight: Flight;
  status?: BookingStatus;
  sorobanTxHash?: string | null;
  contractSubmitAttempts?: number;
}): Promise<Booking> {
  const passengerRepo = AppDataSource.getRepository(Passenger);
  const passenger = await passengerRepo.save(
    passengerRepo.create({
      email: `${params.walletAddress.toLowerCase()}@example.com`,
      firstName: 'Ada',
      lastName: 'Lovelace',
      sorobanAddress: params.walletAddress,
    }),
  );

  const bookingRepo = AppDataSource.getRepository(Booking);
  return bookingRepo.save(
    bookingRepo.create({
      flight: params.flight,
      passenger,
      status: params.status ?? 'onchain_submitted',
      amountCents: params.flight.priceCents,
      walletAddress: params.walletAddress,
      sorobanTxHash: params.sorobanTxHash ?? null,
      contractSubmitAttempts: params.contractSubmitAttempts ?? 0,
    }),
  );
}

async function clearAll(): Promise<void> {
  await AppDataSource.getRepository(Booking).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(Flight).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(Passenger).createQueryBuilder().delete().execute();
}

describe('transactions routes', () => {
  beforeAll(async () => {
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  afterEach(async () => {
    await clearAll();
    jest.clearAllMocks();
  });

  describe('auth', () => {
    it('rejects requests without a bearer token', async () => {
      const res = await request(app).get('/api/v1/transactions').expect(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/transactions', () => {
    it('lists only the caller\'s bookings that have an on-chain transaction', async () => {
      const flight = await seedFlight();
      const owned = await seedBooking({ walletAddress: WALLET_OWNER, flight, sorobanTxHash: 'txhash-owned' });
      await seedBooking({ walletAddress: WALLET_OWNER, flight, sorobanTxHash: null }); // no tx yet, excluded
      await seedBooking({ walletAddress: WALLET_OTHER, flight, sorobanTxHash: 'txhash-other' }); // different owner, excluded

      const res = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].bookingId).toBe(owned.id);
      expect(res.body.data[0].txHash).toBe('txhash-owned');
      expect(res.body.data[0].explorerUrl).toBe('https://stellar.expert/explorer/testnet/tx/txhash-owned');
    });

    it('respects the limit query parameter', async () => {
      const flight = await seedFlight();
      await seedBooking({ walletAddress: WALLET_OWNER, flight, sorobanTxHash: 'tx-1' });
      await seedBooking({ walletAddress: WALLET_OWNER, flight, sorobanTxHash: 'tx-2' });

      const res = await request(app)
        .get('/api/v1/transactions?limit=1')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/v1/transactions/:bookingId', () => {
    it('returns 404 for an unknown booking', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('skips the chain lookup when no transaction has been submitted yet', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({ walletAddress: WALLET_OWNER, flight, status: 'paid', sorobanTxHash: null });

      const res = await request(app)
        .get(`/api/v1/transactions/${booking.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.txHash).toBeNull();
      expect(soroban.getTransactionStatus).not.toHaveBeenCalled();
    });

    it('marks the booking confirmed when the chain reports success', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({
        walletAddress: WALLET_OWNER,
        flight,
        status: 'onchain_submitted',
        sorobanTxHash: 'tx-success',
      });
      soroban.getTransactionStatus.mockResolvedValue({
        status: 'success',
        txHash: 'tx-success',
        result: { bookingId: '42' },
      });

      const res = await request(app)
        .get(`/api/v1/transactions/${booking.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.chainStatus).toBe('success');
      expect(res.body.data.bookingStatus).toBe('confirmed');

      const updated = await AppDataSource.getRepository(Booking).findOne({ where: { id: booking.id } });
      expect(updated?.status).toBe('confirmed');
      expect(updated?.sorobanBookingId).toBe('42');
    });

    it('marks the booking failed and records the error when the chain reports failure', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({
        walletAddress: WALLET_OWNER,
        flight,
        status: 'onchain_submitted',
        sorobanTxHash: 'tx-failed',
      });
      soroban.getTransactionStatus.mockResolvedValue({
        status: 'failed',
        txHash: 'tx-failed',
        error: 'insufficient balance',
      });

      const res = await request(app)
        .get(`/api/v1/transactions/${booking.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.chainStatus).toBe('failed');
      expect(res.body.data.bookingStatus).toBe('failed');

      const updated = await AppDataSource.getRepository(Booking).findOne({ where: { id: booking.id } });
      expect(updated?.status).toBe('failed');
      expect(updated?.lastError).toBe('insufficient balance');
    });

    it('leaves a pending booking unchanged', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({
        walletAddress: WALLET_OWNER,
        flight,
        status: 'onchain_submitted',
        sorobanTxHash: 'tx-pending',
      });
      soroban.getTransactionStatus.mockResolvedValue({ status: 'pending', txHash: 'tx-pending' });

      const res = await request(app)
        .get(`/api/v1/transactions/${booking.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.chainStatus).toBe('pending');
      expect(res.body.data.bookingStatus).toBe('onchain_submitted');
    });
  });

  describe('POST /api/v1/transactions/:bookingId/retry', () => {
    it('requires signedXdr', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({ walletAddress: WALLET_OWNER, flight, status: 'failed' });

      const res = await request(app)
        .post(`/api/v1/transactions/${booking.id}/retry`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for an unknown booking', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/00000000-0000-0000-0000-000000000000/retry')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ signedXdr: 'xdr' })
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('rejects retry when the booking is not in a retryable state', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({ walletAddress: WALLET_OWNER, flight, status: 'confirmed' });

      const res = await request(app)
        .post(`/api/v1/transactions/${booking.id}/retry`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ signedXdr: 'xdr' })
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('resubmits a failed transaction and records the new hash', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({
        walletAddress: WALLET_OWNER,
        flight,
        status: 'failed',
        sorobanTxHash: 'old-hash',
        contractSubmitAttempts: 1,
      });
      soroban.submitSignedSorobanXdr.mockResolvedValue({ txHash: 'new-hash' });

      const res = await request(app)
        .post(`/api/v1/transactions/${booking.id}/retry`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ signedXdr: 'signed-xdr-blob' })
        .expect(202);

      expect(res.body.data.txHash).toBe('new-hash');

      const updated = await AppDataSource.getRepository(Booking).findOne({ where: { id: booking.id } });
      expect(updated?.status).toBe('onchain_submitted');
      expect(updated?.sorobanTxHash).toBe('new-hash');
      expect(updated?.contractSubmitAttempts).toBe(2);
      expect(updated?.lastError).toBeNull();
    });
  });

  describe('GET /api/v1/transactions/:bookingId/receipt.pdf', () => {
    it('returns 404 for an unknown booking', async () => {
      await request(app)
        .get('/api/v1/transactions/00000000-0000-0000-0000-000000000000/receipt.pdf')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('returns 409 when no transaction has been submitted yet', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({ walletAddress: WALLET_OWNER, flight, status: 'paid', sorobanTxHash: null });

      const res = await request(app)
        .get(`/api/v1/transactions/${booking.id}/receipt.pdf`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('streams a PDF receipt for a submitted transaction', async () => {
      const flight = await seedFlight();
      const booking = await seedBooking({
        walletAddress: WALLET_OWNER,
        flight,
        status: 'confirmed',
        sorobanTxHash: 'tx-receipt',
      });

      const res = await request(app)
        .get(`/api/v1/transactions/${booking.id}/receipt.pdf`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain(`receipt-${booking.id}.pdf`);
      expect(Buffer.from(res.body).toString('utf8')).toBe('%PDF-1.4 mock receipt');
      expect(soroban.generateTransactionReceiptPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: booking.id,
          txHash: 'tx-receipt',
          explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-receipt',
          passengerName: 'Ada Lovelace',
        }),
      );
    });
  });
});
