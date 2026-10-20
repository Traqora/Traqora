# Contract Deployment Runbook

Step-by-step procedure for deploying and upgrading Traqora's Soroban contracts on **testnet** and **mainnet**.

> **Upgrades:** Deploying a new version of an already-deployed, upgradeable contract is *not* a plain redeploy — it must go through the 48-hour timelock procedure described in [contracts/UPGRADE_PROCEDURE.md](../../contracts/UPGRADE_PROCEDURE.md). Read that document first if you are upgrading rather than doing a fresh deployment.

## Prerequisites

- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-shells) installed (`cargo install --locked stellar-cli` — the deploy script installs it automatically if missing).
- Rust toolchain with the `wasm32-unknown-unknown` target (see `rust-toolchain.toml`).
- `jq` installed.
- A funded deployer account secret key:
  - **Testnet:** fund via the [Stellar testnet faucet](https://laboratory.stellar.org/#account-create?network=test).
  - **Mainnet:** ensure the deployer holds enough XLM for deployment fees and minimum balances.
- Export the key (never commit it):
  ```bash
  export STELLAR_SECRET_KEY="S..."
  ```

## Fresh deployment

### Step 1 — Run the deploy script

```bash
# Testnet
./scripts/deploy-contracts.sh testnet

# Mainnet: explicit confirmation is required (see "Network guard" below)
CONFIRM_MAINNET=mainnet ./scripts/deploy-contracts.sh mainnet
```

Optional arguments:

```bash
./scripts/deploy-contracts.sh <network> <deploy-tag> <verify>
# e.g. tag a release and verify afterwards:
./scripts/deploy-contracts.sh testnet v1.2.0 true
```

The script will:

1. Build all contracts (`cargo build --target wasm32-unknown-unknown --release` in `contracts/`).
2. Optimize WASM binaries with `wasm-opt` if available.
3. Deploy each contract via `stellar contract deploy`.
4. Save artifacts to `.deployments/<network>/<tag>/`, including `contracts.json` mapping contract names to IDs.
5. Update the `.deployments/<network>/latest` symlink.
6. Optionally run `scripts/verify-contracts.sh <network>` when `verify=true`.

Example output:

```
=== Deploying Contracts to testnet ===
Tag: 20260826-120000
  Deploying booking...
    Contract ID: CABC...
    WASM Hash: abc123...
```

### Network guard

Before the script builds or deploys anything, it runs
`resolve_network_config` from [`scripts/lib/network-guard.sh`](../../scripts/lib/network-guard.sh).
The guard makes sure the RPC endpoint and the network passphrase both belong to the network you
asked for, so a mainnet deploy cannot use testnet settings or the other way round.

**Inputs**

| Input | Default | Rule |
|-------|---------|------|
| `<network>` (first argument) | `testnet` | Must be `testnet` or `mainnet` |
| `RPC_URL` | testnet: `https://soroban-testnet.stellar.org:443`, mainnet: `https://soroban-rpc.stellar.org:443` | Must use `https`. For mainnet it must not contain `testnet`, `futurenet`, `localhost` or `127.0.0.1`. For testnet it must not contain `mainnet` or be the default mainnet RPC |
| `NETWORK_PASSPHRASE` | The standard passphrase for the network | Must be **exactly** `Test SDF Network ; September 2015` (testnet) or `Public Global Stellar Network ; September 2015` (mainnet) |
| `CONFIRM_MAINNET` | unset | Must be `mainnet` for a mainnet target |

**Output:** the script prints the resolved RPC and passphrase and passes them directly to
`stellar contract deploy` (`--rpc-url` / `--network-passphrase`). It does not use a
`stellar network` alias, so a stale local alias can no longer send a deploy to the wrong network.

**Error cases:** the script stops before building, deploying or writing to `.deployments/`.

| Exit code | Cause |
|-----------|-------|
| `2` | Unknown network |
| `3` | The passphrase does not match the network. This includes typos such as `October 2015` |
| `4` | The RPC URL is not `https`, or it points at the other network or a local endpoint |
| `5` | Mainnet target without `CONFIRM_MAINNET=mainnet` |

The configuration checks (2–4) run before the confirmation check (5). A misconfigured mainnet
deploy therefore reports the real problem, not just a missing confirmation.

In CI, `cd.yml` and `deploy-automated.yml` set `CONFIRM_MAINNET` to the same value as the
selected network. A testnet run leaves it as `testnet`, so the mainnet opt-in is only present
when the workflow itself has chosen mainnet.

Before this change, the script cleared `RPC_URL` and `NETWORK_PASSPHRASE` before applying its
defaults, so overrides were silently ignored. Overrides now take effect, but only after they
pass the checks above.

Regression tests (no Stellar CLI or network access needed):

```bash
npm run test:scripts        # or: bash scripts/tests/network-guard.test.sh
```

### Step 2 — Record contract IDs

Copy `contracts.json` from `.deployments/<network>/<tag>/` into your secrets manager / deployment notes and update backend environment variables (contract IDs referenced by `packages/backend`) before restarting services. Never commit real contract IDs for mainnet without maintainer approval.

### Step 3 — Verify health

```bash
./scripts/health-check.sh testnet          # or mainnet
./scripts/health-check.sh testnet v1.2.0   # check a specific tagged deployment
```

The script invokes each deployed contract through its stored ID and reports PASS/FAIL. All contracts must report OK before proceeding.

## Upgrading an existing contract

1. Follow the full lifecycle in [UPGRADE_PROCEDURE.md](../../contracts/UPGRADE_PROCEDURE.md): **propose → approve (threshold) → wait 48h timelock → execute**.
2. The new implementation WASM hash used when scheduling the upgrade must match the hash of the artifact built from the approved commit — build first, then schedule.
3. After executing an upgrade, run the health check again and smoke-test booking/refund flows on the affected contract.

Rollback procedures are covered in the [rollback section of UPGRADE_PROCEDURE.md](../../contracts/UPGRADE_PROCEDURE.md) and `scripts/rollback.sh`.

## Rollback

If a fresh deployment is broken:

```bash
./scripts/rollback.sh <network>          # interactive: lists tags to roll back to
./scripts/rollback.sh <network> <tag>    # non-interactive
```

For upgradeable contracts, use the rollback path defined by the timelock mechanism (see UPGRADE_PROCEDURE.md). Point backend configuration back at the previous known-good contract IDs recorded in `.deployments/<network>/<previous-tag>/contracts.json`.

## Checklist

- [ ] Tests pass (`cargo test` in `contracts/`)
- [ ] Correct network selected (`testnet` vs `mainnet`) — double-check before running
- [ ] `STELLAR_SECRET_KEY` exported and funded; never echoed into logs or committed
- [ ] Deployment completed with a meaningful tag
- [ ] `scripts/verify-contracts.sh` run (or `verify=true`)
- [ ] `scripts/health-check.sh` PASS
- [ ] Contract IDs recorded and backend/client env vars updated
- [ ] Post-deployment smoke tests executed

## Related documents

- [Upgrade Procedure with 48-Hour Timelock](../../contracts/UPGRADE_PROCEDURE.md)
- [Deployment Guide](../deployment-guide.md)
- [Production Deployment Checklist](../DEPLOYMENT_CHECKLIST.md)
