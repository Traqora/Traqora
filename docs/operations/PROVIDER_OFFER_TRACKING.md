# Provider offer identifiers

Issue #914. The upstream offer identifier from search is carried through
checkout and confirmation so provider-specific failures can be correlated to
the original offer.

## Contract

- Search mapping (`mapAmadeusOfferToFlight`) sets `providerOfferId` to the
  Amadeus offer `id` when present, otherwise the synthesized flight id.
- `POST /api/v1/bookings` accepts `providerOfferId` and persists it on the
  booking row.
- Confirmation payloads include `providerOfferId` via
  `confirmationWithOfferId`.
- The client confirmation view renders the offer id when the booking has one.

## Failure cases

- Missing, blank, or non-string identifiers throw `MissingProviderOfferIdError`
  (`MISSING_PROVIDER_OFFER_ID`).
- Confirmation of a booking whose offer id was lost fails the same way rather
  than omitting the field.

## Tests

`packages/backend/src/services/__tests__/providerOfferTracking.test.ts` and
`packages/client/tests/unit/booking-confirmation.test.tsx`.
