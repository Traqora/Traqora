import {
  cacheBooking,
  cacheBookings,
  getCachedBooking,
  getCachedBookings,
  cacheItinerary,
  getCachedItinerary,
  getCachedItineraries,
  cacheSearchResults,
  getCachedSearchResults,
  getAllCachedSearches,
  clearCachedSearchResults,
  addPendingSync,
  getPendingSyncs,
  clearPendingSyncs,
  clearAllOfflineData,
  getOfflineData,
  CachedBooking,
} from '../lib/offline-storage'
import type { Flight } from '../lib/api'

const booking: CachedBooking = {
  id: 'BOOKING-1',
  flightNumber: 'BA123',
  departureTime: '2026-08-01T10:00:00Z',
  arrivalTime: '2026-08-01T14:00:00Z',
  airline: 'British Airways',
  from: 'LHR',
  to: 'JFK',
  passengers: 2,
  totalPrice: 450,
  bookingDate: '2026-07-20',
  status: 'confirmed',
}

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

const query = { from: 'jfk', to: 'lax', date: '2026-08-01', passengers: 1, class: 'economy' }

describe('offline-storage: bookings', () => {
  beforeEach(() => {
    clearAllOfflineData()
  })

  it('caches and retrieves a single booking', () => {
    cacheBooking(booking)
    expect(getCachedBooking('BOOKING-1')).toEqual(booking)
  })

  it('returns null for a booking that was never cached', () => {
    expect(getCachedBooking('does-not-exist')).toBeNull()
  })

  it('caches multiple bookings at once', () => {
    const second: CachedBooking = { ...booking, id: 'BOOKING-2' }
    cacheBookings([booking, second])
    expect(getCachedBookings().map((b) => b.id).sort()).toEqual(['BOOKING-1', 'BOOKING-2'])
  })
})

describe('offline-storage: itineraries', () => {
  beforeEach(() => {
    clearAllOfflineData()
  })

  it('caches and retrieves an itinerary with a cachedAt timestamp', () => {
    cacheItinerary('BOOKING-1', booking)
    const itinerary = getCachedItinerary('BOOKING-1')
    expect(itinerary?.booking).toEqual(booking)
    expect(typeof itinerary?.cachedAt).toBe('number')
  })

  it('lists all cached itineraries', () => {
    cacheItinerary('BOOKING-1', booking)
    cacheItinerary('BOOKING-2', { ...booking, id: 'BOOKING-2' })
    expect(getCachedItineraries()).toHaveLength(2)
  })
})

describe('offline-storage: search results', () => {
  beforeEach(() => {
    clearAllOfflineData()
    jest.restoreAllMocks()
  })

  it('returns null when no search has been cached for a query', () => {
    expect(getCachedSearchResults(query)).toBeNull()
  })

  it('caches and retrieves search results for a query', () => {
    cacheSearchResults(query, flights)
    const cached = getCachedSearchResults(query)
    expect(cached?.flights).toEqual(flights)
    expect(cached?.query).toEqual(query)
  })

  it('is case-insensitive on airport codes when matching a cached query', () => {
    cacheSearchResults(query, flights)
    const cached = getCachedSearchResults({ ...query, from: 'JFK', to: 'LAX' })
    expect(cached?.flights).toEqual(flights)
  })

  it('treats a different date as a distinct cache entry', () => {
    cacheSearchResults(query, flights)
    expect(getCachedSearchResults({ ...query, date: '2026-08-02' })).toBeNull()
  })

  it('lists all cached searches', () => {
    cacheSearchResults(query, flights)
    cacheSearchResults({ ...query, to: 'SEA' }, flights)
    expect(getAllCachedSearches()).toHaveLength(2)
  })

  it('clears all cached search results', () => {
    cacheSearchResults(query, flights)
    clearCachedSearchResults()
    expect(getCachedSearchResults(query)).toBeNull()
    expect(getAllCachedSearches()).toHaveLength(0)
  })

  it('expires cached search results after the search TTL', () => {
    const realNow = Date.now
    let now = realNow()
    jest.spyOn(Date, 'now').mockImplementation(() => now)

    cacheSearchResults(query, flights)
    expect(getCachedSearchResults(query)).not.toBeNull()

    // Advance beyond the 1 hour search cache expiry
    now += 61 * 60 * 1000
    expect(getCachedSearchResults(query)).toBeNull()
  })

  it('does not expire booking/itinerary caches when only the shorter search TTL has elapsed', () => {
    const realNow = Date.now
    let now = realNow()
    jest.spyOn(Date, 'now').mockImplementation(() => now)

    cacheSearchResults(query, flights)
    cacheItinerary('BOOKING-1', booking)

    now += 61 * 60 * 1000 // past search TTL, well within the 7 day booking TTL

    expect(getCachedSearchResults(query)).toBeNull()
    expect(getCachedItinerary('BOOKING-1')).not.toBeNull()
  })

  it('normalizes data persisted before search caching existed', () => {
    // Simulate a pre-existing localStorage payload without a `searches` key
    localStorage.setItem(
      'traqora_offline_data',
      JSON.stringify({
        bookings: { 'BOOKING-1': booking },
        itineraries: {},
        lastSyncTime: 0,
        pendingSyncs: [],
      }),
    )

    expect(getCachedSearchResults(query)).toBeNull()
    cacheSearchResults(query, flights)
    expect(getCachedSearchResults(query)?.flights).toEqual(flights)
    // Pre-existing data should survive the migration
    expect(getCachedBooking('BOOKING-1')).toEqual(booking)
  })
})

describe('offline-storage: pending syncs', () => {
  beforeEach(() => {
    clearAllOfflineData()
  })

  it('adds and retrieves pending syncs', () => {
    addPendingSync('booking', { id: 'BOOKING-1' })
    const syncs = getPendingSyncs()
    expect(syncs).toHaveLength(1)
    expect(syncs[0].type).toBe('booking')
  })

  it('clears pending syncs', () => {
    addPendingSync('booking', { id: 'BOOKING-1' })
    clearPendingSyncs()
    expect(getPendingSyncs()).toHaveLength(0)
  })
})

describe('offline-storage: storage quota handling', () => {
  beforeEach(() => {
    clearAllOfflineData()
    jest.restoreAllMocks()
  })

  it('trims the oldest cached searches and retries when storage quota is exceeded', () => {
    cacheSearchResults(query, flights)
    cacheSearchResults({ ...query, to: 'SEA' }, flights)

    const realSetItem = Storage.prototype.setItem.bind(localStorage)
    let calls = 0
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      calls += 1
      if (calls === 1) {
        const err = new Error('quota exceeded')
        err.name = 'QuotaExceededError'
        throw err
      }
      realSetItem(key, value)
    })

    expect(() => cacheSearchResults({ ...query, to: 'ORD' }, flights)).not.toThrow()

    // Quota recovery kicks in (clearOldestData runs) and the write is retried
    // rather than the exception propagating up to the caller.
    expect(calls).toBeGreaterThan(1)
    expect(getCachedSearchResults({ ...query, to: 'ORD' })?.flights).toEqual(flights)
  })
})

describe('offline-storage: getOfflineData defaults', () => {
  beforeEach(() => {
    clearAllOfflineData()
  })

  it('returns an empty shape with a searches map when nothing is cached', () => {
    const data = getOfflineData()
    expect(data.searches).toEqual({})
    expect(data.bookings).toEqual({})
    expect(data.itineraries).toEqual({})
    expect(data.pendingSyncs).toEqual([])
  })
})
