import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from './lib/sentryScrub';

// Client-side Sentry init (#382): captures render errors, unhandled
// promise rejections, and performance data from the browser. No-op when
// NEXT_PUBLIC_SENTRY_DSN isn't set, so local dev doesn't need a Sentry
// project configured.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // PII/secret scrubbing (#382) — see scrubEvent for the field list.
  beforeSend: scrubEvent,
  // User feedback widget (issue #334): a "Report a Bug" tab users can open
  // any time, plus an automatic prompt after a captured crash. Uses
  // Sentry's own screenshot/attachment pipeline — no custom widget UI to
  // build or maintain.
  integrations: [
    Sentry.feedbackIntegration({
      colorScheme: "system",
      showBranding: false,
      autoInject: true,
    }),
  ],
});
