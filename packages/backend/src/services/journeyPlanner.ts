import crypto from 'crypto';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface JourneyStop {
  id: string;
  city: string;
  airportCode: string;
  arrivalDate: string;
  departureDate: string;
  timezone?: string;
  activities: string[];
  notes?: string;
  sequenceOrder: number;
}

export interface Journey {
  id: string;
  title: string;
  description?: string;
  userId: string;
  stops: JourneyStop[];
  totalDays: number;
  isOptimized: boolean;
  shareToken: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  stops: Array<Omit<JourneyStop, 'id' | 'sequenceOrder'>>;
  recommendedDays: number;
}

export interface RouteOptimizationResult {
  optimizedStops: JourneyStop[];
  totalFlightDurationMinutes: number;
  totalLayoverMinutes: number;
  savingsDescription: string;
}

const CITY_TIMEZONES: Record<string, string> = {
  JFK: 'America/New_York',
  LHR: 'Europe/London',
  CDG: 'Europe/Paris',
  FCO: 'Europe/Rome',
  HND: 'Asia/Tokyo',
  SIN: 'Asia/Singapore',
  SYD: 'Australia/Sydney',
  DXB: 'Asia/Dubai',
};

const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  JFK: { lat: 40.6413, lng: -73.7781 },
  LHR: { lat: 51.4700, lng: -0.4543 },
  CDG: { lat: 49.0097, lng: 2.5479 },
  FCO: { lat: 41.8003, lng: 12.2389 },
  HND: { lat: 35.5494, lng: 139.7798 },
  SIN: { lat: 1.3644, lng: 103.9915 },
  SYD: { lat: -33.9399, lng: 151.1753 },
  DXB: { lat: 25.2532, lng: 55.3657 },
};

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export class JourneyPlannerService {
  private journeysMap = new Map<string, Journey>();

  private templates: JourneyTemplate[] = [
    {
      id: 'template-europe-capitals',
      name: 'European Capitals Express',
      category: 'Cultural',
      description: 'Classic circuit through London, Paris, and Rome.',
      recommendedDays: 9,
      stops: [
        {
          city: 'London',
          airportCode: 'LHR',
          arrivalDate: '2026-09-01T10:00:00.000Z',
          departureDate: '2026-09-04T12:00:00.000Z',
          timezone: 'Europe/London',
          activities: ['British Museum', 'London Eye', 'Tower of London'],
        },
        {
          city: 'Paris',
          airportCode: 'CDG',
          arrivalDate: '2026-09-04T14:30:00.000Z',
          departureDate: '2026-09-07T16:00:00.000Z',
          timezone: 'Europe/Paris',
          activities: ['Eiffel Tower', 'Louvre Museum', 'Montmartre'],
        },
        {
          city: 'Rome',
          airportCode: 'FCO',
          arrivalDate: '2026-09-07T18:15:00.000Z',
          departureDate: '2026-09-10T11:00:00.000Z',
          timezone: 'Europe/Rome',
          activities: ['Colosseum', 'Vatican Museums', 'Trevi Fountain'],
        },
      ],
    },
    {
      id: 'template-asia-hubs',
      name: 'Asia Tech & Innovation Hubs',
      category: 'Business & Tech',
      description: 'Explore leading technological centers in Tokyo and Singapore.',
      recommendedDays: 8,
      stops: [
        {
          city: 'Tokyo',
          airportCode: 'HND',
          arrivalDate: '2026-10-01T08:00:00.000Z',
          departureDate: '2026-10-05T14:00:00.000Z',
          timezone: 'Asia/Tokyo',
          activities: ['Akihabara Tech District', 'Shinjuku Center', 'TeamLab Planets'],
        },
        {
          city: 'Singapore',
          airportCode: 'SIN',
          arrivalDate: '2026-10-05T20:30:00.000Z',
          departureDate: '2026-10-09T18:00:00.000Z',
          timezone: 'Asia/Singapore',
          activities: ['Marina Bay Sands', 'Gardens by the Bay', 'Jewel Changi'],
        },
      ],
    },
  ];

  async createJourney(params: {
    userId: string;
    title: string;
    description?: string;
    stops: Array<Omit<JourneyStop, 'id' | 'sequenceOrder'>>;
    isPublic?: boolean;
  }): Promise<Journey> {
    if (!params.title || params.title.trim().length === 0) {
      throw new BadRequestError('Journey title is required');
    }
    if (!params.stops || params.stops.length < 2) {
      throw new BadRequestError('Multi-stop journey requires at least 2 stops');
    }

    const id = `jny-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const shareToken = crypto.randomBytes(16).toString('hex');

    const formattedStops: JourneyStop[] = params.stops.map((stop, index) => ({
      ...stop,
      id: `stop-${index + 1}-${crypto.randomBytes(4).toString('hex')}`,
      sequenceOrder: index + 1,
      timezone: stop.timezone || CITY_TIMEZONES[stop.airportCode] || 'UTC',
    }));

    // Calculate total days between first arrival and last departure
    const start = new Date(formattedStops[0].arrivalDate).getTime();
    const end = new Date(formattedStops[formattedStops.length - 1].departureDate).getTime();
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));

    const journey: Journey = {
      id,
      title: params.title,
      description: params.description,
      userId: params.userId,
      stops: formattedStops,
      totalDays,
      isOptimized: false,
      shareToken,
      isPublic: params.isPublic ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.journeysMap.set(id, journey);
    logger.info('Journey created', { id: journey.id, userId: params.userId });
    return journey;
  }

  async getJourney(journeyId: string, requestingUserId?: string): Promise<Journey> {
    const journey = this.journeysMap.get(journeyId);
    if (!journey) {
      throw new NotFoundError('Journey not found');
    }
    if (!journey.isPublic && requestingUserId && journey.userId !== requestingUserId) {
      throw new UnauthorizedError('Unauthorized access to private journey');
    }
    return journey;
  }

  async getJourneyByShareToken(shareToken: string): Promise<Journey> {
    for (const journey of this.journeysMap.values()) {
      if (journey.shareToken === shareToken) {
        return journey;
      }
    }
    throw new NotFoundError('Journey not found for share token');
  }

  async listUserJourneys(userId: string): Promise<Journey[]> {
    return Array.from(this.journeysMap.values()).filter((j) => j.userId === userId);
  }

  async updateJourney(
    journeyId: string,
    userId: string,
    updates: Partial<Pick<Journey, 'title' | 'description' | 'isPublic'>> & {
      stops?: Array<Omit<JourneyStop, 'id' | 'sequenceOrder'>>;
    }
  ): Promise<Journey> {
    const journey = await this.getJourney(journeyId, userId);
    if (journey.userId !== userId) {
      throw new UnauthorizedError('Cannot update journey owned by another user');
    }

    if (updates.title !== undefined) journey.title = updates.title;
    if (updates.description !== undefined) journey.description = updates.description;
    if (updates.isPublic !== undefined) journey.isPublic = updates.isPublic;

    if (updates.stops) {
      if (updates.stops.length < 2) {
        throw new BadRequestError('Journey must have at least 2 stops');
      }
      journey.stops = updates.stops.map((stop, index) => ({
        ...stop,
        id: `stop-${index + 1}-${crypto.randomBytes(4).toString('hex')}`,
        sequenceOrder: index + 1,
        timezone: stop.timezone || CITY_TIMEZONES[stop.airportCode] || 'UTC',
      }));
    }

    journey.updatedAt = new Date().toISOString();
    this.journeysMap.set(journeyId, journey);
    return journey;
  }

  async deleteJourney(journeyId: string, userId: string): Promise<void> {
    const journey = await this.getJourney(journeyId, userId);
    if (journey.userId !== userId) {
      throw new UnauthorizedError('Cannot delete journey owned by another user');
    }
    this.journeysMap.delete(journeyId);
  }

  optimizeRoute(stops: JourneyStop[]): RouteOptimizationResult {
    if (stops.length < 2) {
      return {
        optimizedStops: stops,
        totalFlightDurationMinutes: 0,
        totalLayoverMinutes: 0,
        savingsDescription: 'Route requires at least 2 stops to optimize.',
      };
    }

    // Nearest Neighbor Traveling Salesperson algorithm
    const unvisited = [...stops];
    const optimized: JourneyStop[] = [];

    // Keep start stop fixed
    let current = unvisited.shift()!;
    optimized.push({ ...current, sequenceOrder: 1 });

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let minDistance = Infinity;

      const currentCoords = CITY_COORDINATES[current.airportCode] || { lat: 0, lng: 0 };

      for (let i = 0; i < unvisited.length; i++) {
        const candidateCoords = CITY_COORDINATES[unvisited[i].airportCode] || { lat: 0, lng: 0 };
        const dist = calculateDistanceKm(
          currentCoords.lat,
          currentCoords.lng,
          candidateCoords.lat,
          candidateCoords.lng
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestIndex = i;
        }
      }

      current = unvisited.splice(nearestIndex, 1)[0];
      optimized.push({ ...current, sequenceOrder: optimized.length + 1 });
    }

    let totalFlightMinutes = 0;
    let totalLayoverMinutes = 0;

    for (let i = 0; i < optimized.length - 1; i++) {
      const fromCoords = CITY_COORDINATES[optimized[i].airportCode] || { lat: 0, lng: 0 };
      const toCoords = CITY_COORDINATES[optimized[i + 1].airportCode] || { lat: 0, lng: 0 };
      const dist = calculateDistanceKm(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
      // Rough flight time estimation: 800 km/h average speed + 30 min takeoff/landing
      totalFlightMinutes += Math.round((dist / 800) * 60 + 30);

      const departNext = new Date(optimized[i + 1].arrivalDate).getTime();
      const departCurrent = new Date(optimized[i].departureDate).getTime();
      if (departNext > departCurrent) {
        totalLayoverMinutes += Math.round((departNext - departCurrent) / (1000 * 60));
      }
    }

    return {
      optimizedStops: optimized,
      totalFlightDurationMinutes: totalFlightMinutes,
      totalLayoverMinutes,
      savingsDescription: 'Route optimized using shortest distance sequencing.',
    };
  }

  generateCalendarIcs(journey: Journey): string {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Traqora//Multi-Stop Journey Planner//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${journey.title}`,
    ];

    for (const stop of journey.stops) {
      const startIso = new Date(stop.arrivalDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const endIso = new Date(stop.departureDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      lines.push(
        'BEGIN:VEVENT',
        `UID:${stop.id}@traqora.com`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART:${startIso}`,
        `DTEND:${endIso}`,
        `SUMMARY:Stop in ${stop.city} (${stop.airportCode})`,
        `LOCATION:${stop.city}, Airport: ${stop.airportCode}`,
        `DESCRIPTION:Activities: ${stop.activities.join(', ')}`,
        'END:VEVENT'
      );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  getTemplates(): JourneyTemplate[] {
    return this.templates;
  }
}

export const journeyPlannerService = new JourneyPlannerService();
