"use client"

import { WifiOff, RefreshCw } from "lucide-react"
import { useOffline } from "@/components/offline-provider"
import { useOfflineSync } from "@/lib/use-offline-sync"

export function OfflineBanner() {
  const { isOnline, hasPendingSyncs } = useOffline()
  const { isSyncing } = useOfflineSync()

  if (isOnline && !hasPendingSyncs) {
    return null
  }

  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg ${
        isOnline ? "bg-amber-500 text-white" : "bg-slate-900 text-white"
      }`}
    >
      {isOnline ? (
        <>
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          <span>{isSyncing ? "Syncing your bookings..." : "Pending changes will sync shortly"}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You're offline — showing cached bookings and search results</span>
        </>
      )}
    </div>
  )
}
