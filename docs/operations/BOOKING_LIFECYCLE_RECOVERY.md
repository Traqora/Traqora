# Booking Lifecycle Failure Recovery

This document defines recovery procedures for v1 booking API and lifecycle states: supplier timeout, payment pending, contract pending, and partial completion states.

## 1. Supplier Timeout
- **Symptom**: Seat reservation or contract dispatch to the airline/provider times out before on-chain confirmation or response receipt.
- **Recovery Procedure**:
  1. Inspect transaction submission logs and Soroban RPC status.
  2. If the transaction was included but timed out on indexers, query the booking contract state using `get_booking`.
  3. If no on-chain state exists and the timeout occurred pre-submission, retry with an idempotent key.
  4. If the supplier failed to fulfill within the expiration threshold, execute cancellation/refund routines as per smart contract policy.

## 2. Payment Pending
- **Symptom**: Booking is created (`pending`), but payment is not executed or payment intent is stuck/abandoned.
- **Recovery Procedure**:
  1. Unfunded bookings remain in `pending` state with zero escrowed funds.
  2. Expired pending bookings past the timeout window can be cancelled via passenger or automated sweep triggers, returning the reservation back to available inventory.
  3. Verify token allowance and balances before re-attempting `pay_for_booking`.

## 3. Contract Pending
- **Symptom**: Smart contract deployment or initialization transaction is pending/unconfirmed across ledger boundaries.
- **Recovery Procedure**:
  1. Verify network congestion and base fee configuration.
  2. Re-simulate the transaction against the current ledger sequence using Soroban RPC.
  3. If unconfirmed after threshold ledgers, re-submit with bumped fee or abort deployment setup cleanly.

## 4. Partial Completion States
- **Symptom**: Multi-leg journey reservations or batch operations (e.g. `batch_complete_bookings`, batch flight creation/status updates) experience partial failures where some legs succeed and others fail.
- **Recovery Procedure**:
  1. Inspect event logs for individual leg/item execution results.
  2. For partial batch failures, successful individual records are committed while failed items return structured errors.
  3. Execute compensating actions or manual review/retry workflows specifically targeting the failed subset using the returned error identifiers.
