import type { ErrorEvent, EventHint } from '@sentry/nextjs';

/**
 * Field name fragments treated as sensitive across all three Sentry
 * runtimes (client/server/edge) — mirrors the backend's
 * requestLogger.SENSITIVE_KEYS list (not imported directly: that module is
 * server/Node-only and pulls in dependencies that don't belong in a
 * browser bundle).
 */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'jwt',
  'refresh_token',
];

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));
}

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    sanitized[key] = isSensitiveKey(key) ? '[REDACTED]' : sanitize(val);
  }
  return sanitized;
}

/**
 * Scrubs request headers/data/cookies and breadcrumb data before an event
 * leaves the browser/edge/server runtime for Sentry (#382). Shared by all
 * three sentry.*.config.ts entry points so the scrub rule only lives in
 * one place.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = sanitize(event.request.headers) as Record<string, string>;
    }
    if (event.request.data) {
      event.request.data = sanitize(event.request.data);
    }
    if (event.request.cookies) {
      event.request.cookies = undefined;
    }
  }

  if (event.extra) {
    event.extra = sanitize(event.extra) as Record<string, unknown>;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      data: crumb.data ? (sanitize(crumb.data) as Record<string, unknown>) : crumb.data,
    }));
  }

  return event;
}
