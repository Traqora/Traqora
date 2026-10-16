/**
 * Performance regression tests for the Payment page.
 * Measures render times for payment form, processing, and confirmation states.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { measureRender, assertRenderThresholds } from './perf-utils'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ id: 'booking-123' }),
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

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn().mockResolvedValue({ ok: true }) },
}))

describe('PaymentPage Render Performance', () => {
  it('should render payment page within 100ms', async () => {
    const PaymentPage = require('@/app/payment/[id]/page').default || require('@/app/payment/page').default

    const stats = await measureRender(() => {
      render(React.createElement(PaymentPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })
})
