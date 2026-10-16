"use client";

import React, { useEffect, useState } from "react";
import { Trophy, Star } from "lucide-react";
import { useConfetti } from "@/lib/use-confetti";

export type LoyaltySummary = {
  tier: string;
  points: number;
  nextTier?: string | null;
  progressPct?: number;
  benefits: { id: string; label: string; description?: string }[];
};

export function LoyaltySummaryCard({
  summary,
  loading,
  upgradeCelebration,
}: {
  summary?: LoyaltySummary;
  loading?: boolean;
  upgradeCelebration?: boolean;
}) {
  const confetti = useConfetti();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && upgradeCelebration) {
      confetti();
    }
  }, [upgradeCelebration, confetti, isMounted]);

  return (
    <div className="rounded-lg border p-4 bg-background">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-medium">Current Tier</h2>
        </div>
        <div className="flex items-center gap-1 text-yellow-500">
          <Star className="w-4 h-4" />
          <span className="text-sm">{loading ? "..." : summary?.tier ?? "—"}</span>
        </div>
      </div>
      <div className="mt-4">
        <div className="text-sm text-muted-foreground">Points Balance</div>
        <div className="text-2xl font-semibold">{loading ? "—" : summary?.points?.toLocaleString() ?? 0}</div>
      </div>
      {summary?.nextTier && (
        <div className="mt-2 text-sm text-muted-foreground">Next: {summary.nextTier}</div>
      )}
      {typeof summary?.progressPct === "number" && (
        <div className="mt-1 text-xs text-muted-foreground">Progress: {Math.round(summary.progressPct)}%</div>
      )}
    </div>
  );
}