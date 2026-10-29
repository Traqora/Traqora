import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Store the provider ticketing deadline on the booking, separate from the
 * flight departure time (#906).
 */
export class AddTicketingDeadline1768200000000 implements MigrationInterface {
  name = 'AddTicketingDeadline1768200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "ticketingDeadline" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "ticketingDeadline"`);
  }
}
