# V1 notifications and support

This document describes the v1 notification lifecycle and the support booking
lookup workflow. It stays inside the documented v1 scope: no new channels, no
new categories, and no public API changes beyond the support lookup endpoint.

## Booking lifecycle email templates

The reviewed v1 template set lives in `src/templates/emails/v1/index.ts` and
covers five events:

| Event | Template export | Purpose |
| --- | --- | --- |
| `confirmation` | `bookingTemplate` | Booking confirmed |
| `pending` | `pendingTemplate` | Booking awaiting confirmation |
| `schedule-change` | `scheduleChangeTemplate` | Departure time changed |
| `cancellation` | `cancellationTemplate` | Booking cancelled, with reason |
| `refund` | `refundTemplate` | Refund processed |

`BOOKING_LIFECYCLE_TEMPLATES` maps each event to its renderer and
`getBookingLifecycleTemplate(event)` resolves one with validation. Every
template returns `{ subject, text, html }`, and every interpolated value is
HTML escaped so passenger or provider data cannot inject markup. `EmailService`
accepts both the legacy type names (`booking`, `reminder`, `refund`) and the
lifecycle event names.

## Delivery status tracking

`src/services/deliveryLifecycle.ts` defines the recorded states:

- `accepted`: the provider accepted the message for delivery.
- `delivered`: the provider confirmed delivery.
- `failed`: a delivery attempt failed.
- `retrying`: another attempt is scheduled or in flight.
- `terminal`: no further attempts will be made.

Valid transitions are enforced in `NotificationHistoryService`, which stores
the state in the existing `notification_logs.payload` JSON column via the
`deliveryLifecycle` key. A late callback cannot move a delivery backwards or
revive a terminal one. The service exposes `recordProviderAcceptance`,
`recordDeliveryFailure`, `recordRetry` and `markTerminal`.

Metadata is passed through `sanitizeDeliveryMetadata` before it is persisted.
Keys containing `token`, `secret`, `password`, `authorization`, `apiKey`,
`privateKey`, `credential`, `webhook`, `signature` or `auth` are replaced with
`[REDACTED]`, including inside nested objects and arrays. Message bodies and
one-time links are never copied into delivery metadata.

## Notification preferences and required notices

Optional channel preferences continue to gate `email`, `sms`, `push` and
`inapp` delivery by `enabled` and `frequency`. The `system` and `payment`
categories are operationally or legally required in v1 and are always
delivered, even when a user disabled a channel. Individual notices can also
set `NotificationPayload.required = true` to opt into the same behavior.

Do-Not-Disturb suppresses optional notices during the configured window but
never suppresses a required notice. This is enforced in both
`NotificationService.shouldDeliver` and
`MultiChannelNotificationService.shouldDeliver`.

## Support booking lookup

`GET /api/v1/admin/bookings/lookup` lets an authenticated admin or support
staff member locate a booking by the privacy-safe `TRQ-...` reference or an
internal booking UUID. Query parameters:

- `reference` (required): safe reference or UUID.
- `contact` (optional): claimed email or phone used to verify the requester.
- `reason` (required): free-text reason recorded in the audit trail.

The response is a redacted summary with booking id, reference, status, flight
details, passenger name and `requesterVerified`. Payment secrets, unsigned
transactions and provider tokens are never returned. Every lookup writes an
`AdminAuditLog` entry with the staff identity, reason, outcome, and client IP.
Malformed references and missing reasons are rejected with `400`; unknown
bookings return `404` and are audited as `NOT_FOUND`.
