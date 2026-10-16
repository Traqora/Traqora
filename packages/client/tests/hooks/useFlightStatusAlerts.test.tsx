import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useFlightStatusAlerts } from '@/hooks/useFlightStatusAlerts'

const toastMock = jest.fn()
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

const subscribeFlightMock = jest.fn()
const unsubscribeFlightMock = jest.fn()
jest.mock('@/components/socket/SocketProvider', () => ({
  useSocket: () => ({
    manager: {
      subscribeFlight: subscribeFlightMock,
      unsubscribeFlight: unsubscribeFlightMock,
    },
    connected: true,
  }),
}))

let capturedOnFlightStatus: ((data: any) => void) | undefined
jest.mock('@/hooks/use-socket-events', () => ({
  useSocketEvents: (opts: any) => {
    capturedOnFlightStatus = opts.onFlightStatus
  },
}))

const mockAlert = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'alert-1',
  userId: 'user-1',
  flightId: 'FL123',
  isActive: true,
  createdAt: new Date().toISOString(),
  ...overrides,
})

describe('useFlightStatusAlerts real-time WS wiring (issue #333)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ data: [mockAlert()] }), { status: 200 }),
    ) as any
  })

  it('subscribes to the flight room for each active alert after loading', async () => {
    renderHook(() => useFlightStatusAlerts())

    await waitFor(() => {
      expect(subscribeFlightMock).toHaveBeenCalledWith('FL123')
    })
  })

  it('unsubscribes from a flight room once its alert is removed', async () => {
    const { result, rerender } = renderHook(() => useFlightStatusAlerts())

    await waitFor(() => expect(subscribeFlightMock).toHaveBeenCalledWith('FL123'))

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as any

    await act(async () => {
      await result.current.unsubscribe('alert-1')
    })
    rerender()

    await waitFor(() => expect(unsubscribeFlightMock).toHaveBeenCalledWith('FL123'))
  })

  it('updates the matching alert and shows a toast when a flight_status event arrives', async () => {
    const { result } = renderHook(() => useFlightStatusAlerts())

    await waitFor(() => expect(result.current.alerts).toHaveLength(1))
    expect(capturedOnFlightStatus).toBeDefined()

    act(() => {
      capturedOnFlightStatus!({
        flightId: 'FL123',
        status: 'DELAYED',
        detail: 'New departure 14:30',
        timestamp: new Date('2026-08-01T12:00:00Z'),
      })
    })

    await waitFor(() => {
      expect(result.current.alerts[0].lastStatus).toBe('DELAYED')
    })
    expect(result.current.alerts[0].lastNotifiedAt).toBe('2026-08-01T12:00:00.000Z')
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Flight FL123 status update' }),
    )
  })

  it('ignores a flight_status event for a flight with no active alert', async () => {
    const { result } = renderHook(() => useFlightStatusAlerts())
    await waitFor(() => expect(result.current.alerts).toHaveLength(1))

    act(() => {
      capturedOnFlightStatus!({
        flightId: 'UNRELATED',
        status: 'CANCELLED',
        timestamp: new Date(),
      })
    })

    expect(toastMock).not.toHaveBeenCalled()
    expect(result.current.alerts[0].lastStatus).toBeUndefined()
  })

  it('unsubscribes every tracked flight room on unmount', async () => {
    const { unmount } = renderHook(() => useFlightStatusAlerts())

    await waitFor(() => expect(subscribeFlightMock).toHaveBeenCalledWith('FL123'))

    unmount()

    expect(unsubscribeFlightMock).toHaveBeenCalledWith('FL123')
  })
})
