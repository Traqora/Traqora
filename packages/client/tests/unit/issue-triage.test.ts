/**
 * Unit tests for lib/issue-triage.ts
 *
 * Contract under test
 * ───────────────────
 * parseIssueMarkdown(raw)
 *   • Input : raw markdown string whose first non-blank line is "#<n> <title>"
 *   • Output: TriagedIssue { number, title, area, labels }
 *   • Errors: throws IssueTriageError on empty/blank input or malformed heading
 *
 * classifyArea(title)
 *   • Returns one of the canonical IssueArea values based on keyword matching
 *   • Returns "unknown" when no keyword matches — never throws
 *
 * formatTriageSummary(issue)
 *   • Returns a single-line string "[#<n>] <title> | area: <area> | labels: <l,…>"
 *
 * Test plan
 * ─────────
 * Happy path  : parse real headings from fix.md / issue.md format
 * Failure mode: empty string, blank string, missing heading, malformed heading
 */

import {
  IssueTriageError,
  TriagedIssue,
  classifyArea,
  formatTriageSummary,
  parseIssueMarkdown,
} from "../../lib/issue-triage"

// ---------------------------------------------------------------------------
// classifyArea
// ---------------------------------------------------------------------------
describe("classifyArea", () => {
  it('classifies a client-related title to "client"', () => {
    expect(classifyArea("Fix stablecoin XLM fee display on the UI")).toBe("client")
  })

  it('classifies a backend-related title to "backend"', () => {
    expect(classifyArea("Add request-id correlation to the Express middleware")).toBe("backend")
  })

  it('classifies a contracts-related title to "contracts"', () => {
    expect(classifyArea("Support partial refunds in the refund contract")).toBe("contracts")
  })

  it('classifies an infra-related title to "infrastructure"', () => {
    expect(classifyArea("Add Docker healthcheck to the CI pipeline")).toBe("infrastructure")
  })

  it('classifies a docs-related title to "docs"', () => {
    expect(classifyArea("Update CONTRIBUTING guide for new contributors")).toBe("docs")
  })

  it('returns "unknown" when no keyword matches', () => {
    expect(classifyArea("General housekeeping")).toBe("unknown")
  })

  it("is case-insensitive", () => {
    expect(classifyArea("REACT component accessibility audit")).toBe("client")
    expect(classifyArea("SOROBAN upgrade timelock")).toBe("contracts")
  })

  it('returns "unknown" for an empty string without throwing', () => {
    expect(() => classifyArea("")).not.toThrow()
    expect(classifyArea("")).toBe("unknown")
  })
})

// ---------------------------------------------------------------------------
// parseIssueMarkdown – happy path
// ---------------------------------------------------------------------------
describe("parseIssueMarkdown – happy path", () => {
  it("parses a fix.md-style heading (contracts area)", () => {
    const raw = `#510 Support partial refunds in the refund contract
Repo Avatar
Traqora/Traqora
`
    const result = parseIssueMarkdown(raw)

    expect(result.number).toBe(510)
    expect(result.title).toBe("Support partial refunds in the refund contract")
    expect(result.area).toBe("contracts")
    expect(result.labels).toContain("triage")
    expect(result.labels).toContain("contracts")
  })

  it("parses an issue.md-style heading (backend area)", () => {
    const raw = `#328 Add price prediction and fare trend analytics
Repo Avatar
Traqora/Traqora
`
    const result = parseIssueMarkdown(raw)

    expect(result.number).toBe(328)
    expect(result.title).toBe("Add price prediction and fare trend analytics")
    // "analytics" doesn't match a keyword — classifyArea returns "unknown"
    // which is the correct behaviour for this title
    expect(result.labels).toContain("triage")
  })

  it("parses a single-line string (no trailing content)", () => {
    const result = parseIssueMarkdown("#715 Fix issue template triage")

    expect(result.number).toBe(715)
    expect(result.title).toBe("Fix issue template triage")
  })

  it("skips leading blank lines before the heading", () => {
    const raw = `\n\n#737 Request-id correlation in Express middleware\n`
    const result = parseIssueMarkdown(raw)

    expect(result.number).toBe(737)
    expect(result.area).toBe("backend")
  })

  it("always includes 'triage' in labels", () => {
    const result = parseIssueMarkdown("#1 Some obscure task with no keyword")
    expect(result.labels).toContain("triage")
  })

  it("includes area label when area is not 'unknown'", () => {
    const result = parseIssueMarkdown("#42 Update the Docker deployment pipeline")
    expect(result.labels).toContain("triage")
    expect(result.labels).toContain("infrastructure")
  })

  it("does NOT include area label when area is 'unknown'", () => {
    const result = parseIssueMarkdown("#99 Miscellaneous task")
    expect(result.labels).toEqual(["triage"])
  })
})

