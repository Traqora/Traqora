import "reflect-metadata";
import { UserPreference } from "./entities/UserPreference";
import { NotificationLog } from "./entities/NotificationLog";
import { DataSource } from "typeorm";
import { config } from "../config";
import { logger } from "../utils/logger";
import { Booking } from "./entities/Booking";
import { Flight } from "./entities/Flight";
import { Passenger } from "./entities/Passenger";
import { IdempotencyKey } from "./entities/IdempotencyKey";
import { AdminUser } from "./entities/AdminUser";
import { AdminAuditLog } from "./entities/AdminAuditLog";
import { Refund } from "./entities/Refund";
import { User } from "./entities/User";
import { ContractEventLog } from "./entities/ContractEventLog";
import { ContractEventCursor } from "./entities/ContractEventCursor";
import { ContractReconciliationAttempt } from "./entities/ContractReconciliationAttempt";

const isTest = process.env.NODE_ENV === "test";

export const AppDataSource = new DataSource(
  isTest
    ? {
      type: "better-sqlite3",
      database: ":memory:",
      dropSchema: true,
      synchronize: true,
      entities: [
        Booking,
        Flight,
        Passenger,
        IdempotencyKey,
        UserPreference,
        NotificationLog,
        AdminUser,
        AdminAuditLog,
        Refund,
        User,
        ContractEventLog,
        ContractEventCursor,
        ContractReconciliationAttempt,
      ],
      logging: false,
    }
    : {
      type: "postgres",
      url: config.databaseUrl,
      synchronize: false,
      logging: false,
      entities: [
        Booking,
        Flight,
        Passenger,
        IdempotencyKey,
        UserPreference,
        NotificationLog,
        AdminUser,
        AdminAuditLog,
        Refund,
        User,
        ContractEventLog,
        ContractEventCursor,
        ContractReconciliationAttempt,
      ],
      migrations: [__dirname + "/migrations/*.{js,ts}"],
      ssl:
        config.environment === "production"
          ? { rejectUnauthorized: false }
          : false,
    },
);

export const initDataSource = async () => {
  if (AppDataSource.isInitialized) return;

  // In test mode use the in-memory SQLite datasource — no DATABASE_URL needed
  if (isTest) {
    await AppDataSource.initialize();
    return;
  }

  // If no database URL is configured (dev without Postgres), skip initialization
  if (!config.databaseUrl) {
    logger.warn(
      "No Postgres DATABASE_URL provided, skipping TypeORM datasource initialization",
    );
    return;
  }

  await AppDataSource.initialize();
};

// Startup migration check, wrapped in an async IIFE instead of using
// top-level await so the module stays valid CommonJS under ts-jest.
// Skipped in test mode: no DB connection exists at import time there.
//
// Exported so one-shot entrypoints (notably the staging seeder) can await the
// schema instead of racing it (issue #749).
export const startupMigrations: Promise<void> = (async () => {
  if (isTest) return;
  try {
    // The connection must exist before `showMigrations` can run. Without this
    // the first call rejects with CannotExecuteNotConnectedError and the
    // rethrow below becomes an unhandled rejection that kills the process.
    await initDataSource();
    if (!AppDataSource.isInitialized) return;

    logger.info("Checking database migrations...");
    const hasPending = await AppDataSource.showMigrations();
    if (hasPending) {
      logger.info("Pending migrations found. Running migrations...");
      const runMigrations = await AppDataSource.runMigrations();
      logger.info(`Successfully executed ${runMigrations.length} migrations.`);
    } else {
      logger.info("Database schema is up to date.");
    }
  } catch (error) {
    logger.error("Failed to run database migrations on startup:", error as Error);
    throw error;
  }
})();
