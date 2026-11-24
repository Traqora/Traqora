# Segment fare brand and cabin (#904)

Multi-segment offers keep per-segment `fareBrand` and `cabinClass` when
normalized from Amadeus (and similar) payloads so mixed-cabin itineraries are
presented accurately. Mapping no longer collapses cabin to the first segment
only.

Implementation: `packages/backend/src/services/flightOfferSegments.ts`,
wired from `amadeusFlightDataProvider.mapAmadeusOfferToFlight`.
