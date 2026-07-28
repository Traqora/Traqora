"use client";

import { useCallback, useEffect, useState } from "react";
import type { Flight } from "@/lib/api";

export interface CachedBooking {
  id: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  airline: string;
  from: string;
  to: string;
  passengers: number;
  totalPrice: number;
  bookingDate: string;
  status: "pending" | "confirmed" | "cancelled";
}

export interface CachedItinerary {
  bookingId: string;
  booking: CachedBooking;
  cachedAt: number;
}

export interface CachedSearchQuery {
  from: string;
  to: string;
  date: string;
  passengers: number;
  class: string;
}

export interface CachedSearchResult {
  key: string;
  query: CachedSearchQuery;
  flights: Flight[];
  cachedAt: number;
}

interface OfflineData {
  bookings: Record<string, CachedBooking>;
  itineraries: Record<string, CachedItinerary>;
  searches: Record<string, CachedSearchResult>;
  lastSyncTime: number;
  pendingSyncs: Array<{
    type: "booking" | "itinerary";
    data: unknown;
    timestamp: number;
  }>;
}

const STORAGE_KEY = "traqora_offline_data";
const OFFLINE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const SEARCH_CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour - flight prices/availability go stale fast

/**
 * Get the current offline data from localStorage
 */
export function getOfflineData(): OfflineData {
  if (typeof window === "undefined") {
    return getEmptyOfflineData();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return getEmptyOfflineData();
    }

    const parsed = JSON.parse(stored) as OfflineData;

    // Normalize data persisted before search caching was introduced
    if (!parsed.searches) {
      parsed.searches = {};
    }

    // Clean up expired data
    cleanupExpiredData(parsed);

    return parsed;
  } catch (error) {
    console.error("Failed to parse offline data:", error);
    return getEmptyOfflineData();
  }
}

/**
 * Save offline data to localStorage
 */
export function saveOfflineData(data: OfflineData): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save offline data:", error);
    // Attempt to clear some space and retry
    if (error instanceof Error && error.name === "QuotaExceededError") {
      clearOldestData();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (retryError) {
        console.error("Failed to save offline data after cleanup:", retryError);
      }
    }
  }
}

/**
 * Cache a booking for offline access
 */
export function cacheBooking(booking: CachedBooking): void {
  const data = getOfflineData();
  data.bookings[booking.id] = booking;
  data.lastSyncTime = Date.now();
  saveOfflineData(data);
}

/**
 * Cache multiple bookings
 */
export function cacheBookings(bookings: CachedBooking[]): void {
  const data = getOfflineData();
  bookings.forEach((booking) => {
    data.bookings[booking.id] = booking;
  });
  data.lastSyncTime = Date.now();
  saveOfflineData(data);
}

/**
 * Get cached booking by ID
 */
export function getCachedBooking(id: string): CachedBooking | null {
  const data = getOfflineData();
  return data.bookings[id] || null;
}

/**
 * Get all cached bookings
 */
export function getCachedBookings(): CachedBooking[] {
  const data = getOfflineData();
  return Object.values(data.bookings);
}

/**
 * Cache an itinerary for offline access
 */
export function cacheItinerary(
  bookingId: string,
  booking: CachedBooking,
): void {
  const data = getOfflineData();
  data.itineraries[bookingId] = {
    bookingId,
    booking,
    cachedAt: Date.now(),
  };
  saveOfflineData(data);
}

/**
 * Get cached itinerary by booking ID
 */
export function getCachedItinerary(bookingId: string): CachedItinerary | null {
  const data = getOfflineData();
  return data.itineraries[bookingId] || null;
}

/**
 * Get all cached itineraries
 */
export function getCachedItineraries(): CachedItinerary[] {
  const data = getOfflineData();
  return Object.values(data.itineraries);
}

/**
 * Build a stable cache key for a search query
 */
function buildSearchKey(query: CachedSearchQuery): string {
  return `${query.from.toUpperCase()}-${query.to.toUpperCase()}-${query.date}-${query.passengers}-${query.class}`;
}

/**
 * Cache flight search results for offline access
 */
export function cacheSearchResults(
  query: CachedSearchQuery,
  flights: Flight[],
): void {
  const data = getOfflineData();
  const key = buildSearchKey(query);
  data.searches[key] = { key, query, flights, cachedAt: Date.now() };
  saveOfflineData(data);
}

/**
 * Get cached search results for a query, if available and not expired
 */
export function getCachedSearchResults(
  query: CachedSearchQuery,
): CachedSearchResult | null {
  const data = getOfflineData();
  return data.searches[buildSearchKey(query)] || null;
}

/**
 * Get all cached search results
 */
export function getAllCachedSearches(): CachedSearchResult[] {
  const data = getOfflineData();
  return Object.values(data.searches);
}

