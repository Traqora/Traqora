/**
 * Performance regression tests for the Dashboard page.
 * Measures render times with wallet data, booking history, and loyalty info.
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
    walletType: 'freighter',
    balance: '1000',
  }),
  useWallet: () => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnecting: false,
  }),
}))

jest.mock('@/lib/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = {
        isAuthenticated: true,
        accessToken: 'mock-token',
        biometric: { enabled: false, preferOverWallet: false, requireForPayments: false },
      }
      return selector ? selector(state) : state
    },
    { getState: () => ({}) }
  ),
}))

jest.mock('@/components/nav-wallet-button', () => ({
  NavWalletButton: () => React.createElement('div', { 'data-testid': 'nav-wallet' }, 'Wallet'),
}))

describe('DashboardPage Render Performance', () => {
  it('should render dashboard page within 150ms', async () => {
    const DashboardPage = require('@/app/dashboard/page').default

    const stats = await measureRender(() => {
      render(React.createElement(DashboardPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 150, maxMs: 300 })
  })

  it('should render dashboard page unauthenticated within 100ms', async () => {
    jest.mock('@/lib/auth-store', () => ({
      useAuthStore: Object.assign(
        (selector?: any) => {
          const state = {
            isAuthenticated: false,
            accessToken: null,
            biometric: { enabled: false, preferOverWallet: false, requireForPayments: false },
          }
          return selector ? selector(state) : state
        },
        { getState: () => ({}) }
      ),
    }))

    const DashboardPage = require('@/app/dashboard/page').default

    const stats = await measureRender(() => {
      render(React.createElement(DashboardPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })
})
