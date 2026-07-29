import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsAuditLogs1750000000002 implements MigrationInterface {
  name = 'CreateAnalyticsAuditLogs1750000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "action" varchar(64) NOT NULL,
        "route" varchar(256) NOT NULL,
        "method" varchar(16) NOT NULL,
        "actorId" varchar(128),
        "actorEmail" varchar(128),
        "actorType" varchar(32) NOT NULL DEFAULT 'unknown',
        "tenantId" varchar(128),
        "queryParams" text,
        "metadata" text,
        "statusCode" integer,
        "durationMs" integer,
        "ipAddress" varchar(64) NOT NULL DEFAULT 'unknown',
        "userAgent" varchar(256),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_analytics_audit_logs_action" ON "analytics_audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_analytics_audit_logs_route" ON "analytics_audit_logs" ("route")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_analytics_audit_logs_actorId" ON "analytics_audit_logs" ("actorId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_analytics_audit_logs_createdAt" ON "analytics_audit_logs" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_analytics_audit_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_analytics_audit_logs_actorId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_analytics_audit_logs_route"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_analytics_audit_logs_action"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_audit_logs"`);
  }
}
