import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import NotificationCenterPage from '@/app/notifications/page'
import { API_BASE_URL } from '@/lib/api'

jest.mock('@/components/socket/SocketProvider', () => ({
  useSocket: () => ({ manager: null, connected: false }),
}))

const NOTIFICATION = {
  id: 'n-1',
  userId: 'user-1',
  category: 'booking',
  title: 'Booking confirmed',
  body: 'Your booking TRAQ-123 was confirmed on the blockchain.',
  read: false,
  createdAt: new Date().toISOString(),
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetchRouter() {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchMock = jest.fn(async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url
    calls.push({ url, init })
    const method = (init?.method || 'GET').toUpperCase()

    if (url.endsWith('/notifications/inbox')) {
      return jsonResponse({ userId: 'user-1', notifications: [NOTIFICATION], total: 1 })
    }
    if (url.endsWith('/notifications/stats')) {
      return jsonResponse({ total: 1, read: 0, unread: 1, byCategory: { booking: 1 } })
    }
    if (url.endsWith('/notifications/preferences') && method === 'GET') {
      return jsonResponse({ userId: 'user-1', preferences: [], total: 0 })
    }
    if (url.endsWith('/notifications/preferences') && method === 'PUT') {
      return jsonResponse({ preference: {}, message: 'Preference updated successfully' })
    }
    return jsonResponse({})
  })
  global.fetch = fetchMock as any
  return { fetchMock, calls }
}

function authHeaderOf(calls: Array<{ url: string; init?: RequestInit }>, predicate: (url: string, method: string) => boolean) {
  const call = calls.find((c) =>
    predicate(c.url, (c.init?.method || 'GET').toUpperCase()),
  )
  const headers = (call?.init?.headers || {}) as Record<string, string>
  return headers.Authorization
}

function openPreferencesTab() {
  const tab = screen.getByRole('tab', { name: /preferences/i })
  // Radix Tabs activate on mousedown (button 0)
  fireEvent.mouseDown(tab, { button: 0 })
  fireEvent.click(tab)
}

describe('Notification center preferences (issue #668)', () => {
  beforeEach(() => {
    window.localStorage.setItem(
      'traqora-auth',
      JSON.stringify({ state: { accessToken: 'test-token' } }),
    )
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('renders the notification body text (not the message field)', async () => {
    mockFetchRouter()

    render(<NotificationCenterPage />)

    expect(
      await screen.findByText(/Your booking TRAQ-123 was confirmed on the blockchain\./),
    ).toBeInTheDocument()
  })

  it('loads preferences from the versioned API URL with an auth header', async () => {
    const { calls } = mockFetchRouter()

    render(<NotificationCenterPage />)
    openPreferencesTab()

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === `${API_BASE_URL}/api/v1/notifications/preferences` &&
            (c.init?.method || 'GET').toUpperCase() === 'GET',
        ),
      ).toBe(true)
    })

    expect(
      authHeaderOf(
        calls,
        (url, method) =>
          url === `${API_BASE_URL}/api/v1/notifications/preferences` && method === 'GET',
      ),
    ).toBe('Bearer test-token')

    // The preference matrix renders even before/without server data
    expect(await screen.findByText('Notification Preferences')).toBeInTheDocument()
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0)
  })

  it('saves a toggled preference via PUT to the versioned API URL', async () => {
    const { calls } = mockFetchRouter()

    render(<NotificationCenterPage />)
    openPreferencesTab()

    const switches = await screen.findAllByRole('switch')
    fireEvent.click(switches[0])

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.url === `${API_BASE_URL}/api/v1/notifications/preferences` &&
            (c.init?.method || 'GET').toUpperCase() === 'PUT',
        ),
      ).toBe(true)
    })

    const putCall = calls.find(
      (c) =>
        c.url === `${API_BASE_URL}/api/v1/notifications/preferences` &&
        (c.init?.method || 'GET').toUpperCase() === 'PUT',
    )
    expect(JSON.parse(putCall!.init!.body as string)).toEqual({
      channel: 'email',
      category: 'booking',
      frequency: 'instant',
      enabled: false,
    })
    expect(authHeaderOf(calls, (_url, method) => method === 'PUT')).toBe(
      'Bearer test-token',
    )
  })
})
