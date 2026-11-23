import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { SearchHistoryEntry } from '../src/db/entities/SearchHistoryEntry';
import { RecommendationEvent } from '../src/db/entities/RecommendationEvent';
import {
  getVariantForUser,
  getDestinationMetadata,
  getOfferForDestination,
  getPriceSignal,
  getRecommendations,
} from '../src/services/recommendationService';

jest.mock('../src/services/loyalty/loyaltyService', () => ({
  loyaltyService: { getTier: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loyaltyService } = jest.requireMock('../src/services/loyalty/loyaltyService');

async function seedFlight(toAirport: string, priceCents: number): Promise<Flight> {
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

async function seedSearch(userId: string, toAirport: string): Promise<void> {
  const repo = AppDataSource.getRepository(SearchHistoryEntry);
  await repo.save(
    repo.create({
      userId,
      fromAirport: 'JFK',
      toAirport,
      departureDate: '2026-09-01',
      passengers: 1,
      cabinClass: 'economy',
    }),
  );
}

async function clearAll(): Promise<void> {
  await AppDataSource.getRepository(RecommendationEvent).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(Flight).createQueryBuilder().delete().execute();
  await AppDataSource.getRepository(SearchHistoryEntry).createQueryBuilder().delete().execute();
}

describe('getVariantForUser', () => {
  it('is deterministic for the same user id', () => {
    expect(getVariantForUser('GABC123')).toBe(getVariantForUser('GABC123'));
  });

  it('splits a population of users roughly 50/50', () => {
    const counts = { personalized: 0, control: 0 };
    for (let i = 0; i < 500; i++) {
      counts[getVariantForUser(`user-${i}`)] += 1;
    }
    expect(counts.personalized).toBeGreaterThan(150);
    expect(counts.control).toBeGreaterThan(150);
    expect(counts.personalized + counts.control).toBe(500);
  });
});

describe('getDestinationMetadata', () => {
  it('returns known city/country metadata', () => {
    expect(getDestinationMetadata('cdg')).toEqual({ code: 'CDG', city: 'Paris', country: 'France' });
  });

  it('falls back gracefully for an unknown code', () => {
    expect(getDestinationMetadata('zzz')).toEqual({ code: 'ZZZ', city: 'ZZZ', country: '' });
  });
});

describe('getOfferForDestination', () => {
  it('prioritizes a loyalty offer when the user has a tier', () => {
    const offer = getOfferForDestination({ loyaltyTier: 'Gold', isGoodValue: true, isNewToUser: true });
    expect(offer).toEqual({ type: 'loyalty', label: 'Earn 2x points as a Gold member' });
  });

  it('returns a value offer when the fare is a good deal and there is no loyalty tier', () => {
    const offer = getOfferForDestination({ isGoodValue: true, isNewToUser: true });
    expect(offer.type).toBe('value');
  });

  it('returns a discovery offer for a new destination with no other signal', () => {
    const offer = getOfferForDestination({ isGoodValue: false, isNewToUser: true });
    expect(offer.type).toBe('discovery');
  });

  it('returns a favorite offer for a destination the user already knows with no other signal', () => {
    const offer = getOfferForDestination({ isGoodValue: false, isNewToUser: false });
    expect(offer.type).toBe('favorite');
  });
});

describe('getPriceSignal', () => {
  beforeAll(async () => {
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  afterEach(async () => {
    await clearAll();
  });

  it('returns nulls and isGoodValue false when there are no flights', async () => {
    const signal = await getPriceSignal('ZZZ');
    expect(signal).toEqual({ cheapestPriceCents: null, averagePriceCents: null, isGoodValue: false });
  });

  it('is not a good value with only a single listed flight', async () => {
    await seedFlight('LAX', 20000);
    const signal = await getPriceSignal('LAX');
    expect(signal.cheapestPriceCents).toBe(20000);
    expect(signal.isGoodValue).toBe(false);
  });

  it('flags good value when the cheapest fare is well below the route average', async () => {
    await seedFlight('LAX', 10000);
    await seedFlight('LAX', 30000);
    await seedFlight('LAX', 32000);

    const signal = await getPriceSignal('lax');

    expect(signal.cheapestPriceCents).toBe(10000);
    expect(signal.isGoodValue).toBe(true);
  });

  it('does not flag good value when prices are all close together', async () => {
    await seedFlight('LAX', 20000);
    await seedFlight('LAX', 20500);

    const signal = await getPriceSignal('LAX');

    expect(signal.isGoodValue).toBe(false);
  });
});

describe('getRecommendations', () => {
  // Deterministic fixtures: GTESTWALLET1 hashes into the "personalized" arm
  // and GTESTWALLET0 into the "control" arm of the 50/50 split.
  const PERSONALIZED_USER = 'GTESTWALLET1';
  const CONTROL_USER = 'GTESTWALLET0';

  beforeAll(async () => {
    await initDataSource();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  afterEach(async () => {
    await clearAll();
    jest.clearAllMocks();
  });

  it('sanity-checks the deterministic test fixtures', () => {
    expect(getVariantForUser(PERSONALIZED_USER)).toBe('personalized');
    expect(getVariantForUser(CONTROL_USER)).toBe('control');
  });

  it('ranks the user\'s own history first and blends in co-occurring + trending destinations', async () => {
    loyaltyService.getTier.mockReturnValue(undefined);

    await seedSearch(PERSONALIZED_USER, 'CDG');
    // Other travelers who also searched CDG frequently searched BCN too.
    await seedSearch('other-user-1', 'CDG');
    await seedSearch('other-user-1', 'BCN');
    await seedSearch('other-user-2', 'CDG');
    await seedSearch('other-user-2', 'BCN');
    // A globally popular destination unrelated to CDG, for trending backfill —
    // searched by more distinct users than CDG so it ranks #1 in trending.
    await seedSearch('other-user-3', 'FCO');
    await seedSearch('other-user-4', 'FCO');
    await seedSearch('other-user-5', 'FCO');
    await seedSearch('other-user-6', 'FCO');

    const result = await getRecommendations(PERSONALIZED_USER);

    expect(result.variant).toBe('personalized');
    const ownEntry = result.personalized.find((d) => d.code === 'CDG');
    expect(ownEntry?.reason).toBe('Because you searched for this route');

    const coOccurring = result.personalized.find((d) => d.code === 'BCN');
    expect(coOccurring?.reason).toBe('Popular with travelers who like your usual destinations');

    expect(result.trending[0].code).toBe('FCO');
  });

  it('shows only trending destinations (no personal history) to the control arm', async () => {
    loyaltyService.getTier.mockReturnValue(undefined);

    // Own history exists, but the control arm must ignore it entirely —
    // every returned card should be reasoned as "trending", never personal.
    await seedSearch(CONTROL_USER, 'CDG');
    await seedSearch('other-user-1', 'FCO');
    await seedSearch('other-user-2', 'FCO');

    const result = await getRecommendations(CONTROL_USER);

    expect(result.variant).toBe('control');
    expect(result.personalized.length).toBeGreaterThan(0);
    expect(result.personalized.every((d) => d.reason === 'Trending with Traqora travelers')).toBe(true);
  });

  it('surfaces a loyalty offer when the user has a tier', async () => {
    loyaltyService.getTier.mockReturnValue('Gold');
    await seedSearch('other-user-1', 'NRT');

    const result = await getRecommendations(PERSONALIZED_USER);

    expect(result.trending[0].offer).toEqual({ type: 'loyalty', label: 'Earn 2x points as a Gold member' });
  });

  it('records a view engagement event for every shown personalized destination', async () => {
    loyaltyService.getTier.mockReturnValue(undefined);
    await seedSearch(PERSONALIZED_USER, 'CDG');

    const result = await getRecommendations(PERSONALIZED_USER);

    const events = await AppDataSource.getRepository(RecommendationEvent).find({ where: { userId: PERSONALIZED_USER } });
    expect(events.length).toBe(result.personalized.length);
    expect(events.every((e) => e.action === 'view' && e.variant === 'personalized')).toBe(true);
  });
});
