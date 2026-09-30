# Production Deployment Checklist

Use this checklist to prepare, execute, and verify a deployment of the Traqora application to production, staging, or standalone test environments.

---

## Phase 1: Pre-Deployment Preparation
Before deploying, ensure all prerequisites are met to avoid release failures or service interruptions.

- [ ] **Code Integrity**
  - [ ] All code is merged into `main` (or the target deployment branch).
  - [ ] CI/CD pipeline passes successfully (all linting, type checks, and tests are green).
- [ ] **Smart Contracts (Soroban)**
  - [ ] Smart contracts build cleanly using `soroban build` or `cargo build`.
  - [ ] Contract WASM binaries have been optimized if deploying to production.
  - [ ] Dev keys or production keys for Stellar deployment accounts are funded and secured.
- [ ] **Infrastructure Health**
  - [ ] Production database (PostgreSQL / SQLite) is online and reachable.
  - [ ] Redis cache cluster is online, healthy, and configured for caching/rate-limiting.
  - [ ] Stellar Horizon and Soroban RPC endpoints are fully accessible and synced.
- [ ] **Secrets & Keys Inventory**
  - [ ] Prepare a secure `env` configuration file based on [env.example](../env.example).
  - [ ] Generate a secure 32-character minimum secret key for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
  - [ ] Generate a secure 12-character minimum key for `ADMIN_API_KEY`.
  - [ ] Ensure the Stellar transaction signing secret key (`STELLAR_SECRET_KEY`) is securely stored (never committed to git).
- [ ] **Communication**
  - [ ] Schedule the maintenance window (if applicable) and notify users/stakeholders.

---

## Phase 2: Deployment Execution
Follow these steps in order to deploy the blockchain smart contracts, database, backend, and frontend.

### Step 1: Deploy Soroban Smart Contracts
Smart contracts must be deployed *first* to obtain the Contract IDs needed by the backend.
- [ ] Deploy each contract to the target network (e.g., `testnet` or `mainnet`):
  - [ ] **Booking Contract** $\rightarrow$ Save Contract ID
  - [ ] **Airline Contract** $\rightarrow$ Save Contract ID
  - [ ] **Refund Contract** $\rightarrow$ Save Contract ID
  - [ ] **Loyalty Contract** $\rightarrow$ Save Contract ID
  - [ ] **Governance Contract** $\rightarrow$ Save Contract ID
  - [ ] **Token Contract** $\rightarrow$ Save Contract ID
  - [ ] **Flight Registry Contract** $\rightarrow$ Save Contract ID
- [ ] Initialize the deployed contracts with correct parameters (e.g., admin keys, parameters, initial token supplies) using CLI commands.

### Step 2: Configure Environment Variables
- [ ] Create a `.env` file at the repository root and/or in `packages/backend/` using the values gathered.
- [ ] Fill in the exact Contract IDs retrieved from Step 1:
  ```env
  BOOKING_CONTRACT_ID=0x...
  AIRLINE_CONTRACT_ID=0x...
  REFUND_CONTRACT_ID=0x...
  LOYALTY_CONTRACT_ID=0x...
  GOVERNANCE_CONTRACT_ID=0x...
  TOKEN_CONTRACT_ID=0x...
  FLIGHT_REGISTRY_CONTRACT_ID=0x...
  ```
- [ ] Set `NODE_ENV=production` (or `staging`).
- [ ] Verify the Database and Redis URLs are configured.

### Step 3: Run Database Migrations
- [ ] Backup the existing production database before executing migrations.
- [ ] Run the database migration script to update the schema:
  ```bash
  # Example migration command (if packages/backend uses a CLI/migration command)
  npm run db:migrate --workspace=packages/backend
  ```

### Step 4: Build and Start Backend Service
- [ ] Build the backend package:
  ```bash
  npm run build --workspace=packages/backend
  ```
- [ ] Start the backend application:
  ```bash
  npm run start --workspace=packages/backend
  ```
- [ ] Confirm the backend is listening on the designated `PORT` (default `3001`).

### Step 5: Build and Start Client/Frontend
- [ ] Configure the client environment variables (set `NEXT_PUBLIC_API_URL` to point to the backend service).
- [ ] Build the Next.js client package:
  ```bash
  npm run build --workspace=packages/client
  ```
