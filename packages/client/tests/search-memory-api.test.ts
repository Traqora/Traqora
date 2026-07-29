import { apiClient } from '../lib/api'

describe('search memory api client', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('traqora-auth', JSON.stringify({ state: { accessToken: 'test-token' } }))
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('loads search history', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'history-1',
            userId: 'GSEARCHUSER123',
            fromAirport: 'JFK',
            toAirport: 'LAX',
            departureDate: '2026-09-01',
            passengers: 2,
            cabinClass: 'economy',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    })

    const response = await apiClient.getSearchHistory()
    expect(response.success).toBe(true)
    if (response.success) {
      expect(response.data[0].fromAirport).toBe('JFK')
    }
  })

  it('creates a saved search', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'saved-1',
          userId: 'GSEARCHUSER123',
          name: 'Test search',
          fromAirport: 'JFK',
          toAirport: 'SEA',
          departureDate: '2026-10-02',
          passengers: 1,
          cabinClass: 'business',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    })

    const response = await apiClient.createSavedSearch({
      name: 'Test search',
      from: 'JFK',
      to: 'SEA',
      date: '2026-10-02',
      passengers: 1,
      class: 'business',
    })

    expect(response.success).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/flights/saved-searches'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })
})
