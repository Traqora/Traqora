import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persist the relationship between a fee-bump envelope and its inner
 * transaction (#923), and the stable booking reference published in the
 * transaction memo (#924).
 */
export class AddStellarTransactionMetadata1768000000000 implements MigrationInterface {
  name = 'AddStellarTransactionMetadata1768000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "sorobanInnerTxHash" VARCHAR(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "sorobanFeeBumpTxHash" VARCHAR(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "sorobanIsFeeBump" BOOLEAN NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "bookingReference" VARCHAR(64)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bookings_sorobanInnerTxHash" ON "bookings" ("sorobanInnerTxHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bookings_sorobanFeeBumpTxHash" ON "bookings" ("sorobanFeeBumpTxHash")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_bookings_bookingReference" ON "bookings" ("bookingReference") WHERE "bookingReference" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_bookingReference"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_sorobanFeeBumpTxHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_sorobanInnerTxHash"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "bookingReference"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "sorobanIsFeeBump"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "sorobanFeeBumpTxHash"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "sorobanInnerTxHash"`);
  }
}
