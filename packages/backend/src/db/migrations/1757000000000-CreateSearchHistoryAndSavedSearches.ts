import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSearchHistoryAndSavedSearches1757000000000 implements MigrationInterface {
  name = 'CreateSearchHistoryAndSavedSearches1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const idDefault = isPostgres ? 'uuid_generate_v4()' : 'lower(hex(randomblob(16)))';
    const timestampType = isPostgres ? 'timestamptz' : 'datetime';
    const nowDefault = isPostgres ? 'now()' : 'CURRENT_TIMESTAMP';

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "search_history_entries" (
        "id" uuid PRIMARY KEY DEFAULT ${idDefault},
        "userId" varchar(128) NOT NULL,
        "fromAirport" varchar(3) NOT NULL,
        "toAirport" varchar(3) NOT NULL,
        "departureDate" date NOT NULL,
        "passengers" integer NOT NULL DEFAULT 1,
        "cabinClass" varchar(32) NOT NULL DEFAULT 'economy',
        "createdAt" ${timestampType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_search_history_user_created_at"
      ON "search_history_entries" ("userId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "saved_searches" (
        "id" uuid PRIMARY KEY DEFAULT ${idDefault},
        "userId" varchar(128) NOT NULL,
        "name" varchar(80),
        "fromAirport" varchar(3) NOT NULL,
        "toAirport" varchar(3) NOT NULL,
        "departureDate" date NOT NULL,
        "passengers" integer NOT NULL DEFAULT 1,
        "cabinClass" varchar(32) NOT NULL DEFAULT 'economy',
        "createdAt" ${timestampType} NOT NULL DEFAULT ${nowDefault},
        "updatedAt" ${timestampType} NOT NULL DEFAULT ${nowDefault}
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_saved_searches_user_updated_at"
      ON "saved_searches" ("userId", "updatedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "saved_searches"');
    await queryRunner.query('DROP TABLE IF EXISTS "search_history_entries"');
  }
}
