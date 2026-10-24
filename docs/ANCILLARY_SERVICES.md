# Ancillary services

Traqora supports fixed-price trip extras, upgrade bids, gate upgrades, booking-aware
recommendations, and ancillary revenue reporting. Prices are stored and returned in
integer US-dollar cents.

## Customer endpoints

`GET /api/v1/ancillary/catalog` is public. It accepts `cabinClass` and an optional
`airport`; lounge products are returned only when an airport is supplied.

The following endpoints require the standard bearer token and enforce booking
ownership when the booking has a wallet address:

- `POST /api/v1/ancillary/purchases` purchases a catalog item using `bookingId`,
  `serviceCode`, optional `quantity`, and optional `details`. Lounge purchases must
  include `details.airport`.
- `POST /api/v1/ancillary/upgrade-bids` creates a pending bid using `bookingId`,
  `targetClass`, and `bidCents`.
- `GET /api/v1/ancillary/recommendations/:bookingId` excludes services already
  purchased for the booking.

The server always resolves the price from its catalog. A caller cannot override a
catalog price in the request.

## Operational endpoints

These endpoints require admin authentication:

- `PATCH /api/v1/ancillary/upgrade-bids/:id` accepts or rejects a pending bid.
- `POST /api/v1/ancillary/gate-upgrades` immediately fulfils an upgrade for a paid
  or confirmed booking.
- `GET /api/v1/ancillary/revenue?from=<ISO>&to=<ISO>` reports recognised revenue
  by service type. Pending and rejected bids are excluded.

All date filters are ISO-8601 timestamps. If omitted, the revenue range covers all
records through the current time.

## Database migration

Run the standard backend migration command before using the endpoints:

```sh
npm run migration:run --workspace=packages/backend
```

The `ancillary_purchases` table is append-oriented except for the single transition
of an upgrade bid from `bid_pending` to either `bid_accepted` or `bid_rejected`.

## Provider environment capability matrix (#942)

The application-managed ancillary catalog is not the same thing as airline
fulfilment. The maintained provider matrix is in
`packages/backend/src/services/providerCapabilities.ts` and is covered by
`packages/backend/tests/services/providerCapabilities.test.ts`.

| Capability | Sandbox | Production |
| --- | --- | --- |
| Flight search | Repository fixtures; optional Amadeus test offers | Repository data with configured provider failover |
| Booking | Application/contract flow only; no authoritative airline ticket | Soroban booking submission; airline ticketing is outside this boundary |
| Catalog and pricing | Supported from deterministic application catalog | Supported from persisted application catalog |
| Airline ancillary fulfilment | Unsupported | Unsupported unless a future carrier adapter is explicitly configured |
| Status/gate data | Partial and may be absent | Partial; source, freshness, and conflicts must be checked |

Sandbox success must not be used as evidence of production airline
fulfilment. Missing provider fields are expected in both environments and must
remain explicit to callers rather than being converted into confirmed data.
