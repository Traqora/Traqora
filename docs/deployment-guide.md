# Contract Deployment Guide

## Overview

This guide covers the automated deployment pipeline for Traqora Soroban smart contracts. The deployment system supports testnet and mainnet environments with verification, health checks, and rollback capabilities.

## Prerequisites

- Rust toolchain with `wasm32-unknown-unknown` target
- Stellar CLI (`cargo install stellar-cli`)
- Stellar account secret key with sufficient funds
- Network RPC URL and passphrase

## Directory Structure

```
.deployments/
├── testnet/
│   ├── latest -> 20250101-120000/
│   ├── 20250101-120000/
│   │   ├── contracts.json
│   │   ├── flight_registry/
│   │   │   └── flight_registry.wasm
│   │   ├── booking/
│   │   │   └── booking.wasm
│   │   └── ...
│   └── rollback-20250101-130000.log
├── mainnet/
│   └── ...

scripts/
├── deploy-contracts.sh    # Build + deploy contracts
├── verify-contracts.sh    # Verify deployed WASM hashes
├── health-check.sh        # Validate contract responses
└── rollback.sh            # Rollback to previous deployment
```

## Manual Deployment

### Deploy to Testnet

```bash
export STELLAR_SECRET_KEY="S..."
./scripts/deploy-contracts.sh testnet my-deployment-tag true
```

Parameters:
1. Network: `testnet` or `mainnet`
2. Tag: unique identifier (default: timestamp)
3. Verify: `true` to run verification after deploy

### Verify Deployment

```bash
./scripts/verify-contracts.sh testnet <tag>
```

Compares deployed WASM hashes against local builds. Fails if any hash mismatch is detected.

### Health Check

```bash
./scripts/health-check.sh testnet <tag>
```

Invokes each deployed contract to verify they respond correctly.

### Rollback

```bash
./scripts/rollback.sh testnet <target-tag>
```

Reverts the deployment pointer to a previous deployment. Logs the rollback action.

## Automated CI/CD Pipeline

The `.github/workflows/deploy-automated.yml` workflow handles automated deployments:

| Trigger | Network | Environment |
|---------|---------|-------------|
| Push to `develop` | Testnet | `testnet` |
| Push to `main` | Testnet | `testnet` |
| Tag `v*` | Mainnet | `mainnet` |
| Manual dispatch | Configurable | Configurable |

### Workflow Steps

1. **Determine Network** - Selects target network based on branch/tag
2. **Build & Deploy** - Compiles contracts, deploys to network
3. **Verification** - Validates WASM hashes match source
4. **Health Check** - Invokes each contract method
5. **Upload Artifacts** - Stores deployment artifacts for 30 days
6. **Notification** - Sends Slack notification with deployment status
7. **Migration Check** - On mainnet, checks for breaking changes

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `STELLAR_SECRET_KEY` | Deployer account secret key |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications |

## Migration Compatibility

When deploying to mainnet, the CI pipeline checks for breaking changes in contract packages. Changes that may require migration:

- Storage schema changes
- Function signature changes
- New required initialization parameters
- Event structure changes

## Rollback Strategy

1. **Automatic**: CI stores the previous deployment artifacts
2. **Manual**: Use `scripts/rollback.sh` to revert to any tagged deployment
3. **Emergency**: Re-run the previous successful CI workflow

## Verification Checklist

- [ ] WASM hashes match between local build and deployed contract
- [ ] Contract responds to basic invocations
- [ ] All contract IDs are recorded in deployment artifacts
- [ ] No breaking changes detected (mainnet only)
- [ ] Deployment notification sent
