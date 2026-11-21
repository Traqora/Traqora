# Error Recovery Guide

This guide defines recovery actions for transient and partial failures in the Traqora backend.

## Standard API Error Contract

All middleware-driven failures return this envelope:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable summary",
    "retryable": true,
    "retryAfterMs": 15000,
    "requestId": "1714090000000-ab12cd",
    "timestamp": "2026-04-26T10:00:00.000Z",
    "details": {}
  }
}
```

## Retry and Circuit Breaker Policy

- External calls use exponential backoff retries.
- Circuit opens after 5 consecutive failures.
- When open, API responds with `503` and `code: CIRCUIT_OPEN`.
- Retry delayed until `retryAfterMs` expires.

## Incident Playbook

### 1) Stellar/Soroban timeouts

1. Confirm error code frequency from logs (`external_operation_failed`, `circuit_opened`).
2. Validate RPC endpoint health independently.
3. Keep circuit open until endpoint recovers (automatic half-open probe is enabled).
4. Verify successful close event (`circuit_closed`) and resumed transaction flow.

### 2) Payment processor 5xx errors

1. Confirm `stripe_create_refund` failures in logs.
2. Observe retry attempts (`retrying_operation`).
3. If failures persist, circuit opens and prevents hot-looping.
4. Reconcile pending refunds after recovery by replaying failed refund jobs.

### 3) Partial failure in booking workflow (seat reserved, blockchain submit fails)

1. Detect failed booking state (`status=failed`, `lastError` set).
2. Ensure seat compensation happened (`seatsAvailable` incremented).
3. Re-run booking only with a new idempotency key after user confirmation.
4. Audit by `requestId`, `bookingId`, and `sorobanTxHash` fields.

## Safe Rollback Actions

- Safe: disable traffic to unstable dependency, wait for circuit cooldown.
- Safe: replay idempotent operations with a new correlation id.
- Safe: verify compensation updates before retrying user action.
- Unsafe: direct manual DB mutation of booking/refund status without audit entry.

## Logging and Alerts

All failures should include:

- `requestId`
- `operation`
- `userId` (or `anonymous`)
- timestamped structured payload

Create alerts for:

- repeated `circuit_opened` events in 5 minutes
- >3 retries per operation with no success
- booking/refund stuck in transitional states (`onchain_submitted`, `processing`) beyond SLO
