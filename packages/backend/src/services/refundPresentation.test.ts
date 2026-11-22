import type { Refund } from '../db/entities/Refund';
import {
  deriveRefundOutcome,
  isBookingFullyRefunded,
  REFUND_OUTCOME_LABELS,
  toTravelerRefund,
  TravelerRefund,
} from './refundPresentation';

function makeRefund(overrides: Partial<Refund> = {}): Refund {
  const now = new Date('2026-11-19T10:00:00.000Z');
  return {
    id: 'refund-1',
    booking: { id: 'booking-1' } as Refund['booking'],
    status: 'completed',
    reason: 'flight_cancelled',
    reasonDetails: 'Carrier cancelled the flight',
    requestedAmountCents: 10_000,
    approvedAmountCents: 10_000,
    processingFeeCents: 0,
    isDelayed: false,
    delayedUntil: null,
    stripeRefundId: 're_mock123',
    sorobanTxHash: null,
    reviewNotes: 'INTERNAL: operator called the traveler',
    eligibilityNotes: 'INTERNAL: manual policy override approved',
    reviewedBy: 'ops-user',
    lastError: 'INTERNAL: first attempt failed',
    sorobanUnsignedXdr: 'INTERNAL:secret-xdr',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Refund;
}

describe('deriveRefundOutcome (issue #1155)', () => {
  it.each([
    ['pending', 'pending'],
    ['eligibility_check', 'pending'],
    ['processing', 'pending'],
    ['stripe_refunded', 'pending'],
    ['onchain_pending', 'pending'],
    ['onchain_submitted', 'pending'],
    ['manual_review', 'pending'],
    ['delayed_pending', 'delayed'],
    ['delayed_cancelled', 'rejected'],
    ['rejected', 'rejected'],
    ['failed', 'failed'],
    ['completed', 'full'],
  ] as const)('maps status %s to outcome %s', (status, outcome) => {
    expect(deriveRefundOutcome(makeRefund({ status }))).toBe(outcome);
  });

  it('distinguishes a partial completed refund from a full one', () => {
    const partial = makeRefund({ approvedAmountCents: 6_000 });
    expect(deriveRefundOutcome(partial)).toBe('partial');
    expect(isBookingFullyRefunded(partial)).toBe(false);

    const full = makeRefund({ approvedAmountCents: 10_000 });
    expect(deriveRefundOutcome(full)).toBe('full');
    expect(isBookingFullyRefunded(full)).toBe(true);
  });

  it.each([
    [undefined],
    [null],
    [0],
    [-1],
    [Number.NaN],
  ])('returns unknown for a suspicious completed amount %s', (approved) => {
    const refund = makeRefund({ approvedAmountCents: approved as number | null | undefined });
    expect(deriveRefundOutcome(refund)).toBe('unknown');
    expect(isBookingFullyRefunded(refund)).toBe(false);
  });

  it('treats a completed refund that exceeds the requested amount as full', () => {
    expect(deriveRefundOutcome(makeRefund({ approvedAmountCents: 10_001 }))).toBe('full');
  });

  it('returns unknown for an unrecognised status rather than claiming success', () => {
    expect(deriveRefundOutcome(makeRefund({ status: 'some_new_status' as Refund['status'] }))).toBe(
      'unknown'
    );
  });

  it('never marks a non-completed booking as fully refunded', () => {
    expect(isBookingFullyRefunded(makeRefund({ status: 'stripe_refunded' }))).toBe(false);
    expect(isBookingFullyRefunded(makeRefund({ status: 'failed', approvedAmountCents: 10_000 }))).toBe(
      false
    );
  });

  it('has a human label for every outcome', () => {
    for (const outcome of ['pending', 'partial', 'full', 'delayed', 'rejected', 'failed', 'unknown'] as const) {
      expect(REFUND_OUTCOME_LABELS[outcome]).toBeTruthy();
    }
  });
});

describe('toTravelerRefund (issue #1156)', () => {
  it('exposes policy, amounts, timestamps and deduplicated outcome without internal notes', () => {
    const result = toTravelerRefund(makeRefund());

    expect(result.id).toBe('refund-1');
    expect(result.bookingId).toBe('booking-1');
    expect(result.reason).toBe('flight_cancelled');
    expect(result.requestedAmountCents).toBe(10_000);
    expect(result.approvedAmountCents).toBe(10_000);
    expect(result.outcome).toBe('full');
    expect(result.outcomeLabel).toBe(REFUND_OUTCOME_LABELS.full);
    expect(result.createdAt).toBe('2026-11-19T10:00:00.000Z');
    expect(result.updatedAt).toBe('2026-11-19T10:00:00.000Z');
    expect(result.paymentReference).toBe('re_mock123');
  });

  it('omits every internal-only field', () => {
    const result: Record<string, unknown> = toTravelerRefund(makeRefund()) as unknown as Record<string, unknown>;
    const leaked = [
      'reviewNotes',
      'eligibilityNotes',
      'reviewedBy',
      'cancellationReason',
      'emergencyOverride',
      'emergencyOverrideBy',
      'emergencyOverrideReason',
      'lastError',
      'sorobanUnsignedXdr',
      'contractSubmitAttempts',
      'requestedBy',
      'booking',
    ].filter((key) => key in result);

    expect(leaked).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('INTERNAL');
    expect(JSON.stringify(result)).not.toContain('secret-xdr');
  });

  it('surfaces delayed, partial and rejected outcomes to the traveler', () => {
    expect(toTravelerRefund(makeRefund({ status: 'delayed_pending', isDelayed: true }))).toMatchObject({
      outcome: 'delayed',
      isDelayed: true,
    });
    expect(toTravelerRefund(makeRefund({ approvedAmountCents: 4_000 }))).toMatchObject({
      outcome: 'partial',
      netRefundCents: 4_000,
    });
    expect(toTravelerRefund(makeRefund({ status: 'rejected' })).outcome).toBe('rejected');
  });

  it('computes net refund after processing fee, never negative', () => {
    const result = toTravelerRefund(
      makeRefund({ approvedAmountCents: 5_000, processingFeeCents: 500 })
    );
    expect(result.netRefundCents).toBe(4_500);

    const feeExceeds = toTravelerRefund(
      makeRefund({ approvedAmountCents: 100, processingFeeCents: 500 })
    );
    expect(feeExceeds.netRefundCents).toBe(0);
  });

  it('handles a missing approved amount and delayed timestamp safely', () => {
    const result = toTravelerRefund(
      makeRefund({
        approvedAmountCents: undefined,
        delayedUntil: new Date('2026-11-25T10:00:00.000Z'),
        booking: undefined as unknown as Refund['booking'],
      })
    );
    expect(result.approvedAmountCents).toBeNull();
    expect(result.netRefundCents).toBeNull();
    expect(result.bookingId).toBeNull();
    expect(result.delayedUntil).toBe('2026-11-25T10:00:00.000Z');
    expect(result.outcome).toBe('unknown');
  });

  it('never returns a raw Date object in traveler-facing fields', () => {
    const result: TravelerRefund = toTravelerRefund(makeRefund());
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });
});
