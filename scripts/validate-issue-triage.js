/**
 * validate-issue-triage.js
 *
 * Standalone validation script for lib/issue-triage.ts logic.
 * Runs without Jest/TypeScript toolchain — used to verify correctness
 * in environments where the full test stack is not installed.
 *
 * Run: node scripts/validate-issue-triage.js
 *
 * This is NOT a replacement for the Jest unit tests in
 * packages/client/tests/unit/issue-triage.test.ts — it exists only
 * to provide runnable verification when node_modules is partial.
 */

"use strict";

// ── Inline compiled version of lib/issue-triage.ts ────────────────────────
// (Equivalent to the TypeScript source with types erased.)

class IssueTriageError extends Error {
  constructor(message) {
    super(message);
    this.name = "IssueTriageError";
  }
}

const AREA_KEYWORDS = [
  { keywords: /\b(client|frontend|ui|ux|react|next\.?js|component|style)\b/i, area: "client" },
  { keywords: /\b(backend|api|server|express|database|redis|postgres|auth|jwt|middleware)\b/i, area: "backend" },
  { keywords: /\b(contract|soroban|stellar|wasm|rust|cargo|smart.?contract|refund.?contract|booking.?contract)\b/i, area: "contracts" },
  { keywords: /\b(infra|terraform|docker|ci|cd|deploy|pipeline|workflow|github.?action)\b/i, area: "infrastructure" },
  { keywords: /\b(doc|readme|contributing|changelog|guide|runbook)\b/i, area: "docs" },
];

function deriveLabels(area) {
  return area === "unknown" ? ["triage"] : ["triage", area];
}

function classifyArea(title) {
  for (const { keywords, area } of AREA_KEYWORDS) {
    if (keywords.test(title)) return area;
  }
  return "unknown";
}

function parseIssueMarkdown(raw) {
  if (!raw || !raw.trim()) {
    throw new IssueTriageError("Empty input: issue markdown must not be blank");
  }
  const firstLine = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (!firstLine) {
    throw new IssueTriageError("No content found in issue markdown");
  }
  const match = firstLine.match(/^#(\d+)\s+(.+)$/);
  if (!match) {
    throw new IssueTriageError(
      `Malformed issue heading: expected "#<number> <title>", got: "${firstLine}"`
    );
  }
  const number = parseInt(match[1], 10);
  const title = match[2].trim();
  const area = classifyArea(title);
  const labels = deriveLabels(area);
  return { number, title, area, labels };
}

function formatTriageSummary(issue) {
  return `[#${issue.number}] ${issue.title} | area: ${issue.area} | labels: ${issue.labels.join(", ")}`;
}

// ── Minimal assertion helpers ──────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertThrows(fn, ErrorClass, msgFragment, label) {
  try {
    fn();
    console.error(`  ✗ FAIL (no throw): ${label}`);
    failed++;
  } catch (e) {
    if (ErrorClass && !(e instanceof ErrorClass)) {
      console.error(`  ✗ FAIL (wrong error class ${e.constructor.name}): ${label}`);
      failed++;
    } else if (msgFragment && !e.message.includes(msgFragment)) {
      console.error(`  ✗ FAIL (message "${e.message}" missing "${msgFragment}"): ${label}`);
      failed++;
    } else {
      console.log(`  ✓ ${label}`);
      passed++;
    }
  }
}

// ── Test suite ─────────────────────────────────────────────────────────────

console.log("\nclassifyArea");
assert(classifyArea("Fix stablecoin XLM fee display on the UI") === "client",
  'classifies client title to "client"');
assert(classifyArea("Add request-id correlation to the Express middleware") === "backend",
  'classifies backend title to "backend"');
assert(classifyArea("Support partial refunds in the refund contract") === "contracts",
  'classifies contracts title to "contracts"');
assert(classifyArea("Add Docker healthcheck to the CI pipeline") === "infrastructure",
  'classifies infra title to "infrastructure"');