- [ ] Start the frontend application:
  ```bash
  npm run start --workspace=packages/client
  ```

---

## Phase 3: Post-Deployment Verification
Verify that the services are healthy and running correctly.

- [ ] **Health Checks**
  - [ ] Query backend `/health` endpoint and verify it returns a `200 OK` response with database and Redis statuses.
- [ ] **Authentication Flow**
  - [ ] Connect a wallet (e.g., Freighter) from the frontend.
  - [ ] Verify a signature challenge is successfully requested, signed, and authenticated.
- [ ] **Telemetry & Monitoring**
  - [ ] Verify logs are feeding into the collector at the correct `LOG_LEVEL`.
  - [ ] If OpenTelemetry is enabled, verify traces are arriving in the APM system.
- [ ] **Smoke Tests**
  - [ ] Perform a flight search (validates Amadeus API connectivity and caching).
  - [ ] Attempt a test flight booking to confirm contract call initiation and database writes.

---

## Phase 4: Rollback Runbook

Traqora has two independent rollback mechanisms, because "the backend
deployment" and "the on-chain contracts" fail and recover in completely
different ways:

| What broke                              | Script                          | Triggered by |
| ---------------------------------------- | -------------------------------- | ------------ |
| Backend/frontend app deploy is unhealthy | `scripts/rollback-backend.sh`    | Automatically, in CD (see below) |
| A deployed Soroban contract is bad       | `scripts/rollback.sh`            | Manually, by an operator |

### 4.1 Automated backend rollback (issue #589)

`.github/workflows/cd.yml` runs `deploy-app` then `smoke-tests` on every
deploy. If **either** fails, the `rollback` job runs automatically:

1. **Determine previous tag** — looks up the most recent successful workflow
   run on `main` and uses its commit SHA as the rollback target (falls back
   to the `latest` tag if none is found).
2. **Roll back** — runs `scripts/rollback-backend.sh <environment>
   <previous_tag> --force`, which:
   - Re-points the `docker-compose.prod.yml` stack at the previous image
     tag and waits for the containers to come up.
   - Polls `GET /health` (up to 6 retries, 5s apart) until it returns
     `200`/`204`, or gives up.
   - Posts a Slack alert (via `SLACK_WEBHOOK_URL`, if configured) both when
     the rollback starts and when its outcome is known — success or
     "still unhealthy, needs a human".
   - Exits non-zero if the rollback itself didn't restore health, which
     fails the `rollback` job and is visible in `notify`.
3. **Contract rollback (if applicable)** — if contracts were deployed as
   part of this release, `scripts/rollback.sh <network> latest` is also run
   to point contract references back at the last known-good deployment.

Run it by hand against a live environment:

```bash
API_URL=https://api.staging.traqora.example \
SLACK_WEBHOOK_URL=https://hooks.slack.com/... \
  ./scripts/rollback-backend.sh staging <previous-tag> --api-url "$API_URL"
```

Add `--force` to roll back even when the health check currently passes
(e.g. rolling back for a reason the health check can't see, like a bad
migration). Add `--dry-run` to print the exact plan — health verdict, the
`docker compose` command that would run, and the alert text — without
changing anything or sending a real alert.

**Verified by a dry-run test.** `.github/workflows/rollback-drill.yml` runs
`scripts/rollback-backend.sh --dry-run` against both an unreachable target
(rollback path) and a stub healthy server (no-op path) on every change to
the script, plus monthly on a schedule, so the runbook can't silently rot.

### 4.2 Manual contract rollback

If a deployed Soroban contract has a bug and needs to point back at a
previous on-chain deployment:

```bash
STELLAR_SECRET_KEY=... ./scripts/rollback.sh <network> <deployment-tag>
```

Lists available deployment tags for the network when `<deployment-tag>` is
omitted, and asks for confirmation before repointing `latest`. See the
script's own header for full usage.

### 4.3 If rollback doesn't fix it

1. **Database Restore** — if schema changes are breaking and cannot be
   backward-compatible, restore the database from the pre-deployment
   backup (Phase 1).
2. **On-chain Action** — if the bug is in contract logic itself (not just
   which address is referenced), freeze operations via the contract's
   pause/admin mechanism if it has one, then plan a proper upgrade.
3. Escalate per `SECURITY_INCIDENT_RESPONSE.md` if user funds or data are at
   risk.
