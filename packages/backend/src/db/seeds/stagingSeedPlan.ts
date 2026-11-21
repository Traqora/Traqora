/**
 * Staging seed plan — pure, deterministic fixture generation (issue #749).
 *
 * This module contains no database access and no config imports so that both
 * the operator script (`scripts/seed-staging.sh`) and the CLI entrypoint
 * (`seedStaging.ts`) can agree on the same contract, and so the plan can be
 * unit tested without a live database.
 *
 * The plan is derived from a fixed seed, so two runs with the same options
 * produce byte-identical rows. That keeps staging reproducible and makes a
 * `--dry-run` diff meaningful.
 */

/** Environments this seeder knows how to target. */
export const SEED_ENVIRONMENTS = ['local', 'staging', 'production'] as const;
export type SeedEnvironment = (typeof SEED_ENVIRONMENTS)[number];

/** Fixture datasets, in the order they are applied. */
export const SEED_DATASETS = ['admin', 'users', 'flights', 'bookings'] as const;
export type SeedDataset = (typeof SEED_DATASETS)[number];

/** Result of parsing CLI arguments / environment. */
export type ParseResult =
  | { ok: true; options: StagingSeedOptions }
  | { ok: false; error: string; exitCode: 1 | 2 };

export interface StagingSeedOptions {
  /** Target environment. Defaults to `staging`. */
  environment: SeedEnvironment;
  /** Connection string. Required; never defaulted, so a typo cannot hit the wrong DB. */
  databaseUrl: string;
  /** How many synthetic flights to generate. Default 250. */
  volume: number;
  /** Restrict the run to a subset of datasets. */
  only: SeedDataset[];
  /** Print the plan without writing anything. */
  dryRun: boolean;
  /** Delete the rows owned by this seeder before inserting. */
  reset: boolean;
  /** Permit writing to a `production` environment. */
  allowProduction: boolean;
  /** Password for the seeded super admin. Required unless `dryRun`. */
  adminPassword: string | null;
  /** Do not run pending TypeORM migrations before seeding. */
  skipMigrations: boolean;
  /** Deterministic PRNG seed. */
  seed: number;
  /** Fixed clock so generated timestamps are reproducible. */
  now: Date;
}

export interface SeededPassenger {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  nationality: string;
  sorobanAddress: string;
}

export interface SeededFlight {
  key: string;
  flightNumber: string;
  airlineCode: string;
  fromAirport: string;
  toAirport: string;
  departureTime: Date;
  arrivalTime: Date;
  seatsAvailable: number;
  priceCents: number;
  status: string;
  delayMinutes: number;
  gate: string;
  terminal: string;
  dataSource: string;
  syncStatus: string;
}

export interface SeededBooking {
  key: string;
  flightKey: string;
  passengerKey: string;
  walletAddress: string;
  status: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface StagingSeedPlan {
  environment: SeedEnvironment;
  generatedAt: Date;
  datasets: SeedDataset[];
  admin: { email: string; role: typeof SEED_ADMIN_ROLE } | null;
  users: string[];
  passengers: SeededPassenger[];
  flights: SeededFlight[];
  bookings: SeededBooking[];
  counts: Record<SeedDataset, number>;
}

/** Default synthetic flight count for a staging environment. */
export const DEFAULT_SEED_VOLUME = 250;

/** Upper bound accepted for `--volume`, to keep a fat-finger from filling a disk. */
export const MAX_SEED_VOLUME = 20_000;

export const SEED_ADMIN_EMAIL = 'admin@traqora.com';
export const SEED_ADMIN_ROLE = 'super_admin' as const;

/**
 * Placeholder Stellar account used on every seeded row.
 *
 * Structurally valid (a `G` followed by 55 base32 characters) so the columns
 * satisfy their length constraints, but deliberately not a real account: it
 * holds no assets and cannot sign anything.
 */
export const SEED_SOROBAN_ADDRESS = `G${'S'.repeat(55)}`;

const BASE_WALLET = 'GBXWZ2B74NZD54NIPD7S6C7IWRK2VWRHX4E3H7UHT5XU5Z73OOBQWJ2I';
const SEED_TENANTS = 3;
const PASSENGERS_PER_BOOKING = 1;

const FIRST_NAMES = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Barbara', 'Edsger', 'Radia'];
const LAST_NAMES = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Torvalds', 'Liskov', 'Dijkstra', 'Perlman'];
const NATIONALITIES = ['NGA', 'USA', 'GBR', 'DEU', 'IND', 'BRA', 'KEN', 'JPN'];
const AIRPORTS = ['JFK', 'LHR', 'LOS', 'DXB', 'GRU', 'MIA', 'NBO', 'SIN', 'CDG', 'JNB', 'ORD', 'AMS'];
const TERMINALS = ['A', 'B', 'C', 'D'];
const DATA_SOURCES = ['AMADEUS', 'SABRE', 'MANUAL', 'FLIGHT_STATUS_API'];

/** Statuses a booking can realistically be in during QA. */
const BOOKING_STATUSES = [
  'created',
  'awaiting_payment',
  'paid',
  'onchain_submitted',
  'confirmed',
  'failed',
  'refunded',
];

/**
 * Flight statuses, weighted so the common case dominates. `CANCELLED` and
 * `DELAYED` exist so the failure paths have data behind them.
 */
const FLIGHT_STATUS_CYCLE = [
  'SCHEDULED',
  'SCHEDULED',
  'SCHEDULED',
  'SCHEDULED',
  'BOARDING',
  'LANDED',
  'DELAYED',
  'CANCELLED',
];

/** Deterministic PRNG (mulberry32). */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, values: readonly T[]): T =>
  values[Math.floor(random() * values.length) % values.length];

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/**
 * Reject a `production` target unless the operator opted in explicitly.
 *
 * The staging seeder is a data-writing tool; running it against production by
 * accident (wrong `DATABASE_URL`, stale `.env`) is the failure mode worth
 * spending code on.
 */
