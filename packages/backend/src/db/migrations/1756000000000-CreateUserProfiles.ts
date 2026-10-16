import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserProfiles1756000000000 implements MigrationInterface {
  name = 'CreateUserProfiles1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "displayName" varchar(80),
        "bio" varchar(500),
        "avatarUrl" varchar(2048),
        "travelPreferences" jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_profiles_userId" ON "user_profiles" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_profiles_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profiles"`);
  }
}
