import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupplierBookingReference1779000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bookings" ADD COLUMN "supplierBookingReference" TEXT',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "bookings" DROP COLUMN "supplierBookingReference"',
    );
  }
}
