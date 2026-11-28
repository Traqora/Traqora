# Booking Lifecycle and Atomic Persistence Failure Recovery

## Overview
Booking and passenger records are persisted atomically within the Soroban smart contract layer (`BookingStorage::set_atomic`). This ensures that partial booking entries or orphaned traveler data cannot be left behind if a write operation fails partway.

Use the [booking operations view](BOOKING_OPERATIONS_VIEW.md) to identify the
affected booking. Record the Traqora booking ID, booking state, last update, and
any available payment or transaction reference. Keep passenger data and private
supplier confirmation codes out of incident notes and logs.

| Situation | Verify before acting | Recovery |
| --- | --- | --- |
| Supplier submission timed out | Check the supplier using the original request reference. A timeout is an unknown outcome. Traqora's on-chain status cannot establish whether a supplier accepted the reservation. | If the supplier accepted it, reconcile the existing reservation. Retry only after the supplier confirms that it did not accept the request or guarantees that reusing the original reference is idempotent. Escalate any remaining uncertainty. |
| Booking is `awaiting_payment` or `payment_processing` | Check the existing payment intent in the payment provider. Use that intent to determine whether payment succeeded, failed, or is still processing. | Allow normal confirmation or webhook processing to advance the booking. For terminal failures, follow the [checkout failure guidance](CHECKOUT_FAILURE_PATHS.md). Avoid creating a second charge while the first intent is unresolved. |
| Booking is `onchain_pending` or `onchain_submitted` | Check the booking transaction hash on the configured Stellar network when a hash exists. Distinguish confirmed success, terminal failure, and an unknown result. | Reconcile confirmed transactions. Retry confirmation only after checking the existing payment and transaction, then keep the operation on the same booking. Escalate an unknown transaction outcome before resubmitting. |
| Payment, supplier reservation, or contract state advanced without the others | Verify the outcome of each part independently. A successful charge or transaction does not establish that the other parts succeeded. | Preserve successful steps and use [refund reconciliation](refund-reconciliation.md) when compensation is required. Escalate when the current evidence is insufficient to determine the next safe action. |

## Audited operator recovery

An operator with `booking:reconcile` can use
`POST /api/v1/admin/bookings/{id}/recovery` after checking the upstream
outcomes. Include an `Idempotency-Key` header and a reason that summarizes the
evidence without private identifiers.

- `retry_confirmation` sets the booking to `onchain_pending` for confirmation
  recovery. It does not submit a supplier reservation or initiate a new payment.
- `mark_failed` records `failed` after a terminal outcome. It does not cancel a
  supplier reservation or issue a refund by itself.

Reuse the same key, action, and reason if the recovery request times out.
Confirm the returned booking status and retain the `auditLogId` for the
incident record. Escalate disagreements between the supplier, payment provider,
and ledger instead of manually forcing a confirmed state.

## Failure Recovery
- **Atomic Writes**: Soroban ledger transactions execute all storage modifications within a single atomic boundary. If any step fails, the entire transaction reverts.
- **Orphan Prevention**: Passenger index records and core booking records are updated together. Verify booking IDs using `get_booking` and associated passenger records via `get_passenger_record`.
