# Traqora Operations Guide

## Airline Booking Reference Recovery and Provider Timeouts

When booking flights or reserving seats through external airline providers or smart contract orchestration, network or provider timeouts can result in unknown transaction outcomes (whether the booking was registered and processed or dropped).

### Expected Behavior & Timeout Reconciliation

To prevent duplicate bookings and ensure idempotent retries:

1. **Request References**: Every booking or reservation request can supply a unique `request_ref` identifier (Symbol).
2. **Reconciliation Check**: When a timeout occurs, the orchestration layer invokes reconciliation functions such as `reconcile_and_reserve_seat` or `reconcile_booking_reference` with the original `request_ref`.
3. **Idempotent Retry**: If the request reference is already recorded in storage, the contract returns the existing booking/flight state without creating a duplicate or decrementing capacity twice. If the reference is not found, the reservation proceeds normally and is tied to the reference.

### Failure Cases

- **Reference Mismatch**: Supplying a different flight or booking parameter with a previously used `request_ref` triggers an explicit panic / failure to prevent parameter tampering during retries.
- **Unverified / Inactive Flights**: Attempts to reconcile against unverified airlines or non-active flights are rejected according to standard domain rules.
