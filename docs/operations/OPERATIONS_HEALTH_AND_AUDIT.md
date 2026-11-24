# Operations Health and Audit Filters

## Purpose

This document describes the v1 operator surfaces for health status and audit event filtering. Both surfaces expose states and counters only. No keys, signing material, upstream endpoints or raw error text are returned.

## Health snapshot

- Endpoint: `GET /health/operations`
- Authorization: admin API key or admin bearer token
- Client page: `/admin/operations-health`
- Cache: snapshots are reused for 15 seconds, then recomputed on the next request

### Supplier health

- `lastSuccessfulRequest`: timestamp of the most recent successful supplier request, or null when none has been recorded.
- `currentHealth`: `healthy`, `degraded`, `unhealthy` or `unavailable`. A value of `unavailable` means there is no recorded telemetry.
- `recentFailures`: number of failed requests inside the bounded 20 request window.
- `recentRequestWindow`: the window size, always 20 in v1.

Outcomes are recorded by the failover flight provider for both single provider search and partial search. The counter never grows beyond the window.

### Payment health

- `currentHealth` is derived from the payment circuit state.
- `circuitState` is `CLOSED`, `OPEN`, `HALF_OPEN` or `unavailable`.
- `CLOSED` maps to healthy, `HALF_OPEN` to degraded, `OPEN` to unhealthy.

No provider credentials or keys are included in the response.

### Contract health

- `available` is false when the reconciliation store cannot be read.
- `lastReconciledAt` is the timestamp of the most recent reconciliation attempt, or null.
- `needsReviewCount` counts failed attempts from the last 24 hours.
- Health is unavailable when the store cannot be read, degraded when any event needs review, and healthy otherwise.

## Audit log filters

- Endpoint: `GET /api/v1/audit-logs`
- Authorization: admin API key or admin bearer token with the admin role
- Client page: `/admin/audit-logs`

Supported filters: `action`, `actorType`, `userId`, `adminId`, `resource`, `resourceId`, `from`, `to`, `page` and `limit`. Time filters require ISO 8601 timestamps. Reference filters are exact matches, so an operator should use the full booking reference.

Interactive pages are capped at 500 entries per request and default to 50. A malformed timestamp or a limit above the cap is rejected instead of being silently ignored.

The client reaches these endpoints through `apiClient.getAuditLogs` and `apiClient.exportAuditLogs`. Filtering happens on the server, so the page never downloads the full log before applying a time or reference filter.

## Export limits

- Endpoint: `GET /api/v1/audit-logs/export`
- The export uses a separate schema with a 10,000 entry cap and defaults to that cap.
- Interactive page limits do not apply to exports. A request above 10,000 entries is rejected.
- Exports are limited to page 1 so the cap is a single bounded page rather than a paginated crawl.

## Privacy and accessibility

- Audit responses include actor identifiers, resource references and IP addresses used for security review. They do not include secrets from request bodies.
- Denied queries return an explicit error state in the client, with a retry action.
- Filter inputs have visible labels, and the result table has a caption and column headers.
- Health states are text, not colour alone. Missing timestamps are shown as `No recorded value`.

## Related documents

- `docs/operations/BOOKING_FAILURE_RUNBOOKS.md`
- `docs/operations/INCIDENT_RESPONSE.md`
