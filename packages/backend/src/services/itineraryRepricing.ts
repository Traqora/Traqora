/**
 * Provider reprice gate (#917).
 *
 * If the confirmed provider total differs from the traveler-accepted offer,
 * stop before payment capture and require a new explicit acceptance.
 */

export const REPRICE_REASONS = {
  REQUIRES_CONFIRMATION: "provider_reprice_requires_confirmation",
  MATCHES_ACCEPTED: "matches_accepted_offer",
} as const;

export type RepriceDecision =
  | { action: "capture"; reason: typeof REPRICE_REASONS.MATCHES_ACCEPTED }
  | {
      action: "require_traveler_confirmation";
      reason: typeof REPRICE_REASONS.REQUIRES_CONFIRMATION;
      acceptedCents: number;
      confirmedCents: number;
      deltaCents: number;
    };

export function evaluateProviderReprice(
  acceptedCents: number,
  confirmedProviderCents: number,
): RepriceDecision {
  if (acceptedCents === confirmedProviderCents) {
    return { action: "capture", reason: REPRICE_REASONS.MATCHES_ACCEPTED };
  }

  return {
    action: "require_traveler_confirmation",
    reason: REPRICE_REASONS.REQUIRES_CONFIRMATION,
    acceptedCents,
    confirmedCents: confirmedProviderCents,
    deltaCents: confirmedProviderCents - acceptedCents,
  };
}
