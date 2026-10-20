import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTravelDocumentsTable1750000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'travel_documents',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'walletAddress',
            type: 'varchar',
            length: '128',
          },
          {
            name: 'documentType',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'documentNumber',
            type: 'text',
          },
          {
            name: 'fullName',
            type: 'text',
          },
          {
            name: 'issuingCountry',
            type: 'text',
          },
          {
            name: 'nationality',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'dateOfBirth',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'expiryDate',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'issueDate',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'verificationStatus',
            type: 'varchar',
            length: '32',
            default: "'unverified'",
          },
          {
            name: 'verificationNotes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'verifiedAt',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'isPrimary',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isDeleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'deletedAt',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'travel_documents',
      new TableIndex({ name: 'IDX_travel_documents_walletAddress', columnNames: ['walletAddress'] }),
    );

    await queryRunner.createIndex(
      'travel_documents',
      new TableIndex({ name: 'IDX_travel_documents_expiryDate', columnNames: ['expiryDate'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('travel_documents');
  }
}
