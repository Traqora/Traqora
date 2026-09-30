/**
 * Performance regression tests for the Check-in page.
 * Measures render times for check-in form and boarding pass states.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { measureRender, assertRenderThresholds } from './perf-utils'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

describe('CheckinPage Render Performance', () => {
  it('should render check-in page within 100ms', async () => {
    const CheckinPage = require('@/app/checkin/page').default

    const stats = await measureRender(() => {
      render(React.createElement(CheckinPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })
})
