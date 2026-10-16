import { renderHook, act, waitFor } from '@testing-library/react'
import { useFlightSearch } from '../hooks/use-flight-search'
import { apiClient, Flight } from '../lib/api'
import { cacheSearchResults, clearAllOfflineData, getCachedSearchResults } from '../lib/offline-storage'

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}))

jest.mock('@/hooks/use-socket', () => ({
  useSocket: () => ({ manager: null, connected: false }),
}))

const params = { from: 'jfk', to: 'lax', date: '2026-08-01', passengers: 1, class: 'economy' as const }

const flights: Flight[] = [
  {
    id: 'FL-1',
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
  },
]

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  })
}

describe('useFlightSearch offline fallback', () => {
  beforeEach(() => {
    clearAllOfflineData()
    setOnline(true)
    jest.restoreAllMocks()
  })

  it('caches results on a successful search', async () => {
    jest.spyOn(apiClient, 'searchFlights').mockResolvedValue({ success: true, data: flights } as any)

    const { result } = renderHook(() => useFlightSearch())

    await act(async () => {
      await result.current.searchFlights(params)
    })

    expect(result.current.flights).toEqual(flights)
    expect(result.current.isFromCache).toBe(false)
    expect(getCachedSearchResults(params)?.flights).toEqual(flights)
  })

  it('falls back to cached results when the network request fails', async () => {
    cacheSearchResults(params, flights)
    jest.spyOn(apiClient, 'searchFlights').mockResolvedValue({
      success: false,
      error: { message: 'Network error' },
    } as any)

    const { result } = renderHook(() => useFlightSearch())

    await act(async () => {
      await result.current.searchFlights(params)
    })

    expect(result.current.flights).toEqual(flights)
    expect(result.current.isFromCache).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('surfaces an error when the network request fails and there is no cache', async () => {
    jest.spyOn(apiClient, 'searchFlights').mockResolvedValue({
      success: false,
      error: { message: 'Network error' },
    } as any)

    const { result } = renderHook(() => useFlightSearch())

    await act(async () => {
      await result.current.searchFlights(params)
    })

    expect(result.current.flights).toEqual([])
    expect(result.current.isFromCache).toBe(false)
    expect(result.current.error).toBe('Network error')
  })

  it('serves cached results immediately when offline, without calling the API', async () => {
    cacheSearchResults(params, flights)
    setOnline(false)
    const searchSpy = jest.spyOn(apiClient, 'searchFlights')

    const { result } = renderHook(() => useFlightSearch())

    await act(async () => {
      await result.current.searchFlights(params)
    })

    expect(searchSpy).not.toHaveBeenCalled()
    expect(result.current.flights).toEqual(flights)
    expect(result.current.isFromCache).toBe(true)
  })

  it('reports an offline error when there is no cache to fall back to', async () => {
    setOnline(false)
    const searchSpy = jest.spyOn(apiClient, 'searchFlights')

    const { result } = renderHook(() => useFlightSearch())

    await act(async () => {
      await result.current.searchFlights(params)
    })

    expect(searchSpy).not.toHaveBeenCalled()
    expect(result.current.flights).toEqual([])
    expect(result.current.isFromCache).toBe(false)
    expect(result.current.error).toMatch(/offline/i)
  })
})
