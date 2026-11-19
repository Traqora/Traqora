import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supports the pending-booking age scan used by the stuck-booking gauge (#1174).
 * The index keeps the "oldest booking per pending status" lookup bounded as the
 * bookings table grows.
 */
export class AddBookingStatusUpdatedAtIndex1756000000000 implements MigrationInterface {
  name = 'AddBookingStatusUpdatedAtIndex1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bookings_status_updatedAt" ON "bookings" ("status", "updatedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_status_updatedAt"`);
  }
}
