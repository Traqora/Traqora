/**
 * Tier definitions for analytics API rate limiting — issue #251.
 *
 * Limits:
 *  - Free:       100 req/min,  1 000 req/hr
 *  - Pro:        500 req/min,  5 000 req/hr
 *  - Enterprise: 2 000 req/min, 20 000 req/hr
 *
 * Values are read from environment variables so they can be overridden per
 * deployment without a code change.
 */

export type TierName = 'free' | 'pro' | 'enterprise';

export interface TierQuota {
  perMinute: number;
  perHour: number;
  burstAllowance: number;
}

const env = (key: string, fallback: number): number => {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const TIER_QUOTAS: Record<TierName, TierQuota> = {
  free: {
    perMinute: env('RATE_LIMIT_FREE_PER_MIN', 100),
    perHour: env('RATE_LIMIT_FREE_PER_HR', 1_000),
    burstAllowance: env('RATE_LIMIT_FREE_BURST', 20),
  },
  pro: {
    perMinute: env('RATE_LIMIT_PRO_PER_MIN', 500),
    perHour: env('RATE_LIMIT_PRO_PER_HR', 5_000),
    burstAllowance: env('RATE_LIMIT_PRO_BURST', 100),
  },
  enterprise: {
    perMinute: env('RATE_LIMIT_ENT_PER_MIN', 2_000),
    perHour: env('RATE_LIMIT_ENT_PER_HR', 20_000),
    burstAllowance: env('RATE_LIMIT_ENT_BURST', 400),
  },
};

export const DEFAULT_TIER: TierName = 'free';

/** Map a request's x-user-tier header value to a canonical TierName. */
export function resolveTierName(raw: string | undefined): TierName {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'pro') return 'pro';
  if (lower === 'enterprise') return 'enterprise';
  return DEFAULT_TIER;
}
