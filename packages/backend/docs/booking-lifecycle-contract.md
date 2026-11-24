# Booking Lifecycle Contract — Cancel & Confirm

Operator and contributor reference for two booking state-machine surfaces:
cancellation (#785) and on-chain confirmation retry (#784). Both are implemented
so that repeating a call after success is safe — the underlying transition runs
at most once and every response carries a machine-readable decision.

## 0. Idempotent booking create and confirmation (#640)

`POST /api/v1/bookings` requires authentication and an `Idempotency-Key` header
of 1-128 characters. The key is stored with the canonical hash of the validated
flight, passenger, and authenticated wallet. The first successful request
returns `201`; repeating the same request returns `200` with the original
booking and `idempotent: true`, without reserving another seat or submitting a
second on-chain booking. Reusing the key with a different method, path, or
payload returns `409 Conflict`.

The database's unique key index arbitrates concurrent inserts, while requests
in the same backend process share the in-flight operation. The key row stores
the booking resource ID so a later API retry can load the original booking.
Failed operations do not return a cached success and can be retried with the
same key and payload.

Confirmation polling uses `GET /api/v1/bookings/:id/transaction-status` (and
`GET /api/v1/transactions/:bookingId`). Concurrent polls for a booking are
serialized in-process; only the first poll that changes the booking persists a
transition and triggers a status broadcast. Replays return the settled booking
without another write or broadcast. Pending transactions remain unchanged.

Regression coverage: `packages/backend/tests/idempotency.concurrency.test.ts`,
`packages/backend/tests/bookings.integration.test.ts`, and
`packages/backend/src/services/__tests__/bookingConfirmRetry.test.ts`.

---

## 1. Booking cancel policy engine (#785)

Implementation: `packages/backend/src/services/bookingOrchestrationService.ts`
(`resolveCancelPolicyDecision`, `processCancellation`).

### Inputs

`POST /api/v1/bookings/:id/cancel` (auth required). The booking is loaded by
`:id` with its flight relation; no request body is required.

### Outputs

`200 OK` with `{ success, data: { success, refund, message, policy } }` where:

| Field    | Type                  | Meaning                                                        |
| -------- | --------------------- | -------------------------------------------------------------- |
| `success`| boolean               | `true` when the booking is (or already was) cancelled+refunded |
| `refund` | CancellationRefund    | fare-rules breakdown (`refundableCents`, `netRefundCents`, …)  |
| `message`| string                | human-readable summary                                         |
| `policy` | CancelPolicyDecision  | `action`, `reason`, `httpStatus` (see below)                   |

`policy.action` is one of:

- `refund` — fare rules decided the outcome this call (`success` mirrors it)
- `already_refund_cancelled` — idempotent replay of a completed cancellation
- `reject` — the booking state forbids cancellation; the route raises `409`
  with `policy.reason` in the error message

`policy.reason` is a stable code from `CANCEL_REJECTION_REASONS`:
`already_cancelled`, `booking_failed`, `refund_rejected` (or `cancellable`).
The full platform and supplier fare decision matrix is documented in
[V1 Cancellation Eligibility Rules](CANCELLATION_ELIGIBILITY.md).

### Error cases

| Case                          | Result                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| Unknown booking id            | `400` BadRequestError (`Booking not found`)                    |
| `failed` booking              | `409` ConflictError, reason `booking_failed` — no state change |
| `refund_rejected` booking     | `409` ConflictError, reason `refund_rejected` — no state change|
| Already `refunded` booking    | `200` idempotent no-op, `policy.action = already_refund_cancelled` |
| Non-refundable fare (NK etc.) | `200` with `success: false` and the refund breakdown; booking is **not** modified |

### Policy rules (evaluation order)

1. `refunded` → idempotent no-op (never re-saves, never re-broadcasts).
2. `failed` → reject. A failed booking never captured funds; "cancelling" it
   would mint a bogus `refunded` terminal state.
3. `refund_rejected` → reject. Refund was adjudicated and denied; re-cancelling
   must go through the refund dispute flow instead.
4. Everything else (`created`, `awaiting_payment`, `payment_processing`, `paid`,
   `onchain_pending`, `onchain_submitted`, `confirmed`) → fare rules decide
   eligibility and amount exactly as before #785.

Regression tests: `packages/backend/src/services/__tests__/bookingCancelPolicy.test.ts`.

---

## 2. Idempotent booking confirm retry (#784)

Implementation: `packages/backend/src/services/bookingConfirmRetry.ts`
(`applyConfirmTransition` pure state machine, `confirmBookingTx` orchestration),
wired into the `GET /bookings/:id/transaction-status` and
`GET /transactions/:bookingId` routes.

### Inputs

A booking id. The function loads the booking, reads its `sorobanTxHash`, and
queries the Soroban RPC for the transaction status once (3 attempts with
backoff on transient errors).

### Outputs

`{ outcome, changed, booking, transactionStatus }` plus, on the HTTP routes,
`confirmOutcome` in the response body:

| `outcome`           | Meaning                                                     | Persisted? |
| ------------------- | ----------------------------------------------------------- | ---------- |
| `confirmed`         | transition applied this call (status flip or first-time on-chain booking id capture) | yes |
| `already_confirmed` | idempotent replay — transaction already settled earlier     | no  |
| `failed`            | transaction failed on-chain; `booking.lastError` set        | once |
| `left_pending`      | `pending` / `not_found` / no tx hash — keep polling         | no  |

`changed` is `true` only when a field actually moved; clients and the WebSocket
broadcast can key off it to avoid duplicate notifications.

### Error cases

- Unknown booking id → `400` BadRequestError (404 at the route layer).
- Booking without `sorobanTxHash` → `left_pending`, no chain call.
- Soroban RPC unreachable → retried 3×, then the route's normal error handling
  applies; the booking is left untouched (never marked failed on transport
  errors — only a definitive on-chain `failed` status marks it failed).

### Why this exists

Before #784 the "successful transaction ⇒ confirmed" transition was duplicated
in three places with divergent logic; re-polling re-saved and re-broadcast
confirmed bookings, and one call site read a non-existent `bookingId` property
off the Soroban return value. The pure `applyConfirmTransition` function is now
the single owner of the transition and is unit-tested for idempotent replay in
both directions (confirmed + failed).

Regression tests: `packages/backend/src/services/__tests__/bookingConfirmRetry.test.ts`.

---

## 3. Bounded confirmation retry worker (#1131)

Implementation: `packages/backend/src/services/confirmationRetry.ts`
(`decideConfirmationRetry`, `ConfirmationRetryService`) and
`packages/backend/src/jobs/confirmationRetryJob.ts`, started from
`packages/backend/src/index.ts`.

The post-submission poll (`BookingOrchestrationService.pollTransactionStatus`)
now delegates to `retryUntilSettled`. A periodic sweep
(`CONFIRMATION_RETRY_CRON`, default `*/1 * * * *`) is the durable safety net for
bookings whose in-process poll was lost on restart.

### Inputs

Bookings in `onchain_pending` or `onchain_submitted` with a `sorobanTxHash`,
whose `confirmationNextAttemptAt` is null or in the past. The batch is bounded
by `CONFIRMATION_RETRY_BATCH_SIZE` (default 50).

### Policy

| Env var                             | Default | Meaning                                      |
| ----------------------------------- | ------- | -------------------------------------------- |
| `CONFIRMATION_RETRY_MAX_ATTEMPTS`   | 8       | Total attempts before terminal failure       |
| `CONFIRMATION_RETRY_BASE_DELAY_MS`  | 5000    | First backoff delay                          |
| `CONFIRMATION_RETRY_MAX_DELAY_MS`   | 60000   | Backoff ceiling (exponential, +20% jitter)   |
| `CONFIRMATION_RETRY_BATCH_SIZE`     | 50      | Bookings processed per sweep                 |
| `CONFIRMATION_RETRY_CRON`           | `*/1 * * * *` | Sweep schedule                        |

### Outcomes

| Result                         | Persisted state                                              |
| ------------------------------ | ------------------------------------------------------------ |
| `confirmed` / `already_confirmed` | `confirmed`, attempts reset to 0, next attempt cleared    |
| On-chain `failed`              | `failed`, `lastError` from the chain, seat released once      |
| `pending` / `not_found` / error below budget | unchanged status, attempts +1, `confirmationNextAttemptAt` set |
| Attempt budget exhausted       | `failed` with `lastError = "Confirmation retries exhausted after N attempts…"` and no further retries |

The exhausted/failed row is the visible terminal state: it is returned by the
booking and transaction APIs and fires the normal failed-booking operational
signals. Attempts are serialized per booking in-process, and a new transaction
submission or an admin `retry_confirmation` resets the retry budget.

Regression tests: `packages/backend/src/services/__tests__/confirmationRetry.test.ts`.

---

## 4. Booking dead-letter recovery path (#1132)

Implementation: `packages/backend/src/db/entities/BookingDeadLetter.ts`,
`packages/backend/src/services/bookingDeadLetterService.ts`, and the admin routes
in `packages/backend/src/api/routes/admin/bookings.ts`.

When a booking's on-chain confirmation reaches a terminal `failed` state the
bounded retry worker (#1131) captures a dead-letter entry. Both exhausted retry
budgets and definitive on-chain failures are captured; the entry keeps the
failure context even after an operator recovers the booking.

### Captured context

Entries are stored in `booking_dead_letters` with only privacy-safe fields:

| Field | Meaning |
| --- | --- |
| `bookingId` | Booking being quarantined. |
| `operation` | Closed set; currently `CONFIRM_TRANSACTION`. |
| `bookingStatus` | Booking status after the terminal transition. |
| `attempts` | Attempts spent before quarantine. |
| `reason` | Terminal `lastError`, truncated to 1000 characters. |
| `context` | `previousStatus`, `outcome`, privacy-safe `bookingReference`, `flightId`, `sorobanTxHash`, `amountCents`. |

Passenger identity, contact details, passport data, payment intent/client
secrets, and wallet addresses are never copied into the entry. Re-capturing an
open entry for the same booking and operation updates it in place rather than
creating duplicates.

### Operator endpoints

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/v1/admin/bookings/dead-letters` | `booking:read` | Paginated list; filters `state=open|resolved` and `bookingId`. |
| `GET /api/v1/admin/bookings/dead-letters/:id` | `booking:read` | Inspect one entry. |
| `POST /api/v1/admin/bookings/dead-letters/:id/recover` | `booking:reconcile` | Recover the underlying booking with an audited action. |

The recovery body is the same as the booking recovery endpoint:

```json
{ "action": "retry_confirmation" | "mark_failed", "reason": "..." }
```

`Idempotency-Key` is required. Recovery delegates to the booking recovery
service, so the status correction and `AdminAuditLog` row are written in one
transaction. Every open dead-letter entry for that booking is then marked
`resolved` with `resolvedBy`, `resolutionAction`, `resolutionReason`, and the
`auditLogId`. Resolved entries are retained for investigation.

Reusing the same `Idempotency-Key` returns the original audit reference without
repeating the state change. Recovering an already-resolved dead-letter id also
returns the current booking and original audit reference with
`idempotentReplay: true`.

Regression tests: `packages/backend/src/services/__tests__/bookingDeadLetter.test.ts`
and `packages/backend/tests/booking-recovery.integration.test.ts`.
