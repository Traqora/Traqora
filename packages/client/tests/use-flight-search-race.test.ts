import { renderHook, act } from '@testing-library/react'
import { useFlightSearch } from '../hooks/use-flight-search'
import { apiClient, Flight } from '../lib/api'
import { clearCachedSearchResults } from '../lib/offline-storage'

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}))

jest.mock('@/hooks/use-socket', () => ({
  useSocket: () => ({ manager: null, connected: false }),
}))

function flight(id: string): Flight {
  return {
    id,
    from: 'JFK',
    to: 'LAX',
    departure_time: '2026-08-01T10:00:00Z',
    airline: 'Delta',
    stops: 0,
    duration: 300,
    price: 199,
    rating: 4.5,
    available_seats: 12,
    class: 'economy',
  }
}

const requestA = { from: 'jfk', to: 'lax', date: '2026-08-01', passengers: 1, class: 'economy' as const }
const requestB = { from: 'sfo', to: 'nrt', date: '2026-09-15', passengers: 2, class: 'business' as const }

describe('useFlightSearch request ordering (issue #672)', () => {
  beforeEach(() => {
    // clearAllOfflineData misses the "traqora_offline_data" blob that backs the
    // search cache, so clear the search cache explicitly for test isolation.
    clearCachedSearchResults()
    jest.restoreAllMocks()
  })

  it('happy path: the most recent search wins when both resolve', async () => {
    jest
      .spyOn(apiClient, 'searchFlights')
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: [flight('old')] }) as any, 50)))
      .mockResolvedValueOnce({ success: true, data: [flight('new')] } as any)

    const { result } = renderHook(() => useFlightSearch())

    await act(async () => {
      const first = result.current.searchFlights(requestA)
      const second = result.current.searchFlights(requestB)
      await Promise.all([first, second])
    })

    expect(result.current.flights.map((f) => f.id)).toEqual(['new'])
  })

  it('failure mode: a superseded slow response must not overwrite the newer failure state or surface a stale loading flag', async () => {
    jest
      .spyOn(apiClient, 'searchFlights')
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ success: true, data: [flight('stale')] }) as any, 50)))
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: false, error: { message: 'network failure' } }) as any, 10)),
      )

    const { result } = renderHook(() => useFlightSearch())

    await act(async () => {
      const first = result.current.searchFlights(requestA)
      const second = result.current.searchFlights(requestB)
      await Promise.all([first, second])
    })

    // The newer request failed with no cache for its query, so results are empty;
    // the superseded slow success from the first query must NOT overwrite them.
    expect(result.current.flights).toEqual([])
    expect(result.current.error).toBe('network failure')
    expect(result.current.isLoading).toBe(false)
  })
})
