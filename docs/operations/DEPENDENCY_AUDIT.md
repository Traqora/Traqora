# Dependency Audit Schedule & Runner (#777)

Weekly automated dependency audits for npm workspaces and Soroban contracts,
plus the resumable runner they share. Contributor reference for running the
same audits locally.

## Schedule

`.github/workflows/security-audit.yml` runs on:

- **Schedule:** every Monday 06:00 UTC (`cron: "0 6 * * 1"`)
- **Manual:** workflow_dispatch from the Actions tab

The job runs `bash scripts/audit/audit-deps.sh --self-test` first; a broken
runner fails loudly before gating anything. Then it audits, in order:

1. npm — root lockfile (`AUDIT_NPM_DIR=.`)
2. npm — `packages/backend` lockfile
3. npm — `packages/client` lockfile
4. cargo — `contracts/Cargo.lock`

An `audit-state` artifact (per-target pass records) is uploaded on every run
for diagnostics, whether the run passed or failed.

## Runner contract (`scripts/audit/audit-deps.sh`)

One entry point for npm + cargo audits with a stable, documented exit-code
contract. Inputs are environment variables (all optional):

| Variable              | Default      | Meaning                                          |
| --------------------- | ------------ | ------------------------------------------------ |
| `AUDIT_TARGETS`       | `npm,cargo`  | comma list: `npm` and/or `cargo`                 |
| `AUDIT_LEVEL`         | `high`       | npm audit level that fails the run               |
| `AUDIT_RESUME`        | `true`       | skip targets that already passed for the same lockfile hash |
| `AUDIT_STATE_DIR`     | `.audit-state`| resume/summary state directory                  |
| `AUDIT_NPM_DIR`       | `.`          | directory with the `package-lock.json` to audit  |
| `AUDIT_CARGO_DIR`     | `contracts`  | directory with `Cargo.lock`                      |
| `AUDIT_NPM_CMD`       | `npm`        | npm binary to invoke                             |
| `AUDIT_CARGO_CMD`     | `cargo-audit`| cargo-audit binary                               |
| `AUDIT_REQUIRE_CARGO` | `false`      | missing cargo-audit is exit 2 instead of skip    |
| `AUDIT_NPM_ARGS`      | `--package-lock-only` | extra npm audit args                    |

**Exit codes:**

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| 0    | all requested audits passed (or validly resumed)                    |
| 1    | at least one audit found vulnerabilities at/above `AUDIT_LEVEL`     |
| 2    | tooling/config error: audit binary missing (when required) or lockfile missing, or unknown target |
| 3    | resume state unreadable/corrupted — delete `.audit-state` or set `AUDIT_RESUME=false` |

Resume behaviour: passing a target writes `.audit-state/<target>.json`
containing the lockfile sha256. A later run with `AUDIT_RESUME=true` skips a
target only when that hash matches — any lockfile change forces a re-audit.
Failed targets never write state, so they always re-run. A resumed run does
not invoke the audit binaries at all.

`AUDIT_NPM_ARGS=--package-lock-only` audits the lockfile without requiring a
full `node_modules` install — the CI job runs it right after checkout.

## Running locally

```bash
# Everything (npm root + cargo contracts)
bash scripts/audit/audit-deps.sh

# One workspace at a time
AUDIT_TARGETS=npm AUDIT_NPM_DIR=packages/backend bash scripts/audit/audit-deps.sh
AUDIT_TARGETS=cargo bash scripts/audit/audit-deps.sh

# The runner's own regression suite (happy path + failure modes)
bash scripts/audit/audit-deps.sh --self-test

# Strict mode: missing cargo-audit binary is an error, not a skip
AUDIT_REQUIRE_CARGO=true bash scripts/audit/audit-deps.sh
```

## When the audit fails (remediation workflow)

1. Read the `audit-state` artifact / SUMMARY line to see which target and exit
   code (`1` = vulnerabilities, `2` = tooling, `3` = corrupted state).
2. Reproduce locally with the commands above (`npm audit` output lists the
   advisory; `cargo audit` does the same for Rust deps).
3. Fix via dependency upgrade where possible (`npm audit fix` / `cargo update
   -p <crate>`), keeping the change scoped to the affected lockfile(s).
4. If no fixed version exists, add a temporary, documented exception at the
   call site of the workflow (npm: `audit-level` bump; cargo:
   `cargo audit --deny warnings` config) **with a link to the tracking issue
   and an expiry review date** — never silently.
5. Re-run the workflow; the failing target re-runs automatically (failed
   targets are never resumed).

## Failure-mode coverage

The runner ships with a self-test asserting: happy path (exit 0 + state
written), resume skip, vulnerabilities (exit 1), missing lockfile (exit 2),
corrupted resume state (exit 3), unknown target (exit 2). CI runs it before
the real audits; contributors can run it via `--self-test`.
