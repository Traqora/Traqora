import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from './lib/sentryScrub';

// Server-side (Node runtime) Sentry init (#382): captures SSR render
// errors and API route/server action failures.
Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  enabled: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  // PII/secret scrubbing (#382) — see scrubEvent for the field list.
  beforeSend: scrubEvent,
});
