import { JourneyPlannerService } from '../journeyPlanner';

describe('JourneyPlannerService Unit Tests', () => {
  let service: JourneyPlannerService;

  beforeEach(() => {
    service = new JourneyPlannerService();
  });

  test('createJourney creates a valid multi-stop trip', async () => {
    const journey = await service.createJourney({
      userId: 'user-101',
      title: 'Summer Europe Trip',
      description: 'London, Paris, Rome',
      stops: [
        {
          city: 'London',
          airportCode: 'LHR',
          arrivalDate: '2026-09-01T10:00:00.000Z',
          departureDate: '2026-09-04T12:00:00.000Z',
          activities: ['Big Ben'],
        },
        {
          city: 'Paris',
          airportCode: 'CDG',
          arrivalDate: '2026-09-04T14:30:00.000Z',
          departureDate: '2026-09-07T16:00:00.000Z',
          activities: ['Eiffel Tower'],
        },
      ],
    });

    expect(journey).toBeDefined();
    expect(journey.id).toContain('jny-');
    expect(journey.stops.length).toBe(2);
    expect(journey.shareToken).toBeDefined();
  });

  test('optimizeRoute reorders unvisited stops using nearest neighbor algorithm', () => {
    const stops = [
      {
        id: '1',
        city: 'New York',
        airportCode: 'JFK',
        arrivalDate: '2026-09-01T10:00:00.000Z',
        departureDate: '2026-09-03T10:00:00.000Z',
        timezone: 'America/New_York',
        activities: [],
        sequenceOrder: 1,
      },
      {
        id: '2',
        city: 'Rome',
        airportCode: 'FCO',
        arrivalDate: '2026-09-03T14:00:00.000Z',
        departureDate: '2026-09-06T10:00:00.000Z',
        timezone: 'Europe/Rome',
        activities: [],
        sequenceOrder: 2,
      },
      {
        id: '3',
        city: 'London',
        airportCode: 'LHR',
        arrivalDate: '2026-09-06T12:00:00.000Z',
        departureDate: '2026-09-09T10:00:00.000Z',
        timezone: 'Europe/London',
        activities: [],
        sequenceOrder: 3,
      },
    ];

    const result = service.optimizeRoute(stops);
    expect(result).toBeDefined();
    expect(result.optimizedStops.length).toBe(3);
    // JFK to London is closer than JFK to Rome, so LHR should come before FCO
    expect(result.optimizedStops[1].airportCode).toBe('LHR');
    expect(result.optimizedStops[2].airportCode).toBe('FCO');
  });

  test('generateCalendarIcs produces valid VCALENDAR string', async () => {
    const journey = await service.createJourney({
      userId: 'user-101',
      title: 'Calendar Test Trip',
      stops: [
        {
          city: 'London',
          airportCode: 'LHR',
          arrivalDate: '2026-09-01T10:00:00.000Z',
          departureDate: '2026-09-04T12:00:00.000Z',
          activities: ['Sightseeing'],
        },
        {
          city: 'Paris',
          airportCode: 'CDG',
          arrivalDate: '2026-09-04T14:30:00.000Z',
          departureDate: '2026-09-07T16:00:00.000Z',
          activities: ['Museums'],
        },
      ],
    });

    const ics = service.generateCalendarIcs(journey);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Stop in London (LHR)');
    expect(ics).toContain('END:VCALENDAR');
  });

  test('getTemplates returns predefined journey templates', () => {
    const templates = service.getTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]).toHaveProperty('name');
    expect(templates[0]).toHaveProperty('stops');
  });
});
