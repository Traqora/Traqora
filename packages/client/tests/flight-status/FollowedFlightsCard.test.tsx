import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FollowedFlightsCard } from '@/components/flight-status/FollowedFlightsCard'

const unsubscribeMock = jest.fn().mockResolvedValue(undefined)
let mockAlerts: any[] = []
let mockIsLoading = false

jest.mock('@/hooks/useFlightStatusAlerts', () => ({
  useFlightStatusAlerts: () => ({
    alerts: mockAlerts,
    isLoading: mockIsLoading,
    unsubscribe: unsubscribeMock,
  }),
}))

describe('FollowedFlightsCard (issue #332)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAlerts = []
    mockIsLoading = false
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({ data: { flightId: 'FL1', sampleSize: 4, onTimeCount: 3, disruptedCount: 1, onTimeRate: 0.75 } }),
        { status: 200 },
      ),
    ) as any
  })

  it('renders nothing while alerts are loading', () => {
    mockIsLoading = true
    const { container } = render(<FollowedFlightsCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an empty state when there are no followed flights', () => {
    render(<FollowedFlightsCard />)
    expect(screen.getByText(/not following any flights/i)).toBeInTheDocument()
  })

  it('lists each followed flight with its status badge and on-time performance', async () => {
    mockAlerts = [
      { id: 'a1', userId: 'u1', flightId: 'FL1', isActive: true, createdAt: new Date().toISOString(), lastStatus: 'delayed' },
    ]

    render(<FollowedFlightsCard />)

    expect(screen.getByText('FL1')).toBeInTheDocument()
    expect(screen.getByText('Delayed')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/On-time 75%/)).toBeInTheDocument()
    })
  })

  it('calls unsubscribe with the alert id when the remove button is clicked', async () => {
    mockAlerts = [
      { id: 'a1', userId: 'u1', flightId: 'FL1', isActive: true, createdAt: new Date().toISOString() },
    ]

    render(<FollowedFlightsCard />)
    fireEvent.click(screen.getByLabelText('Stop following flight FL1'))

    expect(unsubscribeMock).toHaveBeenCalledWith('a1')
  })

  it('falls back to a no-history message when the performance fetch fails', async () => {
    global.fetch = jest.fn(async () => new Response('', { status: 500 })) as any
    mockAlerts = [
      { id: 'a1', userId: 'u1', flightId: 'FL1', isActive: true, createdAt: new Date().toISOString() },
    ]

    render(<FollowedFlightsCard />)

    await waitFor(() => {
      expect(screen.getByText('No on-time performance history yet')).toBeInTheDocument()
    })
  })
})
