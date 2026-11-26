import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Store the response of an idempotent operation so a repeated request can be
 * replayed verbatim. Used by cancellation (#1151); the column is generic so
 * other idempotent writes can reuse it.
 */
export class AddIdempotencyResponseBody1768000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "responseBody" TEXT',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "responseBody"',
    );
  }
}
