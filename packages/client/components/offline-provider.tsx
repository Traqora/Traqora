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
