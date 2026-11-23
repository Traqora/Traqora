/**
 * Tier definitions for analytics API rate limiting — issue #251.
 *
 * Limits:
 *  - Free:       100 req/min,  1 000 req/hr
 *  - Pro:        500 req/min,  5 000 req/hr
 *  - Enterprise: 2 000 req/min, 20 000 req/hr
 *
 * Values are loaded from the validated configuration object.
 */

import { config } from '../config';

export type TierName = 'free' | 'pro' | 'enterprise';

export interface TierQuota {
  perMinute: number;
  perHour: number;
  burstAllowance: number;
}

export const buildTierQuotas = (): Record<TierName, TierQuota> => ({
  free: {
    perMinute: config.rateLimitFreePerMin,
    perHour: config.rateLimitFreePerHr,
    burstAllowance: config.rateLimitFreeBurst,
  },
  pro: {
    perMinute: config.rateLimitProPerMin,
    perHour: config.rateLimitProPerHr,
    burstAllowance: config.rateLimitProBurst,
  },
  enterprise: {
    perMinute: config.rateLimitEntPerMin,
    perHour: config.rateLimitEntPerHr,
    burstAllowance: config.rateLimitEntBurst,
  },
});

export const DEFAULT_TIER: TierName = 'free';

export function resolveTierName(raw: string | undefined): TierName {
  const lower = (raw ?? '').toLowerCase();
  if (lower === 'pro') return 'pro';
  if (lower === 'enterprise') return 'enterprise';
  return DEFAULT_TIER;
}
