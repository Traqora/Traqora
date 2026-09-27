"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  formatDuration,
  resolveQuorumTimelockStatus,
  type QuorumTimelockPhase,
  type QuorumTimelockProposal,
} from "@/lib/governance/quorum-timelock-status"

const PHASE_LABELS: Record<QuorumTimelockPhase, string> = {
  pending: "Voting not started",
  voting: "Voting open",
  quorum_not_met: "Quorum not met",
  rejected: "Rejected",
  timelocked: "In timelock",
  ready: "Ready to execute",
  executed: "Executed",
  invalid: "Status unavailable",
}

const PHASE_CLASSES: Record<QuorumTimelockPhase, string> = {
  pending: "bg-muted text-muted-foreground",
  voting: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  quorum_not_met: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  timelocked: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ready: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  executed: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  invalid: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

interface QuorumTimelockStatusProps {
  proposal: QuorumTimelockProposal
  /** Override the clock (tests / storybook). When omitted the component ticks every 30s. */
  now?: Date
  timelockSeconds?: number
}

export function QuorumTimelockStatus({ proposal, now, timelockSeconds }: QuorumTimelockStatusProps) {
  const [tick, setTick] = useState(() => new Date())

  useEffect(() => {
    if (now) return
    const id = setInterval(() => setTick(new Date()), 30_000)
    return () => clearInterval(id)
  }, [now])

  const status = resolveQuorumTimelockStatus(proposal, now ?? tick, timelockSeconds)

  return (
    <div className="space-y-3" data-testid="quorum-timelock-status" data-phase={status.phase}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Status</span>
        <Badge variant="secondary" className={PHASE_CLASSES[status.phase]}>
          {PHASE_LABELS[status.phase]}
        </Badge>
      </div>

      {status.phase === "invalid" ? (
        <p role="alert" className="text-sm text-red-600">
          {status.error}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Quorum</span>
              <span>
                {status.totalVotes.toLocaleString()}/{status.quorum.toLocaleString()}
                {status.quorumMet ? " (met)" : ""}
              </span>
            </div>
            <Progress
              value={status.quorumPercent}
              className="h-2"
              aria-label={`Quorum progress ${status.quorumPercent.toFixed(0)}%`}
            />
          </div>

          {status.timelockEndsAt && (
            <div className="flex justify-between text-sm" role="status" aria-live="polite">
              <span className="text-muted-foreground">
                {status.phase === "timelocked" ? "Executable in" : "Timelock ended"}
              </span>
              <span className="font-medium">
                {status.phase === "timelocked"
                  ? formatDuration(status.timelockRemainingMs ?? 0)
                  : new Date(status.timelockEndsAt).toLocaleString()}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
