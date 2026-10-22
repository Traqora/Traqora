import { logger } from '../utils/logger';
import {
  ContractCursor,
  ContractCursorStore,
} from './contractEventCursorStore';

/**
 * Soroban contract event indexer (#931, #932).
 *
 * Guarantees
 * ----------
 * 1. Positions are stored per contract. One contract's failure or backlog can
 *    never move another contract's cursor.
 * 2. A source ledger/cursor is committed only after every event before it has
 *    been handled successfully. If a handler throws, the cursor stays at the
 *    last successful event and the failing event is retried on the next run.
 * 3. The indexer never jumps to `latestLedger` after fetching a single page.
 *    Pages are drained with the RPC paging token until the scan window is
 *    complete. When the persisted position is far behind the chain, the gap is
 *    backfilled in bounded ledger chunks; a run that reaches its budget stops
 *    with an incomplete (but safely committed) position.
 *
 * The service depends on narrow RPC/store interfaces so this behaviour can be
 * tested without a live Soroban endpoint or a database.
 */

export interface SorobanEventLike {
  ledger: number;
  pagingToken?: string;
  cursor?: string;
  id?: string;
  txHash?: string;
  contractId?: string;
  topic?: unknown[];
  value?: unknown;
  [key: string]: unknown;
}

export interface SorobanEventPage {
  events?: SorobanEventLike[];
  latestLedger?: number;
  cursor?: string;
}

export interface SorobanEventFilter {
  type: 'contract';
  contractIds: string[];
}

export interface SorobanEventRpc {
  getLatestLedger(): Promise<{ sequence: number }>;
  getEvents(params: {
    startLedger?: number;
    endLedger?: number;
    cursor?: string;
    filters: SorobanEventFilter[];
    limit?: number;
  }): Promise<SorobanEventPage>;
}

export type ContractEventHandler = (event: SorobanEventLike) => void | Promise<void>;

export interface ContractEventIndexerOptions {
  /** Maximum events requested from the RPC per call. */
  pageSize: number;
  /** Maximum ledgers a single bounded-backfill request scans. */
  maxLedgerSpan: number;
  /** Backlog (in ledgers) above which a run switches to bounded backfill. */
  gapThresholdLedgers: number;
  /** Lookback used the very first time a contract is indexed. */
  initialLookbackLedgers: number;
  /** Hard cap on RPC pages per contract per run. */
  maxPagesPerRun: number;
  /** Hard cap on how many ledgers a single backfill run may cover. */
  maxBackfillLedgersPerRun: number;
}

export interface LedgerGap {
  fromLedger: number;
  toLedger: number;
  ledgers: number;
}

export interface IndexContractResult {
  contractId: string;
  processedEvents: number;
  committedLedger: number | null;
  gapDetected: boolean;
  backfillChunks: number;
  backfillComplete: boolean;
  pagesFetched: number;
}

