import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import {
  InitialSchema1716912345678,
} from '../../packages/backend/src/db/migrations/1716912345678-InitialSchema';
import {
  CreateTravelDocumentsTable1750000000000,
} from '../../packages/backend/src/db/migrations/1750000000000-CreateTravelDocumentsTable';
import {
  MultiTenantCollaboration1750000000001,
} from '../../packages/backend/src/db/migrations/1750000000001-MultiTenantCollaboration';
import {
  CreateAnalyticsAuditLogs1750000000002,
} from '../../packages/backend/src/db/migrations/1750000000002-CreateAnalyticsAuditLogs';
import {
  CreateCheckIns1750000000003,
} from '../../packages/backend/src/db/migrations/1750000000003-CreateCheckIns';
import {
  CreateInsuranceTables1753500000000,
} from '../../packages/backend/src/db/migrations/1753500000000-CreateInsuranceTables';
import {
  CreateCarbonOffsetTables1755000000000,
} from '../../packages/backend/src/db/migrations/1755000000000-CreateCarbonOffsetTables';
import {
  CreateUserProfiles1756000000000,
} from '../../packages/backend/src/db/migrations/1756000000000-CreateUserProfiles';
import {
  CreateAccountDeletionRequests1756000000001,
} from '../../packages/backend/src/db/migrations/1756000000001-CreateAccountDeletionRequests';
import {
  CreateSearchHistoryAndSavedSearches1757000000000,
} from '../../packages/backend/src/db/migrations/1757000000000-CreateSearchHistoryAndSavedSearches';
import {
  CreateDisputeTables1764600000000,
} from '../../packages/backend/src/db/migrations/1764600000000-CreateDisputeTables';
import {
  AddRecommendationSupport1765000000000,
} from '../../packages/backend/src/db/migrations/1765000000000-AddRecommendationSupport';
import {
  CreateAncillaryPurchases1766000000000,
} from '../../packages/backend/src/db/migrations/1766000000000-CreateAncillaryPurchases';
import {
  CreateCorporateTables1767000000000,
} from '../../packages/backend/src/db/migrations/1767000000000-CreateCorporateTables';

const ALL_MIGRATIONS = [
  InitialSchema1716912345678,
  CreateTravelDocumentsTable1750000000000,
  MultiTenantCollaboration1750000000001,
  CreateAnalyticsAuditLogs1750000000002,
  CreateCheckIns1750000000003,
  CreateInsuranceTables1753500000000,
  CreateCarbonOffsetTables1755000000000,
  CreateUserProfiles1756000000000,
  CreateAccountDeletionRequests1756000000001,
  CreateSearchHistoryAndSavedSearches1757000000000,
  CreateDisputeTables1764600000000,
  AddRecommendationSupport1765000000000,
  CreateAncillaryPurchases1766000000000,
  CreateCorporateTables1767000000000,
];

