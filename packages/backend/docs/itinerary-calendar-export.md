# iCalendar itinerary export (#941)

`GET /api/v1/bookings/:bookingId/itinerary.ics` returns one RFC 5545 calendar
event for the authenticated booking owner.

The event uses a stable `UID` derived from the booking and flight IDs. Its
`SEQUENCE` and `LAST-MODIFIED` values are derived from the booking update time,
so a calendar client can replace the existing event when flight times or
status change. Departure and arrival are emitted with airport-specific IANA
timezone identifiers and the response includes the identifiers as
`X-TRAQORA-*` properties for clients that need to display the source zones.

If arrival data is temporarily unavailable, the exporter uses a two-hour
fallback duration and still keeps the event stable. Invalid departure times
are rejected instead of producing a malformed calendar file.

The client helper is `downloadItineraryCalendar` in
`packages/client/lib/itinerary-calendar.ts`.
