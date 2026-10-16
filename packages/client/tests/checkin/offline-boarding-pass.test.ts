import { renderHook, act } from '@testing-library/react'
import { useCheckInOffline } from '../../hooks/use-check-in-offline'
import { apiClient, CheckInRecord } from '../../lib/api'
import { cacheCheckIn, clearAllOfflineData, getCachedCheckIn } from '../../lib/offline-storage'

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  })
}

function record(overrides: Partial<CheckInRecord> = {}): CheckInRecord {
  return {
    id: 'ci-1',
    status: 'checked_in',
    seatNumber: '12A',
    boardingPassCode: 'BP-ABC123',
    checkedInAt: '2026-09-01T10:00:00Z',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

describe('Offline boarding-pass cache & hook (issue #665)', () => {
  beforeEach(() => {
    clearAllOfflineData()
    setOnline(true)
    jest.restoreAllMocks()
  })

  it('caches the check-in record and boarding pass when online', async () => {
    jest
      .spyOn(apiClient, 'getCheckIn')
      .mockResolvedValue({ success: true, data: record() } as any)

    const { result } = renderHook(() => useCheckInOffline('booking-1'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.checkIn?.boardingPassCode).toBe('BP-ABC123')
    expect(result.current.isFromCache).toBe(false)
    expect(getCachedCheckIn('booking-1')?.checkIn.boardingPassCode).toBe('BP-ABC123')
  })

  it('serves the cached boarding pass offline without calling the API', async () => {
    cacheCheckIn('booking-1', record({ seatNumber: '7C', boardingPassCode: 'BP-CACHED' }))
    setOnline(false)
    const apiSpy = jest.spyOn(apiClient, 'getCheckIn')

    const { result } = renderHook(() => useCheckInOffline('booking-1'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(apiSpy).not.toHaveBeenCalled()
    expect(result.current.checkIn?.boardingPassCode).toBe('BP-CACHED')
    expect(result.current.checkIn?.seatNumber).toBe('7C')
    expect(result.current.isFromCache).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('surfaces an error when offline with no cached boarding pass', async () => {
    setOnline(false)
    const apiSpy = jest.spyOn(apiClient, 'getCheckIn')

    const { result } = renderHook(() => useCheckInOffline('booking-unknown'))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(apiSpy).not.toHaveBeenCalled()
    expect(result.current.checkIn).toBeNull()
    expect(result.current.error).toMatch(/offline/i)
  })

  it('persists a completed check-in via applyCheckIn for later offline viewing', async () => {
    const { result } = renderHook(() => useCheckInOffline('booking-2'))

    await act(async () => {
      result.current.applyCheckIn(record({ boardingPassCode: 'BP-APPLIED' }))
    })

    expect(result.current.checkIn?.boardingPassCode).toBe('BP-APPLIED')
    expect(getCachedCheckIn('booking-2')?.checkIn.boardingPassCode).toBe('BP-APPLIED')
  })
})
