# Traqora API — Worked Examples

Worked request/response examples for the core API flows: **authentication**, **flight search**, **booking**, and **refunds**. These are generated from the OpenAPI spec (see [README.md](./README.md) and `packages/backend/src/api/openapi/generator.ts`).

All examples assume the backend is running locally on `http://localhost:3001`. Interactive docs are available at `/api/docs` and raw OpenAPI JSON at `/api/openapi.json`.

---

## 1. Authentication

Traqora uses wallet-based authentication (SIWStellar-style challenge/verify flow). JWTs are returned and used as Bearer tokens.

### Step 1.1 — Request a challenge

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "GA5XIGA5C7GTPTWU27E7B65KZT2HB4DJKZDAW4ZJFASQOGHLVUWLWD5G"
  }'
```

Response `200`:

```json
{
  "challenge": "Sign this message to log in to Traqora: 8f3b...",
  "expiresAt": "2026-08-26T12:05:00.000Z"
}
```

### Step 1.2 — Sign the challenge with your wallet and verify

Sign the challenge string using Freighter, Albedo or Rabet, then submit:

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "GA5XIGA5C7GTPTWU27E7B65KZT2HB4DJKZDAW4ZJFASQOGHLVUWLWD5G",
    "signature": "<base64 signature of the challenge>",
    "walletType": "freighter"
  }'
```

Response `200`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-08-26T13:00:00.000Z",
  "user": {
    "walletAddress": "GA5XIGA5C7GTPTWU27E7B65KZT2HB4DJKZDAW4ZJFASQOGHLVUWLWD5G",
    "walletType": "freighter",
    "createdAt": "2026-08-26T12:00:00.000Z"
  }
}
```

### Step 1.3 — Refresh tokens

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }'
```

Response `200`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-08-26T14:00:00.000Z"
}
```

Error format (all endpoints):

```json
{
  "success": false,
  "error": {
    "message": "Validation error",
    "code": "VALIDATION_ERROR",
    "details": {},
    "retryable": false,
    "requestId": "req-123",
    "timestamp": "2026-08-26T12:00:00.000Z"
  }
}
```

---

## 2. Flight Search

`GET /api/v1/flights/search` is rate-limited and supports cursor pagination.

```bash
curl -s -G http://localhost:3001/api/v1/flights/search \
  --data-urlencode "origin=JFK" \
  --data-urlencode "destination=LAX" \
  --data-urlencode "date=2026-09-15" \
  --data-urlencode "passengers=2" \
  --data-urlencode "class=economy" \
  --data-urlencode "price_max=500" \
  --data-urlencode "sort=price" \
  --data-urlencode "page_size=10"
```

Response `200` (abridged):

```json
{
  "data": [
    {
      "id": "3f9a1c2e-...",
      "airline": { "code": "AA", "name": "American Airlines" },
      "origin": "JFK",
      "destination": "LAX",
      "departureTime": "2026-09-15T08:30:00Z",
      "arrivalTime": "2026-09-15T11:55:00Z",
      "pricing": { "usd": 342.50, "xlm": 1180.25 }
    }
  ],
  "pagination": {
    "nextCursor": "eyJvZmZzZXQiOjEwfQ==",
    "hasMore": true,
    "pageSize": 10
  }
}
```

To fetch the next page, pass `cursor=<nextCursor>`. Prices can be converted to another currency by adding `currency=EUR`.

---

## 3. Booking

Creating a booking requires authentication (`Authorization: Bearer <accessToken>`).

```bash
curl -s -X POST http://localhost:3001/api/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{
    "flightId": "3f9a1c2e-8c4f-4b7e-9d2a-1f6e5b4a3c21",
    "passenger": {
      "email": "jane@example.com",
      "firstName": "Jane",
      "lastName": "Doe",
      "phone": "+15551234567",
      "sorobanAddress": "GA5XIGA5C7GTPTWU27E7B65KZT2HB4DJKZDAW4ZJFASQOGHLVUWLWD5G"
    }
  }'
```

Response `201` (abridged):

```json
{
  "id": "b7e6d5c4-3210-4fed-cba9-876543210fed",
  "status": "pending_payment",
  "flightId": "3f9a1c2e-8c4f-4b7e-9d2a-1f6e5b4a3c21",
  "passenger": {
    "email": "jane@example.com",
    "firstName": "Jane",
    "lastName": "Doe"
  },
  "createdAt": "2026-08-26T12:10:00.000Z"
}
```

Complete payment by signing and submitting the returned on-chain transaction with your Stellar wallet; the booking then transitions to `confirmed` once the Soroban booking contract settles.

Retrieve a booking:

```bash
curl -s http://localhost:3001/api/v1/bookings/b7e6d5c4-3210-4fed-cba9-876543210fed \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## Seat Holds

Read active group seat holds for a flight. The response contains seat numbers,
hold and expiry timestamps, and an aggregate count; group booking identifiers
are not exposed.

```bash
curl -s http://localhost:3001/api/services/seats/3f9a1c2e-8c4f-4b7e-9d2a-1f6e5b4a3c21/holds
```

Response `200` (abridged):

```json
{
  "flightId": "3f9a1c2e-8c4f-4b7e-9d2a-1f6e5b4a3c21",
  "heldSeats": 2,
  "holds": [
    {
      "seatCount": 2,
      "seats": ["3A", "3B"],
      "lockedAt": "2026-08-26T12:00:00.000Z",
      "expiresAt": "2026-08-26T12:15:00.000Z"
    }
  ],
  "timestamp": "2026-08-26T12:00:00.000Z"
}
```

## 4. Refunds

