import { DataSource } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { ContractEventCursor } from '../db/entities/ContractEventCursor';
import { ContractCursor, ContractCursorStore } from './contractEventCursorStore';

/**
 * Durable per-contract cursor storage backed by `contract_event_cursors`.
 * TypeORM's `save` is an upsert on the contract id primary key.
 */
export class TypeOrmContractCursorStore implements ContractCursorStore {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  async get(contractId: string): Promise<ContractCursor | null> {
    if (!this.dataSource.isInitialized) return null;

    const row = await this.dataSource
      .getRepository(ContractEventCursor)
      .findOne({ where: { contractId } });

    if (!row) return null;

    return {
      contractId: row.contractId,
      cursor: row.cursor ?? null,
      lastCommittedLedger: row.lastCommittedLedger,
    };
  }

  async commit(cursor: ContractCursor): Promise<void> {
    if (!this.dataSource.isInitialized) return;

    await this.dataSource.getRepository(ContractEventCursor).save({
      contractId: cursor.contractId,
      cursor: cursor.cursor,
      lastCommittedLedger: cursor.lastCommittedLedger,
    });
  }
}
