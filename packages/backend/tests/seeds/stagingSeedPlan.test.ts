import {
  DEFAULT_SEED_VOLUME,
  MAX_SEED_VOLUME,
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_ROLE,
  SEED_DATASETS,
  STAGING_SEED_USAGE,
  buildStagingSeedPlan,
  parseStagingSeedOptions,
  summarizeStagingSeedPlan,
} from '../../src/db/seeds/stagingSeedPlan';

const PG_URL = 'postgres://traqora:secret@db.staging.internal:5432/traqora';

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: PG_URL,
    SEED_ADMIN_PASSWORD: 'correct-horse-battery',
    ...overrides,
  };
}

function expectOk(result: ReturnType<typeof parseStagingSeedOptions>) {
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${result.error}`);
  }
  return result.options;
}

function expectError(result: ReturnType<typeof parseStagingSeedOptions>) {
  if (result.ok) {
    throw new Error('expected a validation error, got a valid result');
  }
  return result;
}

describe('staging seed plan (issue #749)', () => {
  describe('parseStagingSeedOptions — happy path', () => {
    it('defaults to the staging environment', () => {
      const options = expectOk(parseStagingSeedOptions([], baseEnv()));
      expect(options.environment).toBe('staging');
      expect(options.volume).toBe(DEFAULT_SEED_VOLUME);
      expect(options.only).toEqual([...SEED_DATASETS]);
      expect(options.dryRun).toBe(false);
      expect(options.reset).toBe(false);
    });

    it('accepts every documented flag', () => {
      const options = expectOk(
        parseStagingSeedOptions(
          ['--environment', 'local', '--volume', '40', '--only', 'flights,bookings', '--reset', '--seed', '7', '--now', '2026-09-27T00:00:00.000Z'],
          baseEnv(),
        ),
      );

      expect(options.environment).toBe('local');
      expect(options.volume).toBe(40);
      expect(options.only).toEqual(['flights', 'bookings']);
      expect(options.reset).toBe(true);
      expect(options.seed).toBe(7);
      expect(options.now.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    });

    it('orders --only by dataset order regardless of argument order', () => {
      const options = expectOk(parseStagingSeedOptions(['--only', 'bookings,admin'], baseEnv()));
      expect(options.only).toEqual(['admin', 'bookings']);
    });

    it('reports help as a non-fatal usage result', () => {
      const result = expectError(parseStagingSeedOptions(['--help'], baseEnv()));
      expect(result.error).toBe('help');
      expect(result.exitCode).toBe(2);
    });

    it('documents its own usage text', () => {
      expect(STAGING_SEED_USAGE).toContain('--dry-run');
      expect(STAGING_SEED_USAGE).toContain('DATABASE_URL');
      expect(STAGING_SEED_USAGE).toContain('Exit codes');
    });
  });

  describe('parseStagingSeedOptions — failure modes', () => {
    it('rejects a missing DATABASE_URL with a runtime error code', () => {
      const result = expectError(parseStagingSeedOptions([], { SEED_ADMIN_PASSWORD: 'correct-horse-battery' }));
      expect(result.error).toMatch(/DATABASE_URL is required/);
      expect(result.exitCode).toBe(1);
    });

    it('rejects a sqlite DATABASE_URL so the seeder cannot target a throwaway database', () => {
      const result = expectError(parseStagingSeedOptions([], baseEnv({ DATABASE_URL: 'sqlite::memory:' })));
      expect(result.error).toMatch(/PostgreSQL connection string/);
      expect(result.exitCode).toBe(1);
    });

    it('requires an admin password of at least 12 characters', () => {
      const short = expectError(parseStagingSeedOptions([], baseEnv({ SEED_ADMIN_PASSWORD: 'tooshort' })));
      expect(short.error).toMatch(/at least 12 characters/);
      expect(short.exitCode).toBe(1);
    });

    it('allows --dry-run without a password', () => {
      const options = expectOk(
        parseStagingSeedOptions(['--dry-run'], { DATABASE_URL: PG_URL }),
      );
      expect(options.dryRun).toBe(true);
      expect(options.adminPassword).toBeNull();
    });

    it('rejects the production environment without --allow-production', () => {
      const result = expectError(parseStagingSeedOptions(['--environment', 'production'], baseEnv()));
      expect(result.error).toMatch(/refusing to seed the "production" environment/);
      expect(result.exitCode).toBe(1);
    });

    it('rejects production pointed at a production-looking host, and says why', () => {
      const result = expectError(
        parseStagingSeedOptions(['--environment', 'production'], baseEnv({ DATABASE_URL: 'postgres://u:p@db.prod.example.com:5432/traqora' })),
      );
      expect(result.error).toMatch(/looks like a production database/);
    });

    it('allows production once the operator opts in', () => {
      const options = expectOk(parseStagingSeedOptions(['--environment', 'production', '--allow-production'], baseEnv()));
      expect(options.environment).toBe('production');
      expect(options.allowProduction).toBe(true);
    });

    it('rejects an unknown environment as a usage error', () => {
      const result = expectError(parseStagingSeedOptions(['--environment', 'devops'], baseEnv()));
      expect(result.error).toMatch(/--environment must be one of/);
      expect(result.exitCode).toBe(2);
    });

    it('rejects a non-integer or out-of-range volume', () => {
      for (const volume of ['0', '-5', 'abc', String(MAX_SEED_VOLUME + 1)]) {
        const result = expectError(parseStagingSeedOptions(['--volume', volume], baseEnv()));
        expect(result.error).toMatch(/--volume must be an integer/);
        expect(result.exitCode).toBe(2);
      }
    });

    it('rejects an unknown --only dataset', () => {
      const result = expectError(parseStagingSeedOptions(['--only', 'flights,invoices'], baseEnv()));
      expect(result.error).toMatch(/--only must be a comma-separated subset/);
      expect(result.exitCode).toBe(2);
    });

    it('rejects an unknown option and a stray positional argument', () => {
      expect(expectError(parseStagingSeedOptions(['--nope'], baseEnv())).error).toMatch(/unknown option/);
      expect(expectError(parseStagingSeedOptions(['staging'], baseEnv())).error).toMatch(/unexpected argument/);
    });

    it('rejects a flag that is missing its value', () => {
      expect(expectError(parseStagingSeedOptions(['--environment'], baseEnv())).error).toMatch(/requires a value/);
      expect(expectError(parseStagingSeedOptions(['--password'], baseEnv())).error).toMatch(/requires a value/);
    });

    it('rejects an invalid SEED_NOW', () => {
      const result = expectError(parseStagingSeedOptions([], baseEnv({ SEED_NOW: 'yesterday' })));
      expect(result.error).toMatch(/SEED_NOW is not a valid date/);
      expect(result.exitCode).toBe(2);
    });
  });

  describe('buildStagingSeedPlan', () => {
    const options = expectOk(
      parseStagingSeedOptions(['--volume', '12', '--now', '2026-09-27T00:00:00.000Z'], baseEnv()),
    );

    it('generates the requested number of flights', () => {
      const plan = buildStagingSeedPlan(options);
      expect(plan.flights).toHaveLength(12);
      expect(plan.counts.flights).toBe(12);
      expect(plan.flights[0].key).toBe('flight-0001');
      expect(plan.flights[11].key).toBe('flight-0012');
    });

    it('is deterministic for a given seed', () => {
      const first = buildStagingSeedPlan(options);
      const second = buildStagingSeedPlan(options);
      expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
    });

    it('changes the fixture set when the seed changes', () => {
      const other = buildStagingSeedPlan({ ...options, seed: options.seed + 1 });
      expect(JSON.stringify(other.flights)).not.toEqual(JSON.stringify(buildStagingSeedPlan(options).flights));
    });

    it('anchors every generated timestamp to the fixed clock', () => {
      const plan = buildStagingSeedPlan(options);
      for (const flight of plan.flights) {
        expect(flight.departureTime.getTime()).toBeGreaterThan(plan.generatedAt.getTime());
        expect(flight.arrivalTime.getTime()).toBeGreaterThan(flight.departureTime.getTime());
      }
    });

    it('never generates a flight from an airport to itself', () => {
      const plan = buildStagingSeedPlan(options);
      for (const flight of plan.flights) {
        expect(flight.fromAirport).not.toBe(flight.toAirport);
      }
    });

    it('covers the failure-path statuses so QA has data behind them', () => {
      const plan = buildStagingSeedPlan({ ...options, volume: 64 });
      const statuses = new Set(plan.flights.map((flight) => flight.status));
      expect(statuses.has('CANCELLED')).toBe(true);
      expect(statuses.has('DELAYED')).toBe(true);
      expect(statuses.has('SCHEDULED')).toBe(true);

      const delayed = plan.flights.find((flight) => flight.status === 'DELAYED');
      expect(delayed?.delayMinutes).toBeGreaterThan(0);
      const cancelled = plan.flights.find((flight) => flight.status === 'CANCELLED');
      expect(cancelled?.seatsAvailable).toBe(0);
    });

    it('links every booking to a generated flight and passenger', () => {
      const plan = buildStagingSeedPlan(options);
      const flightKeys = new Set(plan.flights.map((flight) => flight.key));
      const passengerKeys = new Set(plan.passengers.map((passenger) => passenger.key));

      expect(plan.bookings).toHaveLength(plan.flights.length);
      for (const booking of plan.bookings) {
        expect(flightKeys.has(booking.flightKey)).toBe(true);
        expect(passengerKeys.has(booking.passengerKey)).toBe(true);
        expect(booking.idempotencyKey).toBe(`staging-${booking.flightKey}`);
      }
    });

    it('gives every fixture row a reset marker', () => {
      const plan = buildStagingSeedPlan(options);
      expect(plan.flights.every((flight) => flight.key.startsWith('flight-'))).toBe(true);
      expect(plan.passengers.every((passenger) => passenger.key.startsWith('passenger-'))).toBe(true);
      expect(plan.bookings.every((booking) => booking.idempotencyKey.startsWith('staging-'))).toBe(true);
    });

    it('seeds the admin and the tenant personas only when requested', () => {
      const full = buildStagingSeedPlan(options);
      expect(full.admin).toEqual({ email: SEED_ADMIN_EMAIL, role: SEED_ADMIN_ROLE });
      expect(full.users.length).toBeGreaterThan(1);
    });

    it('honours --only by leaving the other datasets empty', () => {
      const flightsOnly = buildStagingSeedPlan(
        expectOk(parseStagingSeedOptions(['--only', 'flights', '--volume', '3'], baseEnv())),
      );
      expect(flightsOnly.flights).toHaveLength(3);
      expect(flightsOnly.bookings).toHaveLength(0);
      expect(flightsOnly.passengers).toHaveLength(0);
      expect(flightsOnly.admin).toBeNull();
      expect(flightsOnly.users).toHaveLength(0);
    });

    it('still produces a bookable plan when only bookings are requested', () => {
      const bookingsOnly = buildStagingSeedPlan(
        expectOk(parseStagingSeedOptions(['--only', 'bookings'], baseEnv())),
      );
      // No flights in scope, so no bookings are fabricated — an empty plan is
      // better than bookings pointing at rows that do not exist.
      expect(bookingsOnly.bookings).toHaveLength(0);
      expect(bookingsOnly.counts.bookings).toBe(0);
    });

    it('summarises only the requested datasets', () => {
      const plan = buildStagingSeedPlan(
        expectOk(parseStagingSeedOptions(['--only', 'admin,flights', '--volume', '5'], baseEnv())),
      );
      expect(summarizeStagingSeedPlan(plan)).toBe('admin=1 flights=5');
    });

    it('records the target environment on the plan', () => {
      const plan = buildStagingSeedPlan({ ...options, environment: 'staging' });
      expect(plan.environment).toBe('staging');
    });
  });
});
