import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiTenantCollaboration1750000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const uuidDefault = isPostgres ? ' DEFAULT gen_random_uuid()' : '';
    const jsonType = isPostgres ? 'JSONB' : 'TEXT';
    const timestamptzType = isPostgres ? 'TIMESTAMPTZ' : 'DATETIME';
    const nowDefault = isPostgres ? 'now()' : 'CURRENT_TIMESTAMP';

    // 1. tenants
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "slug" VARCHAR(128) NOT NULL,
        "name" VARCHAR(256) NOT NULL,
        "contractId" VARCHAR(128),
        "organizationId" VARCHAR(256),
        "members" ${jsonType} NOT NULL DEFAULT '[]',
        "rateLimitRpm" INTEGER NOT NULL DEFAULT 1000,
        "config" ${jsonType} NOT NULL DEFAULT '{}',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenants_slug" ON "tenants" ("slug")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_tenants_contractId" ON "tenants" ("contractId")`);

    // 2. Add tenantId to bookings (nullable — existing rows have no tenant)
    const bookingCols = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name='tenantId'`
    ).catch(() => []);
    if (!bookingCols || bookingCols.length === 0) {
      await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "tenantId" VARCHAR(36)`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_bookings_tenantId" ON "bookings" ("tenantId")`);
    }

    // 3. dashboard_shares
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dashboard_shares" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "dashboardId" VARCHAR(256) NOT NULL,
        "createdBy" VARCHAR(128) NOT NULL,
        "shareToken" VARCHAR(128) NOT NULL,
        "permission" VARCHAR(32) NOT NULL DEFAULT 'view',
        "allowedWallets" ${jsonType} NOT NULL DEFAULT '[]',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "expiresAt" ${timestamptzType},
        "tenantId" VARCHAR(36),
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_dashboard_shares_token" ON "dashboard_shares" ("shareToken")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dashboard_shares_dashboardId" ON "dashboard_shares" ("dashboardId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dashboard_shares_createdBy" ON "dashboard_shares" ("createdBy")`);

    // 4. dashboard_comments
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dashboard_comments" (
        "id" UUID PRIMARY KEY${uuidDefault},
        "dashboardId" VARCHAR(256) NOT NULL,
        "target" VARCHAR(256),
        "targetType" VARCHAR(32) NOT NULL DEFAULT 'dashboard',
        "authorWallet" VARCHAR(128) NOT NULL,
        "authorName" VARCHAR(128),
        "body" TEXT NOT NULL,
        "parentId" VARCHAR(36),
        "resolved" BOOLEAN NOT NULL DEFAULT false,
        "tenantId" VARCHAR(36),
        "createdAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestamptzType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dashboard_comments_dashboardId" ON "dashboard_comments" ("dashboardId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dashboard_comments_authorWallet" ON "dashboard_comments" ("authorWallet")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const cascade = isPostgres ? ' CASCADE' : '';

    await queryRunner.query(`DROP TABLE IF EXISTS "dashboard_comments"${cascade}`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dashboard_shares"${cascade}`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "tenantId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"${cascade}`);
  }
}
