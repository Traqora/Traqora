# Boarding-Pass Wallet Pass (Apple Wallet)

`GET /api/v1/checkin/:bookingId/wallet-pass` returns the `pass.json` payload for a checked-in
booking. The mobile apps and the web boarding-pass card use it to build an Apple Wallet boarding
pass.

- Builder (a pure function with no side effects): `src/services/walletPass.ts` → `buildAppleWalletPass(checkIn, config)`
- Service: `CheckInService.generateWalletPass` in `src/services/checkinService.ts`

The Google Wallet export (`/google-wallet-pass`) and the PDF export are not changed.

## Inputs

| Input | Source | Rules |
|-------|--------|-------|
| `bookingId` | Path parameter | Must have a check-in record |
| Check-in | `check_ins` | `status` must be `checked_in`. `boardingPassCode` must not be empty |
| Booking | `bookings` | `status` must not be `failed` or `refunded` |
| Flight | `booking.flight` | `flightNumber`, `fromAirport` and `toAirport` are required. `departureTime` must be a valid date |
| Passenger | `booking.passenger` | `firstName` and `lastName` are required |

### Configuration

| Env var | Default (dev/test) | Production |
|---------|--------------------|------------|
| `APPLE_WALLET_PASS_TYPE_ID` | `pass.com.traqora.boardingpass` | **Required** |
| `APPLE_WALLET_TEAM_ID` | `TRAQORADEV` | **Required** |
| `APPLE_WALLET_ORGANIZATION_NAME` | `Traqora` | Optional |

## Output

```json
{
  "success": true,
  "data": {
    "formatVersion": 1,
    "passTypeIdentifier": "pass.com.traqora.boardingpass",
    "teamIdentifier": "ABCDE12345",
    "serialNumber": "<checkIn.id>",
    "description": "TQ101 boarding pass",
    "organizationName": "Traqora",
    "relevantDate": "2026-10-01T09:30:00.000Z",
    "expirationDate": "2026-10-02T09:30:00.000Z",
    "boardingPass": {
      "transitType": "PKTransitTypeAir",
      "headerFields":    [{ "key": "gate", "label": "GATE", "value": "B4" }],
      "primaryFields":   [{ "key": "origin", "label": "FROM", "value": "LOS" },
                          { "key": "destination", "label": "TO", "value": "ACC" }],
      "secondaryFields": [{ "key": "passenger", "label": "PASSENGER", "value": "Ada Obi" },
                          { "key": "seat", "label": "SEAT", "value": "12A" }],
      "auxiliaryFields": [{ "key": "flight", "label": "FLIGHT", "value": "TQ101" },
                          { "key": "terminal", "label": "TERMINAL", "value": "2" },
                          { "key": "departure", "label": "DEPARTS", "value": "2026-10-01T09:30:00.000Z",
                            "dateStyle": "PKDateStyleShort", "timeStyle": "PKDateStyleShort" }]
    },
    "barcodes": [{ "format": "PKBarcodeFormatQR", "message": "ABCDEF…", "messageEncoding": "iso-8859-1", "altText": "ABCDEF…" }],
    "qrCodeDataUrl": "data:image/png;base64,…"
  }
}
```

- `relevantDate` is the departure time, which is when Wallet shows the pass on the lock screen.
  `expirationDate` is 24 hours after departure.
- If the seat is missing it shows `N/A`. A missing gate or terminal shows `TBD`.
- `qrCodeDataUrl` is a Traqora extension that clients use for a preview. It is not part of
  Apple's `pass.json`, so remove it before signing.

## Error cases

| Status | When |
|--------|------|
| `404` | The booking has no check-in |
| `409` | The check-in is not `checked_in`, or the booking is `failed` or `refunded` |
| `422` | Flight or passenger details are missing, the departure time is invalid, or the boarding-pass code is empty |
| `500` | `APPLE_WALLET_PASS_TYPE_ID` or `APPLE_WALLET_TEAM_ID` is not set in production |

## Behavior changes from the previous export

- `barcodes` moved from inside `boardingPass` to the top level of `pass.json`. Wallet ignores
  barcodes that are nested inside `boardingPass`, so previous passes showed no QR code.
- Added `teamIdentifier`, which Apple requires. The pass type ID and team ID can now be configured.
- Added `relevantDate`, `expirationDate`, a gate header field and a terminal field.
- Failed and refunded bookings no longer get a pass. Bookings with incomplete data now return
  `422` instead of crashing with a `500`.

## Signing

This endpoint returns an **unsigned** `pass.json`. To make an installable `.pkpass`, sign it with
the Pass Type ID certificate that matches `APPLE_WALLET_PASS_TYPE_ID`. Signing is outside the
scope of this endpoint.

## Tests

```bash
npm run test -- tests/services/walletPass.test.ts
```
