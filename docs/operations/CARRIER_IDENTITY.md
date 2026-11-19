# Marketing and operating carriers

Issue #903. Codeshare segments keep both carrier identities. Results and
itinerary views label them `Marketed by` and `Operated by` instead of showing
only the marketing carrier.

## Contract

- Marketing carrier: the airline whose flight number is sold.
- Operating carrier: the airline that flies the aircraft.
- When the operating carrier is omitted, it defaults to the marketing carrier
  (`isCodeshare: false`).
- Missing marketing carrier is a validation error (`missing_marketing_carrier`).

## UI

`CarrierLabels` on flight results renders both labels. A codeshare still shows
the operating carrier on its own line so travelers can tell who actually flies.

## Tests

`packages/backend/src/services/__tests__/carrierIdentity.test.ts` and
`packages/client/tests/unit/carrier-labels.test.tsx`.
