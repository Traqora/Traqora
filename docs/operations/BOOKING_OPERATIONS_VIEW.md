# Booking Operations View

## Purpose

The booking operations view gives authorized operators one read-only table of the state needed to answer traveler questions and to triage incidents. It does not add new state or new management actions.

## Access

- Endpoint: `GET /api/v1/admin/operations/bookings`
- Client page: `/admin/operations` in the admin console
- Authentication: admin API key or admin bearer token, same as other admin routes
- Optional filter: `status` matches an exact booking status
- Pagination: `page` and `limit`, with `limit` capped at 100

## Fields

| Field | Meaning | When there is no recorded value |
| --- | --- | --- |
| `bookingId` | Internal booking identifier | Always present |
| `bookingReference` | Traveler facing booking reference | `null` |
| `bookingState` | Authoritative application booking state | Always present |
| `supplierState` | Last known airline or provider state | `unavailable` |
| `paymentReference` | Payment intent or on-chain transaction reference | `null` |
| `contractState` | Backend status implied by the latest indexed contract event | `unavailable` |
| `reconciliationStatus` | `not_attempted`, `detected`, `repaired` or `needs_review` | `not_attempted` when no attempt exists |
| `reconciliationDetail` | Last reconciliation error | `null` |
| `mismatches` | Detected contradictions between sources; each has `type`, `severity` and `detail` | `[]` |
| `flightNumber` | Flight number from the loaded flight relation | `unavailable` |
| `departureTime` | Departure time from the loaded flight relation | `unavailable` |
| `amountCents` | Booking amount in cents | Always present |
| `updatedAt` | Last update timestamp of the booking | Always present |

`unavailable` and `null` are explicit states. The view never displays an invented supplier state, payment reference or reconciliation result.

## Reconciliation mapping

- `repaired` and `detected` map directly from the latest reconciliation attempt.
- `failed` and any unrecognised outcome map to `needs_review`, with the recorded error shown as detail.
- A booking with no reconciliation attempt shows `not_attempted`.

Only the most recent attempt per booking is used. Attempt rows are append-only, so a retry produces a new row and replaces the displayed result.

The response also includes a `summary` object for the current page: `scannedBookings`, `mismatchedBookings`, `mismatchCount`, `byType` and `bySeverity`. Page-scoped counts avoid an unbounded scan of the booking table; use the existing pagination fields to inspect further pages.

## Mismatch detection

A mismatch is recorded only when two recorded sources contradict each other. Missing telemetry is not a mismatch.

| Type | Severity | Trigger |
| --- | --- | --- |
| `contract_backend_mismatch` | `high` | The latest supported contract event implies a different backend status |
| `supplier_backend_mismatch` | `high` | The supplier reports `CANCELLED` while the booking is not terminal |
| `supplier_sync_conflict` | `medium` | The flight has an unresolved `CONFLICT` sync status |
| `payment_reference_missing` | `high` | A paid-or-later booking has no Stripe or on-chain reference |
| `payment_state_unresolved` | `medium` | A failed booking still has a payment reference |
| `reconciliation_failed` | `high` | The latest reconciliation attempt failed |
| `reconciliation_detected` | `medium` | The latest reconciliation attempt detected a mismatch without repairing it |

Mismatch details contain operational state and reconciliation error text; the view does not add traveler personal data.

## Security and privacy

- The endpoint sits behind `requireAdmin` and returns `401` for missing credentials and `403` when the role is insufficient.
- The client clears the table and shows a permission message on `403`, and shows a retry action on other failures.
- The view is read-only. Support changes use the audited support endpoint described in `docs/operations/TRAVELER_SUPPORT_ESCALATION.md`.
- No traveler personal data beyond the booking reference and flight identifiers is shown in this table.

## Accessibility

- The table has a caption and column headers with `scope="col"`.
- The status filter has a visible label.
- The reconciliation summary has its own heading and is described as page-scoped.
- Mismatch lists are labelled and use text, not colour alone, to convey severity.
- Loading, empty, forbidden and error states are announced through a live region or an alert.

## Related documents

- `docs/operations/TRAVELER_SUPPORT_ESCALATION.md`
- `docs/operations/INCIDENT_RESPONSE.md`
