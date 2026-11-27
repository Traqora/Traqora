import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persist bounded on-chain confirmation retry state (#1131). The worker uses
 * `confirmationNextAttemptAt` to honour backoff across restarts, and
 * `confirmationAttempts` to stop after a fixed number of tries and surface a
 * terminal `failed` status.
 */
export class AddConfirmationRetryState1780000000000 implements MigrationInterface {
  name = 'AddConfirmationRetryState1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "confirmationAttempts" INTEGER NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "confirmationNextAttemptAt" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bookings_status_confirmationNextAttemptAt" ON "bookings" ("status", "confirmationNextAttemptAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_status_confirmationNextAttemptAt"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN IF EXISTS "confirmationNextAttemptAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN IF EXISTS "confirmationAttempts"`,
    );
  }
}