export class ContractEventProcessingError extends Error {
  constructor(
    readonly contractId: string,
    readonly event: SorobanEventLike,
    readonly cause: unknown,
  ) {
    super(
      `Failed to process ${contractId} event at ledger ${event.ledger}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'ContractEventProcessingError';
  }
}

interface ScanBudget {
  pages: number;
}

interface ScanWindowResult {
  processedEvents: number;
  complete: boolean;
  scannedThrough: number;
  pagesFetched: number;
}

const DEFAULT_OPTIONS: ContractEventIndexerOptions = {
  pageSize: 100,
  maxLedgerSpan: 500,
  gapThresholdLedgers: 1_000,
  initialLookbackLedgers: 100,
  maxPagesPerRun: 100,
  maxBackfillLedgersPerRun: 10_000,
};

const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const resolveContractEventIndexerOptions = (
  overrides: Partial<ContractEventIndexerOptions> = {},
): ContractEventIndexerOptions => ({
  ...DEFAULT_OPTIONS,
  pageSize: envInt('CONTRACT_INDEXER_PAGE_SIZE', DEFAULT_OPTIONS.pageSize),
  maxLedgerSpan: envInt(
    'CONTRACT_INDEXER_MAX_LEDGER_SPAN',
    DEFAULT_OPTIONS.maxLedgerSpan,
  ),
  gapThresholdLedgers: envInt(
    'CONTRACT_INDEXER_GAP_THRESHOLD_LEDGERS',
    DEFAULT_OPTIONS.gapThresholdLedgers,
  ),
  initialLookbackLedgers: envInt(
    'CONTRACT_INDEXER_INITIAL_LOOKBACK_LEDGERS',
    DEFAULT_OPTIONS.initialLookbackLedgers,
  ),
  maxPagesPerRun: envInt(
    'CONTRACT_INDEXER_MAX_PAGES_PER_RUN',
    DEFAULT_OPTIONS.maxPagesPerRun,
  ),
  maxBackfillLedgersPerRun: envInt(
    'CONTRACT_INDEXER_MAX_BACKFILL_LEDGERS_PER_RUN',
    DEFAULT_OPTIONS.maxBackfillLedgersPerRun,
  ),
  ...overrides,
});

/**
 * Compare the last committed position with the latest available ledger.
 *
 * A gap is any run where more ledgers elapsed than the configured threshold.
 * The caller must then walk the range in bounded chunks instead of requesting
 * only the newest page (which is what silently skipped events before #932).
 */
export function detectLedgerGap(
  previousCommittedLedger: number | null,
  latestLedger: number,
  thresholdLedgers: number,
): LedgerGap | null {
  if (previousCommittedLedger === null || previousCommittedLedger < 0) {
    return null;
  }

  const fromLedger = previousCommittedLedger + 1;
  if (latestLedger < fromLedger) return null;

  const ledgers = latestLedger - previousCommittedLedger;
  if (ledgers <= thresholdLedgers) return null;

  return { fromLedger, toLedger: latestLedger, ledgers };
}

const eventCursor = (event: SorobanEventLike): string | null => {
  const candidate = event.pagingToken ?? event.cursor ?? event.id;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
};

const eventLedger = (event: SorobanEventLike): number | null => {
  const ledger = Number(event.ledger);
  return Number.isFinite(ledger) ? ledger : null;
};

export class ContractEventIndexer {
  private readonly options: ContractEventIndexerOptions;

  constructor(
    private readonly rpc: SorobanEventRpc,
    private readonly cursorStore: ContractCursorStore,
    options: Partial<ContractEventIndexerOptions> = {},
  ) {
    this.options = resolveContractEventIndexerOptions(options);
  }

  async getCursor(contractId: string): Promise<ContractCursor | null> {
    return this.cursorStore.get(contractId);
  }

  /**
   * Index one contract up to the latest ledger visible when the run started.
   *
   * Throws {@link ContractEventProcessingError} when a handler or archive sink
   * fails. The previously committed cursor is already durable in that case, so
   * the next run retries the failed event rather than skipping it.
   */
  async indexContract(
    contractId: string,
    handler: ContractEventHandler,
  ): Promise<IndexContractResult> {
    const latest = await this.rpc.getLatestLedger();
    const latestLedger = Number(latest.sequence);

    if (!Number.isFinite(latestLedger) || latestLedger < 0) {
      throw new Error(`Invalid latest ledger for ${contractId}: ${latest.sequence}`);
    }

    const persisted = await this.cursorStore.get(contractId);
    const previousLedger = persisted?.lastCommittedLedger ?? null;
    const detectedGap = detectLedgerGap(
      previousLedger,
      latestLedger,
      this.options.gapThresholdLedgers,
    );

    // If the last run stopped mid-ledger (token still present), backfill from
    // that ledger rather than the next one. Without this, events later in the
    // same ledger would be skipped when a long gap coincides with a partial
    // page. Replaying the already-committed prefix is safe: the archive
    // deduplicates by paging token and handlers are expected to be idempotent.
    const gap =
      detectedGap && persisted?.cursor
        ? {
            ...detectedGap,
            fromLedger: Math.max(1, previousLedger ?? detectedGap.fromLedger),
            ledgers: detectedGap.ledgers + 1,
          }
        : detectedGap;

    const budget: ScanBudget = { pages: 0 };

    let result: {
      processedEvents: number;
      scannedThrough: number;
      gapDetected: boolean;
      backfillChunks: number;
      backfillComplete: boolean;
    };

    if (gap) {
      logger.warn('Contract event ledger gap detected; starting bounded backfill', {
        contractId,
        fromLedger: gap.fromLedger,
        toLedger: gap.toLedger,
        ledgers: gap.ledgers,
        maxLedgerSpan: this.options.maxLedgerSpan,
        maxBackfillLedgersPerRun: this.options.maxBackfillLedgersPerRun,
      });

      result = await this.backfillGap(contractId, gap, handler, budget);
    } else {
      // A paging token resumes *after* the committed event, so we may include
      // the previous ledger in the request (the token excludes it). Without a
      // token, start at the next ledger so a fully scanned ledger is never
      // replayed on every run.
      const fromLedger = persisted
        ? persisted.cursor
          ? Math.max(0, previousLedger ?? 0)
          : Math.max(0, (previousLedger ?? -1) + 1)
        : Math.max(1, latestLedger - this.options.initialLookbackLedgers + 1);

      const scan = await this.scanWindow(
        contractId,
        fromLedger,
        latestLedger,
        handler,
        budget,
        persisted?.cursor ?? null,
      );

      result = {
        processedEvents: scan.processedEvents,
        scannedThrough: scan.scannedThrough,
        gapDetected: false,
        backfillChunks: 0,
        backfillComplete: scan.complete && scan.scannedThrough >= latestLedger,
      };
    }

    const committed = await this.cursorStore.get(contractId);

    return {
      contractId,
      processedEvents: result.processedEvents,
      committedLedger: committed?.lastCommittedLedger ?? null,
      gapDetected: result.gapDetected,
      backfillChunks: result.backfillChunks,
      backfillComplete: result.backfillComplete,
      pagesFetched: budget.pages,
    };
  }

  /**
   * Walk a large backlog in chunks of at most `maxLedgerSpan` ledgers and at
   * most `maxBackfillLedgersPerRun` ledgers per invocation. Each completed
   * chunk commits its end ledger, so a later run resumes from progress made
   * instead of restarting (or skipping ahead).
   */
  private async backfillGap(
    contractId: string,
    gap: LedgerGap,
    handler: ContractEventHandler,
    budget: ScanBudget,
  ): Promise<{
    processedEvents: number;
    scannedThrough: number;
    gapDetected: boolean;
    backfillChunks: number;
    backfillComplete: boolean;
  }> {
    const lastLedgerThisRun = Math.min(
      gap.toLedger,
      gap.fromLedger + this.options.maxBackfillLedgersPerRun - 1,
    );

    let processedEvents = 0;
    let scannedThrough = gap.fromLedger - 1;
    let backfillChunks = 0;

    for (
      let chunkStart = gap.fromLedger;
      chunkStart <= lastLedgerThisRun;
      chunkStart += this.options.maxLedgerSpan
    ) {
      if (budget.pages >= this.options.maxPagesPerRun) break;

      const chunkEnd = Math.min(
        chunkStart + this.options.maxLedgerSpan - 1,
        lastLedgerThisRun,
      );

      const scan = await this.scanWindow(
        contractId,
        chunkStart,
        chunkEnd,
        handler,
        budget,
        null,
      );

      processedEvents += scan.processedEvents;
      scannedThrough = scan.scannedThrough;
      backfillChunks += 1;

      if (!scan.complete) break;
    }

    const backfillComplete = scannedThrough >= gap.toLedger;

    if (!backfillComplete) {
      logger.warn('Contract event backfill paused at its bounded budget', {
        contractId,
        scannedThrough,
        targetLedger: gap.toLedger,
        backfillChunks,
        pagesFetched: budget.pages,
      });
    } else {
      logger.info('Contract event backfill completed', {
        contractId,
        fromLedger: gap.fromLedger,
        toLedger: gap.toLedger,
        backfillChunks,
      });
    }

    return {
      processedEvents,
      scannedThrough,
      gapDetected: true,
      backfillChunks,
      backfillComplete,
    };
  }

  /**
   * Scan `[fromLedger, toLedger]`, draining every page and committing after
   * each successfully handled event. The watermark for `toLedger` is committed
   * only when the whole window was actually scanned.
   */
  private async scanWindow(
    contractId: string,
    fromLedger: number,
    toLedger: number,
    handler: ContractEventHandler,
    budget: ScanBudget,
    initialCursor: string | null,
  ): Promise<ScanWindowResult> {
    if (fromLedger > toLedger) {
      return {
        processedEvents: 0,
        complete: true,
        scannedThrough: toLedger,
        pagesFetched: 0,
      };
    }

    const filters: SorobanEventFilter[] = [
      { type: 'contract', contractIds: [contractId] },
    ];

    let cursor = initialCursor;
    let scannedThrough = fromLedger - 1;
    let processedEvents = 0;
    let pagesFetched = 0;

    while (budget.pages < this.options.maxPagesPerRun) {
      const requestWeCanFallBackOn = cursor;
      let page: SorobanEventPage;

      budget.pages += 1;
      pagesFetched += 1;

      if (cursor) {
        page = await this.rpc.getEvents({
          cursor,
          filters,
          limit: this.options.pageSize,
        });
      } else {
        page = await this.rpc.getEvents({
          startLedger: fromLedger,
          endLedger: toLedger,
          filters,
          limit: this.options.pageSize,
        });
      }

      const events = page.events ?? [];
      let lastToken: string | null = null;
      let crossedWindowEnd = false;

      for (const event of events) {
        const ledger = eventLedger(event);
        if (ledger === null) continue;

        if (ledger < fromLedger) continue;
        if (ledger > toLedger) {
          // The RPC may return events beyond `endLedger` (or we are paging
          // with a cursor). They belong to the next window, so stop here; the
          // watermark must not move past `toLedger`.
          crossedWindowEnd = true;
          break;
        }

        try {
          await handler(event);
        } catch (error) {
          throw new ContractEventProcessingError(contractId, event, error);
        }

        processedEvents += 1;
        lastToken = eventCursor(event);
        scannedThrough = Math.max(scannedThrough, ledger);

        // Commit event-by-event. If the next event fails (or the process
        // crashes), this event is not replayed from an earlier position.
        await this.cursorStore.commit({
          contractId,
          cursor: lastToken,
          lastCommittedLedger: ledger,
        });
      }

      const pageWasFull = events.length >= this.options.pageSize;
      const nextCursor = lastToken ?? (typeof page.cursor === 'string' ? page.cursor : null);

      if (!pageWasFull || crossedWindowEnd || !nextCursor) {
        await this.commitWatermark(contractId, toLedger);
        return {
          processedEvents,
          complete: true,
          scannedThrough: Math.max(scannedThrough, toLedger),
          pagesFetched,
        };
      }

      if (nextCursor === requestWeCanFallBackOn) {
        // Defensive: a cursor that does not advance would loop forever.
        await this.commitWatermark(contractId, toLedger);
        return {
          processedEvents,
          complete: true,
          scannedThrough: Math.max(scannedThrough, toLedger),
          pagesFetched,
        };
      }

      cursor = nextCursor;
    }

    // Page budget exhausted with possibly more events in this window. Leave
    // the cursor at the last handled event; do not advance to `toLedger`.
    logger.warn('Contract event scan paused at its bounded page budget', {
      contractId,
      fromLedger,
      toLedger,
      scannedThrough,
      pagesFetched,
    });

    return {
      processedEvents,
      complete: false,
      scannedThrough,
      pagesFetched,
    };
  }

  /**
   * Move the watermark to the end of a fully scanned window. The paging token
   * is cleared because the next run should start at `toLedger + 1`; keeping a
   * token anchored to an earlier event could replay it and, worse, make a
   * stale cursor look current.
   */
  private async commitWatermark(contractId: string, toLedger: number): Promise<void> {
    if (toLedger < 0) return;

    const current = await this.cursorStore.get(contractId);
    if (current && current.lastCommittedLedger > toLedger) return;

    // Same ledger but still anchored to an event cursor: the window is now
    // fully scanned, so clear the token. Leaving it would make the next run
    // replay from an event inside a ledger it has already finished.
    if (
      current &&
      current.lastCommittedLedger === toLedger &&
      current.cursor === null
    ) {
      return;
    }

    await this.cursorStore.commit({
      contractId,
      cursor: null,
      lastCommittedLedger: toLedger,
    });
  }
}
