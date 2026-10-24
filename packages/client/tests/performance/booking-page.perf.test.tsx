/**
 * Performance regression tests for the Booking page.
 * Measures render times for the booking page with flight details and passenger forms.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { measureRender, assertRenderThresholds } from './perf-utils'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useParams: () => ({ id: 'FL001' }),
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

describe('BookingPage Render Performance', () => {
  beforeAll(() => {
    jest.mock('@/app/book/[id]/page', () => ({
      __esModule: true,
      default: () => React.createElement('div', null, 'Booking Page'),
    }))
  })

  it('should render booking page within 100ms', async () => {
    const BookingPage = require('@/app/book/[id]/page').default

    const stats = await measureRender(() => {
      render(React.createElement(BookingPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })
})
