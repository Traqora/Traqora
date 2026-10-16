# Soroban Contract Deployment Automation

How Traqora's smart contracts get built, deployed, verified, health-checked, and
rolled back — and what to do when a step fails.

The automation is four shell scripts under `scripts/`, orchestrated by
`.github/workflows/deploy-automated.yml`. Every script is standalone and safe to
run locally with the same arguments CI uses.

---

## Pipeline at a glance

```
deploy-contracts.sh   build → optimize → deploy → write .deployments/<network>/<tag>/
        │
        ├─► verify-contracts.sh    rebuild locally, compare WASM hashes on-chain
        │
        ├─► health-check.sh        invoke each contract, confirm it answers
        │
        └─► rollback.sh            re-point `latest` at a previous good tag
```

Deployment artifacts are the backbone of all four: each run writes

```
.deployments/<network>/<tag>/
├── contracts.json          # { "<contract_name>": "<contract_id>", ... }
├── wasm-checksums.sha256   # sha256 of each deployed binary (sha256sum format)
├── wasm-hashes.json        # { "<contract_name>": "<sha256>", ... }
└── <contract_name>/*.wasm  # the exact binary that was deployed
```

The two checksum files are written by `scripts/compute-wasm-hashes.sh` and are
the basis for the `verify-build-checksums` CI job (issue #592): every build
uploads them with the WASM artifacts, and a job that rebuilds the contracts
fails if the recorded hashes no longer match the freshly built binaries — so
deployment targets cannot drift from what the repository actually builds.

and moves the `.deployments/<network>/latest` symlink to the new tag. Verification,
health checks, and rollback all read from there, so **never hand-edit or delete
this directory** — it is the only record of what is live.

---

## Deploying

```bash
export STELLAR_SECRET_KEY="S...."          # deployer identity, required
./scripts/deploy-contracts.sh <network> [tag] [verify]
```

| Argument | Default | Meaning |
| --- | --- | --- |
| `network` | `testnet` | `testnet` or `mainnet`; anything else exits non-zero |
| `tag` | `YYYYmmdd-HHMMSS` | Names the artifact directory. Pass an explicit tag to make a deploy reproducible/referenceable. |
| `verify` | `false` | Pass `true` to chain `verify-contracts.sh` immediately after deploying |

The script picks the RPC URL and network passphrase from the network name, installs
the Stellar CLI if missing, builds every crate under `contracts/` to
`wasm32-unknown-unknown`, runs `wasm-opt -O4` when available, then deploys each
`.wasm` and records its contract ID and SHA-256.

**Mainnet is not gated by this script.** Access control lives in the workflow
(environment protection rules), not in the shell. Do not run it against mainnet by hand.

## Verifying

```bash
./scripts/verify-contracts.sh <network> [tag]     # tag defaults to `latest`
```

Rebuilds the contracts locally and compares each local WASM hash against the hash
recorded at deploy time. Any mismatch sets the overall status to `FAIL` and exits
non-zero, which fails the workflow.

A mismatch means the deployed binary is not reproducible from the current source —
treat it as a release blocker, not a flake. The usual causes are a dirty working
tree at deploy time, a toolchain version drift (see `rust-toolchain.toml`), or
`wasm-opt` being present on one machine and absent on the other.

## Health checks

```bash
./scripts/health-check.sh <network> [tag]
```

Invokes a read-only entrypoint on each deployed contract and asserts it responds.
This catches contracts that deployed successfully but are not initialised — a class
of failure hash verification cannot see.

## Rolling back

```bash
./scripts/rollback.sh <network> [tag]
```

With no tag it lists the available deployments and prompts. It refuses to run if the
target tag has no artifact directory, and short-circuits when the target is already
`latest`.

Rollback re-points `latest` at a previously deployed tag; **it does not delete or
disable the newer contracts**, which remain on-chain at their own addresses. Any
off-chain config that pins a contract ID (backend env, client build) has to be
updated to match, or the rollback has no user-visible effect.

---

## CI/CD workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `deploy-automated.yml` | manual dispatch / push | Full pipeline: deploy → verify → health check → notify, plus a migration compatibility check |
| `cd-testnet.yml` | push to `main` | Continuous testnet deployment with automatic canary → promote (issue #591) and build-checksum verification (issue #592) |
| `cd-mainnet.yml` | release/manual | Guarded mainnet release: canary deploy → verify → manual approval → promote (issue #591), plus build-checksum verification (issue #592) |

`deploy-automated.yml` jobs, in order:

1. **determine-network** — resolves the target network from the trigger
2. **deploy** — installs Rust + the Stellar CLI, restores the Cargo cache, deploys,
   verifies, health-checks, then uploads both the artifacts and the WASM binaries
3. **notify** — posts the outcome to Slack via `SLACK_WEBHOOK`
4. **migration-check** — flags breaking storage/interface changes against the
   previous deployment

Because deploy uploads `.deployments/**` and `*.wasm` as workflow artifacts, a run
can be audited after the fact even though the runner is ephemeral.

---

## Canary promotion in the app CD pipelines (issue #591)

`cd-testnet.yml` and `cd-mainnet.yml` deploy the application through a canary
stage before any full rollout. The flow is identical in shape — **deploy one
instance → verify health + smoke checks → roll out the rest only if the canary
is healthy** — and differs only in the promotion gate:

| Environment | Canary behaviour | Promotion gate |
| --- | --- | --- |
| **Testnet** (`cd-testnet.yml`, ephemeral/dev) | Fully automatic. Canary deploys on push to `main`, `verify-canary` runs `scripts/health-check.sh --api-url <canary> --skip-contracts` plus a readiness wait, then `promote-canary` rolls out to the full fleet. | None — promotion happens automatically when the canary is healthy. |
| **Mainnet** (`cd-mainnet.yml`, production) | Canary deploys only after the existing manual deployment approval. `verify-canary` must pass, then `promote-approval` waits for a second manual approval (GitHub environment protection rules on the `mainnet` environment) before `promote-canary` rolls out. | Manual approval required. |

Jobs in both pipelines:

1. **deploy-canary** — deploys a single instance (outputs `canary-url`)
2. **verify-canary** — waits for readiness, then runs API health + smoke checks
   (`health-check.sh --api-url ... --skip-contracts`) and on-chain contract
   checks when deployment artifacts are present
3. **promote-canary** — full rollout, followed by a post-promotion health check
4. **abort-canary** — if verification fails, rolls back the canary instance and
   the run fails; nothing beyond the canary is ever rolled out

The canary commands are currently placeholders (kubectl / docker compose
profiles) because the app deployment step itself is a placeholder — wire the
real single-instance rollout primitive in `deploy-canary` and the full rollout
in `promote-canary`, keeping the same job structure. `CANARY_URL` and `API_URL`
are configurable via repository secrets with localhost fallbacks.

For on-chain contracts, `scripts/health-check.sh` also gained an `--api-url`
mode (HTTP health, metrics and root checks) used by the canary verification
steps.

### Required secrets

| Secret | Used by |
| --- | --- |
| `STELLAR_SECRET_KEY` | deploy, rollback |
| `SLACK_WEBHOOK` | notification job |

Rotate `STELLAR_SECRET_KEY` through repository environment settings only; it must
never appear in a workflow file, a script default, or a log line.

---

## Failure playbook

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `Unknown network` | typo'd network argument | Only `testnet`/`mainnet` are valid |
| `STELLAR_SECRET_KEY ... required` | secret not exported into the job | Check the environment binding on the job, not just the repo secret |
| Verification `FAIL` on one contract | non-reproducible build | Confirm a clean tree and the pinned toolchain; rebuild and redeploy rather than accepting the mismatch |
| Health check fails after a green deploy | contract deployed but not initialised | Run the contract's init entrypoint, then re-run the health check |
| `No latest deployment found` | `.deployments/` missing (fresh runner) | Download the artifacts from the last successful run, or redeploy |
| Migration check reports breaking changes | storage layout or interface changed | Ship a migration, or cut a new contract address instead of upgrading in place |

---

## Local dry run

Against testnet, with a funded throwaway key:

```bash
export STELLAR_SECRET_KEY="S...."
./scripts/deploy-contracts.sh testnet local-$(date +%s) true
./scripts/health-check.sh testnet
```

`contracts/UPGRADE_PROCEDURE.md` covers the upgrade mechanism itself (proxy,
admin authorisation, storage migration); this document covers only the automation
that drives it.
