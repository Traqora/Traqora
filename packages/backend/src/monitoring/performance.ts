import os from 'os';

type OperationStatus = 'success' | 'error';
type CacheResult = 'hit' | 'miss' | 'set' | 'fallback' | 'error';
type AlertSeverity = 'info' | 'warning' | 'critical';

interface QuerySample {
  component: string;
  operation: string;
  status: OperationStatus;
  durationMs: number;
  timestamp: string;
}

interface CacheStats {
  cache: string;
  hits: number;
  misses: number;
  sets: number;
  fallbacks: number;
  errors: number;
  totalGets: number;
  hitRate: number;
  averageDurationMs: number;
}

interface PerformanceAlert {
  id: string;
  severity: AlertSeverity;
  metric: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
}

interface SlaTarget {
  queryP95Ms: number;
  cacheHitRate: number;
  errorRate: number;
}

const MAX_QUERY_SAMPLES = 500;
const MAX_ALERTS = 50;
const DEFAULT_SLA_TARGETS: SlaTarget = {
  queryP95Ms: 750,
  cacheHitRate: 0.75,
  errorRate: 0.02,
};

class PerformanceMonitor {
  private readonly querySamples: QuerySample[] = [];
  private readonly cacheStats = new Map<string, CacheStats & { durationTotalMs: number; operations: number }>();
  private readonly alerts: PerformanceAlert[] = [];
  private readonly startedAt = Date.now();

  recordQuery(component: string, operation: string, status: OperationStatus, durationSeconds: number) {
    const sample: QuerySample = {
      component,
      operation,
      status,
      durationMs: Math.round(durationSeconds * 1000),
      timestamp: new Date().toISOString(),
    };

    this.querySamples.push(sample);
    if (this.querySamples.length > MAX_QUERY_SAMPLES) {
      this.querySamples.splice(0, this.querySamples.length - MAX_QUERY_SAMPLES);
    }

    if (sample.durationMs > DEFAULT_SLA_TARGETS.queryP95Ms * 2) {
      this.addAlert('critical', 'query_latency', `${component}.${operation} exceeded latency SLA`, sample.durationMs, DEFAULT_SLA_TARGETS.queryP95Ms);
    } else if (sample.durationMs > DEFAULT_SLA_TARGETS.queryP95Ms) {
      this.addAlert('warning', 'query_latency', `${component}.${operation} is above latency SLA`, sample.durationMs, DEFAULT_SLA_TARGETS.queryP95Ms);
    }
  }

  recordCache(cache: string, result: CacheResult, durationSeconds: number) {
    const current = this.cacheStats.get(cache) ?? {
      cache,
      hits: 0,
      misses: 0,
      sets: 0,
      fallbacks: 0,
      errors: 0,
      totalGets: 0,
      hitRate: 0,
      averageDurationMs: 0,
      durationTotalMs: 0,
      operations: 0,
    };

    if (result === 'hit') current.hits += 1;
    if (result === 'miss') current.misses += 1;
    if (result === 'set') current.sets += 1;
    if (result === 'fallback') current.fallbacks += 1;
    if (result === 'error') current.errors += 1;

    if (result === 'hit' || result === 'miss') {
      current.totalGets += 1;
    }

    current.durationTotalMs += durationSeconds * 1000;
    current.operations += 1;
    current.hitRate = current.totalGets > 0 ? current.hits / current.totalGets : 0;
    current.averageDurationMs = current.operations > 0 ? current.durationTotalMs / current.operations : 0;

    this.cacheStats.set(cache, current);

    if (current.totalGets >= 20 && current.hitRate < DEFAULT_SLA_TARGETS.cacheHitRate) {
      this.addAlert('warning', 'cache_hit_rate', `${cache} cache hit rate is below target`, current.hitRate, DEFAULT_SLA_TARGETS.cacheHitRate);
    }
  }

  getSnapshot() {
    const queryStats = this.buildQueryStats();
    const cacheStats = Array.from(this.cacheStats.values()).map((stats) => ({
      cache: stats.cache,
      hits: stats.hits,
      misses: stats.misses,
      sets: stats.sets,
      fallbacks: stats.fallbacks,
      errors: stats.errors,
      totalGets: stats.totalGets,
      hitRate: round(stats.hitRate),
      averageDurationMs: Math.round(stats.averageDurationMs),
    }));
    const memory = process.memoryUsage();
    const uptimeSeconds = Math.round((Date.now() - this.startedAt) / 1000);
    const errorRate = queryStats.totalQueries > 0 ? queryStats.errorCount / queryStats.totalQueries : 0;
    const overallStatus = this.getOverallStatus(queryStats.p95Ms, cacheStats, errorRate);

    return {
      status: overallStatus,
      generatedAt: new Date().toISOString(),
      queryPerformance: queryStats,
      cache: {
        overallHitRate: round(calculateOverallHitRate(cacheStats)),
        caches: cacheStats,
      },
      systemHealth: {
        uptimeSeconds,
        memoryUsageMb: {
          rss: bytesToMb(memory.rss),
          heapUsed: bytesToMb(memory.heapUsed),
          heapTotal: bytesToMb(memory.heapTotal),
        },
        cpuLoadAverage: os.loadavg(),
        cpuCount: os.cpus().length,
      },
      alerts: this.alerts.slice(-MAX_ALERTS).reverse(),
      capacityPlanning: this.buildCapacityReport(queryStats, cacheStats, memory),
      sla: {
        targets: DEFAULT_SLA_TARGETS,
        queryP95WithinSla: queryStats.p95Ms <= DEFAULT_SLA_TARGETS.queryP95Ms,
        cacheHitRateWithinSla: calculateOverallHitRate(cacheStats) >= DEFAULT_SLA_TARGETS.cacheHitRate || cacheStats.length === 0,
        errorRateWithinSla: errorRate <= DEFAULT_SLA_TARGETS.errorRate,
        errorRate: round(errorRate),
      },
      recentQueries: this.querySamples.slice(-20).reverse(),
    };
  }