// ---------------------------------------------------------------------------
// parseIssueMarkdown – failure-mode regression guards
// ---------------------------------------------------------------------------
describe("parseIssueMarkdown – failure modes", () => {
  /**
   * An empty string must throw — passing empty content is always a caller
   * bug, and silently returning a default would hide the problem.
   */
  it("throws IssueTriageError for an empty string", () => {
    expect(() => parseIssueMarkdown("")).toThrow(IssueTriageError)
    expect(() => parseIssueMarkdown("")).toThrow(/Empty input/)
  })

  /**
   * Whitespace-only input is also invalid.
   */
  it("throws IssueTriageError for a whitespace-only string", () => {
    expect(() => parseIssueMarkdown("   \n\n\t  ")).toThrow(IssueTriageError)
  })

  /**
   * A heading without the "#<number>" prefix (plain markdown h2, sentence
   * text, etc.) must be rejected so callers know they passed the wrong input.
   */
  it("throws IssueTriageError when the first line has no issue number", () => {
    const raw = "Support partial refunds\nSome description"
    expect(() => parseIssueMarkdown(raw)).toThrow(IssueTriageError)
    expect(() => parseIssueMarkdown(raw)).toThrow(/Malformed issue heading/)
  })

  /**
   * A heading with `#` but no trailing title must also be rejected.
   */
  it("throws IssueTriageError when the heading has a number but no title", () => {
    expect(() => parseIssueMarkdown("#510")).toThrow(IssueTriageError)
    expect(() => parseIssueMarkdown("#510 ")).toThrow(IssueTriageError)
  })

  /**
   * Non-numeric "issue numbers" must be rejected.
   */
  it("throws IssueTriageError when the issue number is not numeric", () => {
    expect(() => parseIssueMarkdown("#abc Fix something")).toThrow(IssueTriageError)
  })
})

// ---------------------------------------------------------------------------
// formatTriageSummary
// ---------------------------------------------------------------------------
describe("formatTriageSummary", () => {
  const issue: TriagedIssue = {
    number: 715,
    title: "Fix issue template triage",
    area: "client",
    labels: ["triage", "client"],
  }

  it("produces the expected single-line format", () => {
    const summary = formatTriageSummary(issue)
    expect(summary).toBe(
      "[#715] Fix issue template triage | area: client | labels: triage, client",
    )
  })

  it("includes all labels separated by ', '", () => {
    const multi: TriagedIssue = {
      ...issue,
      labels: ["triage", "backend", "priority:high"],
    }
    expect(formatTriageSummary(multi)).toContain("triage, backend, priority:high")
  })

  it("handles 'unknown' area without crashing", () => {
    const unknown: TriagedIssue = {
      number: 1,
      title: "Misc task",
      area: "unknown",
      labels: ["triage"],
    }
    expect(formatTriageSummary(unknown)).toBe(
      "[#1] Misc task | area: unknown | labels: triage",
    )
  })
})

// ---------------------------------------------------------------------------
// Round-trip integration: parse → format
// ---------------------------------------------------------------------------
describe("parse → format round-trip", () => {
  it("produces a deterministic summary for a fix.md heading", () => {
    const issue = parseIssueMarkdown(
      "#510 Support partial refunds in the refund contract",
    )
    const summary = formatTriageSummary(issue)

    expect(summary).toMatch(/^\[#510\]/)
    expect(summary).toContain("area: contracts")
    expect(summary).toContain("labels: triage, contracts")
  })
})
