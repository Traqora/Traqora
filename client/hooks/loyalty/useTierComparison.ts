"use client";
import { useEffect, useState } from "react";

type Tier = { name: string; requiredPoints: number; bonusMultiplier: number };

export function useTierComparison() {
  const [data, setData] = useState<Tier[] | undefined>();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/loyalty/tiers', { cache: 'force-cache' });
        if (!res.ok) throw new Error('Failed to load tiers');
        setData(await res.json());
      } catch (e) {
        console.error(e);
        setData([]);
      }
    }
    load();
  }, []);

  return { data } as const;
}
