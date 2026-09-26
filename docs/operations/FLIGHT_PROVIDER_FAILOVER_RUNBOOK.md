# Flight Provider Failover — Operator Runbook (#779)

Flight search no longer depends on a single data source. This runbook explains
how the failover chain behaves, how to tell which provider served a request,
and what to do when the chain exhausts.

## How the chain works

`createDefaultFlightSearchService()` (in
`packages/backend/src/services/flightSearchService.ts`) builds an ordered
provider chain behind the existing `OffchainFlightDataProvider` seam:

1. **`offchain-repository`** — the local flight repository (primary; unchanged
   behaviour when it is healthy).
2. **`amadeus`** — the Amadeus flight-offers API (secondary; joined only when
   `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` are configured).

Providers are tried strictly in order for each search. The first success wins;
later providers are not invoked for that call. No retries happen *within* a
provider — each provider owns its own retry policy; the chain only switches
sources.

## What you will see in logs

- Normal single-provider success → `Flight provider succeeded` (debug).
- Failover happened → `Flight provider failover succeeded (#779)` (warn) with
  `providerUsed` and `failedOverFrom` — **alert on a rising rate of these**;
  sustained failover means the repository is degraded even though users see
  results.
- Chain exhausted → the search fails with
  `All flight providers failed (<providers tried>): <last error>`
  (`FlightProviderUnavailableError`) → HTTP 500.

## Environment variables

| Variable                 | Effect                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` | when both are set, the Amadeus secondary joins the failover chain; unset keeps dev/test single-provider |
| `AMADEUS_BASE_URL`       | override Amadeus endpoint (default `https://test.api.amadeus.com`) |
| `AMADEUS_TIMEOUT_MS`     | per-request timeout (default `30000`)                        |

## Diagnosis

1. **Users report search errors (500).** Grep for
   `Flight provider failover succeeded (#779)` — if present, the primary is
   failing and some requests are surviving on Amadeus; check DB/pool health.
   If absent and errors show `All flight providers failed`, both sources are
   down — check Postgres and the Amadeus status page.
2. **Failover rate climbing.** The repository provider is unhealthy (slow
   queries, pool exhaustion). This does not page anyone by itself, but treat a
   sustained climb as a DB incident: check connection-pool metrics and slow
   query logs before users notice.
3. **Amadeus 401 in the attempt trail.** Credentials expired/rotated — update
   `AMADEUS_CLIENT_ID`/`AMADEUS_CLIENT_SECRET` and restart; until then the
   chain behaves as single-provider (failover attempts fail fast).

## Remediation

- **Primary degraded:** fix the database; no config change needed. The chain
  keeps absorbing failures in the meantime.
- **Need to take Amadeus out of the chain:** clear the credential env vars and
  restart — the factory reverts to the single-provider chain.
- **All providers down:** this is a full search outage. Escalate per
  [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

## Adding a provider (contributors)

Implement `OffchainFlightDataProvider` (one method: `search(criteria,
pagination)`), wrap it as `{ name, provider }` in
`createDefaultFlightSearchService()`, and place it in the chain according to
priority. Document the provider's mapping quirks in
`packages/backend/src/services/amadeus/amadeusFlightDataProvider.ts`-style
header comments, and add cases to
`packages/backend/tests/flightProviderFailover.test.ts`.

Regression tests: `packages/backend/tests/flightProviderFailover.test.ts`
(failover happy path, priority, all-failed error trail, Amadeus mapping and
failure modes).
