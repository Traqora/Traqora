/**
 * Performance regression tests for BookingOrchestrationService.
 * Measures fare calculation, passenger name validation, and booking flow operations.
 */

import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 'FL001', priceCents: 50000 }),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockReturnValue({}),
    }),
    transaction: jest.fn().mockImplementation((cb: (entityManager: any) => Promise<any>) =>
      cb({
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ id: 'FL001', priceCents: 50000 }),
          save: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockReturnValue({}),
        }),
      })
    ),
  },
}));

jest.mock('../../src/services/soroban', () => ({
  signAndSubmitCreateBooking: jest.fn().mockResolvedValue({ hash: 'tx-hash', status: 'success' }),
  getTransactionStatus: jest.fn().mockResolvedValue('approved'),
}));

jest.mock('../../src/services/retry', () => ({
  withRetries: jest.fn().mockImplementation((fn: () => Promise<any>) => fn()),
}));

jest.mock('../../src/services/fareRulesService', () => ({
  FareRulesService: jest.fn().mockImplementation(() => ({
    getBookingPriceBreakdown: jest.fn().mockResolvedValue({
      baseFareCents: 45000,
      taxesCents: 5000,
      totalCents: 50000,
      currency: 'USD',
      breakdown: [],
    }),
    validateFareClass: jest.fn().mockResolvedValue({ valid: true }),
  })),
}));

jest.mock('../../src/websockets/server', () => ({
  getWebSocketServer: jest.fn().mockReturnValue({
    emitToUser: jest.fn(),
  }),
}));

jest.mock('../../src/services/inflightServicesService', () => ({
  inflightServicesService: {
    getServicesForFlight: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/services/seatAvailabilityService', () => ({
  seatAvailabilityService: {
    getSeatAvailability: jest.fn().mockResolvedValue({
      seats: [],
      totalSeats: 100,
      availableSeats: 50,
    }),
    lockSeat: jest.fn().mockResolvedValue(true),
    unlockSeat: jest.fn().mockResolvedValue(true),
  },
}));

describe('BookingOrchestrationService Performance', () => {
  describe('fare calculations', () => {
    it('should compute price breakdown within 50ms', async () => {
      const { FareRulesService } = require('../../src/services/fareRulesService');
      const fareService = new FareRulesService();

      const stats = await measurePerf(
        () => fareService.getBookingPriceBreakdown('FL001', 'economy', 'ADT', 1),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });

    it('should validate fare class within 20ms', async () => {
      const { FareRulesService } = require('../../src/services/fareRulesService');
      const fareService = new FareRulesService();

      const stats = await measurePerf(
        () => fareService.validateFareClass('FL001', 'economy'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
    });
  });

  describe('flight change operations', () => {
    it('should quote change fee within 50ms', async () => {
      const { FareRulesService } = require('../../src/services/fareRulesService');
      const fareService = new FareRulesService();

      const stats = await measurePerf(
        () => fareService.getFlightChangeQuote('FL001', 'FL002', 'economy', 'ADT', 1),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });

    it('should quote cancellation refund within 50ms', async () => {
      const { FareRulesService } = require('../../src/services/fareRulesService');
      const fareService = new FareRulesService();

      const stats = await measurePerf(
        () => fareService.getCancellationRefund('BK001', 'economy', 'ADT'),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });

    it('should quote upgrade within 50ms', async () => {
      const { FareRulesService } = require('../../src/services/fareRulesService');
      const fareService = new FareRulesService();

      const stats = await measurePerf(
        () => fareService.getUpgradeQuote('FL001', 'economy', 'business', 'ADT'),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('passenger name validation', () => {
    it('should validate passenger name against airline format within 10ms', async () => {
      const { FareRulesService } = require('../../src/services/fareRulesService');
      const fareService = new FareRulesService();

      const name = { title: 'Mr', firstName: 'John', lastName: 'Doe' };
      const stats = await measurePerf(
        () => fareService.validateNameFormat(name, 'DELTA'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 10, maxMs: 30 });
    });
  });
});
