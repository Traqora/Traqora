import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCheckIns1750000000003 implements MigrationInterface {
  name = 'CreateCheckIns1750000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "check_ins" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bookingId" uuid NOT NULL REFERENCES "bookings"("id"),
        "status" varchar(32) NOT NULL DEFAULT 'pending',
        "seatNumber" varchar(16),
        "boardingPassCode" varchar(64) NOT NULL,
        "checkedInAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_check_ins_bookingId" ON "check_ins" ("bookingId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_check_ins_boardingPassCode" ON "check_ins" ("boardingPassCode")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_check_ins_boardingPassCode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_check_ins_bookingId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "check_ins"`);
  }
}
