import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('contract_event_logs')
@Index(['contractId', 'eventType'])
@Index(['walletAddress'])
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

  @Column({ type: 'varchar', name: 'wallet_address', nullable: true })
  walletAddress: string | null;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'simple-json' : 'jsonb', default: '{}' })
  data: Record<string, unknown>;

  @CreateDateColumn({ name: 'indexed_at' })
  indexedAt: Date;
}
