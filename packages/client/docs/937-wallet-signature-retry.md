# Wallet signature retry (#937)

When a user rejects a wallet signature request, the booking flow keeps:

- the created booking (same booking ID),
- the unsigned transaction XDR and network passphrase,
- the selected itinerary and every checkout input held by the page,
- the transaction summary used for approval.

It does **not** create another booking. The state moves back to `signing` with
`signatureRejected: true` and `canRetrySignature: true`. Retrying calls
`retrySignature()` (or `signAndSubmitTransaction()` again), which reuses the
existing booking and XDR. A successful retry submits the signed XDR exactly
once; a rejection or timeout can be retried as many times as needed.

The same restoration applies to a wallet timeout or an unexpected signing
failure. `reset()` is the only action that intentionally clears the preserved
checkout. Creating a new booking is always an explicit user action, never an
automatic retry side effect.
