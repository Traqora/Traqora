import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ContractReconciliationOutcome = 'repaired' | 'failed' | 'detected';

/**
 * One recorded repair attempt from the contract/booking reconciliation job
 * (#934). Rows are append-only: a retry produces another row, so operators can
 * see that a booking was attempted more than once and why the last attempt
 * failed.
 */
@Entity('contract_reconciliation_attempts')
@Index(['bookingId'])
@Index(['outcome', 'attemptedAt'])
export class ContractReconciliationAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'booking_id', type: 'varchar', length: 64 })
  bookingId!: string;

  @Column({ name: 'soroban_booking_id', type: 'varchar', length: 128, nullable: true })
  sorobanBookingId!: string | null;

  @Column({ name: 'contract_id', type: 'varchar', length: 128, nullable: true })
  contractId!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 64, nullable: true })
  eventType!: string | null;

  @Column({ name: 'event_ledger', type: 'int', nullable: true })
  eventLedger!: number | null;

  @Column({ name: 'previous_status', type: 'varchar', length: 32, nullable: true })
  previousStatus!: string | null;

  @Column({ name: 'expected_status', type: 'varchar', length: 32 })
  expectedStatus!: string;

  @Column({ type: 'varchar', length: 16 })
  outcome!: ContractReconciliationOutcome;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({
    name: 'attempted_at',
    type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz',
  })
  attemptedAt!: Date;
}
