import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputeTables1764600000000 implements MigrationInterface {
  name = 'CreateDisputeTables1764600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "disputes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "refundId" uuid NOT NULL,
        "claimantAddress" varchar(128) NOT NULL,
        "respondentAddress" varchar(128) NOT NULL,
        "arbitratorAddress" varchar(128),
        "disputeType" varchar(64) NOT NULL,
        "description" text NOT NULL,
        "desiredOutcome" text,
        "status" varchar(32) NOT NULL DEFAULT 'open',
        "outcome" varchar(32),
        "resolutionNotes" text,
        "deadlineAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_disputes_refund" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_disputes_refundId" ON "disputes" ("refundId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_disputes_claimantAddress" ON "disputes" ("claimantAddress")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_disputes_respondentAddress" ON "disputes" ("respondentAddress")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_disputes_arbitratorAddress" ON "disputes" ("arbitratorAddress")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dispute_evidence" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "disputeId" uuid NOT NULL,
        "submittedBy" varchar(128) NOT NULL,
        "description" text NOT NULL,
        "fileUrl" text,
        "submittedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_dispute_evidence_dispute" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dispute_evidence_disputeId" ON "dispute_evidence" ("disputeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_dispute_evidence_submittedBy" ON "dispute_evidence" ("submittedBy")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dispute_evidence_submittedBy"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dispute_evidence_disputeId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dispute_evidence"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_disputes_arbitratorAddress"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_disputes_respondentAddress"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_disputes_claimantAddress"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_disputes_refundId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "disputes"`);
  }
}
