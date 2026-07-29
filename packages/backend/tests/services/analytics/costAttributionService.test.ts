import { CostAttributionService } from '../../../src/services/analytics/costAttributionService';

describe('CostAttributionService', () => {
  let svc: CostAttributionService;

  beforeEach(() => {
    svc = new CostAttributionService();
  });

  describe('getSummary()', () => {
    it('returns zero cost for unknown tenant', () => {
      const summary = svc.getSummary('unknown-tenant');
      expect(summary.totalCostCents).toBe(0);
      expect(summary.storageMb).toBe(0);
      expect(summary.totalQueryMs).toBe(0);
    });

    it('tracks storage cost per tenant', () => {
      svc.recordStorage('tenant-a', 1024 * 1024); // 1 MB
      const summary = svc.getSummary('tenant-a');
      expect(summary.storageMb).toBeCloseTo(1, 2);
      expect(summary.storageCostCents).toBeGreaterThan(0);
    });

    it('tracks compute cost per query', () => {
      svc.recordQuery('tenant-a', 'q1', 5000); // 5 seconds
      const summary = svc.getSummary('tenant-a');
      expect(summary.totalQueryMs).toBe(5000);
      expect(summary.computeCostCents).toBeGreaterThan(0);
    });

    it('accumulates multiple storage records', () => {
      svc.recordStorage('tenant-b', 512 * 1024); // 0.5 MB
      svc.recordStorage('tenant-b', 512 * 1024); // 0.5 MB
      const summary = svc.getSummary('tenant-b');
      expect(summary.storageMb).toBeCloseTo(1, 2);
    });

    it('isolates tenants from each other', () => {
      svc.recordStorage('tenant-a', 10 * 1024 * 1024);
      const summaryB = svc.getSummary('tenant-b');
      expect(summaryB.storageMb).toBe(0);
    });

    it('provides optimization tips for high storage', () => {
      svc.recordStorage('tenant-a', 1100 * 1024 * 1024); // 1100 MB
      const summary = svc.getSummary('tenant-a');
      expect(summary.optimizationTips.some((t) => t.includes('archiving'))).toBe(true);
    });

    it('provides optimization tips for long-running queries', () => {
      svc.recordQuery('tenant-a', 'slow-q', 70_000);
      const summary = svc.getSummary('tenant-a');
      expect(summary.optimizationTips.some((t) => t.includes('queries'))).toBe(true);
    });
  });

  describe('checkThreshold()', () => {
    it('returns null when under threshold', () => {
      svc.recordStorage('tenant-a', 1024); // negligible cost
      const alert = svc.checkThreshold('tenant-a', 10000);
      expect(alert).toBeNull();
    });

    it('returns alert when over threshold', () => {
      svc.recordStorage('tenant-a', 100_000 * 1024 * 1024); // very large → high cost
      const alert = svc.checkThreshold('tenant-a', 1);
      expect(alert).not.toBeNull();
      expect(alert!.tenantId).toBe('tenant-a');
      expect(alert!.currentCents).toBeGreaterThan(1);
    });

    it('records alerts for retrieval', () => {
      svc.recordStorage('tenant-a', 100_000 * 1024 * 1024);
      svc.checkThreshold('tenant-a', 1);
      expect(svc.getAlerts('tenant-a').length).toBeGreaterThan(0);
    });
  });

  describe('reset()', () => {
    it('clears all records and alerts', () => {
      svc.recordStorage('tenant-a', 1024 * 1024);
      svc.recordQuery('tenant-a', 'q1', 1000);
      svc.reset();
      const summary = svc.getSummary('tenant-a');
      expect(summary.storageMb).toBe(0);
      expect(summary.totalQueryMs).toBe(0);
    });
  });
});
