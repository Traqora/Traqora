"use client";

import { useOffline } from "@/components/offline-provider";
import { Wifi, WifiOff, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const { isOnline, hasPendingSyncs } = useOffline();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (isOnline && !hasPendingSyncs) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 z-40 ${
        isOnline
          ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
          : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      {isOnline ? (
        <>
          <AlertCircle className="w-4 h-4" />
          <span>Syncing offline changes...</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span>You are offline. Changes will sync when online.</span>
        </>
      )}
    </div>
  );
}

export function OnlineIndicator() {
  const { isOnline } = useOffline();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4 text-green-600" />
          <span className="text-green-600">Online</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-600" />
          <span className="text-red-600">Offline</span>
        </>
      )}
    </div>
  );
}
