"use client";

import React from "react";
import { LoyaltySummaryCard } from "@/components/loyalty/LoyaltySummaryCard";
import { TierProgress } from "@/components/loyalty/TierProgress";
import { PointsHistoryTable } from "@/components/loyalty/PointsHistoryTable";
import { TierBenefits } from "@/components/loyalty/TierBenefits";
import { RedeemPointsForm } from "@/components/loyalty/RedeemPointsForm";
import { TierComparisonChart } from "@/components/loyalty/TierComparisonChart";
import { ReferralInvite } from "@/components/loyalty/ReferralInvite";
import { useLoyaltySummary } from "@/hooks/loyalty/useLoyaltySummary";
import { useTierComparison } from "@/hooks/loyalty/useTierComparison";
import { usePointsHistory } from "@/hooks/loyalty/usePointsHistory";

export default function LoyaltyDashboardPage() {
  const { data: summary, isLoading: summaryLoading, upgradeCelebration } = useLoyaltySummary();
  const { data: tiers } = useTierComparison();
  const history = usePointsHistory();

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Loyalty Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-1">
          <LoyaltySummaryCard summary={summary} loading={summaryLoading} upgradeCelebration={upgradeCelebration} />
        </div>
        <div className="col-span-1 lg:col-span-2">
          <TierProgress summary={summary} loading={summaryLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-1 lg:col-span-2">
          <PointsHistoryTable history={history} />
        </div>
        <div className="col-span-1 space-y-4">
          <TierBenefits benefits={summary?.benefits ?? []} loading={summaryLoading} />
          <RedeemPointsForm points={summary?.points ?? 0} onRedeemedOptimistic={history.refetch} />
          <ReferralInvite />
        </div>
      </div>

      <div>
        <TierComparisonChart tiers={tiers ?? []} />
      </div>
    </div>
  );
}
