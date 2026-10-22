/**
 * Structured JSON logging contract (issue #738).
 *
 * This module is the single source of truth for how Traqora turns a log call
 * into a line of output. Both loggers (`utils/logger` and `services/logger`)
 * delegate to the helpers here so that the emitted envelope, the redaction
 * rules and the failure behaviour cannot drift apart.
 *
 * ## Envelope contract
 *
 * Every emitted record is a single JSON object with these stable top-level keys:
 *
 * | key           | type   | notes                                              |
 * | ------------- | ------ | -------------------------------------------------- |
 * | `timestamp`   | string | ISO-8601 UTC, emitted once by the format chain      |
 * | `level`       | string | `debug` \| `info` \| `warn` \| `error`               |
 * | `message`     | string | human readable, free to change between releases     |
 * | `event`       | string | machine readable event name, safe to filter/alert on |
 * | `service`     | string | `traqora-api`                                       |
 * | `environment` | string | `development` \| `staging` \| `production` \| `test`  |
 *
 * Anything else a caller passes is a structured field. Correlation fields
 * (`correlationId`, `requestId`) are injected from `AsyncLocalStorage` when the
 * caller does not supply them.
 *
 * Consumers must alert on `event`, never on `message`.
 *
 * ## Guarantees
 *
 * 1. **Redaction is recursive and total.** Any key matching
 *    {@link SENSITIVE_LOG_KEY} is replaced with {@link REDACTED} at any depth,
 *    in objects and arrays alike.
 * 2. **Errors are serialised, not dropped.** `Error` instances (and the values
 *    in `error` / `err` fields) become `{ name, message, stack, cause }`
 *    objects. Plain `JSON.stringify` would emit `{}` because `message` and
 *    `stack` are non-enumerable.
 * 3. **Logging never throws.** Circular references, `BigInt` values, `Map`/
 *    `Set` collections, symbols, functions and getters that throw are all
 *    handled. A logger that throws takes the request handler down with it, so
 *    {@link redactValue} and {@link safeStringify} are total functions.
 *
 * ## Output format
 *
 * `LOG_FORMAT` selects the renderer:
 *   - `json`   — one JSON object per line (default outside development)
 *   - `pretty` — `colorize` + `printf`, human readable (default in development)
 *
 * Set `LOG_FORMAT=json` in staging/CI so log pipelines always see the envelope
 * described above, regardless of `NODE_ENV`.
 */

/** Log levels, ordered from most to least verbose. */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Supported renderers for {@link resolveLogFormat}. */
export const LOG_FORMATS = ['json', 'pretty'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

/** Value substituted for any redacted field. */
export const REDACTED = '[REDACTED]';

/** Value substituted when a reference cycle is detected. */
export const CIRCULAR = '[Circular]';

/** Value substituted when the recursion budget is exhausted. */
export const MAX_DEPTH_REACHED = '[MaxDepth]';

/**
 * Keys whose values must never reach a log sink. Matched case-insensitively
 * as a substring so `Authorization`, `x-api-key` and `refreshToken` all match.
 */
export const SENSITIVE_LOG_KEY =
  /authorization|cookie|set-cookie|password|token|secret|api[_-]?key|jwt|refresh_token/i;

/**
 * Substring list form of {@link SENSITIVE_LOG_KEY}, kept for the callers that
 * already work with a list (request logging, legacy middleware).
 */
export const SENSITIVE_LOG_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'api-key',
  'jwt',
  'refresh_token',
];

/** Envelope keys that are part of the documented contract. */
export const LOG_ENVELOPE_KEYS = [
  'timestamp',
  'level',
  'message',
  'event',
  'service',
  'environment',
] as const;

/** Maximum nesting depth walked before a value is replaced by a marker. */
const MAX_DEPTH = 8;

/** Longest event name derived from a message. */
const MAX_EVENT_LENGTH = 64;

/**
 * Derive a stable `event` name from a human readable message.
 *
 * `"HTTP request completed"` becomes `http_request_completed`. Callers that
 * already pass `meta.event` keep their value; this is only the fallback so
 * that every record carries a machine-filterable event.
 */
export function deriveEventName(message: unknown): string {
  if (typeof message !== 'string' || message.length === 0) return 'log';
  const slug = message
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_EVENT_LENGTH)
    .replace(/_+$/g, '');
  return slug.length > 0 ? slug : 'log';
}

/** True when `key` names a field that must be redacted. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_LOG_KEY.test(key);
}

/** Serialised form of an `Error`, safe to place in a JSON record. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string | null;
  code?: string | number;
  cause?: SerializedError | string | null;
  [key: string]: unknown;
}

const isErrorLike = (value: unknown): value is Error =>
  value instanceof Error ||
  (typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string' &&
    typeof (value as { name?: unknown }).name === 'string');

/**
 * Convert an `Error` (or error-like object) into a plain serialisable object,
 * following the `cause` chain. Returns `null` for non-error input so callers
 * can pass values through unchanged.
 */
