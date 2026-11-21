import axios, { AxiosInstance } from 'axios';
import { AmadeusAnalyticsClient } from '../../src/services/amadeus/amadeusClient';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('supplier outage behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns no offers during a supplier outage and resumes when the supplier recovers', async () => {
    const offers = [{ id: 'offer-1' }];
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ data: { data: offers } });
    const create = jest.spyOn(axios, 'create').mockReturnValue({
      get,
      interceptors: { response: { use: jest.fn() } },
    } as unknown as AxiosInstance);
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'test-token', expires_in: 3600 },
    } as never);

    const client = new AmadeusAnalyticsClient({
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });
    const search = {
      originLocationCode: 'LHR',
      destinationLocationCode: 'JFK',
      departureDate: '2026-12-01',
      adults: 1,
    };

    await expect(client.searchFlights(search)).resolves.toEqual([]);
    await expect(client.searchFlights(search)).resolves.toEqual(offers);
    expect(logger.error).toHaveBeenCalledWith(
      'Amadeus flight search failed',
      expect.objectContaining({ error: expect.stringContaining('ECONNREFUSED') }),
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
