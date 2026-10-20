import { renderHook, act } from '@testing-library/react'
import { useFlightStatusOffline } from '../../hooks/use-flight-status-offline'
import { apiClient } from '../../lib/api'
import { cacheFlightStatus, clearAllOfflineData, getCachedFlightStatus } from '../../lib/offline-storage'

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  })
}

describe('Offline flight-status cache & hook (issue #mobile-offline-status)', () => {
  beforeEach(() => {
    clearAllOfflineData()
    setOnline(true)
    jest.restoreAllMocks()
  })

  it('caches flight status successfully when online', async () => {
    const mockData = {
      flightId: 'FL-999',
      status: 'scheduled',
      departure_time: '2026-09-01T12:00:00Z',
      airline: 'StellarAir',
    }
    jest.spyOn(apiClient, 'getFlightStatus').mockResolvedValue({ success: true, data: mockData } as any)

    const { result } = renderHook(() => useFlightStatusOffline('FL-999'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.status?.status).toBe('scheduled')
    expect(result.current.isFromCache).toBe(false)
    expect(getCachedFlightStatus('FL-999')?.status).toBe('scheduled')
  })

  it('falls back to local cache when offline', async () => {
    const cachedData = {
      flightId: 'FL-999',
      status: 'delayed',
      departure_time: '2026-09-01T12:00:00Z',
      updatedAt: new Date().toISOString(),
    }
    cacheFlightStatus('FL-999', cachedData)
    setOnline(false)
    const apiSpy = jest.spyOn(apiClient, 'getFlightStatus')

    const { result } = renderHook(() => useFlightStatusOffline('FL-999'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(apiSpy).not.toHaveBeenCalled()
    expect(result.current.status?.status).toBe('delayed')
    expect(result.current.isFromCache).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('surfaces error when offline and no cache exists', async () => {
    setOnline(false)
    const apiSpy = jest.spyOn(apiClient, 'getFlightStatus')

    const { result } = renderHook(() => useFlightStatusOffline('FL-UNKNOWN'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(apiSpy).not.toHaveBeenCalled()
    expect(result.current.status).toBeNull()
    expect(result.current.error).toMatch(/offline/i)
  })
})
