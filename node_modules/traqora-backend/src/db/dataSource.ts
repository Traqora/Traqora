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

const isTest = process.env.NODE_ENV === "test";

export const AppDataSource = new DataSource(
  isTest
    ? {
      type: "sqlite",
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
      ],
      logging: false,
    }
    : {
      type: "postgres",
      url: config.databaseUrl,
      synchronize: true,
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
      ],
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