/**
 * Clear all cached search results
 */
export function clearCachedSearchResults(): void {
  const data = getOfflineData();
  data.searches = {};
  saveOfflineData(data);
}

/**
 * Add a pending sync action
 */
export function addPendingSync(
  type: "booking" | "itinerary",
  data: unknown,
): void {
  const offlineData = getOfflineData();
  offlineData.pendingSyncs.push({
    type,
    data,
    timestamp: Date.now(),
  });
  saveOfflineData(offlineData);
}

/**
 * Get pending syncs
 */
export function getPendingSyncs() {
  const data = getOfflineData();
  return data.pendingSyncs;
}

/**
 * Clear pending syncs
 */
export function clearPendingSyncs(): void {
  const data = getOfflineData();
  data.pendingSyncs = [];
  saveOfflineData(data);
}

/**
 * Clear all offline data
 */
export function clearAllOfflineData(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear offline data:", error);
  }
}

/**
 * Hook to monitor offline/online status and sync data
 */
export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [hasPendingSyncs, setHasPendingSyncs] = useState(false);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);
    setHasPendingSyncs(getPendingSyncs().length > 0);

    const handleOnline = () => {
      setIsOnline(true);
      // Notify waiting for sync (can trigger parent to sync pending data)
      const pendingSyncs = getPendingSyncs();
      if (pendingSyncs.length > 0) {
        setHasPendingSyncs(true);
        // Dispatch custom event for global sync handling
        window.dispatchEvent(
          new CustomEvent("offline:sync-needed", {
            detail: { pendingSyncs },
          }),
        );
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, hasPendingSyncs, setHasPendingSyncs };
}

/**
 * Hook to check if a specific booking is cached
 */
export function useIsCachedBooking(bookingId: string) {
  const [isCached, setIsCached] = useState(false);

  useEffect(() => {
    const cached = getCachedBooking(bookingId);
    setIsCached(!!cached);
  }, [bookingId]);

  return isCached;
}

/**
 * Hook to load cached bookings
 */
export function useCachedBookings() {
  const [bookings, setBookings] = useState<CachedBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setBookings(getCachedBookings());
    setIsLoading(false);
  }, []);

  return { bookings, isLoading };
}

// Helper functions
function getEmptyOfflineData(): OfflineData {
  return {
    bookings: {},
    itineraries: {},
    searches: {},
    lastSyncTime: 0,
    pendingSyncs: [],
  };
}

function cleanupExpiredData(data: OfflineData): void {
  const now = Date.now();
  const hasChanges = false;

  // Remove expired itineraries
  for (const [key, itinerary] of Object.entries(data.itineraries)) {
    if (now - itinerary.cachedAt > OFFLINE_EXPIRY) {
      delete data.itineraries[key];
    }
  }

  // Remove expired search results
  for (const [key, search] of Object.entries(data.searches)) {
    if (now - search.cachedAt > SEARCH_CACHE_EXPIRY) {
      delete data.searches[key];
    }
  }

  // Remove pending syncs older than 24 hours
  data.pendingSyncs = data.pendingSyncs.filter(
    (sync) => now - sync.timestamp < 24 * 60 * 60 * 1000,
  );

  if (hasChanges) {
    saveOfflineData(data);
  }
}

function clearOldestData(): void {
  const data = getOfflineData();

  // Remove oldest 50% of bookings
  const bookingEntries = Object.entries(data.bookings);
  if (bookingEntries.length > 0) {
    const sortedByDate = bookingEntries.sort(
      ([, a], [, b]) =>
        new Date(a.bookingDate).getTime() - new Date(b.bookingDate).getTime(),
    );
    const removeCount = Math.ceil(sortedByDate.length / 2);
    sortedByDate.slice(0, removeCount).forEach(([key]) => {
      delete data.bookings[key];
    });
  }

  // Remove oldest 50% of itineraries
  const itineraryEntries = Object.entries(data.itineraries);
  if (itineraryEntries.length > 0) {
    const sortedByDate = itineraryEntries.sort(
      ([, a], [, b]) => a.cachedAt - b.cachedAt,
    );
    const removeCount = Math.ceil(sortedByDate.length / 2);
    sortedByDate.slice(0, removeCount).forEach(([key]) => {
      delete data.itineraries[key];
    });
  }

  // Remove oldest 50% of cached searches
  const searchEntries = Object.entries(data.searches);
  if (searchEntries.length > 0) {
    const sortedByDate = searchEntries.sort(
      ([, a], [, b]) => a.cachedAt - b.cachedAt,
    );
    const removeCount = Math.ceil(sortedByDate.length / 2);
    sortedByDate.slice(0, removeCount).forEach(([key]) => {
      delete data.searches[key];
    });
  }

  saveOfflineData(data);
}