function assertNotProduction(options: {
  environment: SeedEnvironment;
  databaseUrl: string;
  allowProduction: boolean;
}): string | null {
  if (options.environment !== 'production' || options.allowProduction) return null;

  const reason = `refusing to seed the "production" environment`;
  const url = options.databaseUrl;
  if (/prod/i.test(url) && !/staging|localhost|127\.0\.0\.1/.test(url)) {
    return `${reason}: ${url} looks like a production database — pass --allow-production if this is intentional`;
  }
  return `${reason} — pass --allow-production if this is intentional`;
}

/**
 * Parse CLI arguments and environment into validated options.
 *
 * Exit code `2` is reserved for usage errors so a wrapper script can tell a
 * typo from a runtime failure.
 */
export function parseStagingSeedOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ParseResult {
  let environment: SeedEnvironment = 'staging';
  let volume = DEFAULT_SEED_VOLUME;
  let only: SeedDataset[] = [...SEED_DATASETS];
  let dryRun = false;
  let reset = false;
  let allowProduction = false;
  let adminPassword: string | null = env.SEED_ADMIN_PASSWORD ?? null;
  let skipMigrations = false;
  let seed = Number(env.SEED_RANDOM_SEED ?? 20260927);
  let now = env.SEED_NOW ? new Date(env.SEED_NOW) : new Date();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        return { ok: false, error: 'help', exitCode: 2 };
      case '--dry-run':
        dryRun = true;
        break;
      case '--reset':
        reset = true;
        break;
      case '--allow-production':
        allowProduction = true;
        break;
      case '--skip-migrations':
        skipMigrations = true;
        break;
      case '--environment':
      case '-e': {
        const value = argv[++i];
        if (!value) return { ok: false, error: '--environment requires a value', exitCode: 2 };
        if (!(SEED_ENVIRONMENTS as readonly string[]).includes(value)) {
          return {
            ok: false,
            error: `--environment must be one of ${SEED_ENVIRONMENTS.join(', ')} (got "${value}")`,
            exitCode: 2,
          };
        }
        environment = value as SeedEnvironment;
        break;
      }
      case '--volume': {
        const value = argv[++i];
        const parsed = Number(value);
        if (value === undefined || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SEED_VOLUME) {
          return {
            ok: false,
            error: `--volume must be an integer between 1 and ${MAX_SEED_VOLUME} (got "${value ?? ''}")`,
            exitCode: 2,
          };
        }
        volume = parsed;
        break;
      }
      case '--only': {
        const value = argv[++i];
        const requested = (value ?? '')
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        const unknown = requested.filter((entry) => !(SEED_DATASETS as readonly string[]).includes(entry));
        if (requested.length === 0 || unknown.length > 0) {
          return {
            ok: false,
            error: `--only must be a comma-separated subset of ${SEED_DATASETS.join(', ')} (got "${value ?? ''}")`,
            exitCode: 2,
          };
        }
        only = SEED_DATASETS.filter((dataset) => requested.includes(dataset));
        break;
      }
      case '--password': {
        const value = argv[++i];
        if (!value) return { ok: false, error: '--password requires a value', exitCode: 2 };
        adminPassword = value;
        break;
      }
      case '--seed': {
        const value = argv[++i];
        const parsed = Number(value);
        if (value === undefined || !Number.isInteger(parsed)) {
          return { ok: false, error: `--seed requires an integer (got "${value ?? ''}")`, exitCode: 2 };
        }
        seed = parsed;
        break;
      }
      case '--now': {
        const value = argv[++i];
        if (!value) return { ok: false, error: '--now requires an ISO-8601 timestamp', exitCode: 2 };
        now = new Date(value);
        break;
      }
      default:
        if (arg.startsWith('-')) {
          return { ok: false, error: `unknown option "${arg}"`, exitCode: 2 };
        }
        positional.push(arg);
    }
  }

  if (positional.length > 0) {
    return { ok: false, error: `unexpected argument "${positional[0]}"`, exitCode: 2 };
  }

  const databaseUrl = env.DATABASE_URL ?? '';
  if (databaseUrl.length === 0) {
    return { ok: false, error: 'DATABASE_URL is required', exitCode: 1 };
  }
  if (/^sqlite:/i.test(databaseUrl)) {
    return {
      ok: false,
      error: `DATABASE_URL must be a PostgreSQL connection string, got "${databaseUrl}"`,
      exitCode: 1,
    };
  }
  if (Number.isNaN(now.getTime())) {
    return { ok: false, error: `SEED_NOW is not a valid date (got "${env.SEED_NOW}")`, exitCode: 2 };
  }
  if (!Number.isInteger(seed)) {
    return { ok: false, error: `SEED_RANDOM_SEED must be an integer (got "${env.SEED_RANDOM_SEED}")`, exitCode: 2 };
  }

  const productionGuard = assertNotProduction({ environment, databaseUrl, allowProduction });
  if (productionGuard) {
    return { ok: false, error: productionGuard, exitCode: 1 };
  }

  if (!dryRun && (!adminPassword || adminPassword.length < 12)) {
    return {
      ok: false,
      error: 'an admin password of at least 12 characters is required (--password or SEED_ADMIN_PASSWORD); use --dry-run to skip it',
      exitCode: 1,
    };
  }

  return {
    ok: true,
    options: {
      environment,
      databaseUrl,
      volume,
      only,
      dryRun,
      reset,
      allowProduction,
      adminPassword,
      skipMigrations,
      seed,
      now,
    },
  };
}

