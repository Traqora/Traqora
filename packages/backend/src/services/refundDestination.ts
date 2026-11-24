/**
 * Original-payment-destination verification (issue #1154).
 *
 * A refund is only "complete" once the payment rail confirms the money is
 * going back to the destination the traveler originally paid from. Stripe
 * refunds can be returned with a `pending`/`failed` status, against a different
 * payment intent, or with an explicit destination override that diverts funds
 * away from the original source. This module keeps that verification in one
 * testable place so processing cannot silently mark an unverified refund as
 * complete.
 */

export interface StripeRefundLike {
  id: string;
  status?: string | null;
  payment_intent?: string | null;
  amount?: number | null;
  currency?: string | null;
  /** Present only when funds are routed somewhere other than the original source. */
  destination?: string | null;
  failure_reason?: string | null;
}

export interface DestinationVerification {
  verified: boolean;
  reason: string;
  status: string;
}

/** Stripe statuses that mean the refund is accepted for return to the source. */
const ACCEPTED_STATUSES = new Set(['succeeded', 'pending']);
/** Stripe statuses that definitively mean the refund will not complete. */
const REJECTED_STATUSES = new Set(['failed', 'canceled', 'requires_action']);

/**
 * Verify that a refund response corresponds to the original payment intent,
 * covers the approved amount, and is heading back to the original source.
 * Deliberately conservative: anything unexpected returns `verified: false`
 * with a reason, never a thrown exception, so callers decide the policy.
 */
export function verifyRefundToOriginalDestination(
  refund: StripeRefundLike,
  expected: {
    paymentIntentId: string;
    amountCents: number;
    currency?: string;
  }
): DestinationVerification {
  const status = refund.status ?? 'unknown';

  if (!refund.id) {
    return { verified: false, reason: 'Refund response has no identifier', status };
  }

  const intent = typeof refund.payment_intent === 'string' ? refund.payment_intent : null;
  if (!intent) {
    return { verified: false, reason: 'Refund response has no payment intent', status };
  }
  if (intent !== expected.paymentIntentId) {
    return {
      verified: false,
      reason: 'Refund payment intent does not match the original payment',
      status,
    };
  }

  if (REJECTED_STATUSES.has(status)) {
    return {
      verified: false,
      reason: refund.failure_reason
        ? `Refund was ${status}: ${refund.failure_reason}`
        : `Refund was ${status}`,
      status,
    };
  }

  if (!ACCEPTED_STATUSES.has(status)) {
    return { verified: false, reason: `Unrecognised refund status: ${status}`, status };
  }

  if (refund.destination) {
    return {
      verified: false,
      reason: 'Refund specifies a destination override away from the original source',
      status,
    };
  }

  if (typeof refund.amount === 'number' && refund.amount !== expected.amountCents) {
    return {
      verified: false,
      reason: `Refund amount ${refund.amount} does not match approved amount ${expected.amountCents}`,
      status,
    };
  }

  if (expected.currency && typeof refund.currency === 'string' && refund.currency.toLowerCase() !== expected.currency.toLowerCase()) {
    return {
      verified: false,
      reason: 'Refund currency does not match the original payment currency',
      status,
    };
  }

  return {
    verified: true,
    reason: status === 'succeeded' ? 'Refund confirmed to original payment source' : 'Refund accepted by rail, awaiting settlement to original source',
    status,
  };
}
