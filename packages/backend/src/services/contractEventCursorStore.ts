/**
 * Storage seam for per-contract Soroban event indexer positions (#931).
 *
 * The indexer depends only on this interface, which keeps the cursor logic
 * testable without a database. The production implementation lives in
 * `contractEventCursorTypeOrmStore.ts`.
 */

export interface ContractCursor {
  contractId: string;
  /** Soroban RPC paging token of the last committed event, if any. */
  cursor: string | null;
  /** Last ledger whose events have all been handled successfully. */
  lastCommittedLedger: number;
}

export interface ContractCursorStore {
  get(contractId: string): Promise<ContractCursor | null>;
  commit(cursor: ContractCursor): Promise<void>;
}

export class InMemoryContractCursorStore implements ContractCursorStore {
  private readonly cursors = new Map<string, ContractCursor>();

  async get(contractId: string): Promise<ContractCursor | null> {
    const cursor = this.cursors.get(contractId);
    return cursor ? { ...cursor } : null;
  }

  async commit(cursor: ContractCursor): Promise<void> {
    this.cursors.set(cursor.contractId, { ...cursor });
  }

  /** Test/ops helper; not part of the durable contract. */
  snapshot(): ContractCursor[] {
    return Array.from(this.cursors.values()).map((cursor) => ({ ...cursor }));
  }
}
