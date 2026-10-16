# Issue #663: Journey Planner Multi-City UI

## Overview

Wired the `JourneyTripPlanner` component into the `/journey` route so travelers
can build and search multi-city (open-jaw) itineraries directly from the client,
backed by the existing `POST /api/v1/flights/multi-city` endpoint.

## Features

- Add/remove flight legs, constrained to a 2–5 segment range
- Per-leg origin, destination, and date inputs with validation:
  - airports must be 3-letter IATA codes
  - origin and destination must differ
  - dates must be non-decreasing across legs
- Passenger count applied to every leg
- Sort combined results by lowest/highest total price or shortest/longest total duration
- Renders the cheapest flight per leg plus the combined itinerary total
- `/journey` now exposes two tabs: **Multi-City Flights** and **Itinerary Builder**

## Files

- `packages/client/components/journey/journey-trip-planner.tsx` — planner UI and validation
- `packages/client/app/journey/page.tsx` — tabs wiring the planner + itinerary builder
- `packages/client/lib/api.ts` — `MultiCity*` types and `apiClient.searchMultiCity()`

## Usage

```tsx
import { JourneyTripPlanner } from "@/components/journey/journey-trip-planner";

<JourneyTripPlanner />;
```

## Testing

- `packages/client/tests/journey/journey-trip-planner.test.tsx`
