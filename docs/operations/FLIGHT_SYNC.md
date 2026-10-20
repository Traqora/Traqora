# Flight Synchronization & Out-of-Order Provider Snapshot Protection

## Overview

The Traqora flight registry backend enforces strict synchronization guards to prevent delayed or out-of-order provider snapshots from overwriting newer flight records. When multiple external providers or delayed network sync responses deliver flight state updates concurrently, race conditions can cause stale data to replace fresh data.

## Rejection Rules & Conflict Resolution

Each flight record (`FlightRecord`) tracks two distinct synchronization metadata fields:
1. `source_timestamp`: The ledger timestamp when the provider snapshot or update was applied.
2. `revision`: A monotonically increasing integer sequence number incremented on every flight update.

### Invariant Checks
When an airline admin or automated sync daemon submits an update via `add_flight`, `add_flight_with_details`, `update_flight_status`, `update_flight_schedule`, or `update_flight_seats`:
- **Timestamp Check:** The incoming update timestamp must be greater than or equal to the existing record's `source_timestamp` (`source_timestamp >= existing.source_timestamp`).
- **Revision Check:** The incoming update revision must be strictly greater than the existing record's `revision` (`revision > existing.revision`).

If either check fails, the contract execution panics with:
`Out-of-order provider snapshot: timestamp older than existing record` or `Out-of-order provider snapshot: revision not newer than existing record`.

## Failure Cases & Expected Behavior

### 1. Delayed Network Response (Out-of-Order Delivery)
- **Scenario:** Flight update A is processed at ledger timestamp 10000. Due to network congestion or queue retries, an older update B (dispatched when ledger timestamp was 5000) arrives at the registry.
- **Expected Behavior:** The registry rejects update B and preserves the state established by update A.
- **Error Propagation:** Transaction reverts with an out-of-order assertion failure.

### 2. Concurrent Provider Divergence
- **Scenario:** Two different airline provider nodes submit conflicting updates for the same flight ID.
- **Expected Behavior:** The first update processed establishes the higher timestamp/revision baseline. Subsequent attempts with older timestamps or stale revisions are rejected automatically.

## Operational Guidance & Monitoring

- **Log Monitoring:** Monitor contract execution errors for `Out-of-order provider snapshot` rejections. High frequencies indicate network routing issues or excessive queue retry delays.
- **Retry Policy:** Off-chain sync daemons and webhook receivers should catch out-of-order rejection errors, inspect the latest ledger state, and drop stale sync payloads rather than entering endless retry loops.
- **Timestamp Synchronization:** Ensure all validator nodes and data ingestion pipelines maintain accurate ledger time references to prevent false rejections caused by clock drift.