export function serializeError(value: unknown, depth = 0): SerializedError | null {
  if (!isErrorLike(value)) return null;
  if (depth >= MAX_DEPTH) return { name: 'MaxDepthError', message: 'error cause chain too deep' };

  const source = value as unknown as Record<string, unknown>;
  const serialized: SerializedError = {
    name: String(source.name ?? 'Error'),
    message: String(source.message ?? ''),
  };

  if (typeof source.stack === 'string') serialized.stack = source.stack;
  if (source.code !== undefined && (typeof source.code === 'string' || typeof source.code === 'number')) {
    serialized.code = source.code;
  }

  if (source.cause !== undefined && source.cause !== null) {
    const cause = serializeError(source.cause, depth + 1);
    serialized.cause = cause ?? String(source.cause);
  }

  // Preserve own enumerable extras (e.g. `err.code`, `err.statusCode`) minus the
  // already-handled and non-enumerable-by-default fields.
  for (const [key, nested] of Object.entries(source)) {
    if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause' || key === 'code') continue;
    if (isSensitiveKey(key)) {
      serialized[key] = REDACTED;
    } else {
      serialized[key] = redactValue(nested, new WeakSet<object>(), depth + 1);
    }
  }

  return serialized;
}

/**
 * Recursively redact secrets and coerce values into JSON-safe equivalents.
 *
 * Total function: never throws, never recurses forever.
 */
export function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet(), depth = 0): unknown {
  if (value === null || value === undefined) return value;

  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') return Number.isFinite(value as number) ? value : String(value);
  if (type === 'bigint') return `${(value as bigint).toString()}n`;
  if (type === 'symbol' || type === 'function') return `[${type}]`;

  if (value instanceof Date) return value.toISOString();
  if (isErrorLike(value)) return serializeError(value, depth);

  const object = value as object;
  if (seen.has(object)) return CIRCULAR;

  if (depth >= MAX_DEPTH) return MAX_DEPTH_REACHED;

  seen.add(object);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => redactValue(entry, seen, depth + 1));
    }
    if (value instanceof Map) {
      return redactValue(Object.fromEntries(value), seen, depth + 1);
    }
    if (value instanceof Set) {
      return redactValue([...value], seen, depth + 1);
    }

    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = REDACTED;
        continue;
      }
      let nested: unknown;
      try {
        nested = (value as Record<string, unknown>)[key];
      } catch {
        // A getter that throws must not take the logger (and the request) down.
        sanitized[key] = '[Unserializable]';
        continue;
      }
      sanitized[key] = redactValue(nested, seen, depth + 1);
    }
    return sanitized;
  } finally {
    seen.delete(object);
  }
}

/**
 * Redact a whole log record while preserving its symbol-keyed properties.
 *
 * winston reads `Symbol.for('level')` and `Symbol.for('message')` off the record
 * to decide which transports accept it and what to render. A redaction format
 * that returns a freshly built object drops those symbols, every transport then
 * filters the record out, and the backend emits no logs at all — which is
 * exactly what happened here (issue #738). Copying the symbols across keeps the
 * record intact.
 */
export function redactLogRecord<T extends object>(record: T): T {
  const redacted = redactValue(record) as Record<string | symbol, unknown>;
  for (const symbol of Object.getOwnPropertySymbols(record)) {
    redacted[symbol] = (record as unknown as Record<symbol, unknown>)[symbol];
  }
  return redacted as unknown as T;
}

/**
 * `JSON.stringify` that cannot fail. Falls back to a coarse string
 * representation if the value resists every attempt.
 */
export function safeStringify(value: unknown, space?: number): string {
  const attempts: Array<() => string> = [
    () => JSON.stringify(value, undefined, space) as string,
    () => JSON.stringify(redactValue(value), undefined, space),
    () => JSON.stringify({ serializationError: 'unserializable log payload' }),
  ];
  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result !== undefined) return result;
    } catch {
      // try the next strategy
    }
  }
  return '{"serializationError":"unserializable log payload"}';
}

/**
 * Resolve the renderer from the environment.
 *
 * `LOG_FORMAT` always wins so staging and CI can request JSON explicitly.
 * Without it, development defaults to `pretty` and every other environment
 * defaults to `json`.
 */
export function resolveLogFormat(
  env: NodeJS.ProcessEnv = process.env,
  environment: string = env.NODE_ENV || 'development',
): LogFormat {
  const requested = (env.LOG_FORMAT || '').trim().toLowerCase();
  if ((LOG_FORMATS as readonly string[]).includes(requested)) return requested as LogFormat;
  return environment === 'development' ? 'pretty' : 'json';
}

/** True when the resolved format is the JSON envelope renderer. */
export function isJsonFormat(env: NodeJS.ProcessEnv = process.env, environment?: string): boolean {
  return resolveLogFormat(env, environment) === 'json';
}
