import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Booking } from './entities/Booking';
import { Flight } from './entities/Flight';
import { Passenger } from './entities/Passenger';
import { IdempotencyKey } from './entities/IdempotencyKey';
import { Refund } from './entities/Refund';

const isTest = process.env.NODE_ENV === 'test';

export const AppDataSource = new DataSource(
  isTest
    ? {
        type: 'sqlite',
        database: ':memory:',
        dropSchema: true,
        synchronize: true,
        entities: [Booking, Flight, Passenger, IdempotencyKey, Refund],
        logging: false,
      }
    : {
        type: 'postgres',
        url: config.databaseUrl,
        synchronize: true,
        logging: false,
        entities: [Booking, Flight, Passenger, IdempotencyKey, Refund],
        ssl: config.environment === 'production' ? { rejectUnauthorized: false } : false,
      }
);

export const initDataSource = async () => {
  if (AppDataSource.isInitialized) return;

  // If no database URL is configured, skip initialization (e.g. in test or dev without Postgres)
  if (!config.databaseUrl) {
    logger.warn('No Postgres DATABASE_URL provided, skipping TypeORM datasource initialization');
    return;
  }

  await AppDataSource.initialize();
};
