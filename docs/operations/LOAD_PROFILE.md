# V1 Load Profile: Flight Search

This document defines the bounded v1 load profile used by the automated flight
search load check in `packages/backend/tests/flight-search-load.test.ts` (#1196).
Keeping the profile explicit prevents the check from silently drifting into an
unbounded benchmark.

## Profile

| Parameter | Value | Rationale |
| --- | --- | --- |
| Concurrent searches | 20 | Exercises contention without overwhelming a shared CI runner |
| Rounds | 3 | One cold round plus two warm cache rounds |
| Page size | 10 | Matches the documented default search page |
| Latency guard rail | p95 below 500 ms | Loose enough to avoid flaky failures on CI |
| Supplier access | None | In-memory repository, cache and registry stub only |

The check asserts structural invariants rather than tight timings: peak
concurrency stays within the profile, the provider is called exactly once per
concurrent request on the cold round, warm rounds are absorbed by the cache,
and both instrumented service operations (`provider_search` and
`registry_state_lookup`) are recorded. Wall-clock latency is only a guard rail.

## Running the check

```bash
cd packages/backend
npx jest --config jest.config.cjs tests/flight-search-load.test.ts --runInBand
```

The check runs as part of the normal backend test suite. It requires no running
server, no Redis and no supplier credentials.

## Scope and limits

This is a resource-and-latency smoke check for the agreed v1 profile, not a
capacity-planning benchmark. It does not exercise Postgres or a live supplier.
Those remain pre-release operational checks recorded in the deployment runbook.
