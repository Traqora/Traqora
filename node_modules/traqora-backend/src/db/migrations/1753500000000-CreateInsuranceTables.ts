import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInsuranceTables1753500000000 implements MigrationInterface {
  name = 'CreateInsuranceTables1753500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "insurance_policies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bookingId" varchar(128) NOT NULL,
        "destination" varchar(3) NOT NULL,
        "tripCostCents" integer NOT NULL,
        "coverageType" varchar(16) NOT NULL DEFAULT 'standard',
        "premiumCents" integer NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'USD',
        "status" varchar(32) NOT NULL DEFAULT 'active',
        "provider" varchar(64) NOT NULL DEFAULT 'mock-global-shield',
        "providerPolicyRef" varchar(128) NOT NULL,
        "coverageDetailsJson" text NOT NULL,
        "purchasedAt" timestamptz NOT NULL DEFAULT now(),
        "refundEligibleUntil" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_insurance_policies_bookingId" ON "insurance_policies" ("bookingId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_insurance_policies_providerPolicyRef" ON "insurance_policies" ("providerPolicyRef")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "insurance_claims" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "policyId" varchar(128) NOT NULL,
        "eventType" varchar(32) NOT NULL,
        "description" text NOT NULL,
        "amountRequestedCents" integer NOT NULL,
        "amountApprovedCents" integer,
        "status" varchar(32) NOT NULL DEFAULT 'submitted',
        "contactEmail" varchar(256),
        "submittedAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_insurance_claims_policyId" ON "insurance_claims" ("policyId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_insurance_claims_policyId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "insurance_claims"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_insurance_policies_providerPolicyRef"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_insurance_policies_bookingId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "insurance_policies"`);
  }
}
