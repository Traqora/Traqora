/**
 * Regression coverage for #931 (durable per-contract cursors) and #932
 * (gap detection + bounded backfill).
 */

import {
  ContractEventIndexer,
  ContractEventProcessingError,
  SorobanEventLike,
  SorobanEventPage,
  SorobanEventRpc,
  detectLedgerGap,
} from '../../src/services/contractEventIndexer';
import { InMemoryContractCursorStore } from '../../src/services/contractEventCursorStore';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

interface FakeRpcOptions {
  latestLedger: number;
  onGetEvents: (params: Parameters<SorobanEventRpc['getEvents']>[0]) => SorobanEventPage;
}

const makeRpc = (options: FakeRpcOptions): SorobanEventRpc & {
  getEvents: jest.Mock;
  getLatestLedger: jest.Mock;
} => {
  const getEvents = jest.fn(async (params: Parameters<SorobanEventRpc['getEvents']>[0]) =>
    options.onGetEvents(params),
  );
  const getLatestLedger = jest.fn(async () => ({ sequence: options.latestLedger }));

  return {
    getLatestLedger,
    getEvents,
  } as unknown as SorobanEventRpc & {
    getEvents: jest.Mock;
    getLatestLedger: jest.Mock;
  };
};

const event = (ledger: number, token: string): SorobanEventLike => ({
  ledger,
  pagingToken: token,
  contractId: 'C1',
});

describe('detectLedgerGap', () => {
  it('returns null when the backlog is within the threshold', () => {
    expect(detectLedgerGap(100, 110, 10)).toBeNull();
  });

  it('returns the exact range when successive cursors diverge', () => {
    expect(detectLedgerGap(100, 150, 10)).toEqual({
      fromLedger: 101,
      toLedger: 150,
      ledgers: 50,
    });
  });

  it('returns null before the first committed cursor', () => {
    expect(detectLedgerGap(null, 1_000, 10)).toBeNull();
  });
});

