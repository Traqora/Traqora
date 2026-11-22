# Transactional email delivery (v1)

## Provider and configuration

- Provider: SendGrid (`@sendgrid/mail`) via `packages/backend/src/services/EmailService.ts`.
- Required configuration: `SENDGRID_API_KEY` (runtime config). If not configured, delivery attempts fail fast with a recorded error (no silent success).
- Sender: configured in `EmailService` (`noreply@traqora.com` by default for v1).
- Templates (v1): `packages/backend/src/templates/emails/v1/*` (`booking`, `reminder`, `refund`, `payment`, `flight_status` mappings for lifecycle events).

## Delivery flow

- Essential lifecycle emails are enqueued via the notification queue and processed by `packages/backend/src/jobs/notificationWorker.ts`.
- The worker records per-channel outcomes in `notification_logs` (sent/failed with attempt count and sanitized error message) and uses idempotency keys to prevent duplicate sends on retries.
- Provider and template resolution failures are logged with structured, non-secret context and surfaced as delivery failures so retries/error handling behave correctly.

## Error handling and safety

- Do not log or persist provider API keys or other secrets.
- Error messages recorded for operations/debugging should be limited to safe provider/status information.
- User preferences must be respected; disabled/missing recipient channels are skipped (not treated as provider failures).
