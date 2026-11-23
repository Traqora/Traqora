# Fare Breakdown Component

The booking summary on `/book/[id]` shows a **Price Breakdown** and a **Total Amount**. Both
come from one pure function, so the amounts on screen always add up.

- Calculation: `lib/pricing/fare-breakdown.ts` → `computeFareBreakdown(input)`
- Component: `components/booking/fare-breakdown.tsx` → `<FareBreakdown breakdown={result} />`
- Used by: `components/booking/booking-summary.tsx`

## Inputs

| Field | Type | Rules |
|-------|------|-------|
| `baseFarePerPassenger` | `string \| number` (USD) | A plain non-negative number, such as `"450"` or `450.5`. Strings with symbols like `"$450"` are rejected |
| `passengerCount` | `number` | A whole number, 1 or more |
| `items` | `{ key, label, amountCents }[]` | Optional. `amountCents` is **USD cents** and must be a whole number, 0 or more. Components may add an `icon` |
| `taxRate` | `number` | Optional, between 0 and 1. Default `0.08` |
| `displayCurrency` | `CurrencyCode` | Optional. Default `USD` |
| `rates` | `Record<string, number>` | USD → currency exchange rates. **Required** for any currency other than USD, and the rate must be greater than 0 |

## Output

On success, `{ ok: true, currency, passengerCount, unitBaseFare, baseFare, lines, subtotal, taxRate, taxes, total }`.
Every amount has this shape: `{ minor, value }`.

- `minor` is a whole number in the display currency's smallest unit, using `decimalPlaces` from
  `lib/currency.ts`. For example, JPY has no decimals and USD has 2.
- `value` is `minor / 10^decimals`. Pass it to `formatCurrency`.

How the amounts are calculated:

1. Each amount is converted to the display currency and rounded to its smallest unit **line by line**.
2. `baseFare = unitBaseFare × passengerCount`. The base fare label therefore always matches its line.
3. `subtotal = baseFare + Σ lines`
4. `taxes = round(subtotal × taxRate)`
5. `total = subtotal + taxes`

This means the rendered lines always add up exactly to `total`. There are no one-cent differences.

## Error cases

If the input is invalid, the function returns `{ ok: false, currency, error: { code, message } }`.
The component then shows a **"Price unavailable"** `role="alert"` box, and the booking summary
shows `—` for the total. It never shows `NaN`, and it never shows USD amounts under another
currency's label.

| `code` | Cause |
|--------|-------|
| `MISSING_EXCHANGE_RATE` | The display currency is not USD and `rates[currency]` is missing, 0 or negative |
| `INVALID_BASE_FARE` | The base fare is not a plain non-negative number, for example `"$450"`, `"N/A"`, a negative value or `NaN` |
| `INVALID_PASSENGER_COUNT` | The passenger count is less than 1 or not a whole number |
| `INVALID_TAX_RATE` | The tax rate is outside `[0, 1]` |
| `INVALID_LINE_ITEM` | An item's `amountCents` is negative or not a whole number |

## Behavior changes from the previous breakdown

- Before, amounts were calculated in floating-point dollars, and a malformed `flight.price`
  rendered `NaN` everywhere.
- Before, a missing exchange rate fell back to `1`. That showed USD amounts labelled as the
  selected currency.
- Before, rounding happened only at display time, so the lines could differ from the total by a cent.

## Example

```tsx
const breakdown = computeFareBreakdown({
  baseFarePerPassenger: flight.price,
  passengerCount: 2,
  items: [{ key: "seat", label: "Seat Selection (12A)", amountCents: 2500 }],
  displayCurrency: "EUR",
  rates: { EUR: 0.92 },
})

<FareBreakdown breakdown={breakdown} />
```

## Tests

```bash
npm run test -- tests/pricing/fare-breakdown.test.tsx
```
