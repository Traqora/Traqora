import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { SearchHistoryEntry } from '../src/db/entities/SearchHistoryEntry';
import { SavedSearch } from '../src/db/entities/SavedSearch';
import { Flight } from '../src/db/entities/Flight';
import { Passenger } from '../src/db/entities/Passenger';
import { Booking } from '../src/db/entities/Booking';
import { RecommendationEvent } from '../src/db/entities/RecommendationEvent';
import {
  getUserDestinationFrequency,
  getTrendingDestinations,
  getCoOccurringDestinations,
  recordRecommendationEvent,
  getEngagementSummary,
} from '../src/services/analytics';

async function seedSearch(userId: string, toAirport: string, createdAt = new Date()): Promise<void> {
  const repo = AppDataSource.getRepository(SearchHistoryEntry);
  const entry = repo.create({
    userId,
    fromAirport: 'JFK',
    toAirport,
    departureDate: '2026-09-01',
    passengers: 1,
    cabinClass: 'economy',
  });
  const saved = await repo.save(entry);
  // createdAt is a @CreateDateColumn (always "now") — override it directly
  // so tests can simulate entries from outside the trending time window.
  await repo.update(saved.id, { createdAt } as Partial<SearchHistoryEntry>);
}

async function seedSavedSearch(userId: string, toAirport: string): Promise<void> {
  const repo = AppDataSource.getRepository(SavedSearch);
  await repo.save(
    repo.create({
      userId,
      name: null,
      fromAirport: 'JFK',
      toAirport,
      departureDate: '2026-09-01',
      passengers: 1,
      cabinClass: 'economy',
    }),
  );
}

async function seedFlight(toAirport: string, priceCents = 20000): Promise<Flight> {
  const repo = AppDataSource.getRepository(Flight);
  return repo.save(
    repo.create({
      flightNumber: 'DL100',
      airlineCode: 'DL',
      fromAirport: 'JFK',
      toAirport,
      departureTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      seatsAvailable: 20,
      priceCents,
      airlineSorobanAddress: 'G-AIRLINE',
      status: 'SCHEDULED',
      dataSource: 'MANUAL',
      syncStatus: 'EXACT_MATCH',
    }),
  );
}

async function seedBooking(walletAddress: string, flight: Flight): Promise<Booking> {
  const passengerRepo = AppDataSource.getRepository(Passenger);
  const passenger = await passengerRepo.save(
    passengerRepo.create({
      email: `${walletAddress.toLowerCase()}@example.com`,
      firstName: 'Test',
      lastName: 'Traveler',
      sorobanAddress: `G-${walletAddress}`,
    }),
  );

  const bookingRepo = AppDataSource.getRepository(Booking);
  return bookingRepo.save(
    bookingRepo.create({
      flight,
      passenger,
      status: 'confirmed',
      amountCents: flight.priceCents,
      walletAddress,
    }),
  );
}

async function clearAll(): Promise<void> {
  await AppDataSource.getRepository(RecommendationEvent).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(Booking).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(Flight).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(Passenger).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(SearchHistoryEntry).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(SavedSearch).createQueryBuilder().delete().execute();
}

