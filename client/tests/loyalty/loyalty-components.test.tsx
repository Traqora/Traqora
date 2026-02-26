import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TierProgress } from '@/components/loyalty/TierProgress'
import { PointsHistoryTable } from '@/components/loyalty/PointsHistoryTable'
import { RedeemPointsForm } from '@/components/loyalty/RedeemPointsForm'

// Mock use-toast used by RedeemPointsForm
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }))

// Mock fetch for redemption
global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.includes('/api/loyalty/redeem')) {
    return new Response(JSON.stringify({ newPoints: 900, redeemed: true }), { status: 200 }) as any
  }
  return new Response(JSON.stringify({}), { status: 200 }) as any
}) as any

describe('Loyalty components', () => {
  test('TierProgress displays correct percentage', () => {
    render(<TierProgress summary={{ tier: 'Silver', points: 500, nextTier: 'Gold', progressPct: 65, benefits: [] }} />)
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  test('PointsHistoryTable paginates', () => {
    const history = {
      items: [
        { id: '1', date: new Date().toISOString(), description: 'Flight A', points: 100 },
      ],
      page: 1,
      pageSize: 10,
      total: 30,
      loading: false,
      setPage: jest.fn(),
      refetch: jest.fn(),
    }
    render(<PointsHistoryTable history={history as any} />)
    fireEvent.click(screen.getByText('Next'))
    expect(history.setPage).toHaveBeenCalledWith(2)
  })

  test('RedeemPointsForm performs optimistic redemption', async () => {
    const onRefetch = jest.fn()
    render(<RedeemPointsForm points={1000} onRedeemedOptimistic={onRefetch} />)
    const input = screen.getByPlaceholderText('Enter points to redeem') as HTMLInputElement
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.click(screen.getByText('Redeem'))
    await waitFor(() => expect(onRefetch).toHaveBeenCalled())
  })
})
