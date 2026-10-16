"use client"

import React from 'react'
import { useSocket } from './socket/SocketProvider'

export function ConnectionIndicator() {
  const { connected } = useSocket()

  return (
    <div
      className="fixed top-4 right-4 z-50"
      role="status"
      aria-live="polite"
      aria-label={connected ? 'Connected to server' : 'Connecting to server'}
    >
      <div className="flex items-center gap-2 bg-white/80 dark:bg-black/60 p-2 rounded-md shadow">
        <span
          className={`h-3 w-3 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`}
          aria-hidden="true"
        />
        <span className="text-sm">{connected ? 'Connected' : 'Connecting'}</span>
      </div>
    </div>
  )
}