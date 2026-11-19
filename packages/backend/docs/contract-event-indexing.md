# Soroban Contract Event Indexing & Booking Reconciliation

Operator/contributor reference for the contract event indexer (`#931`, `#932`)
and the booking reconciliation job (`#934`).

## 1. Durable positions per contract (`#931`)

Every contract indexed by `ContractMonitor` has its own row in
`contract_event_cursors`:

| Column | Meaning |
| --- | --- |
| `contract_id` | Primary key; the Soroban contract ID. |
| `cursor` | Last committed Soroban RPC paging token, or `NULL` when the last scan ended on a ledger boundary. |
| `last_committed_ledger` | Highest ledger whose events were all handled successfully. |
| `updated_at` | Last commit time. |

`ContractEventIndexer.indexContract()` loads only that contract's row and
commits after every successfully handled event. Consequences:

- A restart resumes each contract from its own position; contracts never share
  a cursor.
- A contract that fails cannot hold back, or advance, any other contract. The
  monitor logs the failure and continues with the remaining contracts.
- The cursor is committed **after** the event archive write and every listener
  handler has completed. If either throws, the failing event's token is not
  persisted and the event is retried on the next pass.
- Events replayed because a handler failed after side effects are deduplicated
  in `contract_event_logs` by `(contract_id, paging_token)`. Handlers should
  still be written to be idempotent.

The very first run for a contract starts `CONTRACT_INDEXER_INITIAL_LOOKBACK_LEDGERS`
(default `100`) behind the latest ledger. After that, resume is always from the
persisted ledger/cursor, not from a fresh lookback window.

## 2. Gap detection and bounded backfill (`#932`)

At the start of each pass the indexer compares the persisted
`last_committed_ledger` with the latest ledger visible from RPC. If the backlog
is greater than `CONTRACT_INDEXER_GAP_THRESHOLD_LEDGERS` (default `1000`), the
pass switches to backfill mode:

1. The unprocessed range is walked in chunks of at most
   `CONTRACT_INDEXER_MAX_LEDGER_SPAN` ledgers (default `500`).
2. Each completed chunk commits its end ledger, even when the chunk contains no
   matching events.
3. A single pass covers at most
   `CONTRACT_INDEXER_MAX_BACKFILL_LEDGERS_PER_RUN` ledgers (default `10000`) and
   at most `CONTRACT_INDEXER_MAX_PAGES_PER_RUN` RPC pages (default `100`).
4. If a budget is reached, the pass stops with `backfillComplete: false` and
   the next run resumes from the committed chunk boundary. It never jumps to
   `latestLedger` and silently skips the middle of the range.

Normal (non-gap) passes also drain every page with the RPC paging token until
the snapshot ledger is reached. A full page is never treated as "caught up";
if the page budget is exhausted, the watermark stays at the last handled event.

### Failure cases

| Case | Behaviour |
| --- | --- |
| Handler throws | Cursor remains after the previous successful event; the failing event is retried. `ContractEventProcessingError` is logged by the monitor. |
| Archive write throws | Same as a handler failure: the event is not committed and is retried. |
| RPC page request fails | The pass aborts for that contract; committed progress is preserved and used next time. |
| Backfill budget reached | Safe partial progress is committed; a warning is logged (`Contract event backfill paused at its bounded budget`). |
| Cursor is missing/invalid | The next pass starts at `last_committed_ledger + 1` instead of using the token. |
| Persisted position is ahead of RPC latest | No events are fetched and the position is left untouched. |

### Configuration

All are optional environment variables read by
`resolveContractEventIndexerOptions()`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONTRACT_INDEXER_PAGE_SIZE` | `100` | Events requested per RPC call. |
| `CONTRACT_INDEXER_MAX_LEDGER_SPAN` | `500` | Ledgers per bounded backfill chunk. |
| `CONTRACT_INDEXER_GAP_THRESHOLD_LEDGERS` | `1000` | Backlog that triggers backfill mode. |
| `CONTRACT_INDEXER_INITIAL_LOOKBACK_LEDGERS` | `100` | First-run lookback. |
| `CONTRACT_INDEXER_MAX_PAGES_PER_RUN` | `100` | RPC page budget per contract per pass. |
| `CONTRACT_INDEXER_MAX_BACKFILL_LEDGERS_PER_RUN` | `10000` | Ledger budget for one backfill pass. |

## 3. Event archive

`contract_event_logs` is written before listeners run and is the authoritative
on-chain side of reconciliation. Rows include the contract, event type, ledger,
paging token, transaction hash, decoded booking id (when present), and the
decoded payload. `GET /api/contract-events` and `/replay` read this table.

## 4. Booking reconciliation job (`#934`)

`ContractBookingReconciliationJob` runs hourly by default
(`CONTRACT_RECONCILIATION_CRON`, default `0 * * * *`). Each run:

1. Loads the most recent `CONTRACT_RECONCILIATION_LIMIT` (default `500`) booking
   events with a decoded booking id, for the booking and refund contracts.
2. Keeps the highest-ledger event per Soroban booking id.
3. Maps the event to the expected backend status:

   | Event | Expected booking status |
   | --- | --- |
   | `created` | `onchain_submitted` |
   | `paid` | `paid` |
   | `released` | `confirmed` |
   | `refunded` / `RefundProcessed` | `refunded` |

4. Loads the matching backend bookings and repairs any status mismatch.
5. Appends one row per repair attempt to
   `contract_reconciliation_attempts` with the previous/expected status,
   contract/event/ledger context, outcome (`repaired` / `failed`), and error.

Failures are isolated per booking: a failed repair is recorded and the job
continues. Because the mismatch is not resolved, the next run retries it.

Bookings with no matching backend row are logged and counted as `skipped`;
they are not treated as repairable. Events without a booking id or without a
status mapping are ignored.

The underlying `reconcileContractBookingStates()` helper supports `dryRun`,
which reports mismatches without writing booking state or attempt rows. This is
useful before changing a production feed.

### Operational checks

```sql
-- Current positions, one row per contract
SELECT contract_id, cursor, last_committed_ledger, updated_at
FROM contract_event_cursors
ORDER BY contract_id;

-- Recent failed repairs (retry candidates)
SELECT booking_id, soroban_booking_id, previous_status, expected_status,
       event_ledger, error, attempted_at
FROM contract_reconciliation_attempts
WHERE outcome = 'failed'
ORDER BY attempted_at DESC
LIMIT 50;
```

Backfill activity is visible in the backend log events
`contract event ledger gap detected; starting bounded backfill` and
`contract event backfill paused at its bounded budget`.

## 5. Regression coverage

```bash
cd packages/backend
npm test -- tests/services/contractEventIndexer.test.ts
npm test -- tests/services/contractBookingReconciliation.test.ts
npm test -- tests/services/flightOfferIngestionDelay.test.ts
```

The indexer suite covers per-contract resume, retry after a listener failure,
bounded backfill, and the page-budget watermark. The reconciliation suite
covers repair, failed-repair recording, already-consistent bookings, dry-run,
and missing backend rows.
