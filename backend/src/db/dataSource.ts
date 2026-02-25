import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "../config";
import { Booking } from "./entities/Booking";
import { Flight } from "./entities/Flight";
import { Passenger } from "./entities/Passenger";
import { IdempotencyKey } from "./entities/IdempotencyKey";
import { UserPreference } from "./entities/UserPreference";
import { NotificationLog } from "./entities/NotificationLog";

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
        ],
        ssl:
          config.environment === "production"
            ? { rejectUnauthorized: false }
            : false,
      },
);

export const initDataSource = async () => {
  if (AppDataSource.isInitialized) return;
  await AppDataSource.initialize();
};
