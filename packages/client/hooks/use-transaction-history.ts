"use client"

import { useCallback, useEffect, useState } from "react"
import { apiClient, TransactionRecord } from "@/lib/api"
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
