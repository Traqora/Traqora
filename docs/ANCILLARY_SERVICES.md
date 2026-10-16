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
