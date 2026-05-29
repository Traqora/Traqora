import { ContractMonitoringService } from '../../src/services/ContractMonitoringService';
import {
  createMockSorobanClient,
  createMockStellarServer,
  createMockRepository,
  createMockWebSocketServer,
  createMockEmailService,
} from '../../../tests/helpers/mocks';
import { BookingBuilder } from '../../../tests/helpers/builders';
import { createStellarTransaction } from '../../../tests/helpers/factories';

jest.useFakeTimers();

describe('ContractMonitoringService', () => {
  let service: ContractMonitoringService;
  let soroban: ReturnType<typeof createMockSorobanClient>;
  let stellarServer: ReturnType<typeof createMockStellarServer>;
  let bookingRepo: ReturnType<typeof createMockRepository>;
  let wss: ReturnType<typeof createMockWebSocketServer>;
  let emailService: ReturnType<typeof createMockEmailService>;

  const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  beforeEach(() => {
    soroban = createMockSorobanClient();
    stellarServer = createMockStellarServer();
    bookingRepo = createMockRepository();
    wss = createMockWebSocketServer();
    emailService = createMockEmailService();

    service = new ContractMonitoringService(
      soroban as any,
      stellarServer as any,
      bookingRepo as any,
      wss as any,
      emailService as any,
      CONTRACT_ID,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    service.stop();
  });

  // ── start / stop ───────────────────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('starts the monitoring loop', () => {
      expect(() => service.start()).not.toThrow();
      expect(service.isRunning()).toBe(true);
    });

    it('stops cleanly', () => {
      service.start();
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('is idempotent — second start() is ignored', () => {
      service.start();
      service.start();
      expect(service.isRunning()).toBe(true);
    });
  });

  // ── pollContractEvents ─────────────────────────────────────────────────────

  describe('pollContractEvents()', () => {
    it('processes BookingCreated event and updates booking status', async () => {
      const booking = new BookingBuilder().pending().build();
      const event = {
        type: 'BookingCreated',
        contractId: CONTRACT_ID,
        bookingId: booking.id,
        ledger: 12345678,
        timestamp: new Date().toISOString(),
      };

      soroban.getContractData.mockResolvedValue({ events: [event] });
      bookingRepo.findOneBy.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'confirmed', contractId: CONTRACT_ID });

      await service.pollContractEvents();

      expect(bookingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'confirmed' }),
      );
    });

    it('processes RefundIssued event and marks booking as refunded', async () => {
      const booking = new BookingBuilder().confirmed().build();
      const event = { type: 'RefundIssued', bookingId: booking.id, amount: 45000, ledger: 12345679 };

      soroban.getContractData.mockResolvedValue({ events: [event] });
      bookingRepo.findOneBy.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'refunded' });

      await service.pollContractEvents();

      expect(bookingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'refunded' }),
      );
      expect(emailService.sendRefundConfirmation).toHaveBeenCalledTimes(1);
    });

    it('broadcasts contract event via WebSocket to subscribed users', async () => {
      const booking = new BookingBuilder().confirmed().build();
      const event = { type: 'BookingCreated', bookingId: booking.id, ledger: 1234 };

      soroban.getContractData.mockResolvedValue({ events: [event] });
      bookingRepo.findOneBy.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'confirmed' });

      await service.pollContractEvents();

      expect(wss.emit).toHaveBeenCalledWith(
        'contractEvent',
        expect.objectContaining({ type: 'BookingCreated' }),
      );
    });

    it('skips unknown event types without crashing', async () => {
      soroban.getContractData.mockResolvedValue({
        events: [{ type: 'UnknownEvent', data: {} }],
      });

      await expect(service.pollContractEvents()).resolves.not.toThrow();
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });

    it('handles empty events list gracefully', async () => {
      soroban.getContractData.mockResolvedValue({ events: [] });

      await expect(service.pollContractEvents()).resolves.not.toThrow();
    });
  });

  // ── verifyTransaction ──────────────────────────────────────────────────────

  describe('verifyTransaction()', () => {
    it('returns transaction details when found on ledger', async () => {
      const tx = createStellarTransaction({ successful: true });
      stellarServer.call.mockResolvedValue({ records: [tx] });

      const result = await service.verifyTransaction(tx.hash);

      expect(result.successful).toBe(true);
      expect(result.hash).toBe(tx.hash);
    });

    it('returns null when transaction is not yet on ledger', async () => {
      stellarServer.call.mockResolvedValue({ records: [] });

      const result = await service.verifyTransaction('UNKNOWN_HASH');
      expect(result).toBeNull();
    });

    it('retries polling on pending transactions', async () => {
      soroban.getTransaction
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockResolvedValueOnce({ status: 'SUCCESS' });

      const result = await service.waitForTransaction('TX_HASH_PENDING', { maxRetries: 5, intervalMs: 100 });

      expect(result.status).toBe('SUCCESS');
      expect(soroban.getTransaction).toHaveBeenCalledTimes(3);
    });

    it('throws after max retries if transaction never settles', async () => {
      soroban.getTransaction.mockResolvedValue({ status: 'PENDING' });

      await expect(
        service.waitForTransaction('TX_STUCK', { maxRetries: 3, intervalMs: 50 }),
      ).rejects.toThrow(/transaction timed out/i);
    });
  });

  // ── getContractState ───────────────────────────────────────────────────────

  describe('getContractState()', () => {
    it('returns the current contract state', async () => {
      soroban.getContractData.mockResolvedValue({
        val: {
          type: 'map',
          val: [
            { key: 'totalBookings', val: 100 },
            { key: 'totalRevenue', val: 45000000 },
          ],
        },
      });

      const state = await service.getContractState();

      expect(state.totalBookings).toBe(100);
      expect(state.totalRevenue).toBe(45000000);
    });

    it('throws if contract is not deployed at configured ID', async () => {
      soroban.getContractData.mockRejectedValue(new Error('contract not found'));

      await expect(service.getContractState()).rejects.toThrow(/contract not found/i);
    });
  });

  // ── cron polling schedule ──────────────────────────────────────────────────

  describe('polling schedule', () => {
    it('polls every 30 seconds while running', async () => {
      const pollSpy = jest.spyOn(service, 'pollContractEvents').mockResolvedValue(undefined);

      service.start();
      jest.advanceTimersByTime(90_000); // 1.5 minutes
      await Promise.resolve();

      expect(pollSpy).toHaveBeenCalledTimes(3);
    });

    it('stops polling after stop() is called', async () => {
      const pollSpy = jest.spyOn(service, 'pollContractEvents').mockResolvedValue(undefined);

      service.start();
      service.stop();

      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(pollSpy).not.toHaveBeenCalled();
    });
  });
});
