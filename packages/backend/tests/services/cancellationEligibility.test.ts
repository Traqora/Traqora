/**
 * V1 cancellation eligibility decision table (issue #1148).
 * Table-driven coverage of every rule, precedence, boundary and stable code.
 */

import fs from 'fs';
import path from 'path';

import {
  CANCELLATION_ELIGIBILITY_RULES,
  CANCELLATION_REASON_CODES,
  CancellationEligibilityDecision,
  CancellationEligibilityInput,
  evaluateCancellationEligibility,
} from '../../src/services/cancellationEligibility';

const baseInput: CancellationEligibilityInput = {
  status: 'confirmed',
  fareEligible: true,
  fareReason: null,
  netRefundCents: 12500,
  daysToDeparture: 14,
};

type Case = [
  description: string,
  overrides: Partial<CancellationEligibilityInput>,
  expected: CancellationEligibilityDecision,
];

const cases: Case[] = [
  [
    'idempotent replay of a completed cancellation',
    { status: 'refunded', fareEligible: false, daysToDeparture: -1 },
    {
      action: 'already_refund_cancelled',
      reason: CANCELLATION_REASON_CODES.ALREADY_CANCELLED,
      httpStatus: 200,
      eligible: true,
    },
  ],
  [
    'failed booking is rejected even before fare rules',
    { status: 'failed', fareEligible: false, netRefundCents: 0 },
    {
      action: 'reject',
      reason: CANCELLATION_REASON_CODES.BOOKING_FAILED,
      httpStatus: 409,
      eligible: false,
    },
  ],
  [
    'refund rejected booking is rejected',
    { status: 'refund_rejected' },
    {
      action: 'reject',
      reason: CANCELLATION_REASON_CODES.REFUND_REJECTED,
      httpStatus: 409,
      eligible: false,
    },
  ],
  [
    'non finite departure day count is ineligible',
    { daysToDeparture: Number.NaN },
    {
      action: 'no_refund',
      reason: CANCELLATION_REASON_CODES.INVALID_DEPARTURE_WINDOW,
      httpStatus: 200,
      eligible: false,
    },
  ],
  [
    'negative departure day count is ineligible',
    { daysToDeparture: -1 },
    {
      action: 'no_refund',
      reason: CANCELLATION_REASON_CODES.INVALID_DEPARTURE_WINDOW,
      httpStatus: 200,
      eligible: false,
    },
  ],
  [
    'zero departure day count is a valid same-day cancellation',
    { daysToDeparture: 0 },
    {
      action: 'refund',
      reason: CANCELLATION_REASON_CODES.CANCELLABLE,
      httpStatus: 200,
      eligible: true,
    },
  ],
  [
    'supplier fare ineligibility uses the supplied reason',
    { fareEligible: false, fareReason: 'non-refundable fare class X' },
    {
      action: 'no_refund',
      reason: 'non-refundable fare class X',
      httpStatus: 200,
      eligible: false,
    },
  ],
  [
    'supplier fare ineligibility has a stable fallback reason',
    { fareEligible: false, fareReason: '   ' },
    {
      action: 'no_refund',
      reason: CANCELLATION_REASON_CODES.NON_REFUNDABLE_FARE,
      httpStatus: 200,
      eligible: false,
    },
  ],
  [
    'zero refund is ineligible',
    { netRefundCents: 0 },
    {
      action: 'no_refund',
      reason: CANCELLATION_REASON_CODES.ZERO_REFUND,
      httpStatus: 200,
      eligible: false,
    },
  ],
  [
    'negative refund is ineligible',
    { netRefundCents: -25 },
    {
      action: 'no_refund',
      reason: CANCELLATION_REASON_CODES.ZERO_REFUND,
      httpStatus: 200,
      eligible: false,
    },
  ],
  [
    'non finite refund is ineligible',
    { netRefundCents: Number.POSITIVE_INFINITY },
    {
      action: 'no_refund',
      reason: CANCELLATION_REASON_CODES.ZERO_REFUND,
      httpStatus: 200,
      eligible: false,
    },
  ],
  [
    'an eligible fare with a positive refund is refundable',
    {},
    {
      action: 'refund',
      reason: CANCELLATION_REASON_CODES.CANCELLABLE,
      httpStatus: 200,
      eligible: true,
    },
  ],
  [
    'status comparison is case insensitive',
    { status: 'FAILED' },
    {
      action: 'reject',
      reason: CANCELLATION_REASON_CODES.BOOKING_FAILED,
      httpStatus: 409,
      eligible: false,
    },
  ],
  [
    'an empty status falls through to the fare rules',
    { status: '' },
    {
      action: 'refund',
      reason: CANCELLATION_REASON_CODES.CANCELLABLE,
      httpStatus: 200,
      eligible: true,
    },
  ],
];

describe('evaluateCancellationEligibility (issue #1148)', () => {
  it.each(cases)('%s', (_description, overrides, expected) => {
    expect(evaluateCancellationEligibility({ ...baseInput, ...overrides })).toEqual(expected);
  });

  it('documents exactly seven ordered rules', () => {
    expect(CANCELLATION_ELIGIBILITY_RULES.map((rule) => rule.id)).toEqual([
      'idempotent_replay',
      'failed_booking',
      'refund_rejected_booking',
      'invalid_departure_window',
      'supplier_fare_ineligible',
      'zero_refund',
      'refundable',
    ]);
  });

  it('does not mutate its input', () => {
    const input = { ...baseInput, status: 'REFUNDED', fareReason: 'keep me' };
    const snapshot = { ...input };
    evaluateCancellationEligibility(input);
    expect(input).toEqual(snapshot);
  });
});

describe('reason code parity with the cancellation service', () => {
  const serviceSource = fs.readFileSync(
    path.join(__dirname, '../../src/services/bookingOrchestrationService.ts'),
    'utf8',
  );

  it.each([
    ['ALREADY_CANCELLED', CANCELLATION_REASON_CODES.ALREADY_CANCELLED],
    ['BOOKING_FAILED', CANCELLATION_REASON_CODES.BOOKING_FAILED],
    ['REFUND_REJECTED', CANCELLATION_REASON_CODES.REFUND_REJECTED],
  ])('keeps %s identical to CANCEL_REJECTION_REASONS', (key, value) => {
    const quote = "['\"`]";
    expect(serviceSource).toMatch(new RegExp(`${key}:\\s*${quote}${value}${quote}`));
  });
});
