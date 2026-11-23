# Booking Lifecycle Recovery

To prevent duplicate bookings when requests time out or fail ambiguously against external suppliers, Traqora uses idempotent supplier references and reconciliation flows.

## Idempotent Booking References

- Every booking submission generates a unique client reference (`Idempotency-Key` / supplier reference UUID).
- Supplier API integrations pass this reference so retries return the original booking state instead of creating duplicate reservations.

## Reconciliation Flow

1. **Timeout / Network Error:** If a response from the supplier API is not received within the threshold, the backend marks the transaction status as `AMBIGUOUS`.
2. **Reconciliation Query:** A background worker queries the supplier using the stored idempotency key.
3. **Resolution:**
   - If found and confirmed, the local record transitions to `CONFIRMED`.
   - If not found, the client is safely permitted to retry or receive a full refund/cancellation.
