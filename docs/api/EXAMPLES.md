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

## 4. Refunds

Refunds may be requested by the passenger and are either auto-approved (policy-eligible) or routed to admin review.

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

## Regenerating these examples

The OpenAPI document is generated from zod schemas:

1. Update schemas in `packages/backend/src/api/schemas/index.ts`.
2. Run `npm run generate:openapi`.
3. Inspect `/api/openapi.json` and refresh this file if request/response shapes changed.

## See also

- [API Documentation overview](./README.md)
- [Contract Deployment Runbook](../operations/CONTRACT_DEPLOYMENT_RUNBOOK.md)
