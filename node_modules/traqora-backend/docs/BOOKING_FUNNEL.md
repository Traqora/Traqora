# Search → Book → Pay Funnel

`GET /api/v1/admin/analytics/funnel` shows how many searches turn into bookings, and how many
bookings turn into successful payments, over a time window.

- Service: `src/services/analytics/bookingFunnelService.ts`
- Route: `src/api/routes/admin/analytics.ts`. It uses the same admin auth as the other analytics
  routes: `requireAdmin` plus the `admin` role.

## Inputs

| Query param | Type     | Default          | Rules |
|-------------|----------|------------------|-------|
| `from`      | ISO date | `to` minus 30 days | Inclusive |
| `to`        | ISO date | now              | Exclusive. `from` must be earlier than `to`. The window can be at most 366 days |

## Stages

Each stage is counted separately, by `createdAt`, within `[from, to)`:

| Key      | Source | Counted when |
|----------|--------|--------------|
| `search` | `search_history_entries` | Every recorded search |
| `book`   | `bookings` | Every booking, whatever its status |
| `pay`    | `bookings` | `status` is `paid`, `onchain_pending`, `onchain_submitted`, `confirmed`, `refunded` or `refund_rejected`, which are the statuses that come after a successful payment |

`created`, `awaiting_payment`, `payment_processing` and `failed` bookings are counted as booked
but **not** paid.

## Output

```json
{
  "success": true,
  "data": {
    "window": { "from": "2026-08-26T12:00:00.000Z", "to": "2026-09-25T12:00:00.000Z" },
    "stages": [
      { "key": "search", "count": 1000, "conversionFromPrevious": 100,  "dropOffFromPrevious": 0 },
      { "key": "book",   "count": 200,  "conversionFromPrevious": 20,   "dropOffFromPrevious": 80 },
      { "key": "pay",    "count": 150,  "conversionFromPrevious": 75,   "dropOffFromPrevious": 25 }
    ],
    "overallConversionRate": 15
  }
}
```

- Rates are percentages rounded to one decimal place.
- If the previous stage has a count of 0, the rate is `null`. The endpoint never divides by zero.
- `overallConversionRate` is `pay / search`.
- Searches are recorded only for signed-in users, so bookings can outnumber searches. In that
  case the rate is reported as calculated and can go above 100. It is not capped.

## Error cases

| Case | Response |
|------|----------|
| `from` or `to` is not a parseable date | `400` `Validation Error` |
| `from >= to` | `400` `from must be before to` |
| The window is longer than 366 days | `400` `Funnel window may not exceed 366 days` |
| Missing or invalid admin credentials | `401` |
| Non-admin role (for example `support`) | `403` |

## Example

```bash
curl -H 'X-Admin-Api-Key: <key>' \
  'http://localhost:3001/api/v1/admin/analytics/funnel?from=2026-09-01T00:00:00Z&to=2026-09-08T00:00:00Z'
```

## Tests

```bash
npm run test -- tests/services/analytics/bookingFunnelService.test.ts tests/admin-analytics-funnel.integration.test.ts
```

The old `src/analytics/funnel.js` returns hard-coded royalty-distribution sample data. Nothing
uses it, and this endpoint does not use it either.
