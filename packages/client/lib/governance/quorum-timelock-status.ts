/**
 * Quorum + timelock status for governance proposals.
 *
 * Pure resolver used by the governance UI. See docs/GOVERNANCE_QUORUM_TIMELOCK.md for the contract.
 *
 * Inputs: a proposal (as returned by `/api/v1/governance/proposals/:id`), the current time and the
 * timelock delay. `executionEta` from the API always wins over the derived `votingEnd + delay`.
 */

export const DEFAULT_TIMELOCK_SECONDS = 48 * 60 * 60

export type QuorumTimelockPhase =
  | "pending"          // voting has not started
  | "voting"           // voting window open
  | "quorum_not_met"   // voting ended below quorum -> defeated
  | "rejected"         // voting ended, quorum met, yes <= no
  | "timelocked"       // passed, waiting for the timelock delay to elapse
  | "ready"            // passed, timelock elapsed, awaiting execution
  | "executed"         // executed on-chain
  | "invalid"          // proposal data cannot be interpreted

export interface QuorumTimelockProposal {
  votingStart: string
  votingEnd: string
  yesVotes: number
  noVotes: number
  quorum: number
  status: string
  executed: boolean
  executionEta?: string | null
}

export interface QuorumTimelockStatus {
  phase: QuorumTimelockPhase
  totalVotes: number
  quorum: number
  /** 0–100, capped. */
  quorumPercent: number
  quorumMet: boolean
  /** ISO timestamp when execution unlocks; null unless the proposal passed. */
  timelockEndsAt: string | null
  /** Milliseconds until the timelock elapses; 0 once elapsed, null when not applicable. */
  timelockRemainingMs: number | null
  /** Human-readable reason when phase is "invalid". */
  error?: string
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

export function getTimelockSeconds(): number {
  const raw = process.env.NEXT_PUBLIC_GOVERNANCE_TIMELOCK_SECONDS
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TIMELOCK_SECONDS
}

export function resolveQuorumTimelockStatus(
  proposal: QuorumTimelockProposal,
  now: Date = new Date(),
  timelockSeconds: number = getTimelockSeconds(),
): QuorumTimelockStatus {
  const invalid = (error: string): QuorumTimelockStatus => ({
    phase: "invalid",
    totalVotes: 0,
    quorum: 0,
    quorumPercent: 0,
    quorumMet: false,
    timelockEndsAt: null,
    timelockRemainingMs: null,
    error,
  })

  if (!isNonNegativeNumber(proposal.yesVotes) || !isNonNegativeNumber(proposal.noVotes)) {
    return invalid("Vote counts must be non-negative numbers")
  }
  if (!isNonNegativeNumber(proposal.quorum)) {
    return invalid("Quorum must be a non-negative number")
  }

  const start = parseTime(proposal.votingStart)
  const end = parseTime(proposal.votingEnd)
  if (start === null || end === null) return invalid("Voting window has an invalid date")
  if (end < start) return invalid("Voting end is before voting start")

  const hasEta = proposal.executionEta !== undefined && proposal.executionEta !== null
  const eta = hasEta ? parseTime(proposal.executionEta) : end + Math.max(0, timelockSeconds) * 1000
  if (eta === null) return invalid("Execution ETA has an invalid date")

  const totalVotes = proposal.yesVotes + proposal.noVotes
  const quorum = proposal.quorum
  const quorumMet = totalVotes >= quorum
  const quorumPercent = quorum > 0 ? Math.min((totalVotes / quorum) * 100, 100) : 100
  const nowMs = now.getTime()

  const base = { totalVotes, quorum, quorumPercent, quorumMet, timelockEndsAt: null, timelockRemainingMs: null }

  if (proposal.executed || proposal.status === "executed") {
    return { ...base, phase: "executed", timelockEndsAt: new Date(eta).toISOString(), timelockRemainingMs: 0 }
  }
  if (nowMs < start) return { ...base, phase: "pending" }
  if (nowMs <= end && proposal.status !== "passed" && proposal.status !== "rejected") {
    return { ...base, phase: "voting" }
  }
  if (!quorumMet) return { ...base, phase: "quorum_not_met" }
  if (proposal.status === "rejected" || proposal.yesVotes <= proposal.noVotes) {
    return { ...base, phase: "rejected" }
  }

  const remaining = Math.max(0, eta - nowMs)
  return {
    ...base,
    phase: remaining > 0 ? "timelocked" : "ready",
    timelockEndsAt: new Date(eta).toISOString(),
    timelockRemainingMs: remaining,
  }
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0m"
  const totalMinutes = Math.ceil(ms / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
