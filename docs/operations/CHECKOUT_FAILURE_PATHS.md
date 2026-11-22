# Checkout Failure Paths

The automated coverage in
`packages/backend/tests/checkout-failure-paths.integration.test.ts` exercises
the v1 checkout failure scenarios without calling a live supplier, wallet, or
payment provider (#1189). Stripe and Soroban are mocked; the route, orchestrator
and error handler remain real.

| Scenario | Trigger | Expected response | Side effect |
| --- | --- | --- | --- |
| Normal path | Valid booking request | `201 Created`, status `onchain_submitted` | One signed submission, one booking |
| Expired offer | `sessionExpiresAt` or `offerExpiresAt` in the past | `409 OFFER_EXPIRED` with `details.refreshPath` | No supplier call, no booking |
| Changed price | `confirmedProviderPriceCents` differs from the accepted fare | `409 CONFLICT` with `provider_reprice_requires_confirmation` | No supplier call, no booking |
| Wallet rejection | Signing request rejects with `WALLET_REJECTED` | `409 WALLET_REJECTED` | No booking; released seat |
| Supplier timeout | Signing request rejects with `UPSTREAM_UNAVAILABLE` | `504 UPSTREAM_UNAVAILABLE`, `retryable: true` | No booking; released seat |
| Payment pending | `GET /:id/transaction-status` while Soroban is pending | `200` with `confirmOutcome: left_pending` | Booking stays `onchain_pending` |
| Stripe processing | `payment_intent.processing` webhook | `200 { received: true }` | Booking stays `onchain_pending` |

The changed-price gate is reachable through the booking API via the optional
`confirmedProviderPriceCents` and `repriceAccepted` fields. Both are included in
the idempotency request hash, so a retry with different acceptance values is
rejected instead of replaying a stale response.

Run the suite with:

```bash
cd packages/backend
npx jest --config jest.config.cjs tests/checkout-failure-paths.integration.test.ts --runInBand
```

The test uses fake timers only to advance the supplier deadline. Real timers are
restored before the HTTP request so the transport is not faked.
