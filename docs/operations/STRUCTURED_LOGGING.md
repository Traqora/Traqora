# Structured JSON Logging

Reference for the backend log contract. Applies to **issue #738**.

## Why this exists

Before this change the two backend loggers disagreed with each other, and the
primary one was silent:

- `src/utils/logger.ts` redacted secrets by returning a **newly built object**
  from its winston format. That dropped `Symbol.for('level')` and
  `Symbol.for('message')`, so every transport filtered the record out and the
  backend emitted **no log lines at all** for the ~30 modules that import it.
- `src/services/logger.ts` used a *second*, private `AsyncLocalStorage`, so
  `correlationId` / `requestId` set by the request middleware were invisible to
  it, and it only redacted `body` / `headers` / `details`.
- Neither of them guaranteed an `event` field, so there was nothing stable to
  build alerts or dashboards on.
- Three hot paths (`middleware/rate-limit`, `services/flexible-search`,
  `services/WalletSignatureAdapter`) wrote straight to `console.*`, bypassing
  redaction, correlation and the level filter entirely.

The contract below is now implemented once, in
`packages/backend/src/utils/structuredLogger.ts`, and both loggers delegate to it.

## The envelope

Every record is a single JSON object on a single line. These keys are stable and
may be relied on:

| key           | type   | notes                                                    |
| ------------- | ------ | -------------------------------------------------------- |
| `timestamp`   | string | ISO-8601 UTC                                              |
| `level`       | string | `debug` \| `info` \| `warn` \| `error`                      |
| `message`     | string | human readable, **may change between releases**            |
| `event`       | string | machine readable, **safe to filter and alert on**           |
| `service`     | string | always `traqora-api`                                       |
| `environment` | string | `development` \| `test` \| `staging` \| `production`        |

Plus `correlationId` / `requestId` whenever the call happens inside a request
(the request middleware publishes them to an `AsyncLocalStorage`; both loggers
now share that one instance).

Everything else a caller passes is a structured field.

> **Rule for consumers:** alert and group on `event`, never on `message`.

### Where `event` comes from

1. `meta.event` if the caller supplied one — always wins.
2. Otherwise a slug derived from the message:
   `"Booking confirmed"` → `booking_confirmed`.

Pass `event` explicitly for anything you intend to alert on, so that rewording
the message cannot silently break a dashboard.

## Guarantees

1. **Redaction is total and recursive.** Any key matching
   `authorization|cookie|set-cookie|password|token|secret|api[_-]?key|jwt|refresh_token`
   (case-insensitive substring) is replaced with `[REDACTED]`, at any depth, in
   objects and arrays. Non-string keys are not matched.
2. **Errors are serialised, not dropped.** `Error` values become
   `{ name, message, stack, code?, cause? }` and the `cause` chain is followed.
   Plain `JSON.stringify` emits `{}` for an `Error`, so without this an
   `error` field in a log line is worth nothing.
3. **Logging never throws.** These are all handled and never reach a
   `throw`: circular references (`[Circular]`), nesting deeper than 8 levels
   (`[MaxDepth]`), `BigInt` (`"123…n"`), `Map` / `Set` (plain object / array),
   `Symbol` and functions (`[symbol]` / `[function]`), non-finite numbers,
   and getters that throw (`[Unserializable]`).

   This matters: a logger that throws takes the request handler down with it.

## Configuration

| variable      | values         | default                                |
| ------------- | -------------- | -------------------------------------- |
| `LOG_LEVEL`   | `debug`…`error`| `info`                                 |
| `LOG_FORMAT`  | `json`, `pretty` | `pretty` in development, `json` elsewhere |
| `LOG_AGGREGATION_URL` | URL | unset — no aggregation transport |

`LOG_FORMAT` always wins over the `NODE_ENV` default, so **set
`LOG_FORMAT=json` in staging and CI**: log shippers should not depend on
`NODE_ENV` to decide whether the output is parseable.

Both are read directly from `process.env` (same as the pre-existing
`LOG_AGGREGATION_URL` handling) rather than through the zod config schema,
because the renderer is a sink concern, not a validated application setting.

## Using it

```ts
import { logger } from '../utils/logger';          // request-path logger
import { getLogger } from '../services/logger';     // ergonomic facade

logger.info('Booking confirmed', { event: 'booking.confirmed.v2', bookingId, amountCents });

const log = getLogger({ component: 'flexible-search' });
log.error('Failed to search flights for date', { date, error });  // `error` is serialised
```

Rules of thumb:

- Do not use `console.*` in `packages/backend/src`. The linter does not catch it
  yet, but every `console.*` there is a review comment waiting to happen.
- Pass the caught exception under the key `error` so the cause chain is kept.
- Keep secrets out of `message` strings — redaction only inspects *keys*, not
  the content of a string. `"failed for token abc123"` leaks.

## Verifying locally

```bash
LOG_FORMAT=json npm run dev --workspace=packages/backend
# {"environment":"development","event":"http_request","level":"info",
#  "message":"http_request","password":"[REDACTED]","requestId":"…",
#  "service":"traqora-api","timestamp":"2026-09-27T11:00:00.000Z"}

npm test --workspace=packages/backend -- tests/utils/structuredLog
```

`tests/utils/structuredLogger.test.ts` covers the pure helpers (redaction,
error serialisation, failure modes, format resolution). `tests/utils/structuredLogEnvelope.test.ts`
attaches an in-memory transport to the real logger and asserts the emitted
envelope, so a regression that makes the logger go quiet again fails CI.
