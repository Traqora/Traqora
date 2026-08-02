/**
 * Performance regression tests for CurrencyService.
 * Measures conversion, listing, and bulk operation performance.
 */

import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('CurrencyService Performance', () => {
  let CurrencyService: any;
  let service: any;

  beforeAll(() => {
    CurrencyService = require('../../src/services/currencyService').CurrencyService;
    service = CurrencyService.getInstance();
  });

  beforeEach(() => {
    CurrencyService.instance = service;
    service.clearCache?.();
  });

  it('should convert currency with in-memory rate within 10ms', async () => {
    const stats = await measurePerf(
      () => service.convert(100, 'USD', 'EUR'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 10, maxMs: 20 });
  });

  it('should convert multiple currencies within 15ms each', async () => {
    const convertAll = async () => {
      await service.convert(100, 'USD', 'EUR');
      await service.convert(200, 'USD', 'GBP');
      await service.convert(150, 'EUR', 'JPY');
      await service.convert(50, 'GBP', 'CAD');
      await service.convert(300, 'USD', 'NGN');
    };

    const stats = await measurePerf(convertAll, 20);
    assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
  });

  it('should get supported currencies within 5ms', async () => {
    const stats = await measurePerf(
      () => service.getSupportedCurrencies(),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 5, maxMs: 10 });
  });

  it('should get currency config within 5ms', async () => {
    const stats = await measurePerf(
      () => service.getCurrencyConfig('USD'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 5, maxMs: 10 });
  });

  it('should format currency amount within 5ms', async () => {
    const stats = await measurePerf(
      () => service.formatAmount(1234.56, 'USD'),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 5, maxMs: 15 });
  });

  it('should list all supported currencies within 10ms', async () => {
    const stats = await measurePerf(
      () => service.getSupportedCurrencies(),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 10, maxMs: 20 });
  });
});
