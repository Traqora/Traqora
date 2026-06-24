"use client";

import { useEffect, useRef, useState } from "react";
import { useLoyaltyStore } from "@/lib/stores/loyalty";

export function useLoyaltySummary() {
  const store = useLoyaltyStore();
  const prevTier = useRef<string | undefined>();
  const [upgradeCelebration, setUpgradeCelebration] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    
    if (store.tier && prevTier.current && prevTier.current !== store.tier) {
      setUpgradeCelebration(true);
      setTimeout(() => setUpgradeCelebration(false), 2000);
    }
    prevTier.current = store.tier;
  }, [store.tier, isMounted]);

  return {
    data: isMounted ? {
      tier: store.tier,
      points: store.availablePoints,
      nextTier: store.nextTier,
      progressPct: store.progressPct,
      benefits: []
    } : {
      tier: 'Bronze',
      points: 0,
      nextTier: null,
      progressPct: 0,
      benefits: []
    },
    isLoading: !isMounted,
    refresh: store.refreshAccount,
    upgradeCelebration
  } as const;
}