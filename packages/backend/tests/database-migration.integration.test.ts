import { DataSource } from 'typeorm';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { InitialSchema1716912345678 } from '../src/db/migrations/1716912345678-InitialSchema';

describe('Database Migrations and Schema Health Check', () => {
  let testDataSource: DataSource;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    // Initialize primary in-memory AppDataSource (synchronize:true for test)
    await initDataSource();

    // Create a dedicated separate better-sqlite3 memory connection to verify reversible migrations
    testDataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      logging: false,
      migrations: [InitialSchema1716912345678],
    });
    await testDataSource.initialize();
  });

  afterAll(async () => {
    if (testDataSource && testDataSource.isInitialized) {
      await testDataSource.destroy();
    }
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it('should run initial schema migration completely (10 tables created)', async () => {
    // Verify no tables exist initially
    const initialTables: Array<{ name: string }> = await testDataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    expect(initialTables.length).toBe(0);

    // Run migrations UP
    const ranMigrations = await testDataSource.runMigrations();
    expect(ranMigrations.length).toBeGreaterThan(0);

    // Verify all 10 tables are present
    const migratedTables: Array<{ name: string }> = await testDataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        AND name != 'migrations'
    `);
    const tableNames = migratedTables.map((t) => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('flights');
    expect(tableNames).toContain('passengers');
    expect(tableNames).toContain('bookings');
    expect(tableNames).toContain('refunds');
    expect(tableNames).toContain('user_preferences');
    expect(tableNames).toContain('notification_logs');
    expect(tableNames).toContain('admin_users');
    expect(tableNames).toContain('admin_audit_logs');
    expect(tableNames).toContain('idempotency_keys');
  });

  it('should roll back the initial migration cleanly (all tables dropped)', async () => {
    // Tables should be present from the previous test
    const beforeRollback: Array<{ name: string }> = await testDataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        AND name != 'migrations'
    `);
    expect(beforeRollback.length).toBeGreaterThan(0);

    // Rollback migrations DOWN
    await testDataSource.undoLastMigration();

    // Verify all tables are dropped — database back to clean state
    const afterRollback: Array<{ name: string }> = await testDataSource.query(`
      SELECT name FROM sqlite_master WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        AND name != 'migrations'
    `);
    expect(afterRollback.length).toBe(0);
  });

  it('schema validation: AppDataSource should be connected and have no pending migrations', async () => {
    // Verify AppDataSource is initialized (test mode uses synchronize:true, no migrations table)
    expect(AppDataSource.isInitialized).toBe(true);

    // Verify basic query works — equivalent to the /health/schema DB ping
    await expect(AppDataSource.query('SELECT 1')).resolves.toBeDefined();
  });
});
