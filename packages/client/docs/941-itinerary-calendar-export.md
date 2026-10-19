# Itinerary calendar export

Use `downloadItineraryCalendar(bookingId)` from
`packages/client/lib/itinerary-calendar.ts` to download the booking's `.ics`
event. The server supplies a stable event identifier and airport timezone
identifiers so calendar clients update an existing event when the flight
schedule changes.
