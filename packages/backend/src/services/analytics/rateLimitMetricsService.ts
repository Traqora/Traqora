import { getRateLimitMetrics, resetRateLimitMetrics as resetMetrics } from '../../services/metrics';

export interface RateLimitMetricItem {
  endpoint: string;
  tier: string;
  allowed: number;
  blocked: number;
  lastBlockedAt: string | null;
}

export interface RateLimitMetricsSummary {
  totals: {
    allowed: number;
    blocked: number;
  };
  items: RateLimitMetricItem[];
}

export async function getRateLimitAbuseMetrics(): Promise<RateLimitMetricsSummary> {
  const metrics = getRateLimitMetrics();
  let totalAllowed = 0;
  let totalBlocked = 0;

  const items: RateLimitMetricItem[] = (metrics || []).map((entry: any) => {
    const allowed = entry.allowed ?? 0;
    const blocked = entry.blocked ?? 0;
    totalAllowed += allowed;
    totalBlocked += blocked;
    return {
      endpoint: entry.endpoint || '',
      tier: entry.tier || 'public',
      allowed,
      blocked,
      lastBlockedAt: entry.lastBlockedAt || null,
    };
  });

  return {
    totals: {
      allowed: totalAllowed,
      blocked: totalBlocked,
    },
    items,
  };
}

export function resetRateLimitAbuseMetrics(): void {
  if (typeof resetMetrics === 'function') {
    resetMetrics();
  }
}
