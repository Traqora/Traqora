import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlightProvenance1769000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const timestampType = queryRunner.connection.options.type === 'postgres' ? 'TIMESTAMPTZ' : 'DATETIME';
    await queryRunner.query(`ALTER TABLE "flights" ADD COLUMN "sourceFreshness" VARCHAR(32) NOT NULL DEFAULT 'unknown'`);
    await queryRunner.query(`ALTER TABLE "flights" ADD COLUMN "sourceImportedAt" ${timestampType}`);
    await queryRunner.query(`ALTER TABLE "flights" ADD COLUMN "sourceUpdatedAt" ${timestampType}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "flights" DROP COLUMN "sourceUpdatedAt"`);
    await queryRunner.query(`ALTER TABLE "flights" DROP COLUMN "sourceImportedAt"`);
    await queryRunner.query(`ALTER TABLE "flights" DROP COLUMN "sourceFreshness"`);
  }
}
