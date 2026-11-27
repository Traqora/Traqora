import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persist booking work that exhausted automatic recovery (#1132). Operators use
 * these rows to find quarantined bookings and recover them through the audited
 * booking-recovery endpoint; the safe context excludes passenger and payment
 * secrets.
 */
export class CreateBookingDeadLetters1781000000000
  implements MigrationInterface
{
  name = 'CreateBookingDeadLetters1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking_dead_letters" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bookingId" varchar(64) NOT NULL,
        "operation" varchar(64) NOT NULL DEFAULT 'CONFIRM_TRANSACTION',
        "bookingStatus" varchar(32) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "reason" text,
        "context" jsonb,
        "state" varchar(16) NOT NULL DEFAULT 'open',
        "resolvedBy" varchar(128),
        "resolutionAction" varchar(64),
        "resolutionReason" text,
        "auditLogId" varchar(128),
        "resolvedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_booking_dead_letters_booking" ON "booking_dead_letters" ("bookingId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_booking_dead_letters_state" ON "booking_dead_letters" ("state")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_booking_dead_letters_state_created" ON "booking_dead_letters" ("state", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_booking_dead_letters_state_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_booking_dead_letters_state"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_booking_dead_letters_booking"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "booking_dead_letters"`);
  }
}
