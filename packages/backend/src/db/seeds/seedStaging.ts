import "reflect-metadata";
import bcrypt from "bcryptjs";
import { DataSource } from "typeorm";
import { AdminUser } from "../entities/AdminUser";
import { Booking } from "../entities/Booking";
import { Flight } from "../entities/Flight";
import { Passenger } from "../entities/Passenger";
import { User } from "../entities/User";
import { logger } from "../../utils/logger";
import {
  SEED_ADMIN_EMAIL,
  SEED_SOROBAN_ADDRESS,
  STAGING_SEED_USAGE,
  StagingSeedOptions,
  StagingSeedPlan,
  buildStagingSeedPlan,
  parseStagingSeedOptions,
  summarizeStagingSeedPlan,
} from "./stagingSeedPlan";

/** Marker written into `flights.rawData` so `--reset` only deletes our own rows. */
const SEED_MARKER_KEY = "seedKey";
const BOOKING_SEED_PREFIX = "staging-";

/** Rows are written in chunks so a large volume does not build one huge INSERT. */
const INSERT_CHUNK_SIZE = 200;

const chunk = <T>(items: T[], size = INSERT_CHUNK_SIZE): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

/** Keys of the flights that already exist and carry our marker. */
async function readSeededFlightKeys(dataSource: DataSource): Promise<Map<string, Flight>> {
  const repo = dataSource.getRepository(Flight);
  const byKey = new Map<string, Flight>();
  // Selecting only the two columns we need keeps this cheap on a large table.
  for (const row of await repo.find({ select: { id: true, rawData: true } })) {
    const key = (row.rawData as Record<string, unknown> | null)?.[SEED_MARKER_KEY];
    if (typeof key === "string") byKey.set(key, row as Flight);
  }
  return byKey;
}

/**
 * Emails already present in `passengers`.
 *
 * `passengers.email` is stored through an encryption transformer, so it cannot
 * be matched with a `WHERE ... IN (...)`; the column is selected (and therefore
 * decrypted) and compared in memory instead.
 */
async function readPassengerEmails(dataSource: DataSource): Promise<Set<string>> {
  const repo = dataSource.getRepository(Passenger);
  const emails = new Set<string>();
  for (const row of await repo.find({ select: { id: true, email: true } })) {
    if (row.email) emails.add(row.email);
  }
  return emails;
}

/**
 * Remove the rows this seeder owns, leaving operator-created data untouched.
 *
 * Every delete is scoped by a marker only this seeder writes, which is why
 * `--reset` is safe to point at a database that already holds real data.
 *
 * Deletes go through primary keys rather than encrypted columns: the passenger
 * and booking key columns are encrypted at rest, and TypeORM cannot build a
 * `WHERE ... IN` over a transformed column.
 */
export async function resetStagingFixtures(dataSource: DataSource, plan: StagingSeedPlan): Promise<void> {
  if (plan.datasets.includes("bookings")) {
    // Bookings first: passengers are referenced by them.
    const bookingRepo = dataSource.getRepository(Booking);
    const rows = await bookingRepo.find({ select: { id: true, idempotencyKey: true } });
    const ids = rows
      .filter((row) => typeof row.idempotencyKey === "string" && row.idempotencyKey.startsWith(BOOKING_SEED_PREFIX))
      .map((row) => row.id);
    if (ids.length > 0) {
      for (const batch of chunk(ids)) {
        await bookingRepo.delete(batch);
      }
      logger.info("staging_seed_reset", { event: "staging_seed_reset", dataset: "bookings", deleted: ids.length });
    }
  }

  if (plan.datasets.includes("flights")) {
    const flightRepo = dataSource.getRepository(Flight);
    // `rawData` is jsonb on Postgres and simple-json on sqlite; the cast makes
    // the LIKE comparison work on both.
    const result = await flightRepo
      .createQueryBuilder()
      .delete()
      .where("CAST(rawData AS TEXT) LIKE :marker", { marker: `%${SEED_MARKER_KEY}%` })
      .execute();
    if (result.affected) {
      logger.info("staging_seed_reset", { event: "staging_seed_reset", dataset: "flights", deleted: result.affected });
    }
  }

  if (plan.datasets.includes("bookings") && plan.passengers.length > 0) {
    const passengerRepo = dataSource.getRepository(Passenger);
    const wanted = new Set(plan.passengers.map((passenger) => passenger.email));
    const ids = (await passengerRepo.find({ select: { id: true, email: true } }))
      .filter((row) => wanted.has(row.email))
      .map((row) => row.id);
    if (ids.length > 0) {
      for (const batch of chunk(ids)) {
        await passengerRepo.delete(batch);
      }
      logger.info("staging_seed_reset", { event: "staging_seed_reset", dataset: "passengers", deleted: ids.length });
    }
  }

  if (plan.datasets.includes("users") && plan.users.length > 0) {
    const userRepo = dataSource.getRepository(User);
    const wanted = new Set(plan.users);
    const ids = (await userRepo.find({ select: { walletAddress: true } }))
      .filter((row) => wanted.has(row.walletAddress))
      .map((row) => row.walletAddress);
    if (ids.length > 0) {
      for (const batch of chunk(ids)) {
        await userRepo.delete(batch);
      }
      logger.info("staging_seed_reset", { event: "staging_seed_reset", dataset: "users", deleted: ids.length });
    }
  }

  if (plan.datasets.includes("admin")) {
    const adminRepo = dataSource.getRepository(AdminUser);
    const { affected } = await adminRepo.delete({ email: SEED_ADMIN_EMAIL });
    if (affected) {
      logger.info("staging_seed_reset", { event: "staging_seed_reset", dataset: "admin", deleted: affected });
    }
  }
}

