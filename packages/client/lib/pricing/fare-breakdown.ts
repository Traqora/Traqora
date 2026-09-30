/**
 * Fare breakdown calculation — issue #767.
 *
 * Pure, integer-based pricing used by the booking fare breakdown UI. See docs/FARE_BREAKDOWN.md.
 *
 * Inputs are in USD (base fare per passenger in major units, line items in cents). Every amount is
 * converted to the display currency and rounded to that currency's minor unit *per line*, so the
 * rendered lines always add up exactly to the subtotal and total.
 *
 * Invalid input never produces NaN or a mislabelled currency: it returns `{ ok: false, error }`.
 */

import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency"

export const DEFAULT_TAX_RATE = 0.08

export interface FareLineItemInput {
  key: string
  label: string
  /** Amount in USD cents. Must be a non-negative integer. */
  amountCents: number
}

export interface FareBreakdownInput<T extends FareLineItemInput = FareLineItemInput> {
  /** Base fare per passenger in USD, e.g. "450" or 450.5. */
  baseFarePerPassenger: string | number
  passengerCount: number
  items?: T[]
  /** Fraction between 0 and 1. Defaults to DEFAULT_TAX_RATE. */
  taxRate?: number
  displayCurrency?: CurrencyCode
  /** USD → currency rates. Required for any display currency other than USD. */
  rates?: Record<string, number>
}

export interface FareAmount {
  /** Integer amount in the display currency's minor unit. */
  minor: number
  /** Major-unit amount, ready for formatCurrency. */
  value: number
}

export type FareBreakdownLine<T extends FareLineItemInput = FareLineItemInput> = T & { amount: FareAmount }

export type FareBreakdownErrorCode =
  | "INVALID_BASE_FARE"
  | "INVALID_PASSENGER_COUNT"
  | "INVALID_LINE_ITEM"
  | "INVALID_TAX_RATE"
  | "MISSING_EXCHANGE_RATE"

export interface FareBreakdownSuccess<T extends FareLineItemInput = FareLineItemInput> {
  ok: true
  currency: CurrencyCode
  passengerCount: number
  unitBaseFare: FareAmount
  baseFare: FareAmount
  lines: FareBreakdownLine<T>[]
  subtotal: FareAmount
  taxRate: number
  taxes: FareAmount
  total: FareAmount
}

export interface FareBreakdownFailure {
  ok: false
  currency: CurrencyCode
  error: { code: FareBreakdownErrorCode; message: string }
}

export type FareBreakdownResult<T extends FareLineItemInput = FareLineItemInput> =
  | FareBreakdownSuccess<T>
  | FareBreakdownFailure

const PRICE_PATTERN = /^\d+(\.\d+)?$/

function parseBaseFare(raw: string | number): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null
  const value = String(raw ?? "").trim()
  return PRICE_PATTERN.test(value) ? Number(value) : null
}

export function computeFareBreakdown<T extends FareLineItemInput>(
  input: FareBreakdownInput<T>,
): FareBreakdownResult<T> {
  const currency = input.displayCurrency ?? "USD"
  const fail = (code: FareBreakdownErrorCode, message: string): FareBreakdownFailure => ({
    ok: false,
    currency,
    error: { code, message },
  })

  const rate = currency === "USD" ? 1 : input.rates?.[currency]
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return fail("MISSING_EXCHANGE_RATE", `No exchange rate available for ${currency}`)
  }

  const unitUsd = parseBaseFare(input.baseFarePerPassenger)
  if (unitUsd === null) {
    return fail("INVALID_BASE_FARE", "Base fare must be a non-negative number")
  }

  if (!Number.isInteger(input.passengerCount) || input.passengerCount < 1) {
    return fail("INVALID_PASSENGER_COUNT", "Passenger count must be a whole number of at least 1")
  }

  const taxRate = input.taxRate ?? DEFAULT_TAX_RATE
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    return fail("INVALID_TAX_RATE", "Tax rate must be between 0 and 1")
  }

  const items = input.items ?? []
  const badItem = items.find((item) => !Number.isInteger(item.amountCents) || item.amountCents < 0)
  if (badItem) {
    return fail("INVALID_LINE_ITEM", `Line item "${badItem.label}" must be a non-negative whole number of cents`)
  }

  const factor = 10 ** (SUPPORTED_CURRENCIES[currency]?.decimalPlaces ?? 2)
  const toMinor = (usd: number) => Math.round(usd * rate * factor)
  const amount = (minor: number): FareAmount => ({ minor, value: minor / factor })

  const unitMinor = toMinor(unitUsd)
  const baseMinor = unitMinor * input.passengerCount
  const lines = items.map((item) => ({ ...item, amount: amount(toMinor(item.amountCents / 100)) }))
  const subtotalMinor = lines.reduce((sum, line) => sum + line.amount.minor, baseMinor)
  const taxesMinor = Math.round(subtotalMinor * taxRate)

  return {
    ok: true,
    currency,
    passengerCount: input.passengerCount,
    unitBaseFare: amount(unitMinor),
    baseFare: amount(baseMinor),
    lines,
    subtotal: amount(subtotalMinor),
    taxRate,
    taxes: amount(taxesMinor),
    total: amount(subtotalMinor + taxesMinor),
  }
}
