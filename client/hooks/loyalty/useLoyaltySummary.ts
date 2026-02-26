"use client";
import { useEffect, useRef, useState } from "react";
import type { LoyaltySummary } from "@/components/loyalty/LoyaltySummaryCard";

export function useLoyaltySummary() {
  const [data, setData] = useState<LoyaltySummary | undefined>();
  const [isLoading, setLoading] = useState(true);
  const prevTier = useRef<string | undefined>();
  const [upgradeCelebration, setUpgradeCelebration] = useState(false);

  async function fetchSummary() {
    setLoading(true);
    try {
      const res = await fetch('/api/loyalty/summary', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData(json);
      if (prevTier.current && json?.tier && prevTier.current !== json.tier) {
        setUpgradeCelebration(true);
        // reset celebration flag after firing once
        setTimeout(() => setUpgradeCelebration(false), 2000);
      }
      prevTier.current = json?.tier;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSummary();
    const id = setInterval(fetchSummary, 30_000);
    return () => clearInterval(id);
  }, []);

  return { data, isLoading, refresh: fetchSummary, upgradeCelebration } as const;
}
