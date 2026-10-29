# Minimum connection time for self-transfer itineraries

Issue #901. Traqora flags connections whose layover is shorter than the configured
minimum connection time (MCT) for the airport pair, including separate-ticket
self-transfers that are not protected by one carrier.

## Contract

- Input: ordered flight segments (`from`, `to`, `departureAt`, `arrivalAt`) plus
  optional `ticketId` / `selfTransfer`.
- Airport pair key: `{inbound.to}-{outbound.from}` (e.g. `LHR-LHR`, `LHR-LGW`).
- Default MCT is 90 minutes. Known pairs override that (see
  `DEFAULT_CONNECTION_TIME_CONFIG`).
- Self-transfer (different `ticketId`, or `selfTransfer: true`) adds
  `selfTransferExtraMinutes` (default 60).
- Output: one `ConnectionFlag` per connection. `ok: false` means the itinerary
  must be flagged, not silently booked.

## Failure cases

| Case | Reason |
| --- | --- |
| Layover shorter than MCT | `below_minimum` |
| Unparseable timestamps | `invalid_times` |
| Next departure before inbound arrival | `negative_layover` |
| Direct flight | no flags |

## Tests

`packages/backend/src/services/__tests__/connectionTimeValidation.test.ts`
covers a valid protected connection, a short self-transfer, a pair-specific
boundary, and invalid times.
