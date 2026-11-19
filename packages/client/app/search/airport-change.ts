export interface ItinerarySegment {
  origin: string
  destination: string
}

export interface AirportChangeNotice {
  arrivedAt: string
  departsFrom: string
  metro: string
  /** Kilometres between the two airports, when a published distance is known. */
  distanceKm: number | null
  requiresGroundTransfer: true
}

interface Metro {
  name: string
  airports: string[]
}

const METROS: Metro[] = [
  { name: "New York", airports: ["JFK", "LGA", "EWR"] },
  { name: "London", airports: ["LHR", "LGW", "LCY", "STN", "LTN"] },
  { name: "Paris", airports: ["CDG", "ORY"] },
  { name: "Tokyo", airports: ["HND", "NRT"] },
  { name: "Chicago", airports: ["ORD", "MDW"] },
  { name: "Washington", airports: ["DCA", "IAD", "BWI"] },
  { name: "San Francisco Bay", airports: ["SFO", "OAK", "SJC"] },
  { name: "Los Angeles", airports: ["LAX", "BUR", "SNA", "LGB"] },
  { name: "Milan", airports: ["MXP", "LIN", "BGY"] },
]

const DISTANCE_KM: Record<string, number> = {
  "EWR-JFK": 34,
  "EWR-LGA": 27,
  "JFK-LGA": 17,
  "LCY-LHR": 16,
  "LGW-LHR": 43,
  "LHR-LTN": 48,
  "LHR-STN": 62,
  "CDG-ORY": 35,
  "HND-NRT": 75,
  "MDW-ORD": 25,
  "DCA-IAD": 40,
  "BWI-DCA": 50,
  "BWI-IAD": 70,
  "OAK-SFO": 18,
  "SFO-SJC": 48,
  "OAK-SJC": 50,
  "BUR-LAX": 28,
  "LAX-LGB": 26,
  "LAX-SNA": 58,
  "LIN-MXP": 50,
  "BGY-MXP": 55,
  "BGY-LIN": 45,
}

function metroOf(code: string): Metro | undefined {
  return METROS.find((metro) => metro.airports.includes(code))
}

function distanceKm(left: string, right: string): number | null {
  const key = [left, right].sort().join("-")
  return DISTANCE_KM[key] ?? null
}

/**
 * Connecting legs that arrive and leave from different airports in the same
 * metro. Unknown airport pairs and same-airport connections produce no notice.
 * Distance is omitted when this table does not have it.
 */
export function segmentsFromFlight(flight: {
  segments?: ItinerarySegment[] | null
}): ItinerarySegment[] {
  return Array.isArray(flight.segments) ? flight.segments : []
}

export function airportChangeNotices(segments: ItinerarySegment[] | null | undefined): AirportChangeNotice[] {
  if (!segments || segments.length < 2) return []

  const notices: AirportChangeNotice[] = []
  for (let index = 0; index < segments.length - 1; index += 1) {
    const arrivedAt = segments[index].destination.trim().toUpperCase()
    const departsFrom = segments[index + 1].origin.trim().toUpperCase()
    if (!arrivedAt || !departsFrom || arrivedAt === departsFrom) continue

    const metro = metroOf(arrivedAt)
    if (!metro || metro !== metroOf(departsFrom)) continue

    notices.push({
      arrivedAt,
      departsFrom,
      metro: metro.name,
      distanceKm: distanceKm(arrivedAt, departsFrom),
      requiresGroundTransfer: true,
    })
  }
  return notices
}
