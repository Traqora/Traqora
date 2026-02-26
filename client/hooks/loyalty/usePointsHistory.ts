"use client";
import { useEffect, useState } from "react";
import type { HistoryItem, HistoryHook } from "@/components/loyalty/PointsHistoryTable";

export function usePointsHistory(pageSize: number = 10): HistoryHook {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function fetchPage(p = page) {
    setLoading(true);
    try {
      const res = await fetch(`/api/loyalty/history?page=${p}&pageSize=${pageSize}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load history');
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total || 0);
    } catch (e) {
      console.error(e);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  return { items, page, pageSize, total, loading, setPage, refetch: () => fetchPage(page) };
}
