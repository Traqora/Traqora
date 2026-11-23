"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DisputeTimeline } from "@/components/disputes/DisputeTimeline";
import type { DisputeTimelineEvent, DisputePhase } from "@/components/disputes/DisputeTimeline";

const defaultPhases: DisputeTimelineEvent[] = [
  { phase: "created", label: "Created", description: "Dispute filed by claimant", timestamp: new Date(Date.now() - 86400000 * 5), status: "completed" },
  { phase: "evidence", label: "Evidence", description: "Both parties submitted evidence", timestamp: new Date(Date.now() - 86400000 * 4), status: "completed" },
  { phase: "jury_selection", label: "Jury Selection", description: "Jury members selected", timestamp: new Date(Date.now() - 86400000 * 3), status: "completed" },
  { phase: "commit_vote", label: "Commit Vote", description: "Jury commit phase completed", timestamp: new Date(Date.now() - 86400000 * 2), status: "completed" },
  { phase: "reveal_vote", label: "Reveal Vote", description: "Jury revealed their votes", timestamp: new Date(Date.now() - 86400000), status: "active" },
  { phase: "appeal", label: "Appeal", description: "Appeal phase available", timestamp: undefined, status: "upcoming" },
  { phase: "finalized", label: "Finalized", description: "Dispute finalized on-chain", timestamp: undefined, status: "upcoming" },
];

export default function DisputeTimelinePage() {
  const [currentPhase, setCurrentPhase] = useState<DisputePhase>("reveal_vote");

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
          href="/disputes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Disputes
        </Link>

        <DisputeTimeline
          disputeId="demo-dispute-1"
          phases={defaultPhases}
          currentPhase={currentPhase}
          title="Dispute Timeline"
        />
      </div>

      <footer role="contentinfo" className="sr-only">
        <p>© {new Date().getFullYear()} Traqora. Decentralized flight booking powered by Stellar.</p>
      </footer>
    </div>
  );
}
