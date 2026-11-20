# V1 Security and Privacy Release Review

**Status:** DRAFT for maintainer sign-off
**Scope:** Traqora V1, security and privacy controls
**Prepared:** 2026-11-19

This record captures the unresolved findings, owners, mitigations, and go/no-go
decision for the V1 security and privacy surface. It is a living document: each
finding must be closed or explicitly accepted by its owner before the decision
can be flipped from NO-GO to GO.

## 1. Control review

| # | Control | Status | Evidence | Residual risk | Owner |
| - | ------- | ------ | -------- | ------------- | ----- |
| C-1 | Secret scanning on PR and push | In place | `.github/workflows/gitleaks.yml`, `security-gitleaks` jobs in `ci.yml` and `ci-pipeline.yml`; pinned gitleaks, `--redact`, versioned `.gitleaks.toml` | Low: baseline allowlist is one narrowly scoped historical commit; weekly full-history scan catches newly disclosed rules | Security owner (assign before sign-off) |
| C-2 | Vulnerable dependency policy | In place | `.github/workflows/security-audit.yml` + `scripts/audit/audit-deps.sh` (npm + cargo, `AUDIT_LEVEL=high`, self-test gate); Snyk and `actions/dependency-review-action` in PR CI | Medium: PR-time Snyk and dependency-review are non-blocking pending a repo setting; weekly audit is the only hard gate | Platform owner |
| C-3 | Credential and PII log redaction | Updated in this release | `packages/backend/src/utils/structuredLogger.ts` (single source of truth for both loggers); coverage in `tests/utils/structuredLogger.pii.test.ts` | Low: key-based redaction plus in-string email and Stellar secret-seed redaction; public wallet addresses intentionally retained | Backend owner |
| C-4 | PII encrypted at rest | In place | Encrypted passenger columns via `utils/encryption.ts`; documented in `PRIVACY.md` | Low | Backend owner |
| C-5 | GDPR data subject workflows | In place | Export/delete/consent routes in `api/routes/users.ts`, `governance/dataPrivacyService.ts` | Low | Backend owner |
| C-6 | Contract access control and timelock | In place | `SECURITY.md` checklist, `PENTEST_PLAN.md`, contract snapshot review | Medium: checklist is manual; see `docs/operations/CONTRACT_SNAPSHOT_REVIEW.md` | Contracts owner |

Controls C-1 and C-2 were shipped earlier (issues #601 and #777). This release
adds automated regression coverage for their configuration in
`tests/security/ciSecurityControls.test.ts` so a future edit cannot silently
weaken them.

## 2. Open findings

F-1 and F-2 are release blockers. F-3 is a tracked follow-up that does not by
itself block launch but must have an accepted owner and date.

### F-1 (BLOCKER): Backend source does not parse on clean `main`

- **Severity:** critical
- **Owner:** Backend owner (assign before sign-off)
- **Evidence:** `tsc --noEmit` on clean `upstream/main` reports parse errors in
  `src/api/routes/auth.ts` (orphaned `catch` blocks near line 95),
  `src/jobs/notificationWorker.ts` (truncated `if` near line 146), and
  `src/services/dispute/disputeService.ts` (unclosed object literal near line
  316). These are syntax errors, not type errors.
- **Impact:** The backend build and every test that imports these modules fail.
  A build that does not compile cannot be released.
- **Mitigation:** Repair the three malformed blocks on `main`, then require a
  clean `tsc` build in CI before the release branch is cut.
- **Status:** OPEN. Out of scope for the security and privacy change set; must
  be resolved by the owning area before GO.

### F-2 (BLOCKER): Large set of pre-existing failing tests

- **Severity:** high
- **Owner:** QA owner (assign before sign-off)
- **Evidence:** A full backend Jest run on clean `upstream/main` reports 95
  failing suites out of 211 and 448 failing tests out of 2291.
- **Impact:** There is no reliable regression signal to gate the release on.
- **Mitigation:** Triage failures into pre-existing flakes versus real
  regressions, quarantine known flakes with an expiry date, and require a green
  focused suite for every touched area.
- **Status:** OPEN. The security and privacy change sets add focused suites
  that pass in isolation; they do not repair unrelated failures.

### F-3 (FOLLOW-UP): PR-time dependency gates are advisory

- **Severity:** medium
- **Owner:** Platform owner
- **Evidence:** `security-snyk` and `security-dependency-review` in `ci.yml`
  use `continue-on-error: true`. The comment records that dependency-review is
  kept non-blocking until the repository's dependency-graph setting is
  confirmed. The weekly `security-audit.yml` job is the only hard high-severity
  gate.
- **Impact:** A vulnerable dependency can merge and only fail at the next
  weekly audit, increasing mean time to detection.
- **Mitigation:** Confirm the repository setting, then remove
  `continue-on-error` from `security-dependency-review` on a dedicated
  infrastructure change with a rollback plan.
- **Status:** OPEN, accepted as a V1 follow-up with an owner and target date.

### F-4 (FOLLOW-UP): Case-colliding service filenames

- **Severity:** low
- **Owner:** Backend owner
- **Evidence:** `src/services/WebhookService.ts` and
  `src/services/webhookService.ts` differ only by case. Git warns that only one
  is materialised on case-insensitive filesystems (macOS, Windows).
- **Impact:** A build on a developer machine can silently use the wrong module.
- **Mitigation:** Rename one file to a distinct, case-insensitive-safe name in
  a focused change.
- **Status:** OPEN, tracked as hygiene.

## 3. Privacy requirements confirmation

For the V1 security and privacy surface:

- Tokens, wallet signing material, and payment secrets are redacted by key and
  by in-string patterns (C-3). Public wallet addresses remain in logs because
  they are not secrets and are needed for operational tracing.
- Passenger identity (names, government IDs, dates of birth) and contact
  details (email, phone) are redacted by key and in free-text messages (C-3).
- Redaction is total: circular references, getters that throw, oversized
  payloads, and error cause chains cannot bypass it or take down the logger.
- Secret scanning output is redacted so CI logs do not re-leak a finding (C-1).
- Accessibility requirements are unaffected: this release changes no UI.

## 4. Go / no-go decision

**Decision: NO-GO for V1 launch at this time.**

The security and privacy controls themselves are ready: secret scanning, the
high-severity dependency policy, and the expanded log redaction are in place
with automated regression coverage. However F-1 (backend does not parse) and
F-2 (no reliable test signal) are release blockers outside the security scope.

Conditions to flip this decision to GO:

1. F-1 closed: `tsc` build clean on the release branch and the three malformed
   files repaired.
2. F-2 closed: focused suites green and a documented triage of the remaining
   failures with named owners.
3. F-3 and F-4 each have an accepted owner and a target date recorded above.
4. A maintainer signs off in the review of the PR that introduces this
   document.

Sign-off: ____________________ (maintainer)  Date: ____________
