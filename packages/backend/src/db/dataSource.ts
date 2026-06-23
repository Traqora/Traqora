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
import { TravelDocument } from "./entities/TravelDocument";

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
        TravelDocument,
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
        TravelDocument,
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

  try {
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
};
