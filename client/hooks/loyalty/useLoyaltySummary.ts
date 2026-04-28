"use client";
import { useEffect, useRef, useState } from "react";
import { useLoyaltyStore } from "@/lib/stores/loyalty";

export function useLoyaltySummary() {
  const store = useLoyaltyStore()
  const prevTier = useRef<string | undefined>();
  const [upgradeCelebration, setUpgradeCelebration] = useState(false);

  useEffect(() => {
    if (store.tier && prevTier.current && prevTier.current !== store.tier) {
      setUpgradeCelebration(true);
      // reset celebration flag after firing once
      setTimeout(() => setUpgradeCelebration(false), 2000);
    }
    prevTier.current = store.tier;
  }, [store.tier]);

  return {
    data: {
      tier: store.tier,
      points: store.availablePoints,
      nextTier: store.nextTier,
      progressPct: store.progressPct,
      benefits: [] // TODO: Add benefits based on tier
    },
    isLoading: false, // Store doesn't track loading state yet
    refresh: store.refreshAccount,
    upgradeCelebration
  } as const;
}
