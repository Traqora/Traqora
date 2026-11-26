# Traveler Support Escalation

## Purpose

This document defines how v1 support staff handle traveler incidents across payments, suppliers, bookings, cancellations and refunds. It stays inside the documented v1 support scope and does not introduce new customer channels.

## Scope and principles

- Support acts only on a booking after the traveler is verified by wallet address or booking reference.
- Every support access and every support change is recorded with the actor, the reason, the booking reference and a timestamp.
- Reads are audited as well as writes, because viewing a traveler itinerary is itself a privacy sensitive action.
- Denied attempts and failed changes are recorded, so no support action disappears from the trail.
- Support staff may view bookings. Only admins may change booking status.
- Never paste full card numbers, private keys, seed phrases or authentication tokens into a reason field. Reasons are operational text, not a place for secrets.

## Escalation levels

| Level | Owner | Trigger | Response target |
| --- | --- | --- | --- |
| L1 | Support specialist | First contact, status questions, document collection | Acknowledge within the published support window |
| L2 | Support lead | Payment or supplier incident that cannot be resolved from existing records | Same business day |
| L3 | Engineering or operations on-call | Suspected contract, ledger or provider fault | Follow `docs/operations/INCIDENT_RESPONSE.md` severity rules |

Move to the next level when the required action needs a role the current level does not hold, when the ledger and application state disagree, or when the traveler reports financial loss.

## Payment incidents

Use this path for failed charges, duplicate charges, pending on-chain payments and missing payment references.

1. Confirm the booking reference and the payment reference shown in the booking operations view.
2. Read `docs/api/payment-retry.md` before advising a retry. Do not ask the traveler to pay twice while a charge is still pending.
3. Record the support access with a reason that names the ticket and the observed state.
4. If the charge is duplicated or the on-chain result cannot be confirmed, escalate to L2 with the booking reference and both references.
5. Refund decisions follow the refund path below. Support staff do not issue refunds directly.

## Supplier incidents

Use this path for provider timeouts, seat assignment failures, ticket numbers that never arrived and schedule changes reported by the airline.

1. Check the supplier state and flight number in the booking operations view. A value of Unavailable means there is no recorded telemetry, not that the supplier confirmed a problem.
2. Follow `docs/operations/FLIGHT_PROVIDER_FAILOVER_RUNBOOK.md` when the provider is degraded.
3. For a timeout with an unknown outcome, follow the reconciliation guidance in `docs/operations/README.md`. Do not create a second booking while reconciliation is pending.
4. Escalate to L2 if the supplier state and the traveler's evidence conflict, or to L3 if reconciliation reports a mismatch.

## Booking incidents

Use this path for wrong names, wrong dates, missing passengers and status that does not match payment.

1. Open the booking through the audited support view with a reason. The actor, reason, booking reference and timestamp are written to the security audit log.
2. Compare booking state, supplier state and payment reference in the operations view.
3. If a status change is required, an admin performs it through the support endpoint with a new reason. The previous and new states are recorded in the audit metadata.
4. If a support specialist attempts a status change, the request is denied and the denial is audited. Escalate to an admin.
5. Correcting traveler supplied details stays within the existing booking flows. Support does not edit flight inventory.

## Cancellation incidents

Use this path when a traveler wants to cancel or reports that a cancellation did not complete.

1. Show the traveler the non-mutating cancellation quote first. It states the outcome, estimated refund, currency, fees and expiry.
2. Explain that the quote is an estimate that expires at 15 minutes or at departure, whichever comes first. The final amount is computed when the cancellation is confirmed.
3. If the quote is ineligible, explain the reason from the quote outcome instead of promising a refund.
4. If the cancellation itself failed, escalate to L2 with the booking reference and the observed response. See `docs/api/EXAMPLES.md` for the quote and cancellation request shapes.

## Refund incidents

Use this path for missing refunds, wrong refund amounts and refunds stuck after approval.

1. Read the refund status for the booking. Do not create a second refund request while one is already recorded.
2. Compare the approved amount with the earlier quote. If they differ, quote expiry or a policy tier change is the likely cause, and L2 confirms which applied.
3. If the refund is approved but no payment reference exists, escalate to L2 with the refund identifier.
4. If the on-chain leg is involved and the ledger disagrees with the recorded status, escalate to L3 and follow `docs/operations/INCIDENT_RESPONSE.md`.

## Audit and privacy requirements

- Support access uses action `support_booking_access`, changes use `support_booking_change`, denied attempts use `support_access_denied` and failed changes use `support_change_failed`.
- All four actions share the single security audit chain and keep the hash chain intact.
- The reason and booking reference are stored under the audit entry details. The actor and timestamp are stored on the entry itself.
- Audit entries are retained according to the platform retention policy. Do not delete or edit them to correct a mistake, append a new entry instead.
- Only travelers involved in a booking and authorized operators may see its details. Redaction of sensitive fields is applied before an audit entry is written.

## Accessibility requirements

- Every reason field has a visible label and an accessible error message.
- Support tools expose state as text, not by colour alone.
- Keyboard users can reach the reason field, submit action and audit result messages.

## Related documents

- `docs/operations/BOOKING_OPERATIONS_VIEW.md`
- `docs/operations/INCIDENT_RESPONSE.md`
- `docs/api/payment-retry.md`
- `docs/api/EXAMPLES.md`
