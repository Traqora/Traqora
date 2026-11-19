# Refund outcomes (V1)

This document describes how cancellation and refund results are represented to
travelers and operators. It accompanies the V1 work on issues #1153, #1154,
#1155 and #1156.

## Traveler-facing outcomes

The raw refund status is an internal workflow state. Travelers see a derived
`outcome` instead, so a booking is never reported as fully refunded when only
part of the money is coming back or the rail has not settled:

| Outcome | Label | When it is returned |
| ------- | ----- | ------------------- |
| `pending` | Refund in progress | Request is queued, checking eligibility, approved, or processing |
| `partial` | Partial refund issued | `completed` with an approved amount below the requested amount |
| `full` | Full refund issued | `completed` with an approved amount at or above the requested amount |
| `delayed` | Refund on security hold | `delayed_pending` (SLA timelock) |
| `rejected` | Refund not approved | `rejected` or `delayed_cancelled` |
| `failed` | Refund could not be processed | `failed` |
| `unknown` | Refund status needs review | Completed with a missing or invalid amount, or an unrecognised status |

`isFullyRefunded` in the status response is true only for `full`. Callers must
use it, or the derived `outcome`, rather than `status === 'completed'`, before
treating a booking as completely refunded.

## Amounts and arithmetic

All amounts are integer cents. Percentages from fare rules are converted to
integer basis points before multiplication and rounded half up once at the end
(`packages/backend/src/services/refundArithmetic.ts`). This prevents
floating-point drift when a policy uses fractional percentages such as 33.33%.

The traveler view exposes `netRefundCents`, computed by the server after the
processing fee. The client no longer recomputes money with JavaScript floats.

## Original payment destination

For card payments the refund is created against the original Stripe payment
intent. The response is verified (`refundDestination.ts`) for a matching
payment intent, an accepted status, a matching amount and currency, and the
absence of a destination override. A card refund that is not verified or has
not settled stays in progress and is never reported as complete. On-chain
refunds follow the existing timelock and transaction confirmation flow.

## Privacy

Traveler endpoints (`GET /api/v1/refunds/:id`,
`GET /api/v1/refunds/booking/:bookingId` and `GET /api/v1/refunds/:id/status`)
return a projected DTO. Internal operator notes (`reviewNotes`,
`eligibilityNotes`, `cancellationReason`), reviewer identity, error strings,
signing material and the raw booking are never returned to travelers. The
client does not render those fields even if a response contains them.
