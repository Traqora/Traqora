/**
 * V1 cancellation eligibility decision table (issue #1148).
 *
 * This module is intentionally dependency free. It composes the platform
 * status gate (already owned by resolveCancelPolicyDecision) with the supplier
 * fare-rule result into one explicit, documented decision. It does not replace
 * or alter the existing cancellation route.
 */

export type CancellationEligibilityAction =
  | "refund"
  | "no_refund"
  | "already_refund_cancelled"
  | "reject";

export interface CancellationEligibilityInput {
  /** Current booking status. */
  status: string;
  /** Result of the supplier fare-rule refund calculation. */
  fareEligible: boolean;
  /** Stable or human reason from the fare layer, used only when ineligible. */
  fareReason?: string | null;
  /** Net refund from the fare layer, in cents. */
  netRefundCents: number;
  /** Precomputed by FareRulesService. No date math is repeated here. */
  daysToDeparture: number;
}

export interface CancellationEligibilityDecision {
  action: CancellationEligibilityAction;
  reason: string;
  httpStatus: number;
  eligible: boolean;
}

/** Stable codes shared with the documented v1 decision matrix. */
export const CANCELLATION_REASON_CODES = {
  ALREADY_CANCELLED: "already_cancelled",
  BOOKING_FAILED: "booking_failed",
  REFUND_REJECTED: "refund_rejected",
  CANCELLABLE: "cancellable",
  NON_REFUNDABLE_FARE: "non_refundable_fare",
  ZERO_REFUND: "zero_refund",
  INVALID_DEPARTURE_WINDOW: "invalid_departure_window",
} as const;

interface EligibilityRule {
  id: string;
  matches: (input: CancellationEligibilityInput, status: string) => boolean;
  decision: (input: CancellationEligibilityInput) => CancellationEligibilityDecision;
}

function decide(
  action: CancellationEligibilityAction,
  reason: string,
  httpStatus: number,
  eligible: boolean,
): CancellationEligibilityDecision {
  return { action, reason, httpStatus, eligible };
}

/**
 * Ordered rules. Evaluation stops at the first match, so the order is part of
 * the contract and is asserted by the documentation test.
 */
export const CANCELLATION_ELIGIBILITY_RULES: readonly EligibilityRule[] = [
  {
    id: "idempotent_replay",
    matches: (_input, status) => status === "refunded",
    decision: () =>
      decide(
        "already_refund_cancelled",
        CANCELLATION_REASON_CODES.ALREADY_CANCELLED,
        200,
        true,
      ),
  },
  {
    id: "failed_booking",
    matches: (_input, status) => status === "failed",
    decision: () =>
      decide("reject", CANCELLATION_REASON_CODES.BOOKING_FAILED, 409, false),
  },
  {
    id: "refund_rejected_booking",
    matches: (_input, status) => status === "refund_rejected",
    decision: () =>
      decide("reject", CANCELLATION_REASON_CODES.REFUND_REJECTED, 409, false),
  },
  {
    id: "invalid_departure_window",
    matches: (input) =>
      !Number.isFinite(input.daysToDeparture) || input.daysToDeparture < 0,
    decision: () =>
      decide("no_refund", CANCELLATION_REASON_CODES.INVALID_DEPARTURE_WINDOW, 200, false),
  },
  {
    id: "supplier_fare_ineligible",
    matches: (input) => !input.fareEligible,
    decision: (input) => {
      const supplied = typeof input.fareReason === "string" ? input.fareReason.trim() : "";
      return decide(
        "no_refund",
        supplied || CANCELLATION_REASON_CODES.NON_REFUNDABLE_FARE,
        200,
        false,
      );
    },
  },
  {
    id: "zero_refund",
    matches: (input) => !Number.isFinite(input.netRefundCents) || input.netRefundCents <= 0,
    decision: () => decide("no_refund", CANCELLATION_REASON_CODES.ZERO_REFUND, 200, false),
  },
  {
    id: "refundable",
    matches: () => true,
    decision: () => decide("refund", CANCELLATION_REASON_CODES.CANCELLABLE, 200, true),
  },
];

/**
 * Return the single cancellation decision for a booking.
 *
 * Error paths preserve the existing route semantics: state-based rejections
 * use 409, while supplier fare ineligibility is a 200 with a no_refund action
 * so the caller can still return the refund breakdown without mutating state.
 */
export function evaluateCancellationEligibility(
  input: CancellationEligibilityInput,
): CancellationEligibilityDecision {
  const status = typeof input.status === "string" ? input.status.toLowerCase() : "";

  for (const rule of CANCELLATION_ELIGIBILITY_RULES) {
    if (rule.matches(input, status)) {
      return rule.decision(input);
    }
  }

  // The final rule always matches; this is a defensive fallback only.
  return decide("no_refund", CANCELLATION_REASON_CODES.NON_REFUNDABLE_FARE, 200, false);
}
