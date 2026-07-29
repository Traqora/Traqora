export interface ClientMockFlight {
  id: string;
  flightNumber: string;
  airlineCode: string;
  fromAirport: string;
  toAirport: string;
  departureTime: string;
  arrivalTime: string;
  priceCents: number;
  seatsAvailable: number;
  status: string;
  gate?: string;
  terminal?: string;
}

export interface ClientMockCheckIn {
  id: string;
  bookingId: string;
  status: 'pending' | 'checked_in' | 'cancelled';
  seatNumber?: string | null;
  boardingPassCode: string;
  checkedInAt?: string | null;
}

export interface ClientMockJourneyStop {
  id: string;
  city: string;
  airportCode: string;
  arrivalDate: string;
  departureDate: string;
  activities: string[];
  notes?: string;
}

export interface ClientMockJourney {
  id: string;
  title: string;
  description?: string;
  userId: string;
  stops: ClientMockJourneyStop[];
  totalDays: number;
  optimized: boolean;
  shareToken?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export class ClientMockFactories {
  static createFlight(overrides: Partial<ClientMockFlight> = {}): ClientMockFlight {
    return {
      id: 'flight-mock-1',
      flightNumber: 'TQ101',
      airlineCode: 'TQ',
      fromAirport: 'JFK',
      toAirport: 'LHR',
      departureTime: '2026-08-01T10:00:00.000Z',
      arrivalTime: '2026-08-01T22:00:00.000Z',
      priceCents: 45000,
      seatsAvailable: 85,
      status: 'SCHEDULED',
      gate: 'B12',
      terminal: 'T4',
      ...overrides,
    };
  }

  static createCheckIn(overrides: Partial<ClientMockCheckIn> = {}): ClientMockCheckIn {
    return {
      id: 'checkin-mock-1',
      bookingId: 'booking-mock-1',
      status: 'checked_in',
      seatNumber: '14A',
      boardingPassCode: 'BP-TQ101-JANE-DOE-14A',
      checkedInAt: '2026-07-28T00:00:00.000Z',
      ...overrides,
    };
  }

  static createJourney(overrides: Partial<ClientMockJourney> = {}): ClientMockJourney {
    return {
      id: 'journey-mock-1',
      title: 'European Capital Tour',
      description: 'Multi-stop trip across London, Paris, and Rome',
      userId: 'user-mock-1',
      stops: [
        {
          id: 'stop-1',
          city: 'London',
          airportCode: 'LHR',
          arrivalDate: '2026-08-01T10:00:00.000Z',
          departureDate: '2026-08-04T12:00:00.000Z',
          activities: ['British Museum', 'London Eye'],
        },
        {
          id: 'stop-2',
          city: 'Paris',
          airportCode: 'CDG',
          arrivalDate: '2026-08-04T14:30:00.000Z',
          departureDate: '2026-08-07T16:00:00.000Z',
          activities: ['Eiffel Tower', 'Louvre Museum'],
        },
        {
          id: 'stop-3',
          city: 'Rome',
          airportCode: 'FCO',
          arrivalDate: '2026-08-07T18:15:00.000Z',
          departureDate: '2026-08-10T11:00:00.000Z',
          activities: ['Colosseum', 'Vatican City'],
        },
      ],
      totalDays: 9,
      optimized: true,
      shareToken: 'share-token-abc123xyz',
      isPublic: true,
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
      ...overrides,
    };
  }
}
