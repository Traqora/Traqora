import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { computeFareBreakdown, DEFAULT_TAX_RATE } from '@/lib/pricing/fare-breakdown'
import { FareBreakdown } from '@/components/booking/fare-breakdown'
import { BookingSummary } from '@/components/booking/booking-summary'

const items = [
  { key: 'seat', label: 'Seat Selection (12A)', amountCents: 2500 },
  { key: 'baggage', label: 'Baggage (1)', amountCents: 3999 },
]

describe('computeFareBreakdown', () => {
  it('computes base fare, line items, taxes and total in USD minor units', () => {
    const result = computeFareBreakdown({ baseFarePerPassenger: '450', passengerCount: 2, items })
    if (!result.ok) throw new Error('expected ok')

    expect(result.currency).toBe('USD')
    expect(result.unitBaseFare).toEqual({ minor: 45000, value: 450 })
    expect(result.baseFare).toEqual({ minor: 90000, value: 900 })
    expect(result.lines.map((l) => l.amount.minor)).toEqual([2500, 3999])
    expect(result.subtotal.minor).toBe(96499)
    expect(result.taxRate).toBe(DEFAULT_TAX_RATE)
    expect(result.taxes.minor).toBe(7720) // round(96499 * 0.08)
    expect(result.total.minor).toBe(104219)
  })

  it('keeps lines summing exactly to the total after currency conversion', () => {
    const result = computeFareBreakdown({
      baseFarePerPassenger: 199.99,
      passengerCount: 3,
      items: [{ key: 'meals', label: 'Meals (3)', amountCents: 1333 }],
      displayCurrency: 'EUR',
      rates: { EUR: 0.9137 },
    })
    if (!result.ok) throw new Error('expected ok')

    const lineSum = result.baseFare.minor + result.lines.reduce((s, l) => s + l.amount.minor, 0)
    expect(lineSum).toBe(result.subtotal.minor)
    expect(result.subtotal.minor + result.taxes.minor).toBe(result.total.minor)
    expect(result.baseFare.minor).toBe(result.unitBaseFare.minor * 3)
    expect(Number.isInteger(result.total.minor)).toBe(true)
  })

  it('uses the display currency minor unit (JPY has no decimals)', () => {
    const result = computeFareBreakdown({
      baseFarePerPassenger: '100',
      passengerCount: 1,
      displayCurrency: 'JPY',
      rates: { JPY: 149.5 },
      taxRate: 0,
    })
    if (!result.ok) throw new Error('expected ok')
    expect(result.total).toEqual({ minor: 14950, value: 14950 })
  })

  it('fails instead of mislabelling USD amounts when the exchange rate is missing', () => {
    const result = computeFareBreakdown({ baseFarePerPassenger: '450', passengerCount: 1, displayCurrency: 'EUR' })
    expect(result).toEqual({
      ok: false,
      currency: 'EUR',
      error: { code: 'MISSING_EXCHANGE_RATE', message: 'No exchange rate available for EUR' },
    })
  })

  it.each([
    [{ baseFarePerPassenger: '$450' }, 'INVALID_BASE_FARE'],
    [{ baseFarePerPassenger: 'abc' }, 'INVALID_BASE_FARE'],
    [{ baseFarePerPassenger: -5 }, 'INVALID_BASE_FARE'],
    [{ baseFarePerPassenger: Number.NaN }, 'INVALID_BASE_FARE'],
    [{ passengerCount: 0 }, 'INVALID_PASSENGER_COUNT'],
    [{ passengerCount: 1.5 }, 'INVALID_PASSENGER_COUNT'],
    [{ taxRate: 1.2 }, 'INVALID_TAX_RATE'],
    [{ items: [{ key: 'x', label: 'Bad', amountCents: -100 }] }, 'INVALID_LINE_ITEM'],
    [{ items: [{ key: 'x', label: 'Bad', amountCents: 10.5 }] }, 'INVALID_LINE_ITEM'],
    [{ displayCurrency: 'EUR', rates: { EUR: 0 } }, 'MISSING_EXCHANGE_RATE'],
  ])('rejects %p with %s', (overrides, code) => {
    const result = computeFareBreakdown({ baseFarePerPassenger: '450', passengerCount: 1, ...(overrides as object) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })
})

describe('<FareBreakdown />', () => {
  it('renders each line and taxes', () => {
    const breakdown = computeFareBreakdown({ baseFarePerPassenger: '450', passengerCount: 2, items })
    render(<FareBreakdown breakdown={breakdown} />)

    expect(screen.getByText('Base Fare (2 × $450.00)')).toBeInTheDocument()
    expect(screen.getByText('$900.00')).toBeInTheDocument()
    expect(screen.getByText('Seat Selection (12A)')).toBeInTheDocument()
    expect(screen.getByText('$39.99')).toBeInTheDocument()
    expect(screen.getByText('$77.20')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders an alert instead of NaN for invalid input', () => {
    const breakdown = computeFareBreakdown({ baseFarePerPassenger: 'N/A', passengerCount: 1 })
    render(<FareBreakdown breakdown={breakdown} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Price unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('Base fare must be a non-negative number')
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })
})

describe('<BookingSummary /> fare integration', () => {
  const flight = {
    id: 'f1',
    airline: 'Traqora Air',
    logo: '/logo.png',
    flightNumber: 'TQ101',
    from: 'LOS',
    to: 'ACC',
    fromCity: 'Lagos',
    toCity: 'Accra',
    departure: '09:00',
    arrival: '10:00',
    date: '2026-10-01',
    duration: '1h',
    stops: 'Non-stop',
    price: '450',
    currency: 'USD',
    class: 'Economy',
    aircraft: 'A320',
  }

  it('shows the computed total', () => {
    render(<BookingSummary flight={flight} passengerCount={1} selectedSeat={{ id: '12A', price: 25 }} />)
    // (450 + 25) * 1.08 = 513.00
    expect(screen.getByTestId('fare-total')).toHaveTextContent('$513.00')
  })

  it('shows a placeholder total when the display currency has no rate', () => {
    render(<BookingSummary flight={flight} passengerCount={1} displayCurrency="EUR" rates={{}} />)
    expect(screen.getByTestId('fare-total')).toHaveTextContent('—')
    expect(screen.getByRole('alert')).toHaveTextContent('No exchange rate available for EUR')
  })
})
