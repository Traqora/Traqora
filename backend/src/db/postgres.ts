import { Pool } from 'pg';
import { config } from '../config';

let pool: Pool | null = null;

export const getPostgresPool = (): Pool => {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for PostgreSQL-backed flight search');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return pool;
};