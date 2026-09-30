import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '../lib/api'
import { cacheFlightStatus, getCachedFlightStatus, FlightStatusCacheItem } from '../lib/offline-storage'

export function useFlightStatusOffline(flightId: string) {
  const [status, setStatus] = useState<FlightStatusCacheItem | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isFromCache, setIsFromCache] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const cached = getCachedFlightStatus(flightId)
    if (cached) {
      setStatus(cached)
      setIsFromCache(true)
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsLoading(false)
      if (!cached) {
        setError('Device is offline and no cached status available for this flight.')
      }
      return
    }

    try {
      const response = await apiClient.getFlightStatus(flightId)
      if (response && response.success && response.data) {
        const liveData: FlightStatusCacheItem = {
          flightId,
          status: response.data.status,
          departure_time: response.data.departure_time,
          arrival_time: response.data.arrival_time,
          airline: response.data.airline,
          from: response.data.from,
          to: response.data.to,
          updatedAt: new Date().toISOString(),
        }
        setStatus(liveData)
        setIsFromCache(false)
        cacheFlightStatus(flightId, liveData)
      } else if (!cached) {
        setError(response.error?.message || 'Failed to fetch flight status')
      }
    } catch (err: any) {
      if (!cached) {
        setError(err.message || 'Network error while fetching flight status')
      }
    } finally {
      setIsLoading(false)
    }
  }, [flightId])

  useEffect(() => {
    if (flightId) {
      fetchStatus()
    }
  }, [flightId, fetchStatus])

  return {
    status,
    isLoading,
    isFromCache,
    error,
    refreshStatus: fetchStatus,
  }
}
