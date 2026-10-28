# Provider reprice confirmation (#917)

If the confirmed provider price differs from the traveler-accepted offer, Traqora
stops **before payment capture** and requires the traveler to review and accept
the new total.

## Expected behavior

- Matching totals proceed to capture.
- Any delta returns `409` with `provider_reprice_requires_confirmation` until
  `repriceAccepted` is true.

Client: `packages/client/components/booking/reprice-confirmation.tsx`.
Backend: `packages/backend/src/services/itineraryRepricing.ts`.
