"use client";
import { useEffect } from "react";
import { useLoyaltyStore } from "@/lib/stores/loyalty";
import type { HistoryItem, HistoryHook } from "@/components/loyalty/PointsHistoryTable";

export function usePointsHistory(pageSize: number = 10): HistoryHook {
  const store = useLoyaltyStore()

  useEffect(() => {
    if (store.userId) {
      store.refreshHistory(store.historyPage)
    }
  }, [store.userId, store.historyPage])

  const setPage = (page: number) => {
    store.refreshHistory(page)
  }

  const refetch = () => {
    store.refreshHistory(store.historyPage)
  }

  return {
    items: store.transactions.map((t: any) => ({
      id: t.id || Math.random().toString(),
      date: t.timestamp || new Date().toISOString(),
      description: t.description || 'Transaction',
      points: t.points || 0
    })),
    page: store.historyPage,
    pageSize,
    total: store.historyTotal,
    loading: store.historyLoading,
    setPage,
    refetch
  };
}
