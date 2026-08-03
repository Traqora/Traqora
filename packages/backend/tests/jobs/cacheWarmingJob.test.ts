import { AppDataSource } from '../../src/db/dataSource';
import { CacheWarmingJob } from '../../src/jobs/cacheWarmingJob';
import { FlightSearchService } from '../../src/services/flightSearchService';

describe('CacheWarmingJob (issue #335)', () => {
  let queryBuilder: any;

  beforeEach(() => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    jest.spyOn(AppDataSource, 'getRepository').mockReturnValue({
      createQueryBuilder: jest.fn(() => queryBuilder),
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('warms the cache for every frequent route returned by the query', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      {
        fromAirport: 'JFK',
        toAirport: 'LHR',
        departureDate: '2026-09-01',
        passengers: '2',
        cabinClass: 'economy',
        searchCount: '15',
      },
      {
        fromAirport: 'LAX',
        toAirport: 'CDG',
        departureDate: '2026-09-05',
        passengers: '1',
        cabinClass: 'business',
        searchCount: '8',
      },
    ]);

    const searchFlights = jest.fn().mockResolvedValue({ data: [], pagination: { has_more: false, next_cursor: null, page_size: 20 } });
    const fakeService = { searchFlights } as unknown as FlightSearchService;

    const job = new CacheWarmingJob(fakeService);
    const result = await job.runNow();

    expect(result).toEqual({ warmed: 2, failed: 0 });
    expect(searchFlights).toHaveBeenCalledTimes(2);
    expect(searchFlights).toHaveBeenNthCalledWith(1, {
      from: 'JFK',
      to: 'LHR',
      date: '2026-09-01',
      passengers: 2,
      travelClass: 'economy',
      sortBy: 'price',
      pageSize: 20,
    });
  });

  it('counts a failed warm without aborting the remaining routes', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      { fromAirport: 'JFK', toAirport: 'LHR', departureDate: '2026-09-01', passengers: '1', cabinClass: 'economy', searchCount: '5' },
      { fromAirport: 'LAX', toAirport: 'CDG', departureDate: '2026-09-05', passengers: '1', cabinClass: 'economy', searchCount: '3' },
    ]);

    const searchFlights = jest
      .fn()
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce({ data: [], pagination: { has_more: false, next_cursor: null, page_size: 20 } });
    const fakeService = { searchFlights } as unknown as FlightSearchService;

    const job = new CacheWarmingJob(fakeService);
    const result = await job.runNow();

    expect(result).toEqual({ warmed: 1, failed: 1 });
  });

  it('returns zero counts and does not throw when the query fails', async () => {
    queryBuilder.getRawMany.mockRejectedValue(new Error('db unavailable'));

    const searchFlights = jest.fn();
    const fakeService = { searchFlights } as unknown as FlightSearchService;

    const job = new CacheWarmingJob(fakeService);
    const result = await job.runNow();

    expect(result).toEqual({ warmed: 0, failed: 0 });
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it('is a no-op when there are no frequent routes', async () => {
    const searchFlights = jest.fn();
    const fakeService = { searchFlights } as unknown as FlightSearchService;

    const job = new CacheWarmingJob(fakeService);
    const result = await job.runNow();

    expect(result).toEqual({ warmed: 0, failed: 0 });
    expect(searchFlights).not.toHaveBeenCalled();
  });
});
