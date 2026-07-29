"use client"

import { useCallback, useEffect, useState } from "react"
import { apiClient, TransactionRecord } from "@/lib/api"
import { cacheItinerary, type CachedBooking } from "@/lib/offline-storage"
import { useSocketEvents } from "./use-socket-events"
import { useWalletStore } from "@/lib/stellar-wallet-connect"

export function useTransactionHistory(limit = 20) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { address } = useWalletStore()

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true)
    const response = await apiClient.listTransactions(limit)
    if (response.success) {
      setTransactions(response.data)
      setError(null)
      response.data.forEach((tx) => {
        const cached: CachedBooking = {
          id: tx.bookingId,
          flightNumber: "",
          departureTime: "",
          arrivalTime: "",
          airline: "",
          from: "",
          to: "",
          passengers: 0,
          totalPrice: 0,
          bookingDate: tx.updatedAt,
          status: tx.bookingStatus === "confirmed" ? "confirmed" : tx.bookingStatus === "failed" ? "cancelled" : "pending",
        }
        cacheItinerary(tx.bookingId, cached)
      })
    } else {
      setError(response.error?.message || "Failed to load transactions")
    }
    setIsLoading(false)
  }, [limit])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  useSocketEvents({
    walletAddress: address || undefined,
    onBookingStatus: () => {
      fetchTransactions()
    },
  })

  return { transactions, isLoading, error, refetch: fetchTransactions }
}