  private buildQueryStats() {
    const durations = this.querySamples.map((sample) => sample.durationMs).sort((a, b) => a - b);
    const errorCount = this.querySamples.filter((sample) => sample.status === 'error').length;
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);

    return {
      totalQueries: this.querySamples.length,
      errorCount,
      averageMs: durations.length > 0 ? Math.round(totalDuration / durations.length) : 0,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      slowest: this.querySamples.reduce<QuerySample | null>((slowest, sample) => {
        if (!slowest || sample.durationMs > slowest.durationMs) return sample;
        return slowest;
      }, null),
    };
  }

  private buildCapacityReport(
    queryStats: ReturnType<PerformanceMonitor['buildQueryStats']>,
    cacheStats: CacheStats[],
    memory: NodeJS.MemoryUsage
  ) {
    const heapUsedRatio = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal : 0;
    const cacheHitRate = calculateOverallHitRate(cacheStats);
    const recommendations: string[] = [];

    if (queryStats.p95Ms > DEFAULT_SLA_TARGETS.queryP95Ms) {
      recommendations.push('Review slow analytics queries and add indexes or materialized views for repeated aggregations.');
    }
    if (cacheStats.length > 0 && cacheHitRate < DEFAULT_SLA_TARGETS.cacheHitRate) {
      recommendations.push('Increase cache TTLs or pre-warm high-traffic analytics queries to improve hit rate.');
    }
    if (heapUsedRatio > 0.8) {
      recommendations.push('Increase service memory limits or reduce in-memory analytics result sizes.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Current telemetry is within capacity targets. Continue collecting trend data for forecasting.');
    }

    return {
      heapUsedRatio: round(heapUsedRatio),
      projectedDailyQueries: queryStats.totalQueries * 288,
      cacheEfficiency: round(cacheHitRate),
      recommendations,
    };
  }

  private getOverallStatus(queryP95Ms: number, cacheStats: CacheStats[], errorRate: number) {
    const cacheHitRate = calculateOverallHitRate(cacheStats);
    if (queryP95Ms > DEFAULT_SLA_TARGETS.queryP95Ms * 2 || errorRate > DEFAULT_SLA_TARGETS.errorRate * 2) {
      return 'critical';
    }
    if (
      queryP95Ms > DEFAULT_SLA_TARGETS.queryP95Ms ||
      errorRate > DEFAULT_SLA_TARGETS.errorRate ||
      (cacheStats.length > 0 && cacheHitRate < DEFAULT_SLA_TARGETS.cacheHitRate)
    ) {
      return 'degraded';
    }
    return 'healthy';
  }

  private addAlert(severity: AlertSeverity, metric: string, message: string, value: number, threshold: number) {
    const last = this.alerts[this.alerts.length - 1];
    if (last?.metric === metric && last.message === message && Date.now() - Date.parse(last.timestamp) < 60_000) {
      return;
    }

    this.alerts.push({
      id: `${metric}-${Date.now()}`,
      severity,
      metric,
      message,
      value: round(value),
      threshold: round(threshold),
      timestamp: new Date().toISOString(),
    });

    if (this.alerts.length > MAX_ALERTS) {
      this.alerts.splice(0, this.alerts.length - MAX_ALERTS);
    }
  }
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const index = Math.ceil(values.length * percentileValue) - 1;
  return values[Math.max(0, Math.min(values.length - 1, index))];
}

function calculateOverallHitRate(cacheStats: CacheStats[]) {
  const totals = cacheStats.reduce(
    (acc, stats) => {
      acc.hits += stats.hits;
      acc.gets += stats.totalGets;
      return acc;
    },
    { hits: 0, gets: 0 }
  );

  return totals.gets > 0 ? totals.hits / totals.gets : 0;
}

function bytesToMb(bytes: number) {
  return Math.round(bytes / 1024 / 1024);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

export const performanceMonitor = new PerformanceMonitor();