describe('ContractEventIndexer', () => {
  it('resumes each contract from its own persisted cursor (#931)', async () => {
    const store = new InMemoryContractCursorStore();
    await store.commit({
      contractId: 'CA',
      cursor: 'cursor-a',
      lastCommittedLedger: 10,
    });
    await store.commit({
      contractId: 'CB',
      cursor: 'cursor-b',
      lastCommittedLedger: 20,
    });

    const rpc = makeRpc({
      latestLedger: 30,
      onGetEvents: (params) => {
        const contractId = params.filters[0].contractIds[0];
        if (contractId === 'CA' && params.cursor === 'cursor-a') {
          return { events: [event(12, 'a-12')] };
        }
        if (contractId === 'CB' && params.cursor === 'cursor-b') {
          return { events: [] };
        }
        throw new Error(`unexpected request: ${JSON.stringify(params)}`);
      },
    });

    const indexer = new ContractEventIndexer(rpc, store, { pageSize: 10 });

    const resultA = await indexer.indexContract('CA', jest.fn());
    const resultB = await indexer.indexContract('CB', jest.fn());

    expect(resultA.processedEvents).toBe(1);
    expect(resultA.committedLedger).toBe(30);
    expect(resultB.processedEvents).toBe(0);
    expect(resultB.committedLedger).toBe(30);

    const calls = rpc.getEvents.mock.calls.map(([params]) => params);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cursor: 'cursor-a' }),
        expect.objectContaining({ cursor: 'cursor-b' }),
      ]),
    );
    expect(calls.every((call) => call.cursor)).toBe(true);

    const cursors = store.snapshot();
    expect(cursors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contractId: 'CA', lastCommittedLedger: 30, cursor: null }),
        expect.objectContaining({ contractId: 'CB', lastCommittedLedger: 30, cursor: null }),
      ]),
    );
  });

  it('keeps the last successful event committed when a handler fails (#931)', async () => {
    const store = new InMemoryContractCursorStore();
    const rpc = makeRpc({
      latestLedger: 10,
      onGetEvents: () => ({
        events: [event(10, 'token-1'), event(10, 'token-2')],
      }),
    });

    const indexer = new ContractEventIndexer(rpc, store, {
      pageSize: 10,
      initialLookbackLedgers: 1,
    });

    const failingHandler = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('listener exploded'));

    await expect(indexer.indexContract('CA', failingHandler)).rejects.toBeInstanceOf(
      ContractEventProcessingError,
    );

    expect(await store.get('CA')).toEqual({
      contractId: 'CA',
      cursor: 'token-1',
      lastCommittedLedger: 10,
    });

    // Retry: the RPC must be asked for events *after* token-1, not from the
    // beginning, and the previously successful event must not replay.
    const retryRpc = makeRpc({
      latestLedger: 10,
      onGetEvents: (params) => {
        if (params.cursor !== 'token-1') {
          throw new Error(`expected retry from token-1, got ${JSON.stringify(params)}`);
        }
        return { events: [event(10, 'token-2')] };
      },
    });
    const retryIndexer = new ContractEventIndexer(retryRpc, store, {
      pageSize: 10,
      initialLookbackLedgers: 1,
    });
    const retryHandler = jest.fn();

    const result = await retryIndexer.indexContract('CA', retryHandler);

    expect(retryHandler).toHaveBeenCalledTimes(1);
    expect(result.processedEvents).toBe(1);
    expect(await store.get('CA')).toEqual({
      contractId: 'CA',
      cursor: null,
      lastCommittedLedger: 10,
    });
  });

  it('backfills a large gap in bounded ledger chunks (#932)', async () => {
    const store = new InMemoryContractCursorStore();
    await store.commit({
      contractId: 'CA',
      cursor: null,
      lastCommittedLedger: 1,
    });

    const rpc = makeRpc({
      latestLedger: 60,
      onGetEvents: () => ({ events: [] }),
    });

    const indexer = new ContractEventIndexer(rpc, store, {
      pageSize: 100,
      gapThresholdLedgers: 10,
      maxLedgerSpan: 20,
      maxBackfillLedgersPerRun: 40,
    });

    const first = await indexer.indexContract('CA', jest.fn());

    expect(first.gapDetected).toBe(true);
    expect(first.backfillChunks).toBe(2);
    expect(first.backfillComplete).toBe(false);
    expect(await store.get('CA')).toMatchObject({
      lastCommittedLedger: 41,
      cursor: null,
    });

    const ranges = rpc.getEvents.mock.calls.map(([params]) => ({
      startLedger: params.startLedger,
      endLedger: params.endLedger,
    }));
    expect(ranges).toEqual([
      { startLedger: 2, endLedger: 21 },
      { startLedger: 22, endLedger: 41 },
    ]);
    // Never jumps straight to latestLedger (60).
    expect(ranges.some((range) => range.startLedger === 60)).toBe(false);

    // Next run resumes at 42, not at the start, and finishes the backfill.
    rpc.getEvents.mockClear();
    rpc.getLatestLedger.mockResolvedValue({ sequence: 60 });

    const second = await indexer.indexContract('CA', jest.fn());

    expect(second.gapDetected).toBe(true);
    expect(second.backfillComplete).toBe(true);
    expect(rpc.getEvents.mock.calls[0][0]).toMatchObject({
      startLedger: 42,
      endLedger: 60,
    });
    expect(await store.get('CA')).toMatchObject({
      lastCommittedLedger: 60,
      cursor: null,
    });
  });

  it('backfills from the partial ledger when a cursor was left mid-ledger (#932)', async () => {
    const store = new InMemoryContractCursorStore();
    await store.commit({
      contractId: 'CA',
      cursor: 'token-5',
      lastCommittedLedger: 5,
    });

    const rpc = makeRpc({
      latestLedger: 100,
      onGetEvents: () => ({ events: [] }),
    });

    const indexer = new ContractEventIndexer(rpc, store, {
      pageSize: 100,
      gapThresholdLedgers: 10,
      maxLedgerSpan: 100,
      maxBackfillLedgersPerRun: 200,
    });

    const result = await indexer.indexContract('CA', jest.fn());

    expect(result.gapDetected).toBe(true);
    expect(rpc.getEvents.mock.calls[0][0]).toMatchObject({
      startLedger: 5,
      endLedger: 100,
    });
  });

  it('does not advance past a page it did not process (#932)', async () => {
    const store = new InMemoryContractCursorStore();
    const rpc = makeRpc({
      latestLedger: 20,
      onGetEvents: (params) => {
        const start = params.startLedger ?? 0;
        return { events: [event(start, `token-${start}`)] };
      },
    });

    const indexer = new ContractEventIndexer(rpc, store, {
      pageSize: 1,
      maxPagesPerRun: 1,
      initialLookbackLedgers: 20,
    });

    const result = await indexer.indexContract('CA', jest.fn());

    expect(result.processedEvents).toBe(1);
    expect(result.committedLedger).toBe(1);
    expect(result.committedLedger).not.toBe(20);
    expect(await store.get('CA')).toEqual({
      contractId: 'CA',
      cursor: 'token-1',
      lastCommittedLedger: 1,
    });
  });
});
