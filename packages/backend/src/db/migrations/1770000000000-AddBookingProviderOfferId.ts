import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Carry the upstream provider offer id through booking confirmation (#914).
 * Nullable so existing bookings, which were made without one, stay valid.
 */
export class AddBookingProviderOfferId1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "providerOfferId" VARCHAR(256)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bookings_providerOfferId" ON "bookings" ("providerOfferId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_providerOfferId"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "providerOfferId"`);
  }
}
