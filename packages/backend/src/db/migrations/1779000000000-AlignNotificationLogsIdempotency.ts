import { MigrationInterface, QueryRunner } from "typeorm";

export class AlignNotificationLogsIdempotency1779000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === "postgres";

    if (isPostgres) {
      await queryRunner.query(
        `ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "idempotencyKey" VARCHAR(255)`
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_notification_logs_dedup_sent" ON "notification_logs" ("userId", "type", "channel", "idempotencyKey", "status")`
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_notification_logs_idempotencyKey" ON "notification_logs" ("idempotencyKey")`
      );
      return;
    }

    const columns = await queryRunner.query(`PRAGMA table_info("notification_logs")`);
    const hasIdempotencyKey = Array.isArray(columns) && columns.some((c: any) => c.name === "idempotencyKey");
    if (!hasIdempotencyKey) {
      await queryRunner.query(`ALTER TABLE "notification_logs" ADD COLUMN "idempotencyKey" varchar`);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_logs_dedup_sent" ON "notification_logs" ("userId", "type", "channel", "idempotencyKey", "status")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notification_logs_idempotencyKey" ON "notification_logs" ("idempotencyKey")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === "postgres";
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notification_logs_idempotencyKey"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notification_logs_dedup_sent"`);

    // Keep idempotencyKey column on down to avoid data loss in environments where it may be in use.
    if (isPostgres) {
      // no-op: column retained intentionally
      return;
    }
  }
}
