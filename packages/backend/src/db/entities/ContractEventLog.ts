import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Local archive of indexed contract events.
 *
 * Besides powering `GET /api/contract-events`, this table is the authoritative
 * on-chain side of the booking reconciliation job (#934). `pagingToken` makes
 * re-processing an event page after a crash idempotent.
 */
@Entity('contract_event_logs')
@Index(['contractId', 'eventType'])
@Index(['contractId', 'pagingToken'], { unique: true })
@Index(['walletAddress'])
@Index(['sorobanBookingId'])
@Index(['ledger'])
export class ContractEventLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_id' })
  contractId: string;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column({ type: 'int' })
  ledger: number;

  /** Soroban paging token; null when the RPC response did not provide one. */
  @Column({ name: 'paging_token', type: 'varchar', length: 512, nullable: true })
  pagingToken: string | null;

  @Column({ name: 'tx_hash', type: 'varchar', length: 128, nullable: true })
  txHash: string | null;

  /**
   * Booking id decoded from the event payload, when the event belongs to a
   * booking. Reconciliation only considers rows with a non-null value.
   */
  @Column({ name: 'soroban_booking_id', type: 'varchar', length: 128, nullable: true })
  sorobanBookingId: string | null;

  @Column({ type: 'varchar', name: 'wallet_address', nullable: true })
  walletAddress: string | null;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'simple-json' : 'jsonb', default: '{}' })
  data: Record<string, any>;

  @CreateDateColumn({ name: 'indexed_at' })
  indexedAt: Date;
}
