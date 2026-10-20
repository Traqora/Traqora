# Loyalty Expiry Reminders

`ExpirationHandler.processAllExpirationReminders(asOf)` sends an in-app
notification for each positive earned-points transaction entering its 30-day
or 7-day expiry window. The notification includes the points, expiry date, and
a link to `/loyalty`. Transactions outside those windows and already-expired
transactions are skipped.

Call the method once per day from the application's scheduler. Repeated calls
within the same threshold window enqueue a reminder only once per transaction
and threshold. The idempotency marker is recorded after the notification is
queued successfully.

The current loyalty store is process-local and in-memory, including reminder
markers. A process restart resets those markers; durable cross-restart
deduplication requires a persistent loyalty store.