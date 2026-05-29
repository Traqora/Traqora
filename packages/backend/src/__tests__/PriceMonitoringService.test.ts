import { PriceMonitoringService } from '../../src/services/PriceMonitoringService';
import {
  createMockRepository,
  createMockEmailService,
  createMockWebSocketServer,
  createMockRedisClient,
} from '../../../tests/helpers/mocks';
import { FlightBuilder } from '../../../tests/helpers/builders';
import { createPriceAlert, createFlight } from '../../../tests/helpers/factories';

jest.useFakeTimers();

describe('PriceMonitoringService', () => {
  let service: PriceMonitoringService;
  let flightRepo: ReturnType<typeof createMockRepository>;
  let alertRepo: ReturnType<typeof createMockRepository>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let wss: ReturnType<typeof createMockWebSocketServer>;
  let redis: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    flightRepo = createMockRepository();
    alertRepo = createMockRepository();
    emailService = createMockEmailService();
    wss = createMockWebSocketServer();
    redis = createMockRedisClient();

    service = new PriceMonitoringService(
      flightRepo as any,
      alertRepo as any,
      emailService as any,
      wss as any,
      redis as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    service.stop();
  });

  // ── start / stop ───────────────────────────────────────────────────────────

  describe('start() / stop()', () => {
    it('starts the cron job without throwing', () => {
      expect(() => service.start()).not.toThrow();
    });

    it('stops the cron job cleanly', () => {
      service.start();
      expect(() => service.stop()).not.toThrow();
    });

    it('does not start twice when called multiple times', () => {
      service.start();
      service.start(); // second call should be a no-op

      expect(service.isRunning()).toBe(true);
    });
  });

  // ── checkPriceAlerts ───────────────────────────────────────────────────────

  describe('checkPriceAlerts()', () => {
    it('sends email alert when flight price drops below target', async () => {
      const flight = new FlightBuilder().from('LOS').to('LHR').withPrice(320).build();
      const alert = createPriceAlert({ origin: 'LOS', destination: 'LHR', targetPrice: 350, currentPrice: 400 });

      alertRepo.find.mockResolvedValue([alert]);
      flightRepo.find.mockResolvedValue([flight]);

      await service.checkPriceAlerts();

      expect(emailService.sendPriceAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: alert.userId,
          newPrice: 320,
          targetPrice: 350,
        }),
      );
    });

    it('updates alert notifiedAt after sending notification', async () => {
      const flight = new FlightBuilder().withPrice(300).build();
      const alert = createPriceAlert({ targetPrice: 350, currentPrice: 400 });

      alertRepo.find.mockResolvedValue([alert]);
      flightRepo.find.mockResolvedValue([flight]);

      await service.checkPriceAlerts();

      expect(alertRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ notifiedAt: expect.any(Date) }),
      );
    });

    it('does NOT alert when price is above target', async () => {
      const flight = new FlightBuilder().withPrice(500).build();
      const alert = createPriceAlert({ targetPrice: 350, currentPrice: 400 });

      alertRepo.find.mockResolvedValue([alert]);
      flightRepo.find.mockResolvedValue([flight]);

      await service.checkPriceAlerts();

      expect(emailService.sendPriceAlert).not.toHaveBeenCalled();
    });

    it('does NOT re-alert if already notified within cooldown period', async () => {
      const flight = new FlightBuilder().withPrice(300).build();
      const alert = createPriceAlert({
        targetPrice: 350,
        currentPrice: 400,
        notifiedAt: new Date(Date.now() - 3600_000), // notified 1h ago
      });

      alertRepo.find.mockResolvedValue([alert]);
      flightRepo.find.mockResolvedValue([flight]);

      await service.checkPriceAlerts();

      expect(emailService.sendPriceAlert).not.toHaveBeenCalled();
    });

    it('skips inactive alerts', async () => {
      const alert = createPriceAlert({ active: false, targetPrice: 200 });
      alertRepo.find.mockResolvedValue([alert]);
      flightRepo.find.mockResolvedValue([new FlightBuilder().withPrice(100).build()]);

      await service.checkPriceAlerts();

      expect(emailService.sendPriceAlert).not.toHaveBeenCalled();
    });

    it('handles empty alerts list gracefully', async () => {
      alertRepo.find.mockResolvedValue([]);

      await expect(service.checkPriceAlerts()).resolves.not.toThrow();
      expect(emailService.sendPriceAlert).not.toHaveBeenCalled();
    });
  });

  // ── updateFlightPrices ─────────────────────────────────────────────────────

  describe('updateFlightPrices()', () => {
    it('fetches latest prices and persists changes to DB', async () => {
      const flights = [
        new FlightBuilder().withPrice(400).departingIn(48).build(),
        new FlightBuilder().withPrice(350).departingIn(2).build(),
      ];
      flightRepo.find.mockResolvedValue(flights);

      await service.updateFlightPrices();

      expect(flightRepo.save).toHaveBeenCalled();
    });

    it('applies dynamic pricing for flights departing in less than 6h', async () => {
      const urgentFlight = new FlightBuilder().withPrice(400).withSeats(3).departingIn(4).build();
      flightRepo.find.mockResolvedValue([urgentFlight]);

      await service.updateFlightPrices();

      const savedFlight = (flightRepo.save as jest.Mock).mock.calls[0][0];
      expect(savedFlight.price).toBeGreaterThan(400);
    });

    it('caches updated prices in Redis', async () => {
      const flight = createFlight();
      flightRepo.find.mockResolvedValue([flight]);

      await service.updateFlightPrices();

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining(`flight:price:${flight.id}`),
        expect.any(String),
        expect.anything(),
      );
    });
  });

  // ── cron execution ─────────────────────────────────────────────────────────

  describe('cron execution', () => {
    it('runs checkPriceAlerts on schedule (every 5 minutes)', async () => {
      alertRepo.find.mockResolvedValue([]);
      flightRepo.find.mockResolvedValue([]);

      const checkSpy = jest.spyOn(service, 'checkPriceAlerts').mockResolvedValue(undefined);

      service.start();

      // Advance time by 15 minutes — expect 3 ticks
      jest.advanceTimersByTime(15 * 60_000);

      await Promise.resolve(); // flush microtask queue

      expect(checkSpy).toHaveBeenCalledTimes(3);
    });

    it('does not execute after stop() is called', async () => {
      const checkSpy = jest.spyOn(service, 'checkPriceAlerts').mockResolvedValue(undefined);

      service.start();
      service.stop();

      jest.advanceTimersByTime(10 * 60_000);
      await Promise.resolve();

      expect(checkSpy).not.toHaveBeenCalled();
    });
  });

  // ── error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('continues running after a non-fatal error in checkPriceAlerts', async () => {
      alertRepo.find.mockRejectedValueOnce(new Error('DB connection lost'));
      alertRepo.find.mockResolvedValueOnce([]);

      const checkSpy = jest.spyOn(service, 'checkPriceAlerts');
      service.start();

      jest.advanceTimersByTime(10 * 60_000);
      await Promise.resolve();

      // Should have been called twice and not crashed
      expect(checkSpy).toHaveBeenCalledTimes(2);
      expect(service.isRunning()).toBe(true);
    });
  });
});
