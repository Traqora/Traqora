import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

export class CreateCorporateTables1767000000000 implements MigrationInterface {
  name = 'CreateCorporateTables1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Corporate Accounts
    await queryRunner.createTable(
      new Table({
        name: 'corporate_accounts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'companyName', type: 'varchar', length: '255' },
          { name: 'registrationNumber', type: 'varchar', length: '128', isNullable: true },
          { name: 'taxId', type: 'varchar', length: '64', isNullable: true },
          { name: 'email', type: 'varchar', length: '255' },
          { name: 'phone', type: 'varchar', length: '64', isNullable: true },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'industry', type: 'varchar', length: '128', isNullable: true },
          { name: 'accountManagerId', type: 'varchar', length: '36', isNullable: true },
          { name: 'creditLimitCents', type: 'integer', default: 0 },
          { name: 'paymentTermsDays', type: 'integer', default: 30 },
          { name: 'status', type: 'varchar', length: '32', default: "'pending'" },
          { name: 'customFields', type: 'json', isNullable: true },
          { name: 'contractStartDate', type: 'timestamptz', isNullable: true },
          { name: 'contractEndDate', type: 'timestamptz', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('corporate_accounts', new TableIndex({
      name: 'IDX_CORP_ACCT_REGISTRATION',
      columnNames: ['registrationNumber'],
    }));

    // Corporate Users
    await queryRunner.createTable(
      new Table({
        name: 'corporate_users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'corporateAccountId', type: 'uuid' },
          { name: 'userId', type: 'varchar', length: '36' },
          { name: 'role', type: 'varchar', length: '32', default: "'traveler'" },
          { name: 'department', type: 'varchar', length: '128', isNullable: true },
          { name: 'costCenter', type: 'varchar', length: '128', isNullable: true },
          { name: 'permissions', type: 'json', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('corporate_users', new TableIndex({
      name: 'IDX_CORP_USER_ACCOUNT',
      columnNames: ['corporateAccountId'],
    }));
    await queryRunner.createIndex('corporate_users', new TableIndex({
      name: 'IDX_CORP_USER_USER',
      columnNames: ['userId'],
    }));

    // Corporate Booking Policies
    await queryRunner.createTable(
      new Table({
        name: 'corporate_booking_policies',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'corporateAccountId', type: 'uuid' },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'maxBookingAmountCents', type: 'integer', isNullable: true },
          { name: 'allowedFareClasses', type: 'text', default: "'economy'" },
          { name: 'maxAdvanceBookingDays', type: 'integer', isNullable: true },
          { name: 'requiresApproval', type: 'boolean', default: true },
          { name: 'approvalThresholdCents', type: 'integer', isNullable: true },
          { name: 'preferredAirlines', type: 'text', isNullable: true },
          { name: 'blacklistedAirlines', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('corporate_booking_policies', new TableIndex({
      name: 'IDX_CORP_POLICY_ACCOUNT',
      columnNames: ['corporateAccountId'],
    }));

    // Booking Approvals
    await queryRunner.createTable(
      new Table({
        name: 'booking_approvals',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'groupBookingId', type: 'uuid' },
          { name: 'corporateAccountId', type: 'uuid', isNullable: true },
          { name: 'requestedBy', type: 'varchar', length: '36' },
          { name: 'approverId', type: 'varchar', length: '36', isNullable: true },
          { name: 'status', type: 'varchar', length: '32', default: "'pending'" },
          { name: 'requestReason', type: 'text', isNullable: true },
          { name: 'approvalNote', type: 'text', isNullable: true },
          { name: 'approvalDate', type: 'timestamptz', isNullable: true },
          { name: 'rejectionReason', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('booking_approvals', new TableIndex({
      name: 'IDX_BOOKING_APPROVAL_GROUP',
      columnNames: ['groupBookingId'],
    }));

    // Add corporate columns to group_bookings
    await queryRunner.addColumns('group_bookings', [
      new TableColumn({ name: 'corporateAccountId', type: 'varchar', length: '36', isNullable: true }),
      new TableColumn({ name: 'approvalStatus', type: 'varchar', length: '32', default: "'not_required'" }),
      new TableColumn({ name: 'billingReference', type: 'varchar', length: '255', isNullable: true }),
      new TableColumn({ name: 'costCenter', type: 'varchar', length: '128', isNullable: true }),
      new TableColumn({ name: 'department', type: 'varchar', length: '128', isNullable: true }),
      new TableColumn({ name: 'bookingPolicyId', type: 'varchar', length: '36', isNullable: true }),
      new TableColumn({ name: 'invoiceData', type: 'json', isNullable: true }),
    ]);

    // Add employee columns to group_members
    await queryRunner.addColumns('group_members', [
      new TableColumn({ name: 'employeeId', type: 'varchar', length: '128', isNullable: true }),
      new TableColumn({ name: 'department', type: 'varchar', length: '128', isNullable: true }),
      new TableColumn({ name: 'travelPolicy', type: 'json', isNullable: true }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('booking_approvals');
    await queryRunner.dropTable('corporate_booking_policies');
    await queryRunner.dropTable('corporate_users');
    await queryRunner.dropTable('corporate_accounts');

    await queryRunner.dropColumns('group_bookings', [
      'corporateAccountId', 'approvalStatus', 'billingReference',
      'costCenter', 'department', 'bookingPolicyId', 'invoiceData',
    ]);

    await queryRunner.dropColumns('group_members', [
      'employeeId', 'department', 'travelPolicy',
    ]);
  }
}
