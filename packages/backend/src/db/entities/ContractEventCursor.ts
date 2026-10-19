import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Durable indexing position for one Soroban contract (#931).
 *
 * The cursor is stored per contract so a restart, or an unrelated contract
 * being slow/failing, can never move another contract's position. The ledger
 * is committed only after every event up to that point has been handled
 * successfully (see `ContractEventIndexer`).
 */
@Entity('contract_event_cursors')
export class ContractEventCursor {
  @PrimaryColumn({ name: 'contract_id', type: 'varchar', length: 128 })
  contractId!: string;

  /**
   * Soroban RPC paging token of the last committed event. Null means "resume
   * from `lastCommittedLedger + 1`" (for example after a scan window with no
   * matching events, where there is no token to anchor to).
   */
  @Column({ type: 'varchar', length: 512, nullable: true })
  cursor!: string | null;

  @Column({ name: 'last_committed_ledger', type: 'integer' })
  lastCommittedLedger!: number;

  @UpdateDateColumn({
    name: 'updated_at',
    type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz',
  })
  updatedAt!: Date;
}
