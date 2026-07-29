import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCarbonOffsetTables1755000000000 implements MigrationInterface {
  name = 'CreateCarbonOffsetTables1755000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'offset_projects',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'name', type: 'varchar', length: '256' },
          { name: 'type', type: 'varchar', length: '32' },
          { name: 'pricePerTonCents', type: 'integer' },
          { name: 'description', type: 'text' },
          { name: 'certifications', type: process.env.NODE_ENV === 'test' ? 'simple-json' : 'jsonb', default: "'[]'::jsonb" },
          { name: 'status', type: 'varchar', length: '128', default: "'active'" },
          { name: 'totalOffsetTons', type: 'integer', default: 0 },
          { name: 'createdAt', type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'carbon_offsets',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'varchar', length: '128' },
          { name: 'flightId', type: 'varchar', length: '128' },
          { name: 'projectId', type: 'varchar', length: '32' },
          { name: 'amountCents', type: 'integer' },
          { name: 'co2Kg', type: 'integer' },
          { name: 'tonsOffset', type: 'integer' },
          { name: 'status', type: 'varchar', length: '32', default: "'pending'" },
          { name: 'bookingId', type: 'varchar', length: '128', isNullable: true },
          { name: 'certificateRef', type: 'varchar', length: '256', isNullable: true },
          { name: 'sorobanTxHash', type: 'varchar', length: '128', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'createdAt', type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_carbon_offsets_user_id ON carbon_offsets ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_carbon_offsets_flight_id ON carbon_offsets ("flightId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_carbon_offsets_booking_id ON carbon_offsets ("bookingId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('carbon_offsets');
    await queryRunner.dropTable('offset_projects');
  }
}