assert(classifyArea("Update CONTRIBUTING guide for new contributors") === "docs",
  'classifies docs title to "docs"');
assert(classifyArea("General housekeeping") === "unknown",
  'returns "unknown" when no keyword matches');
assert(classifyArea("REACT component accessibility audit") === "client",
  "is case-insensitive (REACT)");
assert(classifyArea("SOROBAN upgrade timelock") === "contracts",
  "is case-insensitive (SOROBAN)");
assert(classifyArea("") === "unknown",
  'returns "unknown" for empty string without throwing');

console.log("\nparseIssueMarkdown – happy path");
{
  const r = parseIssueMarkdown(`#510 Support partial refunds in the refund contract\nRepo Avatar`);
  assert(r.number === 510, "parses number 510 from fix.md heading");
  assert(r.title === "Support partial refunds in the refund contract", "parses title correctly");
  assert(r.area === "contracts", 'classifies as "contracts"');
  assert(r.labels.includes("triage"), "labels include 'triage'");
  assert(r.labels.includes("contracts"), "labels include 'contracts'");
}
{
  const r = parseIssueMarkdown("#715 Fix issue template triage");
  assert(r.number === 715, "parses number 715");
  assert(r.title === "Fix issue template triage", "parses title");
}
{
  const r = parseIssueMarkdown("\n\n#737 Request-id correlation in Express middleware\n");
  assert(r.number === 737, "skips leading blank lines");
  assert(r.area === "backend", "classifies backend from Express keyword");
}
{
  const r = parseIssueMarkdown("#1 Some obscure task with no keyword");
  assert(r.labels.includes("triage"), "always includes triage label");
  assert(!r.labels.includes("unknown"), "does not include 'unknown' as a label");
}
{
  const r = parseIssueMarkdown("#99 Miscellaneous task");
  assert(JSON.stringify(r.labels) === JSON.stringify(["triage"]),
    "only 'triage' label when area is unknown");
}

console.log("\nparseIssueMarkdown – failure modes");
assertThrows(() => parseIssueMarkdown(""), IssueTriageError, "Empty input",
  "throws IssueTriageError for empty string");
assertThrows(() => parseIssueMarkdown("   \n\n\t  "), IssueTriageError, null,
  "throws IssueTriageError for whitespace-only input");
assertThrows(() => parseIssueMarkdown("Support partial refunds\nSome description"),
  IssueTriageError, "Malformed issue heading",
  "throws when first line has no issue number");
assertThrows(() => parseIssueMarkdown("#510"), IssueTriageError, "Malformed",
  "throws when heading has number but no title");
assertThrows(() => parseIssueMarkdown("#510 "), IssueTriageError, "Malformed",
  "throws when heading has number but only whitespace title");
assertThrows(() => parseIssueMarkdown("#abc Fix something"), IssueTriageError, null,
  "throws when issue number is non-numeric");

console.log("\nformatTriageSummary");
{
  const issue = { number: 715, title: "Fix issue template triage", area: "client", labels: ["triage", "client"] };
  const s = formatTriageSummary(issue);
  assert(s === "[#715] Fix issue template triage | area: client | labels: triage, client",
    "produces expected single-line format");
}
{
  const issue = { number: 1, title: "Misc task", area: "unknown", labels: ["triage"] };
  assert(formatTriageSummary(issue) === "[#1] Misc task | area: unknown | labels: triage",
    "handles unknown area without crashing");
}

console.log("\nround-trip: parse → format");
{
  const issue = parseIssueMarkdown("#510 Support partial refunds in the refund contract");
  const summary = formatTriageSummary(issue);
  assert(summary.startsWith("[#510]"), "summary starts with [#510]");
  assert(summary.includes("area: contracts"), "summary contains area: contracts");
  assert(summary.includes("labels: triage, contracts"), "summary contains correct labels");
}

// ── Results ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All assertions passed ✓");
}
