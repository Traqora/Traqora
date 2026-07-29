import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountDeletionRequests1756000000001 implements MigrationInterface {
  name = 'CreateAccountDeletionRequests1756000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "reason" text,
        "requestedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_account_deletion_requests_userId" ON "account_deletion_requests" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_account_deletion_requests_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_deletion_requests"`);
  }
}
