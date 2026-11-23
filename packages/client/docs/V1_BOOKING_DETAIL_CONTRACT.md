# V1 Booking Detail Contract

## Purpose

This document defines the v1 booking detail behavior for itinerary and
self-service. It covers two related surfaces: the states shown when a booking
cannot be displayed normally (issue #1146), and the display of supplier
schedule changes next to the itinerary that was originally purchased (issue
#1145). It does not introduce a new page or a new public API. The view issue
#1139 remains the owner of page composition.

## One state at a time

`packages/client/components/booking/booking-detail-state.ts` exposes
`resolveBookingDetailState`. It is the single source of truth for the state a
detail view renders. `BookingDetailStateView` is the presentational component
and never receives raw error text.

| State | Trigger | User-facing meaning | Action |
| --- | --- | --- | --- |
| `missing` | HTTP 404, `NOT_FOUND`, `BOOKING_NOT_FOUND`, or no booking object | No booking matches the reference | Back to bookings |
| `unauthorized` | HTTP 401/403, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_OWNER`, `BOOKING_ACCESS_DENIED` | The booking belongs to another account | Back to bookings |
| `pending` | Booking status `created`, `awaiting_payment`, `payment_processing`, `onchain_pending`, `onchain_submitted` | The booking exists but is not settled yet | None |
| `unavailable` | HTTP 5xx, any other non-2xx status, or any error code not covered above | The lookup failed for a transient or unclassified reason | Try again |
| `ready` | None of the above and a booking object is present | Normal itinerary rendering | Caller renders detail content |

`isLoading` is handled by the view as a skeleton and is deliberately not one of
the five states. This keeps the resolver an O(1) pure function with no hooks.

### Evaluation order

The resolver evaluates the table from top to bottom and returns the first
match. Authorization always wins over missing and transport errors so a caller
cannot probe another account's booking by changing the reference.

### Privacy and accessibility

Copy comes from the fixed `BOOKING_DETAIL_STATE_COPY` table. Provider error
strings, exception text, and passenger data are never appended to it. The view
uses `role="status"` with `aria-live="polite"`, marks the loading skeleton with
`aria-busy="true"`, and hides decorative icons from assistive technology.

## Supplier schedule changes

`packages/client/components/booking/schedule-change.ts` defines the
`ScheduleChange` model and `normalizeScheduleChanges`. The presentational
component `ScheduleChangeList` renders each verified change with the originally
purchased departure beside the revised departure.

### Verification requirement

A change is renderable only when all of the following hold:

- `verifiedBy` is exactly `provider`.
- `id`, `flightNumber`, `originalDeparture`, `revisedDeparture` and `verifiedAt`
  are non-empty strings, and `verifiedAt` parses as a date.
- The original and revised departures differ.

Client supplied text is not accepted as a supplier fact. Callers must source
changes from provider backed data such as flight sync output or the booking's
provider offer. No new endpoint is added; the models and doc rely on data
already available to callers.

Normalization is one linear pass, keeps at most 20 changes, trims whitespace
and control characters, and bounds free-text fields. React escapes all
rendered values.

## Tests

- `packages/client/tests/unit/booking-detail-state.test.ts` covers every state
  rule, the authorization priority, and the fixed copy table.
- `packages/client/tests/unit/schedule-change.test.ts` covers accepted and
  rejected entries, the verification guard, and field bounds.
- Component tests under `packages/client/tests/unit/` cover accessible roles
  and the absence of raw error text when the full client toolchain is present.

## Related documentation

- [Cancellation eligibility](../../backend/docs/CANCELLATION_ELIGIBILITY.md)
- [Booking lifecycle contract](../../backend/docs/booking-lifecycle-contract.md)
- [V1 notification and support](../../backend/docs/NOTIFICATIONS_V1.md)