describe('Database Migration Round-Trip Tests', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      logging: false,
      migrations: ALL_MIGRATIONS,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    // Clean slate: run all downs then ups
    for (let i = ALL_MIGRATIONS.length - 1; i >= 0; i--) {
      try {
        await dataSource.undoLastMigration();
      } catch (err) {
        // Ignore if already down
      }
    }
  });

  it('should run all migrations up successfully', async () => {
    const migrations = await dataSource.runMigrations();
    expect(migrations.length).toBe(ALL_MIGRATIONS.length);

    // Verify migrations table exists
    const migrationTable = await dataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'
    `);
    expect(migrationTable.length).toBe(1);
  });

  it('should rollback all migrations cleanly', async () => {
    // Run all migrations up
    await dataSource.runMigrations();

    // Rollback all migrations
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration();
    }

    // Verify no tables remain (except migrations)
    const tables = await dataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
    `);
    expect(tables.length).toBe(0);
  });

  it('should perform a full round-trip without data corruption', async () => {
    // Run all migrations up
    await dataSource.runMigrations();

    // Insert test data
    await dataSource.query(`
      INSERT INTO users (walletAddress, walletType) VALUES ('test-wallet-1', 'freighter')
    `);
    await dataSource.query(`
      INSERT INTO users (walletAddress, walletType) VALUES ('test-wallet-2', 'albedo')
    `);

    // Verify data exists
    const usersBefore = await dataSource.query(`SELECT * FROM users`);
    expect(usersBefore.length).toBe(2);

    // Rollback all migrations
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration();
    }

    // Run migrations up again
    await dataSource.runMigrations();

    // Verify schema is clean (no data should remain after rollback)
    const usersAfter = await dataSource.query(`SELECT * FROM users`);
    expect(usersAfter.length).toBe(0);
  });

  it('should preserve foreign key constraints during round-trip', async () => {
    await dataSource.runMigrations();

    // Insert a flight
    const flightResult = await dataSource.query(`
      INSERT INTO flights (flightNumber, airlineCode, fromAirport, toAirport, departureTime, arrivalTime)
      VALUES ('FL123', 'AA', 'JFK', 'LAX', datetime('now'), datetime('now', '+5 hours'))
    `);
    const flightId = flightResult[0].id;

    // Insert a passenger
    const passengerResult = await dataSource.query(`
      INSERT INTO passengers (email, firstName, lastName, sorobanAddress)
      VALUES ('test@example.com', 'John', 'Doe', 'GTEST123')
    `);
    const passengerId = passengerResult[0].id;

    // Insert a booking with valid foreign keys
    await dataSource.query(`
      INSERT INTO bookings (flightId, passengerId, status, amountCents)
      VALUES (?, ?, 'confirmed', 10000)
    `, [flightId, passengerId]);

    // Verify booking exists
    const bookings = await dataSource.query(`SELECT * FROM bookings`);
    expect(bookings.length).toBe(1);

    // Rollback and re-apply
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration();
    }
    await dataSource.runMigrations();

    // Verify constraints still work by attempting invalid insert
    await expect(
      dataSource.query(`
        INSERT INTO bookings (flightId, passengerId, status, amountCents)
        VALUES ('invalid-uuid', 'invalid-uuid', 'confirmed', 10000)
      `)
    ).rejects.toThrow();
  });

  it('should create and drop indexes correctly during round-trip', async () => {
    await dataSource.runMigrations();

    // Check for specific indexes
    const indexesBefore = await dataSource.query(`
      SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'
    `);
    const indexNamesBefore = indexesBefore.map((i: any) => i.name);

    // Verify some expected indexes exist
    expect(indexNamesBefore).toContain('idx_flights_flightNumber');
    expect(indexNamesBefore).toContain('idx_bookings_idempotencyKey');

    // Rollback and re-apply
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration();
    }
    await dataSource.runMigrations();

    // Verify indexes are recreated
    const indexesAfter = await dataSource.query(`
      SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'
    `);
    const indexNamesAfter = indexesAfter.map((i: any) => i.name);

    expect(indexNamesAfter).toContain('idx_flights_flightNumber');
    expect(indexNamesAfter).toContain('idx_bookings_idempotencyKey');
  });

  it('should handle incremental rollbacks correctly', async () => {
    await dataSource.runMigrations();

    // Rollback one migration at a time
    for (let i = 0; i < 3; i++) {
      await dataSource.undoLastMigration();
    }

    // Run migrations again
    await dataSource.runMigrations();

    // Verify all tables are present
    const tables = await dataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
    `);
    expect(tables.length).toBeGreaterThan(0);
  });

  it('should verify table count matches expected after full migration', async () => {
    await dataSource.runMigrations();

    const tables = await dataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
    `);
    
    // We expect at least the core tables from InitialSchema (10 tables)
    // plus additional tables from other migrations
    expect(tables.length).toBeGreaterThanOrEqual(10);

    // Verify core tables exist
    const tableNames = tables.map((t: any) => t.name);
    const coreTables = [
      'users', 'flights', 'passengers', 'bookings', 'refunds',
      'user_preferences', 'notification_logs', 'admin_users',
      'admin_audit_logs', 'idempotency_keys'
    ];
    
    for (const table of coreTables) {
      expect(tableNames).toContain(table);
    }
  });

  it('should verify migration table tracks applied migrations', async () => {
    await dataSource.runMigrations();

    const appliedMigrations = await dataSource.query(`
      SELECT * FROM migrations ORDER BY timestamp
    `);

    expect(appliedMigrations.length).toBe(ALL_MIGRATIONS.length);

    // Verify migration names are recorded
    const migrationNames = appliedMigrations.map((m: any) => m.name);
    expect(migrationNames).toContain('InitialSchema1716912345678');
    expect(migrationNames).toContain('CreateTravelDocumentsTable1750000000000');
  });

  it('should handle empty database on rollback', async () => {
    // Run migrations
    await dataSource.runMigrations();

    // Rollback all
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration();
    }

    // Try to rollback again (should be safe)
    await expect(dataSource.undoLastMigration()).resolves.toBeUndefined();
  });

  it('should verify no orphaned foreign keys after round-trip', async () => {
    await dataSource.runMigrations();

    // Insert data with proper foreign keys
    const flightResult = await dataSource.query(`
      INSERT INTO flights (flightNumber, airlineCode, fromAirport, toAirport, departureTime, arrivalTime)
      VALUES ('FL456', 'DL', 'ATL', 'SEA', datetime('now'), datetime('now', '+6 hours'))
    `);
    const flightId = flightResult[0].id;

    const passengerResult = await dataSource.query(`
      INSERT INTO passengers (email, firstName, lastName, sorobanAddress)
      VALUES ('jane@example.com', 'Jane', 'Smith', 'GTEST456')
    `);
    const passengerId = passengerResult[0].id;

    await dataSource.query(`
      INSERT INTO bookings (flightId, passengerId, status, amountCents)
      VALUES (?, ?, 'confirmed', 15000)
    `, [flightId, passengerId]);

    // Full round-trip
    for (let i = 0; i < ALL_MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration();
    }
    await dataSource.runMigrations();

    // Database should be clean (data wiped on rollback)
    const bookings = await dataSource.query(`SELECT * FROM bookings`);
    expect(bookings.length).toBe(0);
  });

  it('should verify cascade deletes work correctly', async () => {
    await dataSource.runMigrations();

    // Insert flight and booking
    const flightResult = await dataSource.query(`
      INSERT INTO flights (flightNumber, airlineCode, fromAirport, toAirport, departureTime, arrivalTime)
      VALUES ('FL789', 'UA', 'SFO', 'ORD', datetime('now'), datetime('now', '+4 hours'))
    `);
    const flightId = flightResult[0].id;

    const passengerResult = await dataSource.query(`
      INSERT INTO passengers (email, firstName, lastName, sorobanAddress)
      VALUES ('bob@example.com', 'Bob', 'Johnson', 'GTEST789')
    `);
    const passengerId = passengerResult[0].id;

    await dataSource.query(`
      INSERT INTO bookings (flightId, passengerId, status, amountCents)
      VALUES (?, ?, 'confirmed', 20000)
    `, [flightId, passengerId]);

    // Delete passenger (should cascade to booking)
    await dataSource.query(`DELETE FROM passengers WHERE id = ?`, [passengerId]);

    const bookings = await dataSource.query(`SELECT * FROM bookings`);
    expect(bookings.length).toBe(0);
  });

  it('should handle sequential migration application', async () => {
    // Apply migrations one by one
    for (const migration of ALL_MIGRATIONS) {
      await dataSource.queryRunner?.startTransaction();
      try {
        const instance = new migration();
        await instance.up(dataSource.createQueryRunner());
        await dataSource.queryRunner?.commitTransaction();
      } catch (err) {
        await dataSource.queryRunner?.rollbackTransaction();
        throw err;
      }
    }

    // Verify tables exist
    const tables = await dataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
    `);
    expect(tables.length).toBeGreaterThan(0);
  });

  it('should verify table column types are preserved', async () => {
    await dataSource.runMigrations();

    // Check users table structure
    const usersTable = await dataSource.query(`
      PRAGMA table_info(users)
    `);
    
    const columns = usersTable.map((c: any) => c.name);
    expect(columns).toContain('walletAddress');
    expect(columns).toContain('walletType');
    expect(columns).toContain('createdAt');
    expect(columns).toContain('lastLoginAt');

    // Check walletAddress is VARCHAR and PRIMARY KEY
    const walletAddressCol = usersTable.find((c: any) => c.name === 'walletAddress');
    expect(walletAddressCol.type).toContain('varchar');
    expect(walletAddressCol.pk).toBe(1);
  });

  it('should verify unique constraints are enforced', async () => {
    await dataSource.runMigrations();

    // Insert a user
    await dataSource.query(`
      INSERT INTO users (walletAddress, walletType) VALUES ('unique-wallet', 'freighter')
    `);

    // Try to insert duplicate (should fail)
    await expect(
      dataSource.query(`
        INSERT INTO users (walletAddress, walletType) VALUES ('unique-wallet', 'albedo')
      `)
    ).rejects.toThrow();
  });

  it('should verify not null constraints are enforced', async () => {
    await dataSource.runMigrations();

    // Try to insert user without required fields
    await expect(
      dataSource.query(`
        INSERT INTO users (walletAddress) VALUES ('test-wallet')
      `)
    ).rejects.toThrow();
  });
});
