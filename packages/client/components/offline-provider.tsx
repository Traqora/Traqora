"use client";

import {
  useEffect,
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { useOfflineStatus } from "@/lib/offline-storage";

interface OfflineContextType {
  isOnline: boolean;
  isServiceWorkerReady: boolean;
  hasPendingSyncs: boolean;
  setHasPendingSyncs: (value: boolean) => void;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { isOnline, hasPendingSyncs, setHasPendingSyncs } = useOfflineStatus();
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    registerServiceWorker();

    // Listen for service worker updates
    let registration: ServiceWorkerRegistration | null = null;

    async function registerServiceWorker() {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        setIsServiceWorkerReady(true);

        // Check for updates periodically (every hour)
        const updateInterval = setInterval(
          () => {
            registration?.update().catch((error) => {
              console.warn(
                "Failed to check for service worker updates:",
                error,
              );
            });
          },
          60 * 60 * 1000,
        );

        // Listen for controller change (new service worker activated)
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          console.log("Service worker updated");
          // Optionally notify user about update
          window.dispatchEvent(new CustomEvent("offline:sw-updated"));
        });

        // Handle messages from service worker
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data.type === "OFFLINE_STATUS") {
            console.log("Offline status update:", event.data.isOffline);
          }
        });

        return () => clearInterval(updateInterval);
      } catch (error) {
        console.error("Failed to register service worker:", error);
        setIsServiceWorkerReady(false);
      }
    }

    const handleSync = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const syncs = customEvent.detail.pendingSyncs;
      if (!syncs || syncs.length === 0) return;

      console.log("Processing pending syncs...");
      const { clearPendingSyncs } = await import("@/lib/offline-storage");
      const { apiClient } = await import("@/lib/api");

      for (const sync of syncs) {
        try {
          if (sync.type === "booking") {
             // Basic retry logic, could be expanded
             if (sync.data.bookingId && sync.data.signedXdr) {
               await apiClient.submitSignedTransaction(sync.data.bookingId, sync.data.signedXdr);
             } else {
               await apiClient.createBooking(sync.data);
             }
          }
        } catch (err) {
          console.error("Failed to sync pending action", err);
        }
      }
      clearPendingSyncs();
      setHasPendingSyncs(false);
      
      const { toast } = await import("sonner");
      toast.success("Offline data synced", {
        description: "Your pending actions have been processed.",
      });
    };

    window.addEventListener("offline:sync-needed", handleSync);

    return () => {
      window.removeEventListener("offline:sync-needed", handleSync);
    }
  }, []);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isServiceWorkerReady,
        hasPendingSyncs,
        setHasPendingSyncs,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOffline must be used within OfflineProvider");
  }
  return context;
}
