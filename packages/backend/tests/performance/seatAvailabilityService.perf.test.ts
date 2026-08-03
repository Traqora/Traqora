/**
 * Performance regression tests for SeatAvailabilityService.
 * Measures seat map generation, availability checks, locking/unlocking.
 */

import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        if (where?.id === 'FL001') {
          return Promise.resolve({
            id: 'FL001',
            flightNumber: 'AA100',
            departure: new Date('2026-08-01'),
            aircraftType: 'Boeing 787',
          });
        }
        return Promise.resolve(null);
      }),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue({}),
    }),
  },
}));

describe('SeatAvailabilityService Performance', () => {
  let SeatAvailabilityService: any;

  beforeAll(() => {
    SeatAvailabilityService = require('../../src/services/seatAvailabilityService').seatAvailabilityService;
  });

  it('should get seat map within 50ms', async () => {
    const stats = await measurePerf(
      () => SeatAvailabilityService.getSeatAvailability('FL001'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
  });

  it('should get seat map filtered by class within 50ms', async () => {
    const stats = await measurePerf(
      () => SeatAvailabilityService.getSeatAvailability('FL001', 'business'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
  });

  it('should lock seat within 20ms', async () => {
    const stats = await measurePerf(
      () => SeatAvailabilityService.lockSeat('FL001', '3A', 'booking-1'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
  });

  it('should unlock seat within 20ms', async () => {
    await SeatAvailabilityService.lockSeat('FL001', '3A', 'booking-1');

    const stats = await measurePerf(
      () => SeatAvailabilityService.unlockSeat('FL001', '3A', 'booking-1'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
  });

  it('should check seat availability within 20ms', async () => {
    const stats = await measurePerf(
      () => SeatAvailabilityService.isSeatAvailable('FL001', '3A'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
  });

  it('should get available seat count within 30ms', async () => {
    const stats = await measurePerf(
      () => SeatAvailabilityService.getAvailableCount('FL001', 'economy'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 30, maxMs: 60 });
  });
});
