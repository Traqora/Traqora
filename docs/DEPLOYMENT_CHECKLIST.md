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

## Phase 4: Rollback Strategy
If critical issues occur during deployment and cannot be quickly patched:

1. **Revert Frontend**: Restore the previous Next.js production build/container image.
2. **Revert Backend**: Restore the previous backend build/container image.
3. **Database Restore**: If schema changes are breaking and cannot be backward-compatible, restore the database from the pre-deployment backup.
4. **On-chain Action**: If contract bugs are present, freeze operations (if the contract supports a pause/admin freeze method) or redeploy/upgrade the contract address.
