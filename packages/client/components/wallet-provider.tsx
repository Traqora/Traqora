"use client"

import { useEffect, useState } from "react"
import { initializeWalletKit } from "@/lib/stellar-wallet-connect"
import { announce } from "@/lib/accessibility"

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<string>("initializing")

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        setStatus("connecting")
        await initializeWalletKit("testnet")
        if (!cancelled) {
          setStatus("connected")
        }
      } catch {
        if (!cancelled) {
          setStatus("error")
        }
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status === "connected") {
      announce("Wallet service initialized", "polite")
    } else if (status === "error") {
      announce("Wallet service failed to initialize", "assertive")
    }
  }, [status])

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {status === "connected" && "Wallet service ready"}
        {status === "error" && "Wallet connection error"}
      </div>
      {children}
    </>
  )
}