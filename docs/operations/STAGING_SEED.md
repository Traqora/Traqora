# Staging Seed Runbook

How to populate a staging environment with deterministic Traqora fixtures.
Implements **issue #749**.

## Why

`npm run db:seed` inserts four rows: one admin, one wallet, the static flight
list and a single booking. That is enough for a unit test and not enough to
exercise staging — there is no way to look at a bookings list, a refund queue or
a failed-payment dashboard and see anything plausible in it.

This seeder generates a configurable volume of flights, passengers and bookings
with realistic status distributions, so those screens have data behind them
before a QA pass starts.

## Contract

```
./scripts/seed-staging.sh [options]
```

| option                            | meaning                                                     | default    |
| --------------------------------- | ----------------------------------------------------------- | ---------- |
| `-e, --environment <env>`         | `local` \| `staging` \| `production`                          | `staging`  |
| `--volume <n>`                    | synthetic flights (and one booking each), 1–20000             | `250`      |
| `--only <list>`                   | subset of `admin,users,flights,bookings`                      | all        |
| `--password <pw>`                 | password for the seeded super admin                           | —          |
| `--dry-run`                       | validate and print the plan, write nothing, open no connection | off       |
| `--reset`                         | delete the rows this seeder owns before inserting              | off        |
| `--allow-production`              | permit `--environment production`                             | off        |
| `--seed <n>`                      | deterministic PRNG seed                                       | `20260927` |
| `--now <iso>`                     | fixed clock, so timestamps are reproducible                   | now        |
| `--skip-migrations`               | do not apply pending migrations first                         | off        |

Environment: `DATABASE_URL` (required), `SEED_ADMIN_PASSWORD`, `SEED_RANDOM_SEED`,
`SEED_NOW`.

**Exit codes** — `0` seeded (or `--help`), `1` refused or failed, `2` usage
error. A wrapper can therefore tell a typo from a runtime failure.

## Running it

```bash
# 1. See what would happen. Safe on a laptop with no database running.
DATABASE_URL='postgres://user:pass@staging-db:5432/traqora' \
  ./scripts/seed-staging.sh --dry-run
# admin=1 users=3 flights=250 bookings=250

# 2. Seed for real.
DATABASE_URL='postgres://user:pass@staging-db:5432/traqora' \
SEED_ADMIN_PASSWORD='<from the password manager>' \
  ./scripts/seed-staging.sh --volume 500

# 3. Start over.
… ./scripts/seed-staging.sh --reset
```

Against a `docker compose.prod.yml --profile staging` stack, the database
publishes no host port, so exec into the API container instead:

```bash
docker compose -f docker-compose.prod.yml --profile staging exec \
  -e SEED_ADMIN_PASSWORD='…' api ../scripts/seed-staging.sh
```

## Guards

The script is a data-writing tool pointed at a shared environment, so it refuses
the ways that goes wrong:

| guard                                            | exit |
| ------------------------------------------------ | ---- |
| `DATABASE_URL` missing                            | 1    |
| `DATABASE_URL` is a `sqlite:` URL                | 1    |
| contract IDs unset or still `DEFAULT_ID`          | 1    |
| admin password shorter than 12 characters         | 1    |
| `--environment production` without `--allow-production` | 1 |
| `production` target whose host looks like prod    | 1    |
| unknown option, bad `--volume`, bad `--only`      | 2    |

`--dry-run` short-circuits before any of the database work, so it needs only
`DATABASE_URL` to be syntactically present.

The same guards live in `packages/backend/src/db/seeds/stagingSeedPlan.ts` and
are unit tested; the shell wrapper repeats the cheap ones so a misconfiguration
fails in a second rather than after a `ts-node` boot.

## Idempotency and reset

Re-running is safe: rows are keyed, and existing keys are skipped rather than
re-inserted. A second run reports `written: {"admin":0,"users":0,…}`.

The keys are:

| dataset   | key                                                     |
| --------- | ------------------------------------------------------- |
| flights   | `rawData->>'seedKey'` (`flight-0001`, …)                 |
| passengers| generated email (`staging.<name>.<name><n>@example.test`) |
| bookings  | `idempotencyKey` (`staging-flight-0001`, …)              |
| users     | the wallet address                                       |
| admin     | the email address                                        |

`--reset` deletes exactly those keys, so pointing it at a database that also
holds operator-created data leaves that data alone.

## Determinism

Same `--seed` plus same `--now` produces byte-identical rows. Pin both when you
need a reproducible staging database, for example to compare a migration's
before/after state:

```bash
SEED_RANDOM_SEED=42 SEED_NOW=2026-09-01T00:00:00.000Z ./scripts/seed-staging.sh
```

All fixture accounts are fake. `SEED_SOROBAN_ADDRESS` is a structurally valid
but unissued Stellar account; it holds nothing and cannot sign.

## Known blocker (pre-existing, not introduced here)

The shared TypeORM data source currently fails to initialise against PostgreSQL:

```
TypeORMError: Column projectId of Entity CarbonOffset does not support length property.
```

`CarbonOffset` declares both a `@ManyToOne project` relation and an explicit
`@Column projectId`, and the two collide during metadata validation. This
affects `npm run db:seed` identically and is unrelated to this seeder — the
insert/reset path in `seedStaging.ts` is verified against PostgreSQL directly.
Fixing the entity is tracked separately.

## Files

| path                                                       | role                              |
| ---------------------------------------------------------- | --------------------------------- |
| `scripts/seed-staging.sh`                                   | operator wrapper, env preflight  |
| `packages/backend/src/db/seeds/seedStaging.ts`              | CLI entrypoint, database writes  |
| `packages/backend/src/db/seeds/stagingSeedPlan.ts`          | pure plan + guards, unit tested  |
| `packages/backend/tests/seeds/stagingSeedPlan.test.ts`      | regression tests                 |
| `packages/backend/src/db/dataSource.ts`                     | `startupMigrations` promise export |

The data source now exports `startupMigrations`, a promise for the boot-time
migration check. That check used to call `showMigrations()` before the
connection existed, so it rejected with `CannotExecuteNotConnectedError` and the
rethrow became an unhandled rejection. One-shot entrypoints need to be able to
*wait* for the schema, which is what the export is for.
