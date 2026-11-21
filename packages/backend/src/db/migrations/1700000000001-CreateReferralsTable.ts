// @ts-ignore
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateReferralsTable1700000000001 implements MigrationInterface {
  name = 'CreateReferralsTable1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'referrals',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'referrerId',
            type: 'varchar',
          },
          {
            name: 'referrerEmail',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'referredEmail',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'referredWallet',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'referralCode',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'isCompleted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'riskScore',
            type: 'int',
            default: 0,
          },
          {
            name: 'fraudCheckResults',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isBlocked',
            type: 'boolean',
            default: false,
          },
          {
            name: 'blockReason',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'referrals',
      new TableIndex({
        name: 'IDX_referrals_referrerId',
        columnNames: ['referrerId'],
      })
    );

    await queryRunner.createIndex(
      'referrals',
      new TableIndex({
        name: 'IDX_referrals_referralCode',
        columnNames: ['referralCode'],
      })
    );

    await queryRunner.createIndex(
      'referrals',
      new TableIndex({
        name: 'IDX_referrals_ipAddress',
        columnNames: ['ipAddress'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('referrals', 'IDX_referrals_ipAddress');
    await queryRunner.dropIndex('referrals', 'IDX_referrals_referralCode');
    await queryRunner.dropIndex('referrals', 'IDX_referrals_referrerId');
    await queryRunner.dropTable('referrals');
  }
}
