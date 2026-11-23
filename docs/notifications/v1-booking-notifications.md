# V1 booking notifications

This document defines the essential v1 booking lifecycle notifications, their triggers, channels, and deduplication identity. Implementation source of truth: `packages/backend/src/notifications/v1Catalog.ts`.

## Delivery model

- Producers enqueue notifications through `packages/backend/src/jobs/notificationQueue.ts` (`scheduleNotification`).
- The notification worker (`packages/backend/src/jobs/notificationWorker.ts`) delivers per channel (email, SMS, push) based on user preferences/opt-in and records outcomes in `notification_logs`.
- Delivery is idempotent per event and channel: retries and re-enqueues with the same `idempotencyKey` must not send duplicate messages. The worker skips channels that already have a `sent` log entry for `(userId, type, channel, idempotencyKey)` and records failed attempts for retry.
- Provider/configuration failures are recorded in structured logs and, when a channel delivery attempt fails, in `notification_logs.errorMessage` (without storing secrets).

## Essential v1 events

| Event | Notification type | Trigger | Default channels | Required payload (minimum) | Idempotency key shape |
|---|---|---|---|---|---|
| Booking confirmed | `booking` | Booking transitions to confirmed (payment and reservation accepted for the traveler). | email, sms, push (subject to preferences/opt-in) | `bookingId`, `bookingReference`, `flightNumber` | `booking_confirmed:{bookingId}` |
| Payment confirmed | `payment` | Payment for a booking is captured/confirmed. | email, sms, push | `bookingId`, `bookingReference`, `amount` (or equivalent payment identifier in key) | `payment_confirmed:{bookingId}:{paymentIdOrIntent}` |
| Schedule change | `flight_status` / specific flight event types | Material schedule/status change affecting a booked flight (delay, significant delay, cancellation, gate change, boarding update/status). | email, sms, push (event-dependent) | `bookingIdOrFlightId`, `flightNumber`, `changeType`/`status` and relevant details | `schedule_change:{flightId}:{changeType}:{eventTimestampOrState}` (and recipient where fan-out is per user) |
| Booking cancelled | `flight_cancelled` (or booking cancellation event mapped to cancellation notification) | Booking or its flight is cancelled in a way that affects the traveler. | email, sms, push | `bookingIdOrFlightId`, `flightNumber`, `reason` | `booking_cancelled:{bookingIdOrFlightId}` (and recipient where fan-out is per user) |
| Refund status | `refund` / `refund_initiated` | Refund lifecycle update relevant to the traveler (initiated, processed/completed, failed/rejected as applicable). | email, sms, push | `refundId`, `bookingId`, `bookingReference`, `status` | `refund_status:{refundId}:{status}` (and recipient where fan-out is per user) |

Notes:
- Channels are constrained by user preferences and compliance flags (for push, `pushEnabled`, `pushOptedIn`, and type-specific push preferences). A skipped/disabled channel is not a delivery failure.
- Event producers must supply stable identity inputs so the same logical event produces the same idempotency key across retries/re-enqueues.
- v1 scope is limited to booking, payment, schedule-change, cancellation, and refund messages listed above.

## Booking confirmation support contact

The booking confirmation view (`mobile/BookingConfirmationScreen.tsx`) accepts an optional `supportContact` prop (`phone`, `email`, `hours`). When provided, it renders a "Need help?" section that shows the support route and the traveler's booking reference (`TRAQ-{bookingId}`) so it can be quoted to support. The section contains no other customer data, and is omitted entirely when no support contact is supplied. Phone numbers are linked with `tel:` and emails with `mailto:`; the section uses a labelled `<section>` landmark for accessibility.
