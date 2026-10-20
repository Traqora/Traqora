import { useState, useEffect, useCallback } from 'react'
import { apiClient, CheckInRecord } from '../lib/api'
import {
  cacheCheckIn,
  getCachedCheckIn,
  CheckInCacheItem,
} from '../lib/offline-storage'

/**
 * Offline-aware check-in loader.
 *
 * Mirrors `useFlightStatusOffline`: it serves a cached check-in/boarding pass
 * immediately, short-circuits when the device is offline, and writes through
 * to the cache whenever fresh data is fetched.
 */
export function useCheckInOffline(bookingId: string) {
  const [checkIn, setCheckIn] = useState<CheckInRecord | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isFromCache, setIsFromCache] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCheckIn = useCallback(async () => {
    if (!bookingId) return
    setIsLoading(true)
    setError(null)

    const cached: CheckInCacheItem | null = getCachedCheckIn(bookingId)
    if (cached) {
      setCheckIn(cached.checkIn)
      setIsFromCache(true)
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsLoading(false)
      if (!cached) {
        setError('Device is offline and no cached boarding pass available for this booking.')
      }
      return
    }

    try {
      const response = await apiClient.getCheckIn(bookingId)
      if (response.success && response.data) {
        setCheckIn(response.data)
        setIsFromCache(false)
        cacheCheckIn(bookingId, response.data)
      } else if (!cached) {
        setError(response.error?.message || 'Failed to fetch check-in details')
      }
    } catch (err: any) {
      if (!cached) {
        setError(err.message || 'Network error while fetching check-in details')
      }
    } finally {
      setIsLoading(false)
    }
  }, [bookingId])

  /** Record a freshly completed check-in and persist it for offline viewing. */
  const applyCheckIn = useCallback(
    (record: CheckInRecord) => {
      setCheckIn(record)
      setIsFromCache(false)
      cacheCheckIn(bookingId, record)
    },
    [bookingId],
  )

  useEffect(() => {
    fetchCheckIn()
  }, [fetchCheckIn])

  return {
    checkIn,
    isLoading,
    isFromCache,
    error,
    refresh: fetchCheckIn,
    applyCheckIn,
  }
}
