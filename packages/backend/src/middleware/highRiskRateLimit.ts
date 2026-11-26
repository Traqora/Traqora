/**
 * Strict, dedicated rate limits for the two highest-risk V1 endpoints
 * (issue #1181). These are independent of the global and tiered limiters so a
 * burst that stays inside the global budget is still blocked here.
 *
 *  - auth: throttles wallet challenge / verify / refresh to stop brute force.
 *  - checkout: throttles booking creation to stop resource exhaustion.
 */
import { createIpRateLimiter, IpRateLimitOptions } from '../utils/rateLimiter';

export const AUTH_RATE_LIMIT: IpRateLimitOptions = {
  points: 10,
  durationSeconds: 15 * 60,
  keyPrefix: 'traqora-auth-rate-limit',
};

export const CHECKOUT_RATE_LIMIT: IpRateLimitOptions = {
  points: 8,
  durationSeconds: 60,
  keyPrefix: 'traqora-checkout-rate-limit',
};

export type RateLimitMiddleware = ReturnType<typeof createIpRateLimiter>;

export const createHighRiskRateLimiter = (options: IpRateLimitOptions) =>
  createIpRateLimiter(options);

export const authRateLimiter = createHighRiskRateLimiter(AUTH_RATE_LIMIT);
export const checkoutRateLimiter = createHighRiskRateLimiter(CHECKOUT_RATE_LIMIT);
