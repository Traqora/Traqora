# Issue Triage — Traqora

> Implements issue #715: Fix issue template triage

This document describes the end-to-end triage flow for issues and bug reports
in the Traqora repository.

---

## GitHub Issue Templates

Two structured templates live in `.github/ISSUE_TEMPLATE/`:

| Template | File | When to use |
|---|---|---|
| Bug Report | `bug_report.yml` | A reproducible defect in client, backend, contracts, or infra |
| Feature Request | `feature_request.yml` | A new capability or improvement |

Both templates:
- Require contributors to select an **Area** (client / backend / contracts / infrastructure / docs)
- Automatically apply the `triage` label and the matching area label on creation
- Disable blank (free-form) issues — ad-hoc questions go to [GitHub Discussions](https://github.com/Traqora/Traqora/discussions)

---

## Triage Utility (`lib/issue-triage.ts`)

The client package exports three functions for programmatic triage of the
legacy `fix.md` / `issue.md` markdown format.

### Contract

```ts
parseIssueMarkdown(raw: string): TriagedIssue
```
Parses a markdown string whose first non-blank line matches `#<number> <title>`.
Returns a `TriagedIssue`. Throws `IssueTriageError` on blank input or a
malformed heading.

```ts
classifyArea(title: string): IssueArea
```
Returns one of `"client" | "backend" | "contracts" | "infrastructure" | "docs" | "unknown"`
based on keyword matching. Never throws.

```ts
formatTriageSummary(issue: TriagedIssue): string
```
Serialises a `TriagedIssue` to a single-line string:
```
[#715] Fix issue template triage | area: client | labels: triage, client
```

### Error type

`IssueTriageError` extends `Error` with `name = "IssueTriageError"`. Thrown by
`parseIssueMarkdown` when:
- input is empty or whitespace-only
- the first non-blank line does not match `#<number> <title>`

### Usage example

```ts
import { parseIssueMarkdown, formatTriageSummary } from "@/lib/issue-triage";

const raw = `#510 Support partial refunds in the refund contract
Repo Avatar
Traqora/Traqora
`;

const issue = parseIssueMarkdown(raw);
// { number: 510, title: "Support partial refunds in the refund contract",
//   area: "contracts", labels: ["triage", "contracts"] }

console.log(formatTriageSummary(issue));
// [#510] Support partial refunds in the refund contract | area: contracts | labels: triage, contracts
```

---

## Running Tests

### Jest unit tests (requires full install)
```bash
npm test --workspace=packages/client
```
Tests live in `packages/client/tests/unit/issue-triage.test.ts`.

### Standalone validation (bare Node, no install needed)
```bash
node scripts/validate-issue-triage.js
```
Runs 32 assertions against the compiled-equivalent logic. Exits `0` on success,
`1` on any failure.

---

## Keyword → Area Mapping

| Area | Keywords matched (case-insensitive) |
|---|---|
| `client` | client, frontend, ui, ux, react, nextjs, component, style |
| `backend` | backend, api, server, express, database, redis, postgres, auth, jwt, middleware |
| `contracts` | contract, soroban, stellar, wasm, rust, cargo, smart contract, refund contract, booking contract |
| `infrastructure` | infra, terraform, docker, ci, cd, deploy, pipeline, workflow, github action |
| `docs` | doc, readme, contributing, changelog, guide, runbook |
| `unknown` | *(no keyword matched)* |

---

## Adding a New Area

1. Add the new value to the `IssueArea` union type in `lib/issue-triage.ts`
2. Add a new entry to `AREA_KEYWORDS` with a regex and the area name
3. Add the area option to both `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml`
4. Add test coverage in `tests/unit/issue-triage.test.ts` and `scripts/validate-issue-triage.js`
5. Update the table above in this document
