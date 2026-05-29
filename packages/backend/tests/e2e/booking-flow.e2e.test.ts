/**
 * E2E Test: Complete Booking Flow
 * search → book → pay (Stripe & Stellar) → blockchain confirmation
 *
 * Uses supertest against a real Express app with mocked external services.
 * This mirrors production flow without hitting live Stripe or Stellar networks.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import {
  createMockStripe,
  createMockSorobanClient,
  createMockStellarServer,
  createMockRepository,
  createMockEmailService,
  createMockWebSocketServer,
  createMockRedisClient,
} from '../helpers/mocks';
import { FlightBuilder, UserBuilder } from '../helpers/builders';
import { createBooking } from '../helpers/factories';

describe('E2E: Full Booking Flow', () => {
  let app: Express.Application;
  let flightRepo: ReturnType<typeof createMockRepository>;
  let bookingRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  let refundRepo: ReturnType<typeof createMockRepository>;
  let stripe: ReturnType<typeof createMockStripe>;
  let soroban: ReturnType<typeof createMockSorobanClient>;
  let stellarServer: ReturnType<typeof createMockStellarServer>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let wss: ReturnType<typeof createMockWebSocketServer>;
  let redis: ReturnType<typeof createMockRedisClient>;

  let authToken: string;
  let testUser: any;
  let testFlight: any;

  beforeEach(() => {
    flightRepo = createMockRepository();
    bookingRepo = createMockRepository();
    userRepo = createMockRepository();
    refundRepo = createMockRepository();
    stripe = createMockStripe();
    soroban = createMockSorobanClient();
    stellarServer = createMockStellarServer();
    emailService = createMockEmailService();
    wss = createMockWebSocketServer();
    redis = createMockRedisClient();

    app = createApp({
      flightRepo, bookingRepo, userRepo, refundRepo,
      stripe, soroban, stellarServer, emailService, wss, redis,
    } as any);

    testUser = new UserBuilder()
      .withEmail('e2e-traveller@traqora.com')
      .withWallet('GBZE2ETRAVELLERWALLET123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      .build();

    testFlight = new FlightBuilder()
      .from('LOS').to('LHR')
      .withPrice(450)
      .withSeats(80)
      .departingIn(72)
      .build();

    authToken = `Bearer mock.jwt.e2e.${testUser.id}`;
    userRepo.findOneBy.mockResolvedValue(testUser);
    redis.get.mockResolvedValue(null); // no cache
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  // FLOW 1: Search → Book → Pay with Stripe → Blockchain Anchoring
  // ─────────────────────────────────────────────────────────────────────────

  describe('Flow 1: Stripe Payment → Blockchain Confirmation', () => {
    it('completes the full booking lifecycle', async () => {

      // ── Step 1: Search for flights ────────────────────────────────────────
      flightRepo.find.mockResolvedValue([testFlight]);

      const searchRes = await request(app)
        .get('/api/flights/search')
        .query({ origin: 'LOS', destination: 'LHR', date: '2026-08-10', passengers: 1 })
        .set('Authorization', authToken);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body).toHaveLength(1);
      expect(searchRes.body[0].id).toBe(testFlight.id);

      // ── Step 2: Create booking ────────────────────────────────────────────
      const pendingBooking = createBooking({
        userId: testUser.id,
        flightId: testFlight.id,
        status: 'pending',
        totalAmount: 450,
        paymentMethod: 'stripe',
        stripePaymentIntentId: 'pi_e2e_test',
      });

      flightRepo.findOneBy.mockResolvedValue(testFlight);
      bookingRepo.create.mockReturnValue(pendingBooking);
      bookingRepo.save.mockResolvedValue(pendingBooking);

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', authToken)
        .send({
          flightId: testFlight.id,
          passengerName: 'E2E Traveller',
          passengerEmail: 'e2e-traveller@traqora.com',
          paymentMethod: 'stripe',
          seatNumber: '24C',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe('pending');
      const bookingId = createRes.body.id;

      // ── Step 3: Create Stripe payment intent ──────────────────────────────
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_e2e_test',
        client_secret: 'pi_e2e_test_secret_xyz',
        status: 'requires_payment_method',
        amount: 45000,
      });

      bookingRepo.findOneBy.mockResolvedValue(pendingBooking);

      const intentRes = await request(app)
        .post(`/api/bookings/${bookingId}/payment-intent`)
        .set('Authorization', authToken);

      expect(intentRes.status).toBe(200);
      expect(intentRes.body.client_secret).toBeDefined();
      expect(intentRes.body.client_secret).toContain('pi_e2e_test');

      // ── Step 4: Stripe payment succeeds (simulated via webhook) ───────────
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_e2e_test',
            status: 'succeeded',
            metadata: { bookingId },
          },
        },
      });
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_e2e_test', status: 'succeeded' });

      const confirmedBooking = { ...pendingBooking, status: 'confirmed' };
      bookingRepo.save.mockResolvedValue(confirmedBooking);

      const webhookRes = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'valid_sig_e2e')
        .send(Buffer.from('{}'));

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.received).toBe(true);

      // ── Step 5: Confirm booking state ─────────────────────────────────────
      bookingRepo.findOneBy.mockResolvedValue(confirmedBooking);

      const fetchRes = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', authToken);

      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.status).toBe('confirmed');

      // ── Step 6: Verify email confirmation was sent ────────────────────────
      expect(emailService.sendBookingConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ id: bookingId }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FLOW 2: Search → Book → Pay with Stellar/Soroban → On-chain Confirmation
  // ─────────────────────────────────────────────────────────────────────────

  describe('Flow 2: Stellar Crypto Payment → Soroban Contract Confirmation', () => {
    it('completes the full crypto booking lifecycle', async () => {

      // ── Step 1: Search ────────────────────────────────────────────────────
      flightRepo.find.mockResolvedValue([testFlight]);

      const searchRes = await request(app)
        .get('/api/flights/search')
        .query({ origin: 'LOS', destination: 'LHR', date: '2026-08-10', passengers: 1 })
        .set('Authorization', authToken);

      expect(searchRes.status).toBe(200);

      // ── Step 2: Create booking with Stellar payment ───────────────────────
      const pendingBooking = createBooking({
        userId: testUser.id,
        flightId: testFlight.id,
        status: 'pending',
        totalAmount: 450,
        paymentMethod: 'stellar',
        stellarTransactionHash: null,
      });

      flightRepo.findOneBy.mockResolvedValue(testFlight);
      bookingRepo.create.mockReturnValue(pendingBooking);
      bookingRepo.save.mockResolvedValue(pendingBooking);

      const createRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', authToken)
        .send({
          flightId: testFlight.id,
          passengerName: 'Crypto Traveller',
          passengerEmail: 'crypto@traqora.com',
          paymentMethod: 'stellar',
          walletAddress: testUser.walletAddress,
          seatNumber: '10D',
        });

      expect(createRes.status).toBe(201);
      const bookingId = createRes.body.id;

      // ── Step 3: Submit Stellar transaction ────────────────────────────────
      stellarServer.loadAccount.mockResolvedValue({
        accountId: () => testUser.walletAddress,
        sequenceNumber: () => '200',
        incrementSequenceNumber: jest.fn(),
        balances: [{ asset_type: 'native', balance: '999.0000000' }],
      });
      stellarServer.submitTransaction.mockResolvedValue({
        hash: 'E2E_STELLAR_TX_HASH_CONFIRMED',
        ledger: 50000001,
        successful: true,
      });

      bookingRepo.findOneBy.mockResolvedValue(pendingBooking);

      const payRes = await request(app)
        .post(`/api/bookings/${bookingId}/pay/stellar`)
        .set('Authorization', authToken)
        .send({ walletAddress: testUser.walletAddress });

      expect(payRes.status).toBe(200);
      expect(payRes.body.stellarTransactionHash).toBe('E2E_STELLAR_TX_HASH_CONFIRMED');

      // ── Step 4: Soroban contract confirms booking ─────────────────────────
      soroban.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
      const confirmedBooking = {
        ...pendingBooking,
        status: 'confirmed',
        stellarTransactionHash: 'E2E_STELLAR_TX_HASH_CONFIRMED',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      };
      bookingRepo.save.mockResolvedValue(confirmedBooking);

      const contractRes = await request(app)
        .post(`/api/bookings/${bookingId}/verify-stellar`)
        .set('Authorization', authToken)
        .send({ transactionHash: 'E2E_STELLAR_TX_HASH_CONFIRMED' });

      expect(contractRes.status).toBe(200);
      expect(contractRes.body.status).toBe('confirmed');

      // ── Step 5: Verify final state ────────────────────────────────────────
      bookingRepo.findOneBy.mockResolvedValue(confirmedBooking);

      const fetchRes = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', authToken);

      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.status).toBe('confirmed');
      expect(fetchRes.body.contractId).toBeDefined();
      expect(emailService.sendBookingConfirmation).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FLOW 3: Book → Cancel → Full Refund (Stripe)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Flow 3: Book → Cancel → Refund', () => {
    it('processes a full refund after cancellation', async () => {
      const confirmedBooking = createBooking({
        userId: testUser.id,
        flightId: testFlight.id,
        status: 'confirmed',
        totalAmount: 450,
        paymentMethod: 'stripe',
        stripePaymentIntentId: 'pi_cancel_refund',
      });
      const bookingId = confirmedBooking.id;

      // Cancel
      bookingRepo.findOneBy.mockResolvedValue(confirmedBooking);
      bookingRepo.save.mockResolvedValueOnce({ ...confirmedBooking, status: 'cancelled' });

      const cancelRes = await request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', authToken);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('cancelled');

      // Request refund
      const pendingRefund = { id: 'r-e2e-001', bookingId, amount: 450, status: 'pending' };
      bookingRepo.findOneBy.mockResolvedValue({ ...confirmedBooking, status: 'cancelled' });
      refundRepo.findOneBy.mockResolvedValue(null);
      refundRepo.create.mockReturnValue(pendingRefund);
      refundRepo.save.mockResolvedValueOnce(pendingRefund);

      const refundReqRes = await request(app)
        .post('/api/refunds')
        .set('Authorization', authToken)
        .send({ bookingId, reason: 'Cancelled booking' });

      expect(refundReqRes.status).toBe(201);

      // Process refund (admin approves)
      stripe.refunds.create.mockResolvedValue({ id: 're_e2e_001', status: 'succeeded', amount: 45000 });
      refundRepo.findOneBy.mockResolvedValue(pendingRefund);
      bookingRepo.findOneBy.mockResolvedValue({ ...confirmedBooking, status: 'cancelled' });
      refundRepo.save
        .mockResolvedValueOnce({ ...pendingRefund, status: 'approved' })
        .mockResolvedValueOnce({ ...pendingRefund, status: 'processed', stripeRefundId: 're_e2e_001' });

      const approveRes = await request(app)
        .post(`/api/admin/refunds/${pendingRefund.id}/approve`)
        .set('Authorization', `Bearer mock.jwt.admin`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('processed');
      expect(emailService.sendRefundConfirmation).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FLOW 4: Book → Dispute → On-chain Resolution
  // ─────────────────────────────────────────────────────────────────────────

  describe('Flow 4: Book → Dispute → On-chain Resolution', () => {
    it('resolves a dispute with a Soroban refund transaction', async () => {
      const confirmedBooking = createBooking({
        userId: testUser.id,
        status: 'confirmed',
        paymentMethod: 'stellar',
        stellarTransactionHash: 'ORIGINAL_TX_HASH',
        totalAmount: 400,
      });
      const bookingId = confirmedBooking.id;

      // Open dispute
      const openDispute = {
        id: 'dispute-e2e-001',
        bookingId,
        userId: testUser.id,
        status: 'open',
        reason: 'Flight was overbooked',
        evidence: [],
      };

      bookingRepo.findOneBy.mockResolvedValue(confirmedBooking);
      const disputeRepo = createMockRepository();
      disputeRepo.findOneBy.mockResolvedValue(null);
      disputeRepo.create.mockReturnValue(openDispute);
      disputeRepo.save.mockResolvedValueOnce(openDispute);

      const disputeRes = await request(app)
        .post('/api/disputes')
        .set('Authorization', authToken)
        .send({ bookingId, reason: 'Flight was overbooked, denied boarding' });

      expect(disputeRes.status).toBe(201);

      // Admin resolves dispute — triggers on-chain refund
      soroban.sendTransaction.mockResolvedValue({ hash: 'DISPUTE_REFUND_TX', status: 'PENDING' });
      soroban.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
      disputeRepo.findOneBy.mockResolvedValue(openDispute);
      disputeRepo.save.mockResolvedValueOnce({ ...openDispute, status: 'resolved', resolution: 'refund_issued' });

      const resolveRes = await request(app)
        .post(`/api/admin/disputes/${openDispute.id}/resolve`)
        .set('Authorization', `Bearer mock.jwt.admin`)
        .send({ resolution: 'refund_issued' });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.resolution).toBe('refund_issued');
      expect(soroban.sendTransaction).toHaveBeenCalledTimes(1);
      expect(emailService.sendDisputeUpdate).toHaveBeenCalled();
    });
  });
});
