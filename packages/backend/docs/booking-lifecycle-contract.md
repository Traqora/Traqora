# Booking Lifecycle Contract — Cancel & Confirm

Operator and contributor reference for two booking state-machine surfaces:
cancellation (#785) and on-chain confirmation retry (#784). Both are implemented
so that repeating a call after success is safe — the underlying transition runs
at most once and every response carries a machine-readable decision.

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
