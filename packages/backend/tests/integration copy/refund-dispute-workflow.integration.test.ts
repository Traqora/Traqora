/**
 * Refund & Dispute Workflow Integration Tests
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import {
  createMockStripe,
  createMockSorobanClient,
  createMockRepository,
  createMockEmailService,
  createMockRedisClient,
} from '../helpers/mocks';
import { BookingBuilder, RefundBuilder, DisputeBuilder, UserBuilder } from '../helpers/builders';

describe('Refund & Dispute Workflow Integration', () => {
  let app: Express.Application;
  let bookingRepo: ReturnType<typeof createMockRepository>;
  let refundRepo: ReturnType<typeof createMockRepository>;
  let disputeRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  let stripe: ReturnType<typeof createMockStripe>;
  let soroban: ReturnType<typeof createMockSorobanClient>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let redis: ReturnType<typeof createMockRedisClient>;
  let testUser: any;
  let authToken: string;
  let adminToken: string;

  beforeEach(() => {
    bookingRepo = createMockRepository();
    refundRepo = createMockRepository();
    disputeRepo = createMockRepository();
    userRepo = createMockRepository();
    stripe = createMockStripe();
    soroban = createMockSorobanClient();
    emailService = createMockEmailService();
    redis = createMockRedisClient();

    app = createApp({ bookingRepo, refundRepo, disputeRepo, userRepo, stripe, soroban, emailService, redis } as any);

    testUser = new UserBuilder().withEmail('user@traqora.com').build();
    authToken = `Bearer mock.jwt.user.${testUser.id}`;
    adminToken = `Bearer mock.jwt.admin`;

    userRepo.findOneBy.mockImplementation(({ id }: any) => {
      if (id === testUser.id) return Promise.resolve(testUser);
      if (id === 'admin-id') return Promise.resolve({ ...testUser, id: 'admin-id', role: 'admin' });
      return Promise.resolve(null);
    });
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  // REFUND WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────

  describe('Refund Workflow', () => {
    describe('POST /api/refunds', () => {
      it('201 — creates refund request for confirmed booking', async () => {
        const booking = new BookingBuilder().confirmed().forUser(testUser.id).withAmount(450).build();
        const refund = new RefundBuilder().forBooking(booking.id).withAmount(450).build();

        bookingRepo.findOneBy.mockResolvedValue(booking);
        refundRepo.findOneBy.mockResolvedValue(null);
        refundRepo.create.mockReturnValue(refund);
        refundRepo.save.mockResolvedValue(refund);

        const res = await request(app)
          .post('/api/refunds')
          .set('Authorization', authToken)
          .send({ bookingId: booking.id, reason: 'Changed plans' });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('pending');
        expect(res.body.amount).toBe(450);
      });

      it('409 — returns conflict if refund already exists', async () => {
        const booking = new BookingBuilder().confirmed().forUser(testUser.id).build();
        const existing = new RefundBuilder().forBooking(booking.id).build();

        bookingRepo.findOneBy.mockResolvedValue(booking);
        refundRepo.findOneBy.mockResolvedValue(existing);

        const res = await request(app)
          .post('/api/refunds')
          .set('Authorization', authToken)
          .send({ bookingId: booking.id, reason: 'duplicate' });

        expect(res.status).toBe(409);
      });

      it('422 — returns 422 for non-confirmed booking', async () => {
        const booking = new BookingBuilder().cancelled().forUser(testUser.id).build();
        bookingRepo.findOneBy.mockResolvedValue(booking);
        refundRepo.findOneBy.mockResolvedValue(null);

        const res = await request(app)
          .post('/api/refunds')
          .set('Authorization', authToken)
          .send({ bookingId: booking.id, reason: 'test' });

        expect(res.status).toBe(422);
      });

      it('403 — prevents refunding another user's booking', async () => {
        const booking = new BookingBuilder().confirmed().forUser('other-user').build();
        bookingRepo.findOneBy.mockResolvedValue(booking);
        refundRepo.findOneBy.mockResolvedValue(null);

        const res = await request(app)
          .post('/api/refunds')
          .set('Authorization', authToken)
          .send({ bookingId: booking.id, reason: 'unauthorized attempt' });

        expect(res.status).toBe(403);
      });
    });

    describe('POST /api/admin/refunds/:id/approve', () => {
      it('200 — admin approves refund and triggers processing', async () => {
        const booking = new BookingBuilder().confirmed().withStripePayment('pi_approved').withAmount(300).build();
        const refund = new RefundBuilder().forBooking(booking.id).withAmount(300).build();

        refundRepo.findOneBy.mockResolvedValue(refund);
        bookingRepo.findOneBy.mockResolvedValue(booking);
        stripe.refunds.create.mockResolvedValue({ id: 're_approved', status: 'succeeded', amount: 30000 });
        refundRepo.save.mockResolvedValueOnce({ ...refund, status: 'approved' })
                        .mockResolvedValueOnce({ ...refund, status: 'processed', stripeRefundId: 're_approved' });

        const res = await request(app)
          .post(`/api/admin/refunds/${refund.id}/approve`)
          .set('Authorization', adminToken);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('processed');
        expect(emailService.sendRefundConfirmation).toHaveBeenCalledTimes(1);
      });

      it('403 — non-admin cannot approve refunds', async () => {
        const res = await request(app)
          .post('/api/admin/refunds/r-001/approve')
          .set('Authorization', authToken); // regular user token

        expect(res.status).toBe(403);
      });
    });

    describe('POST /api/admin/refunds/:id/reject', () => {
      it('200 — admin rejects refund with a reason', async () => {
        const refund = new RefundBuilder().build();
        refundRepo.findOneBy.mockResolvedValue(refund);
        refundRepo.save.mockResolvedValue({ ...refund, status: 'rejected' });

        const res = await request(app)
          .post(`/api/admin/refunds/${refund.id}/reject`)
          .set('Authorization', adminToken)
          .send({ reason: 'Non-refundable ticket fare' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('rejected');
      });
    });

    describe('GET /api/refunds', () => {
      it('returns all refunds for the current user', async () => {
        const refunds = [
          new RefundBuilder().build(),
          new RefundBuilder().approved().build(),
        ];
        refundRepo.find.mockResolvedValue(refunds);

        const res = await request(app)
          .get('/api/refunds')
          .set('Authorization', authToken);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DISPUTE WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────

  describe('Dispute Workflow', () => {
    describe('POST /api/disputes', () => {
      it('201 — opens a dispute for a confirmed booking', async () => {
        const booking = new BookingBuilder().confirmed().forUser(testUser.id).build();
        const dispute = new DisputeBuilder().forBooking(booking.id).build();

        bookingRepo.findOneBy.mockResolvedValue(booking);
        disputeRepo.findOneBy.mockResolvedValue(null);
        disputeRepo.create.mockReturnValue(dispute);
        disputeRepo.save.mockResolvedValue(dispute);

        const res = await request(app)
          .post('/api/disputes')
          .set('Authorization', authToken)
          .send({ bookingId: booking.id, reason: 'Seat not as described' });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('open');
        expect(emailService.sendDisputeUpdate).toHaveBeenCalledTimes(1);
      });

      it('409 — conflicts if dispute already exists for booking', async () => {
        const booking = new BookingBuilder().confirmed().forUser(testUser.id).build();
        const existing = new DisputeBuilder().forBooking(booking.id).build();

        bookingRepo.findOneBy.mockResolvedValue(booking);
        disputeRepo.findOneBy.mockResolvedValue(existing);

        const res = await request(app)
          .post('/api/disputes')
          .set('Authorization', authToken)
          .send({ bookingId: booking.id, reason: 'duplicate dispute' });

        expect(res.status).toBe(409);
      });
    });

    describe('POST /api/disputes/:id/evidence', () => {
      it('200 — submits evidence to an open dispute', async () => {
        const dispute = new DisputeBuilder().build();
        const evidence = { type: 'screenshot', url: 'https://ipfs.io/ipfs/Qm123', description: 'Flight delay proof' };

        disputeRepo.findOneBy.mockResolvedValue(dispute);
        disputeRepo.save.mockResolvedValue({ ...dispute, evidence: [evidence] });

        const res = await request(app)
          .post(`/api/disputes/${dispute.id}/evidence`)
          .set('Authorization', authToken)
          .send(evidence);

        expect(res.status).toBe(200);
        expect(res.body.evidence).toContainEqual(evidence);
      });

      it('422 — cannot add evidence to a resolved dispute', async () => {
        const dispute = new DisputeBuilder().resolved('refund_issued').build();
        disputeRepo.findOneBy.mockResolvedValue(dispute);

        const res = await request(app)
          .post(`/api/disputes/${dispute.id}/evidence`)
          .set('Authorization', authToken)
          .send({ type: 'doc', url: 'https://...', description: 'Late evidence' });

        expect(res.status).toBe(422);
      });
    });

    describe('POST /api/admin/disputes/:id/resolve', () => {
      it('200 — admin resolves dispute in user favour and triggers on-chain refund', async () => {
        const booking = new BookingBuilder().confirmed().withCryptoPayment().withAmount(400).build();
        const dispute = new DisputeBuilder().forBooking(booking.id).build();

        disputeRepo.findOneBy.mockResolvedValue(dispute);
        bookingRepo.findOneBy.mockResolvedValue(booking);
        soroban.sendTransaction.mockResolvedValue({ hash: 'DISPUTE_TX', status: 'PENDING' });
        soroban.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
        disputeRepo.save.mockResolvedValue({ ...dispute, status: 'resolved', resolution: 'refund_issued' });

        const res = await request(app)
          .post(`/api/admin/disputes/${dispute.id}/resolve`)
          .set('Authorization', adminToken)
          .send({ resolution: 'refund_issued' });

        expect(res.status).toBe(200);
        expect(res.body.resolution).toBe('refund_issued');
        expect(soroban.sendTransaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('GET /api/admin/disputes', () => {
      it('200 — admin retrieves all open disputes', async () => {
        const open = [
          new DisputeBuilder().build(),
          new DisputeBuilder().build(),
        ];
        disputeRepo.find.mockResolvedValue(open);

        const res = await request(app)
          .get('/api/admin/disputes?status=open')
          .set('Authorization', adminToken);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
      });
    });
  });
});