/**
 * Build the deterministic fixture set.
 *
 * Rows are keyed (`flight-0001`, …) so `--reset` can delete exactly what this
 * seeder owns without touching operator-created data.
 */
export function buildStagingSeedPlan(options: StagingSeedOptions): StagingSeedPlan {
  const random = createRandom(options.seed);
  const { now, volume, only } = options;
  const hour = 60 * 60 * 1000;

  const plan: StagingSeedPlan = {
    environment: options.environment,
    generatedAt: now,
    datasets: only,
    admin: null,
    users: [],
    passengers: [],
    flights: [],
    bookings: [],
    counts: { admin: 0, users: 0, flights: 0, bookings: 0 },
  };

  if (only.includes('admin')) {
    plan.admin = { email: SEED_ADMIN_EMAIL, role: SEED_ADMIN_ROLE };
    plan.counts.admin = 1;
  }

  if (only.includes('users')) {
    // One shared wallet per tenant persona, so multi-tenant scoping has data.
    plan.users = Array.from({ length: SEED_TENANTS }, (_, i) =>
      i === 0 ? BASE_WALLET : `${BASE_WALLET.slice(0, -1)}${i}`,
    );
    plan.counts.users = plan.users.length;
  }

  if (only.includes('flights')) {
    for (let i = 0; i < volume; i += 1) {
      const fromAirport = pick(random, AIRPORTS);
      let toAirport = pick(random, AIRPORTS);
      if (toAirport === fromAirport) {
        toAirport = AIRPORTS[(AIRPORTS.indexOf(fromAirport) + 1) % AIRPORTS.length];
      }
      const departureOffsetHours = 2 + Math.floor(random() * 21 * 24);
      const durationHours = 2 + Math.floor(random() * 12);
      const status = FLIGHT_STATUS_CYCLE[i % FLIGHT_STATUS_CYCLE.length];

      plan.flights.push({
        key: `flight-${pad(i + 1, 4)}`,
        flightNumber: `${pick(random, ['TQ', 'SA', 'VL', 'AF', 'EK'])}${100 + (i % 900)}`,
        airlineCode: pick(random, ['TQ', 'SA', 'VL', 'AF', 'EK']),
        fromAirport,
        toAirport,
        departureTime: new Date(now.getTime() + departureOffsetHours * hour),
        arrivalTime: new Date(now.getTime() + (departureOffsetHours + durationHours) * hour),
        seatsAvailable: status === 'CANCELLED' ? 0 : 20 + Math.floor(random() * 300),
        priceCents: 9_900 + Math.floor(random() * 180_000),
        status,
        delayMinutes: status === 'DELAYED' ? 15 + Math.floor(random() * 240) : 0,
        gate: `${pick(random, TERMINALS)}${1 + Math.floor(random() * 40)}`,
        terminal: pick(random, TERMINALS),
        dataSource: pick(random, DATA_SOURCES),
        syncStatus: pick(random, ['EXACT_MATCH', 'UNVERIFIED', 'MANUAL_OVERRIDE']),
      });
    }
    plan.counts.flights = plan.flights.length;
  }

  if (only.includes('bookings')) {
    const passengersNeeded = Math.max(plan.flights.length * PASSENGERS_PER_BOOKING, 1);
    for (let i = 0; i < passengersNeeded; i += 1) {
      const firstName = pick(random, FIRST_NAMES);
      const lastName = pick(random, LAST_NAMES);
      plan.passengers.push({
        key: `passenger-${pad(i + 1, 4)}`,
        email: `staging.${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.test`,
        firstName,
        lastName,
        phone: `+1555${pad(1000000 + i, 7)}`,
        nationality: pick(random, NATIONALITIES),
        sorobanAddress: SEED_SOROBAN_ADDRESS,
      });
    }

    // One booking per flight keeps the two datasets consistent and makes
    // `counts.bookings === counts.flights` when both are requested.
    for (let i = 0; i < plan.flights.length; i += 1) {
      const flight = plan.flights[i];
      const passenger = plan.passengers[i % plan.passengers.length];
      const status = pick(random, BOOKING_STATUSES);
      plan.bookings.push({
        key: `booking-${pad(i + 1, 4)}`,
        flightKey: flight.key,
        passengerKey: passenger.key,
        walletAddress: plan.users.length > 0 ? plan.users[i % plan.users.length] : BASE_WALLET,
        status,
        amountCents: flight.priceCents,
        idempotencyKey: `staging-${flight.key}`,
      });
    }
    plan.counts.bookings = plan.bookings.length;
  }

  return plan;
}