Refunds may be requested by the passenger and are either auto-approved (policy-eligible) or routed to admin review.

### Get a cancellation quote (before confirming)

Request a non-mutating estimate before the traveller confirms a cancellation. It returns the outcome, estimated refund, currency, fees, and a short-lived expiry. The quote uses the same eligibility policy as the refund flow and never creates a refund record.

```bash
curl -s http://localhost:3001/api/v1/refunds/quote/b7e6d5c4-3210-4fed-cba9-876543210fed \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

Response `200` (abridged):

```json
{
  "success": true,
  "data": {
    "bookingId": "b7e6d5c4-3210-4fed-cba9-876543210fed",
    "outcome": "eligible",
    "reason": "Eligible for 80% refund under standard_partial policy",
    "currency": "USD",
    "originalAmountCents": 35000,
    "estimatedRefundCents": 26250,
    "refundPercentage": 80,
    "fees": {
      "processingFeeCents": 1750,
      "cancellationFeeCents": 0,
      "totalFeeCents": 1750
    },
    "tier": "standard_partial",
    "quotedAt": "2026-11-19T12:00:00.000Z",
    "expiresAt": "2026-11-19T12:15:00.000Z"
  }
}
```

`outcome` is `eligible`, `manual_review`, or `ineligible`. `estimatedRefundCents` is already net of `fees.totalFeeCents`. Quotes expire 15 minutes after `quotedAt`, or at flight departure if that is sooner. An unknown booking returns `404`; a booking without the data needed to price it returns `422` with a `details.code` of `MISSING_FLIGHT`, `MISSING_DEPARTURE_TIME`, or `MISSING_AMOUNT`.

### Step 4.1 — Request a refund

```bash
curl -s -X POST http://localhost:3001/api/v1/refunds/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{
    "bookingId": "b7e6d5c4-3210-4fed-cba9-876543210fed",
    "reason": "flight_cancelled",
    "reasonDetails": "Airline cancelled flight AA1234."
  }'
```

Valid `reason` values: `flight_cancelled`, `flight_delayed`, `customer_request`, `duplicate_booking`, `service_issue`, `other`.

Response `201` (abridged):

```json
{
  "id": "r1e2f3a4-b5c6-4789-a012-3456789abcde",
  "bookingId": "b7e6d5c4-3210-4fed-cba9-876543210fed",
  "status": "pending_review",
  "reason": "flight_cancelled",
  "amount": { "usd": 342.50 },
  "createdAt": "2026-08-26T12:20:00.000Z"
}
```

### Step 4.2 — Check refund status

```bash
curl -s http://localhost:3001/api/v1/refunds/r1e2f3a4-b5c6-4789-a012-3456789abcde/status \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Step 4.3 — Submit the signed on-chain refund transaction

Once approved, sign the refund transaction XDR with your wallet and submit it:

```bash
curl -s -X POST http://localhost:3001/api/v1/refunds/r1e2f3a4-b5c6-4789-a012-3456789abcde/submit-onchain \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{ "signedXdr": "AAAAAgAAAAA..." }'
```

The refund completes when the Soroban refund contract executes the payout on Stellar.

---

## 5. Cancellation

Cancellation is a two step flow. First quote the exact terms, then submit an explicit confirmation together with an idempotency key. This prevents a traveler from agreeing to stale terms and stops a retried request from cancelling twice.

### Step 5.1 - Quote the cancellation terms

```bash
curl -s http://localhost:3001/api/v1/bookings/b7e6d5c4-3210-4fed-cba9-876543210fed/cancellation-refund \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

Response `200` (abridged) contains `eligible`, `netRefundCents`, `refundPercentage` and a human readable `breakdown`. Show these values to the traveler for review.

### Step 5.2 - Confirm and cancel

```bash
curl -s -X POST http://localhost:3001/api/v1/bookings/b7e6d5c4-3210-4fed-cba9-876543210fed/cancel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Idempotency-Key: cancel-b7e6d5c4-3210" \
  -d '{
    "confirm": true,
    "termsVersion": "v1",
    "expectedNetRefundCents": 34250
  }'
```

Rules for this endpoint:

- `confirm` must be `true` and `termsVersion` must be the version returned with the quote.
- `expectedNetRefundCents` must match the live quote. If the quote changed, the request is rejected with `409` and the traveler must review the new terms.
- An `Idempotency-Key` header is required. Repeating the same key and payload replays the first response with `"idempotent": true` and performs no second supplier cancellation or refund. Reusing a key with a different payload returns `409`.

---

## 6. Rate limits

High risk endpoints have dedicated limits on top of the global and tiered limits. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. When a limit is exceeded the API returns `429` with code `RATE_LIMIT_EXCEEDED` and a `Retry-After` header.

| Endpoint family | Limit | Window | Purpose |
| --- | --- | --- | --- |
| `/api/v1/auth/*` and `/api/v1/admin/auth/*` | 10 requests | 15 minutes | Limit wallet authentication brute force attempts per client IP |
| `POST /api/v1/bookings` | 8 requests | 60 seconds | Limit checkout attempts that start payment and booking work per client IP |

Clients should back off for the number of seconds in `Retry-After` before retrying.

---

## Regenerating these examples

The OpenAPI document is generated from zod schemas:

1. Update schemas in `packages/backend/src/api/schemas/index.ts`.
2. Run `npm run generate:openapi`.
3. Inspect `/api/openapi.json` and refresh this file if request/response shapes changed.

## See also

- [API Documentation overview](./README.md)
- [Contract Deployment Runbook](../operations/CONTRACT_DEPLOYMENT_RUNBOOK.md)
