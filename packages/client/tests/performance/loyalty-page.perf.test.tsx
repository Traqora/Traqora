/**
 * Performance regression tests for the Loyalty page.
 * Measures render times for loyalty dashboard with points, tiers, and history.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { measureRender, assertRenderThresholds } from './perf-utils'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/lib/stellar-wallet-connect', () => ({
  useWalletStore: () => ({
    isConnected: true,
    address: 'GABCDEF1234567890123456789012345678901234567890123456',
    balance: '5000',
  }),
}))

jest.mock('@/lib/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = { isAuthenticated: true, accessToken: 'mock-token' }
      return selector ? selector(state) : state
    },
    { getState: () => ({}) }
  ),
}))

jest.mock('@/hooks/use-loyalty', () => ({
  useLoyalty: () => ({
    points: 12500,
    tier: 'gold' as const,
    nextTier: 'platinum' as const,
    pointsToNextTier: 2500,
    history: Array.from({ length: 20 }, (_, i) => ({
      id: `tx-${i}`,
      type: i % 2 === 0 ? 'earn' : 'burn',
      points: i % 2 === 0 ? 500 + i * 100 : -200 - i * 50,
      description: i % 2 === 0 ? 'Flight booking bonus' : 'Upgrade redemption',
      date: new Date(2026, 6, 15 - i).toISOString(),
    })),
    isLoading: false,
  }),
}))

describe('LoyaltyPage Render Performance', () => {
  it('should render loyalty page with points data within 150ms', async () => {
    const LoyaltyPage = require('@/app/loyalty/page').default

    const stats = await measureRender(() => {
      render(React.createElement(LoyaltyPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 150, maxMs: 300 })
  })

  it('should render loyalty page loading state within 100ms', async () => {
    jest.mock('@/hooks/use-loyalty', () => ({
      useLoyalty: () => ({
        points: 0,
        tier: 'bronze' as const,
        nextTier: 'silver' as const,
        pointsToNextTier: 5000,
        history: [],
        isLoading: true,
      }),
    }))

    const LoyaltyPage = require('@/app/loyalty/page').default

    const stats = await measureRender(() => {
      render(React.createElement(LoyaltyPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })
})