/**
 * Write the plan to the database.
 *
 * Idempotent: rows are keyed (a `seedKey` marker in `flights.rawData`, the
 * generated email for passengers, the `staging-` idempotency key for bookings)
 * and existing keys are skipped, so a second run reports 0 written instead of
 * duplicating the fixture set.
 */
export async function applyStagingSeedPlan(
  dataSource: DataSource,
  plan: StagingSeedPlan,
  options: StagingSeedOptions,
): Promise<Record<string, number>> {
  const written: Record<string, number> = { admin: 0, users: 0, flights: 0, bookings: 0, passengers: 0 };

  if (plan.admin) {
    const adminRepo = dataSource.getRepository(AdminUser);
    const existing = await adminRepo.findOne({ where: { email: plan.admin.email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(options.adminPassword ?? "", 10);
      await adminRepo.save(
        adminRepo.create({
          email: plan.admin.email,
          passwordHash,
          role: plan.admin.role,
          isActive: true,
        }),
      );
      written.admin = 1;
    }
  }

  if (plan.datasets.includes("users") && plan.users.length > 0) {
    const userRepo = dataSource.getRepository(User);
    const known = new Set((await userRepo.find({ select: { walletAddress: true } })).map((row) => row.walletAddress));
    const missing = plan.users.filter((wallet) => !known.has(wallet));
    for (const batch of chunk(missing)) {
      await userRepo.save(
        batch.map((walletAddress) =>
          userRepo.create({ walletAddress, walletType: "freighter", lastLoginAt: plan.generatedAt }),
        ),
      );
    }
    written.users = missing.length;
  }

  const flightByKey = new Map<string, Flight>();

  if (plan.datasets.includes("flights") && plan.flights.length > 0) {
    const flightRepo = dataSource.getRepository(Flight);
    for (const [key, row] of await readSeededFlightKeys(dataSource)) {
      flightByKey.set(key, row);
    }
    const missing = plan.flights.filter((flight) => !flightByKey.has(flight.key));
    for (const batch of chunk(missing)) {
      const saved = await flightRepo.save(
        batch.map((flight) =>
          flightRepo.create({
            flightNumber: flight.flightNumber,
            airlineCode: flight.airlineCode,
            fromAirport: flight.fromAirport,
            toAirport: flight.toAirport,
            departureTime: flight.departureTime,
            arrivalTime: flight.arrivalTime,
            seatsAvailable: flight.seatsAvailable,
            priceCents: flight.priceCents,
            status: flight.status,
            delayMinutes: flight.delayMinutes,
            gate: flight.gate,
            terminal: flight.terminal,
            dataSource: flight.dataSource,
            syncStatus: flight.syncStatus,
            airlineSorobanAddress: SEED_SOROBAN_ADDRESS,
            lastSyncedAt: plan.generatedAt,
            rawData: { [SEED_MARKER_KEY]: flight.key, environment: plan.environment },
          }),
        ),
        { chunk: INSERT_CHUNK_SIZE },
      );
      for (const [index, row] of saved.entries()) {
        const key = batch[index]?.key;
        if (key) flightByKey.set(key, row);
      }
    }
    written.flights = missing.length;
  }

  if (plan.datasets.includes("bookings") && plan.bookings.length > 0) {
    const passengerRepo = dataSource.getRepository(Passenger);
    const bookingRepo = dataSource.getRepository(Booking);

    const knownEmails = await readPassengerEmails(dataSource);
    const missingPassengers = plan.passengers.filter((passenger) => !knownEmails.has(passenger.email));
    for (const batch of chunk(missingPassengers)) {
      await passengerRepo.save(
        batch.map((passenger) =>
          passengerRepo.create({
            email: passenger.email,
            firstName: passenger.firstName,
            lastName: passenger.lastName,
            phone: passenger.phone,
            nationality: passenger.nationality,
            sorobanAddress: passenger.sorobanAddress,
          }),
        ),
        { chunk: INSERT_CHUNK_SIZE },
      );
    }
    written.passengers = missingPassengers.length;

    const passengerByEmail = new Map(
      (await passengerRepo.find({ select: { id: true, email: true } })).map((row) => [row.email, row]),
    );
    const knownKeys = new Set(
      (await bookingRepo.find({ select: { idempotencyKey: true } }))
        .map((row) => row.idempotencyKey)
        .filter((key): key is string => typeof key === "string"),
    );
    const missingBookings = plan.bookings.filter((booking) => !knownKeys.has(booking.idempotencyKey));

    let savedCount = 0;
    for (const batch of chunk(missingBookings)) {
      const entities = batch
        .map((booking) => {
          const flight = flightByKey.get(booking.flightKey);
          const email = plan.passengers.find((candidate) => candidate.key === booking.passengerKey)?.email;
          const passenger = email ? passengerByEmail.get(email) : undefined;
          if (!flight || !passenger) return undefined;
          return bookingRepo.create({
            idempotencyKey: booking.idempotencyKey,
            walletAddress: booking.walletAddress,
            flight,
            passenger,
            status: booking.status as never,
            amountCents: booking.amountCents,
          });
        })
        .filter((entity): entity is Booking => entity !== undefined);

      if (entities.length > 0) {
        await bookingRepo.save(entities, { chunk: INSERT_CHUNK_SIZE });
        savedCount += entities.length;
      }
    }
    written.bookings = savedCount;
  }

  return written;
}

export async function seedStaging(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseStagingSeedOptions(argv);

  if (!parsed.ok) {
    if (parsed.error === "help") {
      process.stdout.write(`${STAGING_SEED_USAGE}\n`);
      return 0;
    }
    logger.error("staging_seed_rejected", {
      event: "staging_seed_rejected",
      reason: parsed.error,
      exitCode: parsed.exitCode,
    });
    process.stderr.write(`Error: ${parsed.error}\n\n${STAGING_SEED_USAGE}\n`);
    return parsed.exitCode;
  }

  const options = parsed.options;
  const plan = buildStagingSeedPlan(options);

  logger.info("staging_seed_plan", {
    event: "staging_seed_plan",
    environment: plan.environment,
    datasets: plan.datasets,
    counts: plan.counts,
    dryRun: options.dryRun,
  });
  process.stdout.write(`${summarizeStagingSeedPlan(plan)}\n`);

  // Return before touching the database: a dry run must be answerable on a
  // laptop with no Postgres reachable. `dataSource` is imported lazily for the
  // same reason — importing it eagerly opens a connection and runs migrations
  // on load.
  if (options.dryRun) {
    logger.info("staging_seed_dry_run_complete", {
      event: "staging_seed_dry_run_complete",
      environment: plan.environment,
    });
    return 0;
  }

  // `startupMigrations` opens the connection and brings the schema up to date
  // through the same path the application uses on boot, so a fresh staging
  // database needs no separate `npm run migration:run` step first.
  const { startupMigrations } = await import("../dataSource");
  if (options.skipMigrations) {
    const { initDataSource } = await import("../dataSource");
    await initDataSource();
  } else {
    await startupMigrations;
  }

  const { AppDataSource } = await import("../dataSource");
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  if (options.reset) {
    await resetStagingFixtures(AppDataSource, plan);
  }

  const written = await applyStagingSeedPlan(AppDataSource, plan, options);
  process.stdout.write(`${JSON.stringify({ event: 'staging_seed_complete', environment: plan.environment, written })}\n`);
  logger.info("staging_seed_complete", { event: "staging_seed_complete", environment: plan.environment, written });
  return 0;
}

if (require.main === module) {
  seedStaging()
    .then(async (code) => {
      // Best-effort teardown; the data source may never have been imported.
      try {
        const { AppDataSource } = await import("../dataSource");
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
      } catch {
        /* nothing to tear down */
      }
      process.exit(code);
    })
    .catch(async (err) => {
      logger.error("staging_seed_failed", { event: "staging_seed_failed", error: err });
      try {
        const { AppDataSource } = await import("../dataSource");
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
      } catch {
        /* nothing to tear down */
      }
      process.exit(1);
    });
}
