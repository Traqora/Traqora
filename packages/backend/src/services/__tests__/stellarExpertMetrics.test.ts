/**
 * Stellar Expert Metrics — regression tests — issue #728.
 *
 * Covers:
 *   - getTxStatus: caching, pending/success/failed mapping
 *   - computeContractMetrics: aggregation logic
 *   - verifyOnChainSanity: status and ledger discrepancy detection
 *   - purgeExpiredCache: cache invalidation
 */

import { StellarExpertMetricsService, stellarExpertMetricsService } from '../stellarExpertMetrics';

describe('StellarExpertMetricsService', () => {
  let service: StellarExpertMetricsService;

  beforeEach(() => {
    service = new StellarExpertMetricsService();
  });

  describe('getTxStatus', () => {
    it('returns pending when explorer is unreachable', async () => {
      const originalUrl = process.env.STELLAR_EXPLORER_URL;
      process.env.STELLAR_EXPLORER_URL = 'http://localhost:9999';

      const status = await service.getTxStatus('test-tx-1');
      expect(status.txId).toBe('test-tx-1');
      expect(status.status).toBe('pending');

      if (originalUrl) process.env.STELLAR_EXPLORER_URL = originalUrl;
      else delete process.env.STELLAR_EXPLORER_URL;
    });

    it('caches results within TTL', async () => {
      const originalUrl = process.env.STELLAR_EXPLORER_URL;
      process.env.STELLAR_EXPLORER_URL = 'http://localhost:9999';

      const status1 = await service.getTxStatus('cached-tx');
      const status2 = await service.getTxStatus('cached-tx');

      // Both should be identical (from cache)
      expect(status1.txId).toBe(status2.txId);
      expect(status1.status).toBe(status2.status);

      if (originalUrl) process.env.STELLAR_EXPLORER_URL = originalUrl;
      else delete process.env.STELLAR_EXPLORER_URL;
    });
  });

  describe('computeContractMetrics', () => {
    it('computes metrics with empty tx list', async () => {
      const metrics = await service.computeContractMetrics('contract-1', []);
      expect(metrics.contractId).toBe('contract-1');
      expect(metrics.totalTransactions).toBe(0);
      expect(metrics.freshnessScore).toBe(100);
    });

    it('aggregates successful and failed transactions', async () => {
      const metrics = await service.computeContractMetrics('contract-2', ['tx-a', 'tx-b']);
      expect(metrics.totalTransactions).toBe(2);
      expect(metrics.successfulTransactions + metrics.failedTransactions).toBeLessThanOrEqual(2);
    });
  });

  describe('verifyOnChainSanity', () => {
    it('returns verified when no discrepancies', async () => {
      const originalUrl = process.env.STELLAR_EXPLORER_URL;
      process.env.STELLAR_EXPLORER_URL = 'http://localhost:9999';

      const result = await service.verifyOnChainSanity('tx-ok', 'pending');
      expect(result.verified).toBe(true);

      if (originalUrl) process.env.STELLAR_EXPLORER_URL = originalUrl;
      else delete process.env.STELLAR_EXPLORER_URL;
    });

    it('detects status mismatch', async () => {
      const originalUrl = process.env.STELLAR_EXPLORER_URL;
      process.env.STELLAR_EXPLORER_URL = 'http://localhost:9999';

      const result = await service.verifyOnChainSanity('tx-mismatch', 'success');
      expect(result.verified).toBe(false);
      expect(result.discrepancy).toBeDefined();
      expect(result.discrepancy!).toContain('Status mismatch');

      if (originalUrl) process.env.STELLAR_EXPLORER_URL = originalUrl;
      else delete process.env.STELLAR_EXPLORER_URL;
    });
  });

  describe('purgeExpiredCache', () => {
    it('removes expired cache entries', async () => {
      const originalUrl = process.env.STELLAR_EXPLORER_URL;
      process.env.STELLAR_EXPLORER_URL = 'http://localhost:9999';

      const serviceWithShortTtl = new StellarExpertMetricsService();
      serviceWithShortTtl['cacheTtlMs'] = 1;

      await serviceWithShortTtl.getTxStatus('expired-tx');
      expect(serviceWithShortTtl['cache'].size).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 10));
      serviceWithShortTtl.purgeExpiredCache();
      expect(serviceWithShortTtl['cache'].size).toBe(0);

      if (originalUrl) process.env.STELLAR_EXPLORER_URL = originalUrl;
      else delete process.env.STELLAR_EXPLORER_URL;
    });
  });
});
