"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TierEarnBurn } from "@/components/loyalty/TierEarnBurn";
import type { TierDisplayData } from "@/components/loyalty/TierEarnBurn";

const defaultData: TierDisplayData = {
  tier: "Gold",
  tierProgress: 75,
  pointsEarned: 12500,
  pointsBurned: 3200,
  nextTier: "Platinum",
  nextTierProgress: 45,
  earnBurnRatio: 0.8,
  entries: [
    { type: "earn", amount: 500, description: "Flight booking reward", timestamp: new Date(Date.now() - 3600000), tier: "Gold" },
    { type: "burn", amount: 200, description: "Redemption: Flight voucher", timestamp: new Date(Date.now() - 7200000), tier: "Gold" },
    { type: "earn", amount: 300, description: "Referral bonus", timestamp: new Date(Date.now() - 86400000), tier: "Gold" },
    { type: "earn", amount: 1000, description: "Monthly activity bonus", timestamp: new Date(Date.now() - 172800000), tier: "Gold" },
  ],
};

export default function TierEarnBurnPage() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header role="banner">
        <nav aria-label="Main navigation" className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-2">
                <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/loyalty"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Loyalty
        </Link>

        <TierEarnBurn data={defaultData} loading={loading} />
      </div>

      <footer role="contentinfo" className="sr-only">
        <p>© {new Date().getFullYear()} Traqora. Decentralized flight booking powered by Stellar.</p>
      </footer>
    </div>
  );
}
