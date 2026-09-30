/**
 * Performance regression tests for PriceTracking service.
 * Measures price observation recording, stats computation, and alert evaluation.
 */

import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.id === 'tracker-1' || where?.trackedFlightId === 'tracker-1') {
          return Promise.resolve({
            id: 'tracker-1',
            userId: 'user-1',
            origin: 'JFK',
            destination: 'LHR',
            departureDate: '2026-08-01',
            targetPriceCents: 40000,
            status: 'active',
          });
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.trackedFlightId === 'tracker-1') {
          return Promise.resolve([
            { id: 'obs-1', priceCents: 50000, currency: 'USD', observedAt: new Date('2026-07-01') },
            { id: 'obs-2', priceCents: 48000, currency: 'USD', observedAt: new Date('2026-07-15') },
            { id: 'obs-3', priceCents: 45000, currency: 'USD', observedAt: new Date('2026-07-20') },
          ]);
        }
        if (where?.userId === 'user-1') {
          return Promise.resolve([
            { id: 'tracker-1', origin: 'JFK', destination: 'LHR', status: 'active' },
            { id: 'tracker-2', origin: 'SFO', destination: 'ORD', status: 'active' },
          ]);
        }
        return Promise.resolve([]);
      }),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockReturnValue({}),
    }),
  },
}));

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: {
    getInstance: jest.fn().mockReturnValue({
      sendPriceDropAlert: jest.fn().mockResolvedValue(true),
    }),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('PriceTracking Performance', () => {
  let PriceTrackingService: any;

  beforeAll(() => {
    PriceTrackingService = require('../../src/services/priceTracking');
  });

  describe('tracker management', () => {
    it('should create tracker within 50ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.createTracker({
          userId: 'user-1',
          origin: 'JFK',
          destination: 'LHR',
          departureDate: '2026-08-01',
          targetPriceCents: 40000,
        }),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });

    it('should list user trackers within 30ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.getUserTrackers('user-1'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 30, maxMs: 60 });
    });

    it('should get tracker by id within 20ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.getTracker('tracker-1'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
    });
  });

  describe('price observations', () => {
    it('should record observation within 30ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.recordObservation({
          trackedFlightId: 'tracker-1',
          priceCents: 42000,
          currency: 'USD',
          source: 'test',
        }),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 30, maxMs: 60 });
    });

    it('should compute price stats within 30ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.getPriceStats('tracker-1'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 30, maxMs: 60 });
    });
  });

  describe('price drop assessment', () => {
    it('should assess price drop within 20ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.assessPriceDrop('tracker-1', 38000),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
    });

    it('should detect significant drop within 20ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.assessPriceDrop('tracker-1', 35000),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
    });
  });

  describe('alert evaluation', () => {
    it('should evaluate alert conditions within 30ms', async () => {
      const stats = await measurePerf(
        () => PriceTrackingService.evaluateAlertConditions('tracker-1', 38000),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 30, maxMs: 60 });
    });
  });
});
