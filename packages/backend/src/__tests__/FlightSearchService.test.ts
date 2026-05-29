import { FlightSearchService } from '../../src/services/FlightSearchService';
import { createMockRepository, createMockRedisClient } from '../../../tests/helpers/mocks';
import { FlightBuilder } from '../../../tests/helpers/builders';
import { createFlight } from '../../../tests/helpers/factories';

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn(),
};

jest.mock('axios', () => mockHttpClient);

describe('FlightSearchService', () => {
  let service: FlightSearchService;
  let flightRepo: ReturnType<typeof createMockRepository>;
  let redis: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    flightRepo = createMockRepository();
    redis = createMockRedisClient();
    service = new FlightSearchService(flightRepo as any, redis as any, mockHttpClient as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ── searchFlights ──────────────────────────────────────────────────────────

  describe('searchFlights()', () => {
    const searchParams = { origin: 'LOS', destination: 'LHR', date: '2026-06-15', passengers: 1 };

    it('returns flights matching search criteria', async () => {
      const flights = [
        new FlightBuilder().from('LOS').to('LHR').withPrice(450).build(),
        new FlightBuilder().from('LOS').to('LHR').withPrice(380).build(),
      ];
      flightRepo.find.mockResolvedValue(flights);

      const result = await service.searchFlights(searchParams);

      expect(result).toHaveLength(2);
      expect(flightRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ origin: 'LOS', destination: 'LHR' }) }),
      );
    });

    it('returns cached results when cache hit occurs', async () => {
      const flights = [createFlight({ origin: 'LOS', destination: 'LHR' })];
      redis.get.mockResolvedValue(JSON.stringify(flights));

      const result = await service.searchFlights(searchParams);

      expect(result).toEqual(flights);
      expect(flightRepo.find).not.toHaveBeenCalled();
    });

    it('caches results after fetching from DB', async () => {
      const flights = [createFlight({ origin: 'LOS', destination: 'LHR' })];
      redis.get.mockResolvedValue(null);
      flightRepo.find.mockResolvedValue(flights);

      await service.searchFlights(searchParams);

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('flight:search'),
        JSON.stringify(flights),
        expect.anything(),
      );
    });

    it('returns empty array when no flights match', async () => {
      redis.get.mockResolvedValue(null);
      flightRepo.find.mockResolvedValue([]);

      const result = await service.searchFlights(searchParams);
      expect(result).toEqual([]);
    });

    it('filters out sold-out flights by default', async () => {
      const available = new FlightBuilder().withSeats(10).build();
      const soldOut = new FlightBuilder().soldOut().build();
      redis.get.mockResolvedValue(null);
      flightRepo.find.mockResolvedValue([available, soldOut]);

      const result = await service.searchFlights(searchParams);

      expect(result.every((f: any) => f.availableSeats > 0)).toBe(true);
    });

    it('sorts results by price ascending', async () => {
      const flights = [
        new FlightBuilder().withPrice(600).build(),
        new FlightBuilder().withPrice(300).build(),
        new FlightBuilder().withPrice(450).build(),
      ];
      redis.get.mockResolvedValue(null);
      flightRepo.find.mockResolvedValue(flights);

      const result = await service.searchFlights({ ...searchParams, sortBy: 'price' });

      expect(result[0].price).toBe(300);
      expect(result[result.length - 1].price).toBe(600);
    });

    it('throws on invalid date format', async () => {
      await expect(
        service.searchFlights({ ...searchParams, date: 'not-a-date' }),
      ).rejects.toThrow(/invalid date/i);
    });
  });

  // ── getFlightById ──────────────────────────────────────────────────────────

  describe('getFlightById()', () => {
    it('returns a flight by ID', async () => {
      const flight = createFlight();
      flightRepo.findOneBy.mockResolvedValue(flight);

      const result = await service.getFlightById(flight.id);
      expect(result).toEqual(flight);
    });

    it('throws NotFoundException when flight does not exist', async () => {
      flightRepo.findOneBy.mockResolvedValue(null);
      await expect(service.getFlightById('no-such-flight')).rejects.toThrow(/not found/i);
    });
  });

  // ── getFlightPrice ─────────────────────────────────────────────────────────

  describe('getFlightPrice()', () => {
    it('returns the current price including dynamic pricing', async () => {
      const flight = new FlightBuilder().withPrice(400).departingIn(24).build();
      flightRepo.findOneBy.mockResolvedValue(flight);

      const result = await service.getFlightPrice(flight.id);
      expect(typeof result.price).toBe('number');
      expect(result.currency).toBeDefined();
    });

    it('applies surge pricing when fewer than 10 seats remain', async () => {
      const flight = new FlightBuilder().withPrice(400).withSeats(5).departingIn(3).build();
      flightRepo.findOneBy.mockResolvedValue(flight);

      const result = await service.getFlightPrice(flight.id);
      expect(result.price).toBeGreaterThan(400);
    });
  });

  // ── syncExternalFlights ────────────────────────────────────────────────────

  describe('syncExternalFlights()', () => {
    it('fetches flights from external API and upserts to DB', async () => {
      const externalFlights = [
        { flightNumber: 'TQ101', origin: 'LOS', destination: 'LHR', price: 420, seats: 100 },
        { flightNumber: 'TQ102', origin: 'ABV', destination: 'CDG', price: 380, seats: 80 },
      ];
      mockHttpClient.get.mockResolvedValue({ data: { flights: externalFlights } });

      await service.syncExternalFlights();

      expect(flightRepo.save).toHaveBeenCalledTimes(externalFlights.length);
    });

    it('handles external API failure gracefully', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('External API timeout'));

      await expect(service.syncExternalFlights()).rejects.toThrow(/timeout/i);
    });

    it('invalidates flight search cache after sync', async () => {
      mockHttpClient.get.mockResolvedValue({ data: { flights: [] } });

      await service.syncExternalFlights();

      expect(redis.del).toHaveBeenCalledWith(expect.stringContaining('flight:search'));
    });
  });
});
