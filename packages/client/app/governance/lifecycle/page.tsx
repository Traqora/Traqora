"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProposalLifecycle } from "@/components/governance/ProposalLifecycle";
import type { ProposalLifecycleEvent, ProposalStage } from "@/components/governance/ProposalLifecycle";

const defaultStages: ProposalLifecycleEvent[] = [
  { stage: "created", label: "Created", description: "Proposal submitted by the proposer", timestamp: new Date(Date.now() - 86400000 * 3) },
  { stage: "active", label: "Active", description: "Proposal is now active in the system", timestamp: new Date(Date.now() - 86400000 * 2) },
  { stage: "voting", label: "Voting", description: "Community voting is in progress", timestamp: new Date(Date.now() - 86400000) },
  { stage: "passed", label: "Passed", description: "Proposal has passed the vote", timestamp: new Date(Date.now() - 3600000) },
  { stage: "executed", label: "Executed", description: "Proposal has been executed on-chain", timestamp: new Date() },
];

export default function ProposalLifecyclePage() {
  const [currentStage, setCurrentStage] = useState<ProposalStage>("executed");

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
          href="/governance"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Governance
        </Link>

        <ProposalLifecycle
          proposalId="demo-proposal-1"
          stages={defaultStages}
          currentStage={currentStage}
          title="Proposal Lifecycle"
        />
      </div>

      <footer role="contentinfo" className="sr-only">
        <p>© {new Date().getFullYear()} Traqora. Decentralized flight booking powered by Stellar.</p>
      </footer>
    </div>
  );
}
