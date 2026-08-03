/**
 * Performance regression tests for the Journey page.
 * Measures render times for journey planner with itineraries.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { measureRender, assertRenderThresholds } from './perf-utils'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/lib/stellar-wallet-connect', () => ({
  useWalletStore: () => ({
    isConnected: true,
    address: 'GABCDEF1234567890123456789012345678901234567890123456',
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

describe('JourneyPage Render Performance', () => {
  it('should render journey page within 150ms', async () => {
    const JourneyPage = require('@/app/journey/page').default

    const stats = await measureRender(() => {
      render(React.createElement(JourneyPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 150, maxMs: 300 })
  })
})
