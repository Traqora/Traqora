import { randomUUID } from 'crypto';
import { DataSource, MigrationInterface } from 'typeorm';
import { InitialSchema1716912345678 } from '../src/db/migrations/1716912345678-InitialSchema';
import { CreateUsersTable1700000000000 } from '../src/db/migrations/1700000000000-CreateUsersTable';
import { CreateTravelDocumentsTable1750000000000 } from '../src/db/migrations/1750000000000-CreateTravelDocumentsTable';
import { MultiTenantCollaboration1750000000001 } from '../src/db/migrations/1750000000001-MultiTenantCollaboration';
import { CreateAnalyticsAuditLogs1750000000002 } from '../src/db/migrations/1750000000002-CreateAnalyticsAuditLogs';
import { CreateCheckIns1750000000003 } from '../src/db/migrations/1750000000003-CreateCheckIns';
import { CreateInsuranceTables1753500000000 } from '../src/db/migrations/1753500000000-CreateInsuranceTables';
import { CreateCarbonOffsetTables1755000000000 } from '../src/db/migrations/1755000000000-CreateCarbonOffsetTables';

type MigrationClass = new () => MigrationInterface;

/**
 * V1 migrations in the exact order production applies them. "Supported
 * previous schema" is defined as this list minus the final migration, so a new
 * migration automatically becomes the next upgrade target (#1192).
 */
const ALL_MIGRATIONS: MigrationClass[] = [
  CreateUsersTable1700000000000,
  InitialSchema1716912345678,
  CreateTravelDocumentsTable1750000000000,
  MultiTenantCollaboration1750000000001,
  CreateAnalyticsAuditLogs1750000000002,
  CreateCheckIns1750000000003,
  CreateInsuranceTables1753500000000,
  CreateCarbonOffsetTables1755000000000,
];

const PREVIOUS_SCHEMA_MIGRATIONS = ALL_MIGRATIONS.slice(0, -1);
const LATEST_TABLES = ['offset_projects', 'carbon_offsets'];
const EXPECTED_TABLES = [
  'users',
  'bookings',
  'travel_documents',
  'tenants',
  'analytics_audit_logs',
  'check_ins',
  'insurance_policies',
  ...LATEST_TABLES,
];

const createSqliteSource = async (migrations: MigrationClass[]): Promise<DataSource> => {
  const source = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: false,
    logging: false,
    migrations,
  });
  await source.initialize();
  return source;
};

const listSqliteTables = async (source: DataSource): Promise<string[]> => {
  const rows: Array<{ name: string }> = await source.query(`
    SELECT name FROM sqlite_master WHERE type='table'
      AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
  `);
  return rows.map((row) => row.name);
};

// The full migration chain uses Postgres DDL such as gen_random_uuid(),
// timestamptz and information_schema, so fresh-install and upgrade cases must
// run against Postgres. CI already provides a postgres:15 service with
// DATABASE_URL. Locally, point TEST_DATABASE_URL at any Postgres instance the
// current user can create databases on.
const POSTGRES_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const describeWithPostgres = POSTGRES_URL ? describe : describe.skip;

interface TemporaryDatabase {
  url: string;
  cleanup: () => Promise<void>;
}

const createTemporaryDatabase = async (): Promise<TemporaryDatabase> => {
  if (!POSTGRES_URL) throw new Error('Postgres URL is required');

  const admin = new DataSource({ type: 'postgres', url: POSTGRES_URL });
  await admin.initialize();
  const name = `traqora_migration_${randomUUID().replace(/-/g, '').toLowerCase()}`;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.destroy();
  }

  const url = new URL(POSTGRES_URL);
  url.pathname = `/${name}`;

  const cleanup = async () => {
    const cleaner = new DataSource({ type: 'postgres', url: POSTGRES_URL });
    await cleaner.initialize();
    try {
      await cleaner.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [name],
      );
      await cleaner.query(`DROP DATABASE IF EXISTS "${name}"`);
    } finally {
      await cleaner.destroy();
    }
  };

  return { url: url.toString(), cleanup };
};

const createPostgresSource = async (
  url: string,
  migrations: MigrationClass[],
): Promise<DataSource> => {
  const source = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    logging: false,
    migrations,
  });
  await source.initialize();
  return source;
};

const listPostgresTables = async (source: DataSource): Promise<string[]> => {
  const rows: Array<{ table_name: string }> = await source.query(`
    SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
  `);
  return rows.map((row) => row.table_name);
};

describe('Database Migrations and Schema Health Check', () => {
  it('should run initial schema migration completely (10 tables created)', async () => {
    const source = await createSqliteSource([InitialSchema1716912345678]);
    try {
      expect(await listSqliteTables(source)).toHaveLength(0);

      const ran = await source.runMigrations();
      expect(ran.length).toBeGreaterThan(0);
      expect(await listSqliteTables(source)).toEqual(
        expect.arrayContaining([
          'users',
          'flights',
          'passengers',
          'bookings',
          'refunds',
          'user_preferences',
          'notification_logs',
          'admin_users',
          'admin_audit_logs',
          'idempotency_keys',
        ]),
      );
    } finally {
      await source.destroy();
    }
  });

  it('should roll back the initial migration cleanly (all tables dropped)', async () => {
    const source = await createSqliteSource([InitialSchema1716912345678]);
    try {
      await source.runMigrations();
      expect((await listSqliteTables(source)).length).toBeGreaterThan(0);

      await source.undoLastMigration();

      expect(await listSqliteTables(source)).toHaveLength(0);
    } finally {
      await source.destroy();
    }
  });

  describeWithPostgres('Postgres v1 migration chain (#1192)', () => {
    it('should apply every v1 migration from an empty database', async () => {
      const temp = await createTemporaryDatabase();
      try {
        const source = await createPostgresSource(temp.url, ALL_MIGRATIONS);
        try {
          expect(await listPostgresTables(source)).toHaveLength(0);

          const ran = await source.runMigrations();
          expect(ran).toHaveLength(ALL_MIGRATIONS.length);
          expect(await listPostgresTables(source)).toEqual(
            expect.arrayContaining(EXPECTED_TABLES),
          );
        } finally {
          await source.destroy();
        }
      } finally {
        await temp.cleanup();
      }
    });

    it('should upgrade from the supported previous schema to the latest migration', async () => {
      const temp = await createTemporaryDatabase();
      try {
        const previous = await createPostgresSource(temp.url, PREVIOUS_SCHEMA_MIGRATIONS);
        try {
          const ran = await previous.runMigrations();
          expect(ran).toHaveLength(PREVIOUS_SCHEMA_MIGRATIONS.length);
          const tables = await listPostgresTables(previous);
          expect(tables).toContain('insurance_policies');
          for (const table of LATEST_TABLES) {
            expect(tables).not.toContain(table);
          }
        } finally {
          await previous.destroy();
        }

        const upgraded = await createPostgresSource(temp.url, ALL_MIGRATIONS);
        try {
          // Only the final migration is pending because the migrations table
          // records the previous schema as already applied.
          const ran = await upgraded.runMigrations();
          expect(ran).toHaveLength(1);
          expect(ran[0].name).toBe('CreateCarbonOffsetTables1755000000000');
          expect(await listPostgresTables(upgraded)).toEqual(
            expect.arrayContaining(LATEST_TABLES),
          );
        } finally {
          await upgraded.destroy();
        }
      } finally {
        await temp.cleanup();
      }
    });
  });
});
