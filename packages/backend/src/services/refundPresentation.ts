/**
 * Traveler-facing refund outcomes and projection (issues #1155 and #1156).
 *
 * A refund has a rich internal status machine, but that machine is not a good
 * traveler-facing outcome: `completed` in particular says nothing about
 * whether the whole amount came back. This module derives an explicit outcome
 * that distinguishes full, partial, delayed, rejected, failed and unknown, and
 * projects a refund into a DTO that excludes internal operator notes and
 * signing material.
 */

import type { Refund } from '../db/entities/Refund';

export type RefundOutcome =
  | 'pending'
  | 'partial'
  | 'full'
  | 'delayed'
  | 'rejected'
  | 'failed'
  | 'unknown';

export const REFUND_OUTCOME_LABELS: Readonly<Record<RefundOutcome, string>> = {
  pending: 'Refund in progress',
  partial: 'Partial refund issued',
  full: 'Full refund issued',
  delayed: 'Refund on security hold',
  rejected: 'Refund not approved',
  failed: 'Refund could not be processed',
  unknown: 'Refund status needs review',
};

/** Statuses that never represent a completed money movement. */
const NON_TERMINAL_STATUSES = new Set([
  'pending',
  'eligibility_check',
  'processing',
  'stripe_refunded',
  'onchain_pending',
  'onchain_submitted',
  'manual_review',
]);

/**
 * Derive the traveler-facing outcome from a refund's status and amounts.
 *
 * A `completed` refund only counts as `full` when both the approved amount and
 * the original booking amount agree with the requested amount. Missing or
 * inconsistent amounts produce `unknown`, never a false `full`.
 */
export function deriveRefundOutcome(refund: Pick<
  Refund,
  'status' | 'requestedAmountCents' | 'approvedAmountCents' | 'booking'
>): RefundOutcome {
  switch (refund.status) {
    case 'delayed_pending':
      return 'delayed';
    case 'delayed_cancelled':
    case 'rejected':
      return 'rejected';
    case 'failed':
      return 'failed';
    case 'completed': {
      const approved = refund.approvedAmountCents;
      if (approved === null || approved === undefined || !Number.isSafeInteger(approved)) {
        return 'unknown';
      }
      if (approved <= 0) return 'unknown';
      if (approved >= refund.requestedAmountCents) return 'full';
      return 'partial';
    }
    default:
      return NON_TERMINAL_STATUSES.has(refund.status as string) ? 'pending' : 'unknown';
  }
}

/**
 * True only when the refund is both terminal and for the whole requested
 * amount. Callers must use this instead of `status === 'completed'` before
 * treating a booking as fully refunded.
 */
export function isBookingFullyRefunded(refund: Pick<
  Refund,
  'status' | 'requestedAmountCents' | 'approvedAmountCents' | 'booking'
>): boolean {
  return refund.status === 'completed' && deriveRefundOutcome(refund) === 'full';
}

/** Fields safe to return to a traveler. Operator-only fields are omitted. */
export interface TravelerRefund {
  id: string;
  bookingId: string | null;
  status: Refund['status'];
  outcome: RefundOutcome;
  outcomeLabel: string;
  reason: Refund['reason'];
  reasonDetails: string | null;
  requestedAmountCents: number;
  approvedAmountCents: number | null;
  processingFeeCents: number;
  netRefundCents: number | null;
  isDelayed: boolean;
  delayedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  paymentReference: string | null;
  transactionHash: string | null;
}

/**
 * Project a refund into the traveler-facing shape. Never includes
 * `reviewNotes`, `eligibilityNotes`, `reviewedBy`, `cancellationReason`,
 * `emergencyOverride*`, `lastError`, `sorobanUnsignedXdr`, or the raw booking.
 */
export function toTravelerRefund(refund: Refund): TravelerRefund {
  const outcome = deriveRefundOutcome(refund);
  const approved = refund.approvedAmountCents ?? null;

  return {
    id: refund.id,
    bookingId: refund.booking?.id ?? null,
    status: refund.status,
    outcome,
    outcomeLabel: REFUND_OUTCOME_LABELS[outcome],
    reason: refund.reason,
    reasonDetails: refund.reasonDetails ?? null,
    requestedAmountCents: refund.requestedAmountCents,
    approvedAmountCents: approved,
    processingFeeCents: refund.processingFeeCents ?? 0,
    netRefundCents:
      approved === null ? null : Math.max(0, approved - (refund.processingFeeCents ?? 0)),
    isDelayed: Boolean(refund.isDelayed),
    delayedUntil: refund.delayedUntil ? refund.delayedUntil.toISOString() : null,
    createdAt: refund.createdAt instanceof Date ? refund.createdAt.toISOString() : String(refund.createdAt),
    updatedAt: refund.updatedAt instanceof Date ? refund.updatedAt.toISOString() : String(refund.updatedAt),
    paymentReference: refund.stripeRefundId ?? null,
    transactionHash: refund.sorobanTxHash ?? null,
  };
}
