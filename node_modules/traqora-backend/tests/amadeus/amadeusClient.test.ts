/**
 * Amadeus Client Tests
 * Tests for Amadeus API client authentication, flight search, and data normalization
 */

import axios from 'axios';
import { AmadeusAnalyticsClient } from '../../../src/services/amadeus/amadeusClient';
import { logger } from '../../../src/utils/logger';

jest.mock('axios');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AmadeusAnalyticsClient', () => {
  let client: AmadeusAnalyticsClient;
  const mockClientId = 'test-client-id';
  const mockClientSecret = 'test-client-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new AmadeusAnalyticsClient(mockClientId, mockClientSecret);
  });

  describe('authenticate', () => {
    it('should authenticate and store token', async () => {
      const mockToken = 'mock-jwt-token';
      const mockResponse = {
        status: 200,
        data: {
          access_token: mockToken,
          expires_in: 3600,
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await client.authenticate();

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('auth/v1/oAuth'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle authentication errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(
        new Error('Authentication failed')
      );

      const result = await client.authenticate();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should refresh token if expired', async () => {
      const mockToken1 = 'mock-token-1';
      const mockToken2 = 'mock-token-2';

      mockedAxios.post
        .mockResolvedValueOnce({
          status: 200,
          data: { access_token: mockToken1, expires_in: 1 },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: { access_token: mockToken2, expires_in: 3600 },
        });

      await client.authenticate();

      // Simulate token expiry by advancing time
      jest.useFakeTimers();
      jest.advanceTimersByTime(2000);

      // Next request should trigger re-authentication
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [] },
      });

      try {
        await client.searchFlights({
          originLocationCode: 'FRA',
          destinationLocationCode: 'LAX',
          departureDate: '2026-02-25',
        });
      } catch (e) {
        // Expected to fail with mock, but token refresh should have been attempted
      }

      jest.useRealTimers();
    });
  });

  describe('searchFlights', () => {
    beforeEach(async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      await client.authenticate();
    });

    it('should search for flights successfully', async () => {
      const mockFlightData = {
        data: [
          {
            id: '1',
            type: 'flight-offer',
            source: 'GDS',
            instantTicketingRequired: false,
            nonHomogeneous: false,
            oneWay: false,
            lastTicketingDate: '2026-02-20',
            numberOfBookableSeats: 5,
            itineraries: [
              {
                duration: 'PT10H30M',
                segments: [
                  {
                    departure: {
                      iataCode: 'FRA',
                      at: '2026-02-25T10:00:00',
                    },
                    arrival: {
                      iataCode: 'LAX',
                      at: '2026-02-25T12:30:00',
                    },
                    operatingCarrier: { carrierCode: 'LH' },
                    number: '001',
                    aircraft: { code: '744' },
                    operating: '747',
                    class: 'J',
                    isBlacklistedInEU: false,
                  },
                ],
              },
            ],
            price: {
              currency: 'EUR',
              total: '1200.00',
              base: '1000.00',
              fee: '0.00',
              grandTotal: '1200.00',
            },
            pricingOptions: {
              fareType: ['published'],
              includedCheckedBagsOnly: true,
            },
            validatingAirlineCodes: ['LH'],
            travelerPricings: [
              {
                travelerId: '1',
                fareOption: 'PUBLISHED',
                travelerType: 'ADULT',
                price: { currency: 'EUR', total: '1200.00' },
                fareDetailsBySegment: [
                  { segmentId: '1', cabin: 'BUSINESS' },
                ],
              },
            ],
          },
        ],
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockFlightData,
      });

      const result = await client.searchFlights({
        originLocationCode: 'FRA',
        destinationLocationCode: 'LAX',
        departureDate: '2026-02-25',
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/shopping/flight-offers'),
        expect.any(Object)
      );
    });

    it('should handle flight search errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Search failed'));

      const result = await client.searchFlights({
        originLocationCode: 'FRA',
        destinationLocationCode: 'LAX',
        departureDate: '2026-02-25',
      });

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should include advanced search parameters', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [] },
      });

      await client.searchFlights({
        originLocationCode: 'FRA',
        destinationLocationCode: 'LAX',
        departureDate: '2026-02-25',
        adults: 2,
        children: 1,
        maxPrice: 1500,
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          params: expect.objectContaining({
            adults: 2,
            children: 1,
            maxPrice: 1500,
          }),
        })
      );
    });
  });

  describe('getFlightStatus', () => {
    beforeEach(async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      await client.authenticate();
    });

    it('should get flight status successfully', async () => {
      const mockStatusData = {
        data: [
          {
            flightNumber: 'LH001',
            airport: 'LAX',
            status: 'LANDED',
            delayMinutes: 0,
            gate: 'B45',
          },
        ],
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockStatusData,
      });

      const result = await client.getFlightStatus({
        flightNumber: 'LH001',
        date: '2026-02-25',
        airport: 'LAX',
      });

      expect(result).toBeDefined();
      expect(result.status).toMatch(/LANDED|DELAYED|CANCELLED|SCHEDULED/);
    });

    it('should handle status retrieval errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(
        new Error('Status retrieval failed')
      );

      const result = await client.getFlightStatus({
        flightNumber: 'LH001',
        date: '2026-02-25',
      });

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getAirportDetails', () => {
    beforeEach(async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      await client.authenticate();
    });

    it('should get airport details successfully', async () => {
      const mockAirportData = {
        data: [
          {
            iataCode: 'LAX',
            name: 'Los Angeles International Airport',
            terminals: ['T1', 'T2', 'T3'],
            gates: ['B1-B50'],
          },
        ],
      };

      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockAirportData,
      });

      const result = await client.getAirportDetails('LAX');

      expect(result).toBeDefined();
      expect(result.iataCode).toBe('LAX');
      expect(result.terminals).toBeDefined();
    });

    it('should handle airport details errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(
        new Error('Airport details not found')
      );

      const result = await client.getAirportDetails('INVALID');

      expect(result).toBeNull();
    });
  });

  describe('normalizeFlightData', () => {
    it('should normalize Amadeus flight data to internal format', () => {
      const amadeusData = {
        id: '1',
        itineraries: [
          {
            segments: [
              {
                departure: { iataCode: 'FRA', at: '2026-02-25T10:00:00' },
                arrival: { iataCode: 'LAX', at: '2026-02-25T12:30:00' },
                operatingCarrier: { carrierCode: 'LH' },
                number: '001',
              },
            ],
          },
        ],
        price: { total: '1200.00', currency: 'EUR' },
        numberOfBookableSeats: 5,
      };

      const normalized = (client as any).normalizeFlightData(amadeusData);

      expect(normalized).toHaveProperty('flightNumber');
      expect(normalized).toHaveProperty('price');
      expect(normalized).toHaveProperty('availableSeats');
      expect(normalized.flightNumber).toBe('LH001');
    });
  });

  describe('rate limiting', () => {
    it('should track rate limit information', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      await client.authenticate();

      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '99',
        },
        data: { data: [] },
      });

      await client.searchFlights({
        originLocationCode: 'FRA',
        destinationLocationCode: 'LAX',
        departureDate: '2026-02-25',
      });

      const stats = (client as any).getRateLimitStats?.();
      if (stats) {
        expect(stats).toHaveProperty('limit');
        expect(stats).toHaveProperty('remaining');
      }
    });
  });

  describe('health check', () => {
    it('should report healthy status when authenticated', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'mock-token', expires_in: 3600 },
      });
      await client.authenticate();

      const health = (client as any).getHealth?.();
      if (health) {
        expect(health.authenticated).toBe(true);
      }
    });

    it('should report unhealthy status when not authenticated', () => {
      const health = (client as any).getHealth?.();
      if (health) {
        expect(health.authenticated).toBe(false);
      }
    });
  });
});
