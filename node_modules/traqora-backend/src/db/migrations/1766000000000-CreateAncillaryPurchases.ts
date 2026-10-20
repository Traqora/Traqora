import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAncillaryPurchases1766000000000
  implements MigrationInterface
{
  name = "CreateAncillaryPurchases1766000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ancillary_purchases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bookingId" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "serviceCode" varchar(48) NOT NULL,
        "serviceType" varchar(32) NOT NULL,
        "amountCents" integer NOT NULL CHECK ("amountCents" > 0),
        "quantity" integer NOT NULL DEFAULT 1 CHECK ("quantity" > 0),
        "status" varchar(24) NOT NULL,
        "details" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ancillary_booking" ON "ancillary_purchases" ("bookingId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ancillary_type_created" ON "ancillary_purchases" ("serviceType", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ancillary_type_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ancillary_booking"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ancillary_purchases"`);
  }
}
