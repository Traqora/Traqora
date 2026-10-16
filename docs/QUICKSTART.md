# Contributor Quickstart

Welcome to Traqora! This guide gets you from a fresh clone to a fully running
local environment: backend API, React client, and Soroban smart contracts —
plus how to run every test suite.

> New contributors should also read [CONTRIBUTING.md](../CONTRIBUTING.md) and
> the [Code of Conduct](../CODE_OF_CONDUCT.md).

## Repository layout

This is an npm-workspaces monorepo:

| Path                | What it is                                              |
| ------------------- | ------------------------------------------------------- |
| `packages/backend`  | Node/Express REST + WebSocket API (TypeScript, TypeORM) |
| `packages/client`   | Next.js/React frontend                                  |
| `contracts`         | Soroban smart contracts (Rust)                          |
| `docs/`             | Documentation (you are here)                            |
| `docker-compose.yml`| Full local stack: Postgres, Redis, Stellar, services    |

## Prerequisites

- **Node.js >= 18** and npm (`node -v` to check)
- **Docker + Docker Compose** (recommended path)
- **Rust** with the `wasm32-unknown-unknown` target (contracts only):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  rustup target add wasm32-unknown-unknown
  ```
- A Stellar CLI / `soroban` tooling if you plan to deploy contracts locally
  (see [contract deployment automation](./contract-deployment-automation.md))

## 1. Clone and install

```bash
git clone https://github.com/Traqora/Traqora.git
cd Traqora
npm install          # installs all workspaces (backend + client)
```

## 2. Configure environment

A central example file documents every variable in the monorepo:

```bash
cp env.example .env            # repo root (backend + shared config)
cp packages/backend/env.example packages/backend/.env   # backend-specific overrides
```

For local development the defaults are sensible. Key variables:

| Variable              | Default                              | Purpose                     |
| --------------------- | ------------------------------------ | --------------------------- |
| `PORT`                | `3001`                               | Backend API port            |
| `CORS_ORIGIN`         | `http://localhost:3000`              | Client origin               |
| `DATABASE_URL`        | `postgres://postgres:postgres@db:5432/traqora` | Postgres connection |
| `REDIS_URL`           | `redis://localhost:6379`             | Redis connection            |
| `STELLAR_NETWORK`     | `testnet`                            | `testnet`, `standalone`, …  |
| `HORIZON_URL`         | `https://horizon-testnet.stellar.org`| Horizon endpoint            |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001`              | API URL used by the client  |

Never commit real secrets. See [SECURITY.md](../SECURITY.md) and
[docs/security/secrets-management.md](./security/secrets-management.md).

## 3. Run everything with Docker (recommended)

```bash
docker compose up --build
```

This starts:

| Service    | URL                        | Notes                          |
| ---------- | -------------------------- | ------------------------------ |
| Postgres   | `localhost:5432`           | `postgres/postgres`, db `traqora` |
| Redis      | `localhost:6379`           |                                |
| Stellar    | Horizon `localhost:8000`, Soroban RPC `localhost:8000/soroban/rpc` | standalone network via `stellar/quickstart` |
| Backend    | http://localhost:3001      | hot-reloading (dev target)     |
| Client     | http://localhost:3000      | Next.js dev server             |

Optional extras:

```bash
docker compose up -d                                   # background
docker compose --profile cluster up                    # Redis Cluster (ports 7000-7005)
```

Production-style compose lives in `docker-compose.prod.yml`; see
[DOCKER_SETUP.md](../DOCKER_SETUP.md) for details.

## 4. Run services without Docker

### Infrastructure only

Start just the dependencies, then run apps natively:

```bash
docker compose up -d db redis stellar
```

### Backend

```bash
cd packages/backend
npm install
cp env.example .env
npm run migration:run        # apply TypeORM migrations
npm run db:seed              # optional seed data
npm run dev                  # ts-node-dev on :3001
```

Useful database scripts:

```bash
npm run migration:run        # apply pending migrations
npm run migration:revert     # roll back last migration
npm run db:seed              # seed the database
```

### Client

```bash
cd packages/client
npm install
npm run generate:api-types   # regenerate typed API client from OpenAPI spec
npm run dev                  # Next.js on :3000
```

The client expects the backend on `http://localhost:3001`
(override with `NEXT_PUBLIC_API_URL`).

## 5. Smart contracts

Contracts are Rust/Soroban in `contracts/`. The root `Makefile` wraps the
common tasks:

```bash
make build        # cargo build --target wasm32-unknown-unknown --release
make optimize     # build + wasm-opt optimization
make check-size   # optimize + enforce 500 KB WASM size limit
make test         # cargo test --workspace
make fmt          # rustfmt check
make clippy       # clippy with warnings as errors
make audit        # cargo audit
```

For a deep dive into the contract test suite (coverage targets,
property-based tests, integration flows), see
[contracts/TEST_GUIDE.md](../contracts/TEST_GUIDE.md). Migration notes for
contract upgrades live in [contracts/MIGRATION_NOTES.md](../contracts/MIGRATION_NOTES.md).

## 6. Test suites

Run everything from the monorepo root:

```bash
npm test          # all workspaces
npm run lint      # eslint across workspaces
npm run typecheck # tsc --noEmit across workspaces
```

### Backend (Jest)

```bash
cd packages/backend
npm test                    # unit tests
npm run test:integration    # integration tests (serial)
npm run test:perf           # performance tests (tests/performance/)
```

### Client

```bash
cd packages/client
npm test            # Jest unit tests
npm run test:e2e    # Playwright end-to-end tests
npm run test:a11y   # Playwright accessibility tests
```

Playwright browsers are needed for e2e/a11y runs:
`npx playwright install`.

### Contracts (Cargo)

```bash
cd contracts
cargo test                                    # full workspace suite
cargo test --test integration_test            # single integration file
cargo llvm-cov --workspace --html             # coverage report
# or from the repo root:
./contracts/coverage.sh
```

## Troubleshooting

- **Port conflicts**: stop other services or change `PORT` /
  compose port mappings.
- **Backend can't reach DB/Redis**: when running natively make sure you
  started `db` and `redis` containers and that `DATABASE_URL` points at
  `localhost` (compose uses the service hostnames `db`/`redis` instead).
- **Stellar healthcheck failing**: the quickstart container takes a while to
  become healthy; check `docker compose logs stellar`.
- **Client API errors**: confirm the backend is running and
  `NEXT_PUBLIC_API_URL` matches it.

## Next steps

- Browse open issues labeled `good first issue`.
- Read the [deployment guide](./deployment-guide.md) and
  [API docs](./api/README.md).
- Security concerns? Follow the disclosure process in
  [SECURITY.md](../SECURITY.md); data handling is documented in
  [GDPR_COMPLIANCE.md](../GDPR_COMPLIANCE.md).
