# V1 Cancellation Eligibility Rules

## Purpose

This document is the machine and operator readable decision matrix for v1
cancellation eligibility (issue #1148). It translates platform policy and
supplier fare rules into one explicit decision per booking. The implementation
is `src/services/cancellationEligibility.ts`; the existing cancellation route
and its behavior are unchanged.

## Inputs

`evaluateCancellationEligibility` accepts:

| Field | Source | Meaning |
| --- | --- | --- |
| `status` | `Booking.status` | Platform state of the booking |
| `fareEligible` | `FareRulesService.calculateCancellationRefund` | Whether the supplier fare rules allow a refund |
| `fareReason` | Same fare result | Explanation used when the fare is ineligible |
| `netRefundCents` | Same fare result | Refund amount in cents |
| `daysToDeparture` | Same fare result | Precomputed day count, so no date math is repeated |

The decision returns `action`, `reason`, `httpStatus` and `eligible`.

## Decision matrix

Rules are evaluated in order and the first match wins.

| Order | Rule id | Condition | Action | Reason | HTTP | Eligible |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `idempotent_replay` | status `refunded` | `already_refund_cancelled` | `already_cancelled` | 200 | yes |
| 2 | `failed_booking` | status `failed` | `reject` | `booking_failed` | 409 | no |
| 3 | `refund_rejected_booking` | status `refund_rejected` | `reject` | `refund_rejected` | 409 | no |
| 4 | `invalid_departure_window` | day count missing or negative | `no_refund` | `invalid_departure_window` | 200 | no |
| 5 | `supplier_fare_ineligible` | fare result is not eligible | `no_refund` | fare reason or `non_refundable_fare` | 200 | no |
| 6 | `zero_refund` | net refund is not positive | `no_refund` | `zero_refund` | 200 | no |
| 7 | `refundable` | any remaining case | `refund` | `cancellable` | 200 | yes |

Status comparisons are case insensitive. An empty or non-string status falls
through to the fare rules rather than being treated as an authorization
failure.

## Stable reason codes

| Code | Operator meaning |
| --- | --- |
| `already_cancelled` | A completed cancellation was replayed; no state change |
| `booking_failed` | A failed booking never captured funds, so cancellation is refused |
| `refund_rejected` | A denied refund must go through the refund dispute flow |
| `invalid_departure_window` | Provider date data was missing or in the past |
| `non_refundable_fare` | Supplier fare rules returned no eligible refund |
| `zero_refund` | Eligible fare still produced a non-positive refund amount |
| `cancellable` | The booking may be cancelled and refunded |

The first three codes are shared with `CANCEL_REJECTION_REASONS` in
`src/services/bookingOrchestrationService.ts`. A test asserts that those
values remain identical so the two modules cannot drift.

## Relationship to existing code

`resolveCancelPolicyDecision` still owns the platform status gate and
`processCancellation` still owns the state transition. This module is a pure
composition layer that makes the combined decision explicit and testable. A
future route change may adopt it, but doing so is outside this issue and would
require its own regression comparison.

HTTP semantics match the current route: state based rejections are 409, while
supplier fare ineligibility returns 200 with `success: false` and a refund
breakdown so clients can explain the outcome without a state mutation.

## Scope boundaries

- No new endpoint, request field, or public API contract.
- No database, network, or cache access. The module is pure.
- No change to refund amounts, fare tiers, or cancellation fees.
- No new external dependency.

## Tests

- `tests/services/cancellationEligibility.test.ts` is table driven and covers
  every rule, precedence, case insensitive status, invalid numbers and the
  stable reason code tie to the service constants.
- `tests/docs/v1BookingSurfaceDocs.test.ts` asserts that this matrix documents
  every exported reason code and rule id and that the related docs are linked.

## Related documentation

- [Booking lifecycle contract](booking-lifecycle-contract.md)
- [V1 booking detail contract](../../client/docs/V1_BOOKING_DETAIL_CONTRACT.md)
- [Project README](../../../README.md)
