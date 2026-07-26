"use client";

import { useEffect, useState, useCallback } from "react";
import {
  addPendingSync,
  cacheBooking,
  clearPendingSyncs,
  getPendingSyncs,
  useOfflineStatus,
} from "@/lib/offline-storage";
import { apiClient, CreateBookingRequest } from "@/lib/api";

interface SyncOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  retryCount?: number;
}

/**
 * Hook to handle syncing of pending data when coming back online
 */
export function useOfflineSync(options: SyncOptions = {}) {
  const { isOnline } = useOfflineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);

  const syncPendingData = useCallback(async () => {
    if (isSyncing || !isOnline) {
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      const pendingSyncs = getPendingSyncs();

      if (pendingSyncs.length === 0) {
        setIsSyncing(false);
        return;
      }

      // Process syncs in order
      for (const sync of pendingSyncs) {
        try {
          if (sync.type === "booking") {
            // Implement booking sync logic
            await syncBooking(sync.data);
          } else if (sync.type === "itinerary") {
            // Implement itinerary sync logic
            await syncItinerary(sync.data);
          }
        } catch (error) {
          console.error(`Failed to sync ${sync.type}:`, error);
          if (options.onError) {
            options.onError(
              error instanceof Error ? error : new Error("Unknown sync error"),
            );
          }
          throw error;
        }
      }

      // Clear pending syncs on success
      clearPendingSyncs();

      if (options.onSuccess) {
        options.onSuccess();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Sync failed");
      setSyncError(err);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, options]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && !isSyncing) {
      const timer = setTimeout(() => {
        syncPendingData();
      }, 1000); // Delay 1s to allow network stabilization

      return () => clearTimeout(timer);
    }
  }, [isOnline, isSyncing, syncPendingData]);

  return { isSyncing, syncError, syncPendingData };
}

/**
 * Hook to add an offline request to sync queue
 */
export function useAddOfflineSync() {
  return useCallback((type: "booking" | "itinerary", data: unknown) => {
    addPendingSync(type, data);

    // Dispatch event to notify listeners
    window.dispatchEvent(
      new CustomEvent("offline:sync-added", {
        detail: { type, data },
      }),
    );
  }, []);
}

async function syncBooking(data: unknown): Promise<void> {
  const request = data as CreateBookingRequest & { idempotencyKey?: string };
  const response = await apiClient.createBooking(request, request.idempotencyKey);
  if (!response.success) {
    throw new Error(response.error?.message || "Failed to sync booking");
  }
}

async function syncItinerary(data: unknown): Promise<void> {
  const { bookingId } = data as { bookingId: string };
  const response = await apiClient.getTransactionStatus(bookingId);
  if (!response.success) {
    throw new Error(response.error?.message || "Failed to sync itinerary");
  }
  cacheBooking({
    id: bookingId,
    flightNumber: "",
    departureTime: "",
    arrivalTime: "",
    airline: "",
    from: "",
    to: "",
    passengers: 0,
    totalPrice: 0,
    bookingDate: new Date().toISOString(),
    status: response.data.bookingStatus === "confirmed" ? "confirmed" : "pending",
  });
}
