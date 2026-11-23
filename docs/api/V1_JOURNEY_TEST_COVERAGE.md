# V1 journey automated coverage

Two backend suites protect the documented v1 traveler journey. External providers are mocked, but the suites drive the real Express routers so route wiring, validation, authorization guards, and response envelopes are covered.

## Contract tests

`packages/backend/tests/api/v1-journey-contract.test.ts` covers request and response contracts for:

- `GET /api/v1/flights/search`
- `POST /api/v1/bookings`
- `GET /api/v1/bookings/:id/transaction-status`
- `POST /api/v1/bookings/:id/cancel`
- `POST /api/v1/refunds/request`
- `GET /api/v1/refunds/:id/status`

Each endpoint has a normal-path response assertion and a malformed request assertion. Error responses are validated against the RFC 7807 envelope.

## Happy-path booking test

`packages/backend/tests/e2e/v1-booking-happy-path.test.ts` drives the full journey in order: search, offer selection, passenger entry, simulated payment through the Stripe webhook, on-chain submission, transaction status confirmation, and booking retrieval. It also checks two failure paths: invalid search parameters do not call the flight provider, and a passenger wallet mismatch does not create a booking.

## Running the suites

```bash
cd packages/backend
npx jest --config jest.config.cjs \
  tests/api/v1-journey-contract.test.ts \
  tests/e2e/v1-booking-happy-path.test.ts \
  --runInBand --forceExit
```

These suites avoid the full application bootstrap because the clean `main` backend has known unrelated startup and parse failures documented in `docs/security/V1_RELEASE_REVIEW.md`.
