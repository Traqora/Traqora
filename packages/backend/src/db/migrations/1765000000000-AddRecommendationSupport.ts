import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecommendationSupport1765000000000 implements MigrationInterface {
  name = 'AddRecommendationSupport1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "walletAddress" varchar(128)
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_bookings_walletAddress" ON "bookings" ("walletAddress")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recommendation_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar(128) NOT NULL,
        "destinationCode" varchar(8) NOT NULL,
        "variant" varchar(32) NOT NULL,
        "action" varchar(16) NOT NULL,
        "reason" varchar(64),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_recommendation_events_userId" ON "recommendation_events" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_recommendation_events_destinationCode" ON "recommendation_events" ("destinationCode")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recommendation_events_destinationCode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_recommendation_events_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recommendation_events"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_walletAddress"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "walletAddress"`);
  }
}
