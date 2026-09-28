import { getRateLimitSnapshot, __resetRateLimitSnapshot } from '../metrics';

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
  const snapshot = getRateLimitSnapshot();
  let totalAllowed = 0;
  let totalBlocked = 0;

  const items: RateLimitMetricItem[] = snapshot.map((entry) => {
    totalAllowed += entry.allowed;
    totalBlocked += entry.blocked;
    return {
      endpoint: entry.endpoint,
      tier: entry.tier,
      allowed: entry.allowed,
      blocked: entry.blocked,
      lastBlockedAt: entry.lastBlockedAt,
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
  __resetRateLimitSnapshot();
}
