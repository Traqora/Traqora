/**
 * Performance regression tests for the Auth page.
 * Measures render times for the auth page component tree.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { measureRender, assertRenderThresholds } from './perf-utils'

// Mock all external dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/lib/use-auth', () => ({
  useAuth: () => ({
    authenticate: jest.fn().mockResolvedValue(true),
    isAuthenticating: false,
    canAuthenticate: true,
    isAuthenticated: false,
  }),
}))

jest.mock('@/lib/stellar-wallet-connect', () => ({
  useWalletStore: () => ({
    isConnected: false,
    address: null,
    walletType: null,
  }),
  useWallet: () => ({}),
}))

jest.mock('@/lib/auth', () => ({
  AuthService: {
    getEnrolledBiometrics: jest.fn().mockResolvedValue([]),
    registerBiometric: jest.fn(),
    authenticateBiometric: jest.fn(),
    removeBiometric: jest.fn(),
  },
  getBiometricPlatformType: () => 'unknown' as const,
}))

jest.mock('@/lib/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
      const state = {
        isAuthenticated: false,
        accessToken: null,
        refreshToken: null,
        biometric: { enabled: false, preferOverWallet: false, requireForPayments: false },
        setTokens: jest.fn(),
        clearTokens: jest.fn(),
        setBiometric: jest.fn(),
        resetBiometric: jest.fn(),
      }
      return selector ? selector(state) : state
    },
    { getState: () => ({ setTokens: jest.fn() }) }
  ),
}))

jest.mock('@/lib/api', () => ({
  api: {
    post: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }),
  },
  API_BASE_URL: 'http://localhost:3000',
}))

describe('AuthPage Render Performance', () => {
  it('should render auth page within 100ms', async () => {
    const AuthPage = require('@/app/auth/page').default

    const stats = await measureRender(() => {
      render(React.createElement(AuthPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })

  it('should render auth page with wallet connected within 100ms', async () => {
    // Override mocks for connected state
    jest.mock('@/lib/stellar-wallet-connect', () => ({
      useWalletStore: () => ({
        isConnected: true,
        address: 'GABCDEF1234567890123456789012345678901234567890123456',
        walletType: 'freighter',
      }),
    }))

    jest.mock('@/lib/use-auth', () => ({
      useAuth: () => ({
        authenticate: jest.fn().mockResolvedValue(true),
        isAuthenticating: false,
        canAuthenticate: true,
        isAuthenticated: true,
      }),
    }))

    jest.mock('@/lib/auth-store', () => ({
      useAuthStore: Object.assign(
        (selector?: any) => {
          const state = {
            isAuthenticated: true,
            accessToken: 'mock-token',
            biometric: { enabled: true, preferOverWallet: false, requireForPayments: false },
            setTokens: jest.fn(),
            clearTokens: jest.fn(),
            setBiometric: jest.fn(),
          }
          return selector ? selector(state) : state
        },
        { getState: () => ({ setTokens: jest.fn() }) }
      ),
    }))

    const AuthPage = require('@/app/auth/page').default

    const stats = await measureRender(() => {
      render(React.createElement(AuthPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })
})
