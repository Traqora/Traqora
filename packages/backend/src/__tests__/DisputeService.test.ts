import { DisputeService } from '../../src/services/DisputeService';
import {
  createMockRepository,
  createMockEmailService,
  createMockSorobanClient,
} from '../../../tests/helpers/mocks';
import { BookingBuilder, DisputeBuilder } from '../../../tests/helpers/builders';
import { createDispute } from '../../../tests/helpers/factories';

describe('DisputeService', () => {
  let service: DisputeService;
  let disputeRepo: ReturnType<typeof createMockRepository>;
  let bookingRepo: ReturnType<typeof createMockRepository>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let soroban: ReturnType<typeof createMockSorobanClient>;

  beforeEach(() => {
    disputeRepo = createMockRepository();
    bookingRepo = createMockRepository();
    emailService = createMockEmailService();
    soroban = createMockSorobanClient();

    service = new DisputeService(
      disputeRepo as any,
      bookingRepo as any,
      emailService as any,
      soroban as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── openDispute ────────────────────────────────────────────────────────────

  describe('openDispute()', () => {
    it('opens a dispute for a confirmed booking', async () => {
      const booking = new BookingBuilder().confirmed().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);
      disputeRepo.findOneBy.mockResolvedValue(null);
      disputeRepo.create.mockReturnValue({ bookingId: booking.id, status: 'open' });
      disputeRepo.save.mockResolvedValue({ id: 'd-001', bookingId: booking.id, status: 'open' });

      const result = await service.openDispute({
        bookingId: booking.id,
        userId: booking.userId,
        reason: 'Flight diverted without compensation',
      });

      expect(result.status).toBe('open');
      expect(emailService.sendDisputeUpdate).toHaveBeenCalledTimes(1);
    });

    it('throws if booking does not belong to the user', async () => {
      const booking = new BookingBuilder().confirmed().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      await expect(
        service.openDispute({ bookingId: booking.id, userId: 'imposter', reason: 'fraud' }),
      ).rejects.toThrow(/unauthorized/i);
    });

    it('throws if a dispute already exists for this booking', async () => {
      const booking = new BookingBuilder().confirmed().build();
      const existing = new DisputeBuilder().forBooking(booking.id).build();

      bookingRepo.findOneBy.mockResolvedValue(booking);
      disputeRepo.findOneBy.mockResolvedValue(existing);

      await expect(
        service.openDispute({ bookingId: booking.id, userId: booking.userId, reason: 'again' }),
      ).rejects.toThrow(/dispute already exists/i);
    });

    it('throws if booking is not in confirmed state', async () => {
      const booking = new BookingBuilder().cancelled().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);
      disputeRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.openDispute({ bookingId: booking.id, userId: booking.userId, reason: 'cancelled booking' }),
      ).rejects.toThrow(/cannot dispute/i);
    });
  });

  // ── submitEvidence ─────────────────────────────────────────────────────────

  describe('submitEvidence()', () => {
    it('appends evidence to an open dispute', async () => {
      const dispute = new DisputeBuilder().build(); // status: open
      const evidence = { type: 'screenshot', url: 'https://ipfs.io/ipfs/QmEvidence', description: 'Email from airline' };

      disputeRepo.findOneBy.mockResolvedValue(dispute);
      disputeRepo.save.mockResolvedValue({ ...dispute, evidence: [evidence] });

      const result = await service.submitEvidence(dispute.id, dispute.userId, evidence);

      expect(result.evidence).toContainEqual(evidence);
    });

    it('throws if dispute is already resolved', async () => {
      const dispute = new DisputeBuilder().resolved('refund issued').build();
      disputeRepo.findOneBy.mockResolvedValue(dispute);

      await expect(
        service.submitEvidence(dispute.id, dispute.userId, { type: 'doc', url: 'https://...', description: '' }),
      ).rejects.toThrow(/dispute is closed/i);
    });
  });

  // ── resolveDispute ─────────────────────────────────────────────────────────

  describe('resolveDispute()', () => {
    it('resolves dispute in favour of user and triggers refund on chain', async () => {
      const booking = new BookingBuilder().confirmed().withCryptoPayment().withAmount(400).build();
      const dispute = new DisputeBuilder().forBooking(booking.id).build();

      disputeRepo.findOneBy.mockResolvedValue(dispute);
      bookingRepo.findOneBy.mockResolvedValue(booking);
      soroban.sendTransaction.mockResolvedValue({ hash: 'DISPUTE_RESOLVE_TX', status: 'PENDING' });
      soroban.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
      disputeRepo.save.mockResolvedValue({ ...dispute, status: 'resolved', resolution: 'refund_issued' });

      const result = await service.resolveDispute(dispute.id, 'admin-001', 'refund_issued');

      expect(result.status).toBe('resolved');
      expect(soroban.sendTransaction).toHaveBeenCalledTimes(1);
      expect(emailService.sendDisputeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'resolved' }),
      );
    });

    it('resolves dispute in favour of airline with no refund', async () => {
      const booking = new BookingBuilder().confirmed().withStripePayment().withAmount(300).build();
      const dispute = new DisputeBuilder().forBooking(booking.id).build();

      disputeRepo.findOneBy.mockResolvedValue(dispute);
      bookingRepo.findOneBy.mockResolvedValue(booking);
      disputeRepo.save.mockResolvedValue({ ...dispute, status: 'resolved', resolution: 'denied' });

      const result = await service.resolveDispute(dispute.id, 'admin-001', 'denied');

      expect(result.resolution).toBe('denied');
      expect(soroban.sendTransaction).not.toHaveBeenCalled();
    });

    it('throws if dispute is already resolved', async () => {
      const dispute = new DisputeBuilder().resolved('refund_issued').build();
      disputeRepo.findOneBy.mockResolvedValue(dispute);

      await expect(service.resolveDispute(dispute.id, 'admin', 'denied')).rejects.toThrow(/already resolved/i);
    });
  });

  // ── getDisputeById / getDisputesByUser ─────────────────────────────────────

  describe('getDisputeById()', () => {
    it('returns dispute when found', async () => {
      const dispute = createDispute();
      disputeRepo.findOneBy.mockResolvedValue(dispute);

      const result = await service.getDisputeById(dispute.id);
      expect(result).toEqual(dispute);
    });

    it('throws NotFoundException when not found', async () => {
      disputeRepo.findOneBy.mockResolvedValue(null);
      await expect(service.getDisputeById('no-id')).rejects.toThrow(/not found/i);
    });
  });

  describe('getDisputesByUser()', () => {
    it('returns all disputes for a user', async () => {
      const userId = 'user-dispute-test';
      const disputes = [createDispute({ userId }), createDispute({ userId })];
      disputeRepo.find.mockResolvedValue(disputes);

      const result = await service.getDisputesByUser(userId);
      expect(result).toHaveLength(2);
    });
  });

  // ── admin: listOpenDisputes ────────────────────────────────────────────────

  describe('listOpenDisputes()', () => {
    it('returns all open disputes for admin review', async () => {
      const openDisputes = [createDispute({ status: 'open' }), createDispute({ status: 'open' })];
      disputeRepo.find.mockResolvedValue(openDisputes);

      const result = await service.listOpenDisputes();

      expect(disputeRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'open' } }));
      expect(result).toHaveLength(2);
    });
  });
});