describe('recommendation analytics', () => {
  beforeAll(async () => {
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  afterEach(async () => {
    await clearAll();
  });

  describe('getUserDestinationFrequency', () => {
    it('combines search history, saved searches, and bookings, weighting bookings heaviest', async () => {
      const flight = await seedFlight('LAX');
      await seedSearch('user-1', 'lax');
      await seedSearch('user-1', 'SEA');
      await seedSavedSearch('user-1', 'sea');
      await seedBooking('user-1', flight);

      const result = await getUserDestinationFrequency('user-1');

      const lax = result.find((r) => r.code === 'LAX');
      const sea = result.find((r) => r.code === 'SEA');
      expect(lax?.count).toBe(1 + 3); // 1 search + 1 booking (weight 3)
      expect(sea?.count).toBe(2); // 1 search + 1 saved search
      // Highest count (LAX) ranks first
      expect(result[0].code).toBe('LAX');
    });

    it('is scoped to the requesting user only', async () => {
      await seedSearch('user-1', 'CDG');
      await seedSearch('user-2', 'NRT');

      const result = await getUserDestinationFrequency('user-1');

      expect(result.map((r) => r.code)).toEqual(['CDG']);
    });

    it('returns an empty list for a user with no history', async () => {
      const result = await getUserDestinationFrequency('nobody');
      expect(result).toEqual([]);
    });
  });

  describe('getTrendingDestinations', () => {
    it('ranks destinations by aggregate frequency across all users', async () => {
      await seedSearch('user-1', 'BCN');
      await seedSearch('user-2', 'BCN');
      await seedSearch('user-3', 'FCO');

      const result = await getTrendingDestinations(10);

      expect(result[0]).toEqual({ code: 'BCN', count: 2 });
      expect(result.find((r) => r.code === 'FCO')).toEqual({ code: 'FCO', count: 1 });
    });

    it('weights bookings more heavily than searches', async () => {
      const flight = await seedFlight('DXB');
      await seedBooking('user-1', flight);
      await seedSearch('user-2', 'SYD');

      const result = await getTrendingDestinations(10);

      const dxb = result.find((r) => r.code === 'DXB');
      const syd = result.find((r) => r.code === 'SYD');
      expect(dxb?.count).toBe(3);
      expect(syd?.count).toBe(1);
    });

    it('excludes searches outside the trending window', async () => {
      const staleDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await seedSearch('user-1', 'SIN', staleDate);

      const result = await getTrendingDestinations(10, 30);

      expect(result.find((r) => r.code === 'SIN')).toBeUndefined();
    });

    it('respects the limit parameter', async () => {
      await seedSearch('user-1', 'LAX');
      await seedSearch('user-1', 'SEA');
      await seedSearch('user-1', 'DEN');

      const result = await getTrendingDestinations(2);

      expect(result).toHaveLength(2);
    });
  });

  describe('getCoOccurringDestinations', () => {
    it('finds destinations frequently searched by users who also searched the seed', async () => {
      await seedSearch('user-a', 'CDG');
      await seedSearch('user-a', 'BCN');
      await seedSearch('user-b', 'CDG');
      await seedSearch('user-b', 'BCN');
      await seedSearch('user-b', 'FCO');
      // Unrelated user who never searched the seed shouldn't influence results
      await seedSearch('user-c', 'NRT');

      const result = await getCoOccurringDestinations(['CDG'], new Set(['CDG']), 10);

      expect(result[0]).toEqual({ code: 'BCN', score: 2 });
      expect(result.find((r) => r.code === 'FCO')).toEqual({ code: 'FCO', score: 1 });
      expect(result.find((r) => r.code === 'NRT')).toBeUndefined();
    });

    it('excludes codes passed in excludeCodes', async () => {
      await seedSearch('user-a', 'CDG');
      await seedSearch('user-a', 'BCN');

      const result = await getCoOccurringDestinations(['CDG'], new Set(['CDG', 'BCN']), 10);

      expect(result.find((r) => r.code === 'BCN')).toBeUndefined();
    });

    it('returns an empty array when no seed codes are given', async () => {
      const result = await getCoOccurringDestinations([], new Set(), 10);
      expect(result).toEqual([]);
    });
  });

  describe('recordRecommendationEvent + getEngagementSummary', () => {
    it('aggregates views/clicks/dismissals and computes click-through rate per variant', async () => {
      await recordRecommendationEvent({ userId: 'user-1', destinationCode: 'lax', variant: 'personalized', action: 'view' });
      await recordRecommendationEvent({ userId: 'user-1', destinationCode: 'lax', variant: 'personalized', action: 'view' });
      await recordRecommendationEvent({ userId: 'user-1', destinationCode: 'lax', variant: 'personalized', action: 'click' });
      await recordRecommendationEvent({ userId: 'user-1', destinationCode: 'sea', variant: 'control', action: 'view' });
      await recordRecommendationEvent({ userId: 'user-1', destinationCode: 'sea', variant: 'control', action: 'dismiss' });

      const summary = await getEngagementSummary();
      const personalized = summary.find((s) => s.variant === 'personalized');
      const control = summary.find((s) => s.variant === 'control');

      expect(personalized).toEqual({ variant: 'personalized', views: 2, clicks: 1, dismissals: 0, clickThroughRate: 0.5 });
      expect(control).toEqual({ variant: 'control', views: 1, clicks: 0, dismissals: 1, clickThroughRate: 0 });
    });

    it('scopes the summary to a single user when userId is provided', async () => {
      await recordRecommendationEvent({ userId: 'user-1', destinationCode: 'lax', variant: 'personalized', action: 'view' });
      await recordRecommendationEvent({ userId: 'user-2', destinationCode: 'sea', variant: 'personalized', action: 'view' });

      const summary = await getEngagementSummary('user-1');

      expect(summary).toEqual([{ variant: 'personalized', views: 1, clicks: 0, dismissals: 0, clickThroughRate: 0 }]);
    });

    it('stores the destination code uppercased', async () => {
      await recordRecommendationEvent({ userId: 'user-1', destinationCode: 'lax', variant: 'personalized', action: 'view' });

      const events = await AppDataSource.getRepository(RecommendationEvent).find();
      expect(events[0].destinationCode).toBe('LAX');
    });
  });
});