/** One-line human summary, also used as the machine report payload. */
export function summarizeStagingSeedPlan(plan: StagingSeedPlan): string {
  return Object.entries(plan.counts)
    .filter(([dataset]) => plan.datasets.includes(dataset as SeedDataset))
    .map(([dataset, count]) => `${dataset}=${count}`)
    .join(' ');
}

/** Usage text, also printed by `scripts/seed-staging.sh --help`. */
export const STAGING_SEED_USAGE = `Seeds a staging environment with deterministic Traqora fixtures (issue #749).

Usage:
  scripts/seed-staging.sh [options]

Options:
  -e, --environment <env>   ${SEED_ENVIRONMENTS.join(' | ')} (default: staging)
      --volume <n>          synthetic flights to generate (1-${MAX_SEED_VOLUME}, default ${DEFAULT_SEED_VOLUME})
      --only <list>         comma-separated subset of ${SEED_DATASETS.join(', ')}
      --password <pw>       password for the seeded super admin (or SEED_ADMIN_PASSWORD)
      --dry-run             validate and print the plan without writing
      --reset               delete the rows owned by this seeder first
      --allow-production    permit --environment production
      --seed <n>            deterministic PRNG seed (or SEED_RANDOM_SEED)
      --now <iso>           fixed clock so generated timestamps are reproducible
      --skip-migrations     do not run pending TypeORM migrations first
  -h, --help                show this help

Environment:
  DATABASE_URL             required; PostgreSQL connection string
  SEED_ADMIN_PASSWORD      default for --password
  SEED_RANDOM_SEED         default for --seed
  SEED_NOW                 fixed clock (ISO-8601) so timestamps are reproducible

Exit codes:
  0  seeded successfully
  1  refused or failed
  2  usage error`;
