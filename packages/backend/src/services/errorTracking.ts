import * as Sentry from '@sentry/node';
import type { ErrorEvent, EventHint } from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Config } from '../config/schema';
import { logger } from '../utils/logger';
import { sanitizeObject } from '../middleware/requestLogger';

/**
 * Scrubs request data, extra context, and breadcrumbs before an event
 * leaves the process for Sentry. Reuses requestLogger's
 * sanitizeObject (the same redaction already applied to our own request
 * logs) rather than maintaining a second, divergent scrub list.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = sanitizeObject(event.request.headers) as Record<string, string>;
    }
    if (event.request.data) {
      event.request.data = sanitizeObject(event.request.data);
    }
    if (event.request.cookies) {
      event.request.cookies = undefined;
    }
    if (event.request.query_string && typeof event.request.query_string === 'object') {
      event.request.query_string = sanitizeObject(event.request.query_string) as Record<string, string>;
    }
  }

  if (event.extra) {
    event.extra = sanitizeObject(event.extra) as Record<string, unknown>;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      data: crumb.data ? (sanitizeObject(crumb.data) as Record<string, unknown>) : crumb.data,
    }));
  }

  // A user object with only an id is intentional (see captureException's
  // context param) — but scrub it anyway in case a future caller widens it
  // to include email/name without updating this scrubber.
  if (event.user) {
    event.user = sanitizeObject(event.user) as Record<string, unknown>;
  }

  return event;
}

let initialized = false;

/**
 * Initializes Sentry error tracking + performance monitoring for the backend
 * (#382). Mirrors tracing.ts's config-gated init/shutdown shape: a no-op
 * when sentryDsn isn't configured, so local/dev environments don't need a
 * Sentry project to run.
 */
export const initializeErrorTracking = (runtimeConfig: Config): boolean => {
  if (initialized) {
    return true;
  }

  if (!runtimeConfig.sentryDsn) {
    logger.info('Sentry error tracking disabled (no SENTRY_DSN configured)');
    return false;
  }

  Sentry.init({
    dsn: runtimeConfig.sentryDsn,
    environment: runtimeConfig.environment,
    tracesSampleRate: runtimeConfig.sentryTracesSampleRate,
    profilesSampleRate: runtimeConfig.sentryProfilesSampleRate,
    integrations: [nodeProfilingIntegration()],
    // sendDefaultPii defaults to false, but request headers/body/query and
    // breadcrumb data still flow through by default — scrub them the same
    // way requestLogger already does for our own logs (#382).
    beforeSend: scrubEvent,
  });

  initialized = true;
  logger.info('Sentry error tracking initialized', {
    environment: runtimeConfig.environment,
    tracesSampleRate: runtimeConfig.sentryTracesSampleRate,
  });

  return true;
};

/**
 * Captures an exception with request context, if Sentry is initialized.
 * Safe to call unconditionally — becomes a no-op when Sentry isn't
 * configured, matching how logger.error already gets called unconditionally
 * in errorHandler.ts.
 */
export const captureException = (
  error: unknown,
  context?: {
    requestId?: string;
    userId?: string;
    path?: string;
    method?: string;
    tags?: Record<string, string>;
  },
): void => {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context?.requestId) scope.setTag('requestId', context.requestId);
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.path) scope.setTag('path', context.path);
    if (context?.method) scope.setTag('method', context.method);
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => scope.setTag(key, value));
    }
    Sentry.captureException(error);
  });
};

export const isErrorTrackingInitialized = (): boolean => initialized;

export const shutdownErrorTracking = async (): Promise<void> => {
  if (!initialized) {
    return;
  }

  try {
    await Sentry.close(2000);
    logger.info('Sentry error tracking terminated');
  } catch (error) {
    logger.error('Error terminating Sentry error tracking', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    initialized = false;
  }
};
