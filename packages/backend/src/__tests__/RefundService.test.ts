import { RefundService } from '../../src/services/RefundService';
import {
  createMockRepository,
  createMockStripe,
  createMockSorobanClient,
  createMockEmailService,
} from '../../../tests/helpers/mocks';
import { BookingBuilder, RefundBuilder } from '../../../tests/helpers/builders';
import { createRefund } from '../../../tests/helpers/factories';

describe('RefundService', () => {
  let service: RefundService;
  let refundRepo: ReturnType<typeof createMockRepository>;
  let bookingRepo: ReturnType<typeof createMockRepository>;
  let stripe: ReturnType<typeof createMockStripe>;
  let soroban: ReturnType<typeof createMockSorobanClient>;
  let emailService: ReturnType<typeof createMockEmailService>;

  beforeEach(() => {
    refundRepo = createMockRepository();
    bookingRepo = createMockRepository();
    stripe = createMockStripe();
    soroban = createMockSorobanClient();
    emailService = createMockEmailService();

    service = new RefundService(
      refundRepo as any,
      bookingRepo as any,
      stripe as any,
      soroban as any,
      emailService as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── requestRefund ──────────────────────────────────────────────────────────

  describe('requestRefund()', () => {
    it('creates a pending refund for a confirmed booking', async () => {
      const booking = new BookingBuilder().confirmed().withAmount(450).build();
      bookingRepo.findOneBy.mockResolvedValue(booking);
      refundRepo.findOneBy.mockResolvedValue(null); // no existing refund
      refundRepo.create.mockReturnValue({ bookingId: booking.id, status: 'pending', amount: 450 });
      refundRepo.save.mockResolvedValue({ id: 'r-001', bookingId: booking.id, status: 'pending', amount: 450 });

      const result = await service.requestRefund({ bookingId: booking.id, userId: booking.userId, reason: 'Changed plans' });

      expect(result.status).toBe('pending');
      expect(result.amount).toBe(450);
    });

    it('throws if booking is not confirmed', async () => {
      const booking = new BookingBuilder().pending().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      await expect(
        service.requestRefund({ bookingId: booking.id, userId: booking.userId, reason: 'test' }),
      ).rejects.toThrow(/cannot refund/i);
    });

    it('throws if a refund already exists for this booking', async () => {
      const booking = new BookingBuilder().confirmed().build();
      const existingRefund = new RefundBuilder().forBooking(booking.id).build();

      bookingRepo.findOneBy.mockResolvedValue(booking);
      refundRepo.findOneBy.mockResolvedValue(existingRefund);

      await expect(
        service.requestRefund({ bookingId: booking.id, userId: booking.userId, reason: 'duplicate' }),
      ).rejects.toThrow(/refund already exists/i);
    });

    it('throws if user does not own the booking', async () => {
      const booking = new BookingBuilder().confirmed().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      await expect(
        service.requestRefund({ bookingId: booking.id, userId: 'wrong-user', reason: 'unauthorized' }),
      ).rejects.toThrow(/unauthorized/i);
    });
  });

  // ── processRefund ──────────────────────────────────────────────────────────

  describe('processRefund()', () => {
    it('processes Stripe refund and marks as completed', async () => {
      const booking = new BookingBuilder().confirmed().withStripePayment('pi_refund_test').withAmount(300).build();
      const refund = new RefundBuilder().forBooking(booking.id).withAmount(300).build();

      refundRepo.findOneBy.mockResolvedValue(refund);
      bookingRepo.findOneBy.mockResolvedValue(booking);
      stripe.refunds.create.mockResolvedValue({ id: 're_done', status: 'succeeded', amount: 30000 });
      refundRepo.save.mockResolvedValue({ ...refund, status: 'processed', stripeRefundId: 're_done' });

      const result = await service.processRefund(refund.id);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_refund_test' }),
      );
      expect(result.status).toBe('processed');
      expect(emailService.sendRefundConfirmation).toHaveBeenCalledTimes(1);
    });

    it('processes Stellar refund on chain for crypto bookings', async () => {
      const booking = new BookingBuilder().confirmed().withCryptoPayment().withAmount(200).build();
      const refund = new RefundBuilder().forBooking(booking.id).withAmount(200).build();

      refundRepo.findOneBy.mockResolvedValue(refund);
      bookingRepo.findOneBy.mockResolvedValue(booking);
      soroban.sendTransaction.mockResolvedValue({ hash: 'REFUND_STELLAR_HASH', status: 'PENDING' });
      soroban.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
      refundRepo.save.mockResolvedValue({ ...refund, status: 'processed', stellarRefundHash: 'REFUND_STELLAR_HASH' });

      const result = await service.processRefund(refund.id);

      expect(soroban.sendTransaction).toHaveBeenCalledTimes(1);
      expect(result.stellarRefundHash).toBe('REFUND_STELLAR_HASH');
    });

    it('marks refund as failed if Stripe throws', async () => {
      const booking = new BookingBuilder().confirmed().withStripePayment().withAmount(100).build();
      const refund = new RefundBuilder().forBooking(booking.id).build();

      refundRepo.findOneBy.mockResolvedValue(refund);
      bookingRepo.findOneBy.mockResolvedValue(booking);
      stripe.refunds.create.mockRejectedValue(new Error('charge_already_refunded'));

      await expect(service.processRefund(refund.id)).rejects.toThrow(/already_refunded/i);
      expect(refundRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('throws if refund is already processed', async () => {
      const refund = new RefundBuilder().processed().build();
      refundRepo.findOneBy.mockResolvedValue(refund);

      await expect(service.processRefund(refund.id)).rejects.toThrow(/already processed/i);
    });
  });

  // ── approveRefund / rejectRefund ───────────────────────────────────────────

  describe('approveRefund()', () => {
    it('transitions refund from pending to approved', async () => {
      const refund = createRefund({ status: 'pending' });
      refundRepo.findOneBy.mockResolvedValue(refund);
      refundRepo.save.mockResolvedValue({ ...refund, status: 'approved' });

      const result = await service.approveRefund(refund.id, 'admin-001');
      expect(result.status).toBe('approved');
    });
  });

  describe('rejectRefund()', () => {
    it('transitions refund from pending to rejected with a reason', async () => {
      const refund = createRefund({ status: 'pending' });
      refundRepo.findOneBy.mockResolvedValue(refund);
      refundRepo.save.mockResolvedValue({ ...refund, status: 'rejected' });

      const result = await service.rejectRefund(refund.id, 'admin-001', 'Non-refundable fare');
      expect(result.status).toBe('rejected');
    });
  });

  // ── getRefundsByUser ───────────────────────────────────────────────────────

  describe('getRefundsByUser()', () => {
    it('returns all refunds belonging to a user', async () => {
      const userId = 'user-xyz';
      const refunds = [createRefund({ userId }), createRefund({ userId })];
      refundRepo.find.mockResolvedValue(refunds);

      const result = await service.getRefundsByUser(userId);
      expect(result).toHaveLength(2);
    });
  });

  // ── calculateRefundAmount ──────────────────────────────────────────────────

  describe('calculateRefundAmount()', () => {
    it('returns full amount for cancellations more than 48h before departure', async () => {
      const booking = new BookingBuilder().confirmed().withAmount(500).build();
      const flight = { departureTime: new Date(Date.now() + 72 * 3600_000) };

      const amount = await service.calculateRefundAmount(booking, flight as any);
      expect(amount).toBe(500);
    });

    it('returns 50% for cancellations within 24h of departure', async () => {
      const booking = new BookingBuilder().confirmed().withAmount(500).build();
      const flight = { departureTime: new Date(Date.now() + 12 * 3600_000) };

      const amount = await service.calculateRefundAmount(booking, flight as any);
      expect(amount).toBe(250);
    });

    it('returns 0 for cancellations after departure', async () => {
      const booking = new BookingBuilder().confirmed().withAmount(500).build();
      const flight = { departureTime: new Date(Date.now() - 3600_000) };

      const amount = await service.calculateRefundAmount(booking, flight as any);
      expect(amount).toBe(0);
    });
  });
});
