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

# Mainnet
./scripts/deploy-contracts.sh mainnet
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
