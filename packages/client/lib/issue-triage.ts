/**
 * issue-triage.ts
 *
 * Triage utility for Traqora issue tracking.
 *
 * Contract
 * ────────
 * `parseIssueMarkdown(raw)` accepts a raw markdown string whose first line is
 * a heading of the form `#<number> <title>` (as produced by fix.md / issue.md)
 * and returns a typed `TriagedIssue` value.
 *
 * Inputs  : raw markdown string (non-empty)
 * Outputs : `TriagedIssue` on success
 * Errors  : throws `IssueTriageError` when the heading is absent or malformed
 *
 * `classifyArea(title)` maps a free-text title to one of the canonical
 * `IssueArea` values by keyword matching.  Returns `"unknown"` when no
 * keyword matches — it never throws.
 *
 * `formatTriageSummary(issue)` serialises a `TriagedIssue` back to a
 * single-line triage string suitable for commit messages and changelogs.
 *
 * This module has no runtime dependencies beyond the TypeScript standard
 * library — it is safe to import in any environment (Node, browser, tests).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Canonical project areas, mirroring the values in the issue templates. */
export type IssueArea =
  | "client"
  | "backend"
  | "contracts"
  | "infrastructure"
  | "docs"
  | "unknown"

/** Severity levels accepted in the bug-report template. */
export type IssueSeverity = "critical" | "high" | "medium" | "low"

/** Structured representation of a single triaged issue. */
export interface TriagedIssue {
  /** Numeric issue identifier, e.g. 715 */
  number: number
  /** Raw title string extracted from the heading */
  title: string
  /** Auto-classified area based on title keywords */
  area: IssueArea
  /** Labels that would be applied on triage */
  labels: string[]
}

/** Error thrown when `parseIssueMarkdown` cannot parse the input. */
export class IssueTriageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IssueTriageError"
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Keyword → area mapping (order matters: first match wins). */
const AREA_KEYWORDS: Array<{ keywords: RegExp; area: IssueArea }> = [
  { keywords: /\b(client|frontend|ui|ux|react|next\.?js|component|style)\b/i, area: "client" },
  { keywords: /\b(backend|api|server|express|database|redis|postgres|auth|jwt|middleware)\b/i, area: "backend" },
  { keywords: /\b(contract|soroban|stellar|wasm|rust|cargo|smart.?contract|refund.?contract|booking.?contract)\b/i, area: "contracts" },
  { keywords: /\b(infra|terraform|docker|ci|cd|deploy|pipeline|workflow|github.?action)\b/i, area: "infrastructure" },
  { keywords: /\b(doc|readme|contributing|changelog|guide|runbook)\b/i, area: "docs" },
]

/**
 * Derive labels for a triaged issue.
 * Always includes "triage"; adds the area label when it is not "unknown".
 */
function deriveLabels(area: IssueArea): string[] {
  return area === "unknown" ? ["triage"] : ["triage", area]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a free-text issue title into one of the canonical `IssueArea`
 * values.  Returns `"unknown"` when no keyword matches.
 *
 * @param title - Raw title string (e.g. "Fix stablecoin XLM fee display")
 */
export function classifyArea(title: string): IssueArea {
  for (const { keywords, area } of AREA_KEYWORDS) {
    if (keywords.test(title)) return area
  }
  return "unknown"
}

/**
 * Parse a raw markdown string produced by fix.md / issue.md into a
 * `TriagedIssue`.
 *
 * Expected first non-blank line format:
 *   `#<number> <title>`
 *
 * @throws {IssueTriageError} when the heading line is absent or malformed.
 */
export function parseIssueMarkdown(raw: string): TriagedIssue {
  if (!raw || !raw.trim()) {
    throw new IssueTriageError("Empty input: issue markdown must not be blank")
  }

  // Find the first non-blank line.
  const firstLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)

  if (!firstLine) {
    throw new IssueTriageError("No content found in issue markdown")
  }

  // Match  "#<number> <title>"  or  "#<number><title>" (space optional)
  const match = firstLine.match(/^#(\d+)\s+(.+)$/)
  if (!match) {
    throw new IssueTriageError(
      `Malformed issue heading: expected "#<number> <title>", got: "${firstLine}"`,
    )
  }

  const number = parseInt(match[1], 10)
  const title = match[2].trim()
  const area = classifyArea(title)
  const labels = deriveLabels(area)

  return { number, title, area, labels }
}

/**
 * Serialise a `TriagedIssue` to a single-line triage summary.
 *
 * Output format:  `[#<number>] <title> | area: <area> | labels: <label,…>`
 */
export function formatTriageSummary(issue: TriagedIssue): string {
  return `[#${issue.number}] ${issue.title} | area: ${issue.area} | labels: ${issue.labels.join(", ")}`
}
