import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  JourneyTripPlanner,
  validateMultiCitySegments,
} from '@/components/journey/journey-trip-planner'
import { apiClient, type MultiCityItinerary } from '@/lib/api'

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}))
import { toast } from 'sonner'

const toastMock = toast as unknown as { error: jest.Mock; success: jest.Mock; info: jest.Mock }

function itinerary(): MultiCityItinerary {
  return {
    segments: [
      {
        segment: { origin: 'JFK', destination: 'LHR', date: '2026-09-01', passengers: 1 },
        flights: [],
        bestFlight: {
          id: 'f1',
          from: 'JFK',
          to: 'LHR',
          departure_time: '2026-09-01T08:00:00Z',
          airline: 'Delta',
          stops: 0,
          duration: 360,
          price: 420,
          rating: 4.5,
          available_seats: 5,
          class: 'economy',
          flightNumber: 'DL 1',
          airlineCode: 'DL',
        },
      },
      {
        segment: { origin: 'LHR', destination: 'CDG', date: '2026-09-05', passengers: 1 },
        flights: [],
        bestFlight: null,
      },
    ],
    totalPrice: 420,
    totalDuration: 360,
    isOpenJaw: false,
  }
}

describe('Journey planner multi-city UI (issue #663)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the default two legs and prevents removing below the minimum', () => {
    render(<JourneyTripPlanner />)

    expect(screen.getByText('Leg 1')).toBeInTheDocument()
    expect(screen.getByText('Leg 2')).toBeInTheDocument()
    expect(screen.queryByText('Leg 3')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove leg 1/i })).toBeDisabled()
  })

  it('adds legs up to the maximum of five', () => {
    render(<JourneyTripPlanner />)

    const addButton = screen.getByRole('button', { name: /add leg/i })
    fireEvent.click(addButton)
    fireEvent.click(addButton)
    fireEvent.click(addButton)

    expect(screen.getByText('Leg 5')).toBeInTheDocument()
    expect(addButton).toBeDisabled()
  })

  it('blocks submission and shows an error for an invalid airport code', async () => {
    const spy = jest.spyOn(apiClient, 'searchMultiCity')
    render(<JourneyTripPlanner />)

    fireEvent.change(screen.getByLabelText('Origin', { selector: '#origin-0' }), {
      target: { value: 'J' },
    })
    fireEvent.click(screen.getByRole('button', { name: /search combined itinerary/i }))

    await waitFor(() => {
      expect(screen.getByText(/origin must be a 3-letter airport code/i)).toBeInTheDocument()
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('submits a valid multi-city request and renders the itinerary results', async () => {
    const spy = jest
      .spyOn(apiClient, 'searchMultiCity')
      .mockResolvedValue({ success: true, data: itinerary() })

    render(<JourneyTripPlanner />)
    fireEvent.click(screen.getByRole('button', { name: /search combined itinerary/i }))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1)
    })

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        passengers: 1,
        sortBy: 'total_price',
        sortOrder: 'asc',
      }),
    )
    expect(spy.mock.calls[0][0].segments).toHaveLength(2)

    expect(await screen.findByText('Itinerary Results')).toBeInTheDocument()
    expect(screen.getAllByText('$420').length).toBeGreaterThan(0)
  })

  it('surfaces the API error when the search fails', async () => {
    jest
      .spyOn(apiClient, 'searchMultiCity')
      .mockResolvedValue({ success: false, error: { message: 'No routes available' } })

    render(<JourneyTripPlanner />)
    fireEvent.click(screen.getByRole('button', { name: /search combined itinerary/i }))

    await waitFor(() => {
      expect(screen.getByText('No routes available')).toBeInTheDocument()
    })
  })
})

describe('validateMultiCitySegments (issue #663)', () => {
  const valid = [
    { origin: 'JFK', destination: 'LHR', date: '2026-09-01', passengers: 1 },
    { origin: 'LHR', destination: 'CDG', date: '2026-09-05', passengers: 1 },
  ]

  it('accepts a valid itinerary', () => {
    expect(validateMultiCitySegments(valid)).toBeNull()
  })

  it('rejects out-of-order dates', () => {
    expect(
      validateMultiCitySegments([
        valid[0],
        { ...valid[1], date: '2026-08-01' },
      ]),
    ).toMatch(/cannot be before leg 1/i)
  })

  it('rejects identical origin and destination', () => {
    expect(
      validateMultiCitySegments([
        { ...valid[0], destination: 'JFK' },
        valid[1],
      ]),
    ).toMatch(/must be different/i)
  })
})
