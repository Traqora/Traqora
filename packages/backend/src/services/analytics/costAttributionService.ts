/**
 * Cost attribution service — issue #258.
 *
 * Tracks per-tenant storage usage and per-query compute time to calculate
 * operational costs. Provides cost summaries and threshold-based alerts.
 */

export interface StorageRecord {
  tenantId: string;
  bytes: number;
  recordedAt: Date;
}

export interface QueryRecord {
  tenantId: string;
  queryId: string;
  durationMs: number;
  recordedAt: Date;
}

export interface CostSummary {
  tenantId: string;
  storageCostCents: number;
  computeCostCents: number;
  totalCostCents: number;
  storageMb: number;
  totalQueryMs: number;
  optimizationTips: string[];
}

export interface CostAlert {
  tenantId: string;
  field: 'storage' | 'compute' | 'total';
  currentCents: number;
  thresholdCents: number;
  triggeredAt: Date;
}

// Pricing constants (configurable in production)
const STORAGE_CENTS_PER_MB = 0.023; // ~$0.023/MB/month (S3-class pricing)
const COMPUTE_CENTS_PER_MS = 0.000002; // ~$0.002/s of query time

export class CostAttributionService {
  private storageRecords: StorageRecord[] = [];
  private queryRecords: QueryRecord[] = [];
  private alerts: CostAlert[] = [];

  recordStorage(tenantId: string, bytes: number): void {
    this.storageRecords.push({ tenantId, bytes, recordedAt: new Date() });
  }

  recordQuery(tenantId: string, queryId: string, durationMs: number): void {
    this.queryRecords.push({ tenantId, queryId, durationMs, recordedAt: new Date() });
  }

  getSummary(tenantId: string): CostSummary {
    const storageMb =
      this.storageRecords
        .filter((r) => r.tenantId === tenantId)
        .reduce((acc, r) => acc + r.bytes, 0) / (1024 * 1024);

    const totalQueryMs = this.queryRecords
      .filter((r) => r.tenantId === tenantId)
      .reduce((acc, r) => acc + r.durationMs, 0);

    const storageCostCents = storageMb * STORAGE_CENTS_PER_MB;
    const computeCostCents = totalQueryMs * COMPUTE_CENTS_PER_MS;
    const totalCostCents = storageCostCents + computeCostCents;

    const tips: string[] = [];
    if (storageMb > 1000) tips.push('Consider archiving data older than 90 days to reduce storage.');
    if (totalQueryMs > 60_000) tips.push('Long-running queries detected — add indexes or paginate results.');
    if (totalCostCents > 500) tips.push('High total cost — review data retention policies.');

    return {
      tenantId,
      storageCostCents: parseFloat(storageCostCents.toFixed(4)),
      computeCostCents: parseFloat(computeCostCents.toFixed(4)),
      totalCostCents: parseFloat(totalCostCents.toFixed(4)),
      storageMb: parseFloat(storageMb.toFixed(4)),
      totalQueryMs,
      optimizationTips: tips,
    };
  }

  checkThreshold(tenantId: string, thresholdCents: number): CostAlert | null {
    const summary = this.getSummary(tenantId);
    if (summary.totalCostCents > thresholdCents) {
      const alert: CostAlert = {
        tenantId,
        field: 'total',
        currentCents: summary.totalCostCents,
        thresholdCents,
        triggeredAt: new Date(),
      };
      this.alerts.push(alert);
      return alert;
    }
    return null;
  }

  getAlerts(tenantId?: string): CostAlert[] {
    return tenantId ? this.alerts.filter((a) => a.tenantId === tenantId) : this.alerts;
  }

  /** Reset state — useful for tests. */
  reset(): void {
    this.storageRecords = [];
    this.queryRecords = [];
    this.alerts = [];
  }
}
