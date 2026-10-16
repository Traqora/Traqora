# Flight Sync On-Call Runbook

## Purpose

This runbook describes what to do when flight sync falls behind: how to detect the lag, how to re-trigger sync jobs, and how to verify that the backlog clears.

Flight sync in Traqora is performed by background jobs in `packages/backend/src/jobs/`:

- **`flightStatusPollingJob.ts`** — polls flight status for every flight with at least one active alert (default cron: `*/5 * * * *`, configurable via `FLIGHT_STATUS_POLLING_CRON`) and notifies subscribers of changes.
- **`cacheWarmingJob.ts`** — pre-populates the Redis cache with popular flight search results so search responses stay fast.
- **`priceMonitor.ts`** — tracks price changes for monitored flights.

When these jobs fall behind or stall, users see stale flight status, stale prices, and slow search results.

## 1. Detect

### Symptoms

- Users report stale flight status or outdated prices.
- Search latency alerts fire (`cacheWarmingJob` not keeping Redis warm).
- No `flightStatusPollingJob: pass complete` log entries within the last cron interval.

### Diagnosis steps

1. **Check job logs.** Each pass logs a completion line:
   ```bash
   # Docker Compose deployment
   docker-compose logs --since 30m backend | grep -E "flightStatusPollingJob|cacheWarmingJob|priceMonitor"
   ```
   A healthy job logs `pass complete` (or an equivalent summary) once per cron interval. Missing entries mean the job is stalled or crashed.

2. **Check for repeated errors.**
   ```bash
   docker-compose logs --since 60m backend | grep -E "fetchStatuses failed|unhandled error" | tail -20
   ```
   Common causes: database connectivity (`failed to load actively-followed flights`), external provider timeouts (`fetchStatuses failed`), Redis unavailability (cache warming failures).

3. **Check monitoring dashboards.** Open Grafana (`monitoring/grafana/`) and review:
   - Backend job error rate and duration panels.
   - Redis cache hit ratio (a sudden drop suggests stale/missing warm cache).
   - PostgreSQL connection health.

4. **Measure backlog size.** Count flights that should have been polled recently:
   ```bash
   # Inside the backend container / mongo shell
   db.flightstatusalerts.countDocuments({ isActive: true })
   ```
   Compare this against the `polled` counts in recent log lines — if `polled` is consistently lower than active alerts, sync is behind.

## 2. Re-trigger sync jobs

### Option A: Restart the backend (safest)

Restarting re-initializes all cron jobs:

```bash
docker-compose restart backend
```

After startup, confirm the polling job registers and begins running:

```bash
docker-compose logs -f backend | grep flightStatusPollingJob
```

### Option B: Tighten the cron interval temporarily

Set a more frequent polling schedule via environment variable, then restart:

```bash
# .env or packages/backend/.env
FLIGHT_STATUS_POLLING_CRON="* * * * *"   # every minute (catch-up mode)
```

```bash
docker-compose up -d backend
```

> Revert to the default (`*/5 * * * *`) once the backlog clears to avoid hammering providers.

### Option C: Invoke the job manually

Each job exposes a `runNow()` method for immediate execution. From a Node REPL inside the backend container:

```bash
docker-compose exec backend node -e "
const { initFlightStatusPollingCron } = require('./dist/jobs/flightStatusPollingJob');
const job = initFlightStatusPollingCron();
job.runNow().then((r) => { console.log(r); process.exit(0); });
"
```

Expected output: `{ polled: <n>, changed: <n>, notified: <n> }`.

### If the root cause is an unhealthy dependency

If diagnosis showed DB/Redis/provider failure, fix that first (see [RUNBOOKS.md](./RUNBOOKS.md) — Database Down, Redis/Cache Failure, External API Outage) before re-triggering; otherwise the backlog will not drain.

## 3. Verify the backlog clears

1. Watch consecutive passes until `polled` equals the number of active alerts:
   ```bash
   docker-compose logs -f backend | grep "pass complete"
   ```
2. Confirm no new `fetchStatuses failed` errors appear over two full cron intervals.
3. Spot-check freshness from the API:
   ```bash
   curl -s "http://localhost:3001/api/v1/flights/search?origin=JFK&destination=LAX&date=$(date -d '+3 days' +%F)" | jq '.data[0] | {id, statusUpdatedAt}'
   ```
   The returned timestamps should be within the last polling interval.
4. Restore the standard cron expression if you changed it, then restart the backend one final time.

## 4. Escalation

Escalate if any of the following are true after two catch-up cycles:

- Backlog still not draining.
- External provider outage confirmed with no ETA (coordinate on the provider status page).
- Data integrity concerns (status changes recorded incorrectly).

Page the maintainers via the process in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

## 5. Prevention

- Keep `FLIGHT_STATUS_POLLING_CRON` at its default unless doing planned catch-up work.
- Monitor job completion logs and alert on their absence (heartbeat alerting).
- Track provider rate limits; back off before hitting them rather than after.
- Review [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) quarterly and update this runbook with new failure modes.
