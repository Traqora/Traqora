import * as Sentry from '@sentry/nextjs';

/**
 * Thin wrapper around @sentry/nextjs for manual capture calls from
 * components/hooks that catch an error but still want to keep it running
 * (e.g. a toast + captured exception, rather than crashing to an error
 * boundary). Automatic capture (render errors, unhandled rejections) is
 * already wired up via sentry.client.config.ts / sentry.server.config.ts /
 * sentry.edge.config.ts + instrumentation.ts — this is only for the
 * try/catch cases that don't reach an error boundary.
 */
export function captureException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  Sentry.withScope((scope) => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => scope.setTag(key, value));
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => scope.setExtra(key, value));
    }
    Sentry.captureException(error);
  });
}

export function setSentryUser(user: { id: string; email?: string } | null): void {
  Sentry.setUser(user);
}
