# Issue Fixes Documentation

## #715 Issue Template Triage

**Area**: docs / client

### Problem
The repository had no GitHub issue templates (no `.github/ISSUE_TEMPLATE/` directory), so contributors submitted issues in inconsistent free-text formats (see `fix.md`, `issue.md`). There was also no programmatic way to parse or classify issue headings into structured metadata (area, labels), meaning triage was entirely manual and error-prone.

### Solution
Three narrowly scoped deliverables — no unrelated changes made:

**1. GitHub issue templates** (`.github/ISSUE_TEMPLATE/`)
- `bug_report.yml` — structured bug report with area dropdown, severity, reproduction steps
- `feature_request.yml` — feature proposal with area, acceptance criteria, out-of-scope section
- `config.yml` — disables blank issues; routes ad-hoc questions to GitHub Discussions

Both templates automatically apply the `triage` label plus an area-specific label (e.g. `client`, `backend`, `contracts`) on submission.

**2. Triage utility module** (`packages/client/lib/issue-triage.ts`)
- `parseIssueMarkdown(raw)` — parses the `#<number> <title>` heading format used in `fix.md`/`issue.md` into a typed `TriagedIssue`; throws `IssueTriageError` on malformed input
- `classifyArea(title)` — keyword-based area classification; never throws
- `formatTriageSummary(issue)` — serialises a `TriagedIssue` to a single-line changelog string

**3. Standalone validation script** (`scripts/validate-issue-triage.js`) — runnable with plain `node` when the full test stack is unavailable.

### Contract
| Function | Input | Output | Error |
|---|---|---|---|
| `parseIssueMarkdown` | raw markdown string | `TriagedIssue` | `IssueTriageError` if blank or heading malformed |
| `classifyArea` | title string | `IssueArea` | never throws; returns `"unknown"` |
| `formatTriageSummary` | `TriagedIssue` | single-line string | never throws |

### Testing
- Added Jest unit tests in `packages/client/tests/unit/issue-triage.test.ts`:
  - Happy path: parses `fix.md` headings, `issue.md` headings, leading-blank-line input, single-line input
  - Failure modes: empty string, whitespace-only, missing `#number`, number-only (no title), non-numeric number
  - Round-trip: `parseIssueMarkdown` → `formatTriageSummary` deterministic output
- Added `scripts/validate-issue-triage.js` (32 assertions, runs with bare `node`): `node scripts/validate-issue-triage.js`

## #732 Stablecoin XLM Fee Display

**Area**: Client payments fees

### Problem
The payment page displayed a hardcoded gas fee of `~0.001 ETH` regardless of the selected cryptocurrency. When XLM was selected, the fee should display in XLM units, not ETH.

### Solution
- Added `getGasFee(currency)`, `getPlatformFee(currency, amount)`, `formatGasFee(currency)` utility functions to `packages/client/lib/currency.ts`
- Updated `packages/client/app/payment/[id]/page.tsx` to use these functions for dynamic fee display
- XLM gas fee: `0.00001 XLM`
- USDC/USDT gas fee: `0.0001 USDC/USDT`
- ETH gas fee: `0.001 ETH`
- Platform fee: `0` for stablecoins, `1%` for other currencies

### Testing
- Added tests in `packages/client/tests/currency.test.ts` for `getGasFee`, `getPlatformFee`, `formatGasFee`, `isStablecoin`

## #737 Request-id Correlation

**Area**: Backend logging

### Problem
The `requestLogger` middleware generated a `correlationId` but did not properly propagate the `requestId` through `asyncLocalStorage`, making it difficult to correlate log entries with specific requests.

### Solution
- Updated `packages/backend/src/middleware/requestLogger.ts` to store both `requestId` and `correlationId` in `asyncLocalStorage`
- Updated `packages/backend/src/utils/logger.ts` to read `requestId` from `asyncLocalStorage` in addition to `correlationId`
- Updated `packages/backend/src/services/logger.ts` `enrich` method to include `requestId` from `asyncLocalStorage`

### Testing
- Added tests in `packages/backend/tests/middleware/requestLogger.test.ts` verifying:
  - `requestId` is set on `res.locals` matching `correlationId`
  - `x-correlation-id` header is respected
  - `requestId` propagates through `asyncLocalStorage`
  - Unique IDs generated per request

## #740 Sentry Release Health

**Area**: Backend sentry

### Problem
Sentry initialization did not include a `release` identifier, making it difficult to track which deployment caused errors. No health check existed for the Sentry configuration.

### Solution
- Added `getSentryRelease()` function to `packages/backend/src/services/errorTracking.ts` that reads version from `package.json`
- Added `checkSentryReleaseHealth(runtimeConfig)` function for health validation
- Updated `initializeErrorTracking` to pass `release` to `Sentry.init()`
- Release format: `traqora-backend@<version>`

### Testing
- Added tests in `packages/backend/tests/services/errorTracking.test.ts` verifying:
  - `checkSentryReleaseHealth` returns unhealthy when no DSN configured
  - `checkSentryReleaseHealth` returns healthy with release when configured
  - `getSentryRelease` returns proper release string
  - `initializeErrorTracking` and `captureException` work correctly

## #741 Redis Persistence Check

**Area**: Backend redis

### Problem
No mechanism existed to verify whether Redis persistence (AOF/RDB) was properly configured, risking data loss on restart.

### Solution
- Added `isRedisPersistenceEnabled(redisUrl)` function to `packages/backend/src/services/cacheService.ts`
- Added `checkRedisPersistence(redisUrl, clusterNodes)` function returning detailed persistence status per node
- Added `verifyRedisPersistence(redisUrl, clusterNodes)` function that logs warnings/info and returns boolean
- Persistence is detected by checking if the Redis URL path contains `aof`, `rdb`, or `persistence`

### Testing
- Added tests in `packages/backend/tests/services/cacheService.test.ts` verifying:
  - `isRedisPersistenceEnabled` correctly identifies persistence URLs
  - `checkRedisPersistence` returns details for single-node and cluster configs
  - `verifyRedisPersistence` returns correct boolean and logs appropriately
