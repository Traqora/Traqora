/**
 * Amadeus API Client
 * Handles authentication and API calls to Amadeus flight data endpoints
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import {
  AmadeusFlightData,
  AmadeusFlightStatus,
  AirlineFlightData,
  FlightStatus,
} from '../types/flightSync';

interface AmadeusConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  timeout?: number;
}

interface AmadeusTokenResponse {
  type: string;
  username: string;
  application_name: string;
  client_id: string;
  token_type: string;
  access_token: string;
  expires_in: number;
  scope: string;
  state: string;
}

export class AmadeusAnalyticsClient {
  private axiosInstance: AxiosInstance;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private baseUrl: string;
  private requestCount: number = 0;
  private rateLimitRemaining: number = -1;

  constructor(config: AmadeusConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.baseUrl = config.baseUrl || 'https://test.api.amadeus.com';

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 30000,
    });

    // Add response interceptor to track rate limiting
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.rateLimitRemaining = parseInt(
          response.headers['x-ratelimit-remaining'] || '-1',
          10
        );
        return response;
      },
      (error) => Promise.reject(error)
    );
  }

  /**
   * Authenticate and get access token
   */
  async authenticate(): Promise<string> {
    try {
      // Return existing token if still valid
      if (this.accessToken && Date.now() < this.tokenExpiresAt) {
        return this.accessToken;
      }

      const response = await axios.post<AmadeusTokenResponse>(
        `${this.baseUrl}/v1/security/oauth2/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry 5 minutes before actual expiry
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;

      logger.info('Amadeus authentication successful', {
        expiresIn: response.data.expires_in,
      });

      return this.accessToken;
    } catch (error) {
      logger.error('Amadeus authentication failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to authenticate with Amadeus');
    }
  }

  /**
   * Search for flights
   */
  async searchFlights(params: {
    originLocationCode: string;
    destinationLocationCode: string;
    departureDate: string;
    adults: number;
    max?: number;
  }): Promise<AmadeusFlightData[]> {
    try {
      const token = await this.authenticate();

      const response = await this.axiosInstance.get<{
        data: AmadeusFlightData[];
        dictionaries?: Record<string, any>;
      }>('/v2/shopping/flight-offers', {
        params: {
          originLocationCode: params.originLocationCode,
          destinationLocationCode: params.destinationLocationCode,
          departureDate: params.departureDate,
          adults: params.adults,
          max: params.max || 50,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.requestCount++;
      logger.debug('Amadeus flight search successful', {
        origin: params.originLocationCode,
        destination: params.destinationLocationCode,
        resultCount: response.data.data?.length || 0,
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Amadeus flight search failed', {
        error: error instanceof AxiosError ? error.message : String(error),
        params,
      });
      return [];
    }
  }

  /**
   * Get flight status
   */
  async getFlightStatus(params: {
    carrierCode: string;
    flightNumber: string;
    scheduledDepartureDate: string;
  }): Promise<AmadeusFlightStatus | null> {
    try {
      const token = await this.authenticate();

      const response = await this.axiosInstance.get<{
        data: AmadeusFlightStatus[];
      }>('/v2/schedule/flights', {
        params: {
          carrierCode: params.carrierCode,
          flightNumber: params.flightNumber,
          scheduledDepartureDate: params.scheduledDepartureDate,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.requestCount++;

      if (response.data.data && response.data.data.length > 0) {
        logger.debug('Amadeus flight status retrieved', {
          flightNumber: params.flightNumber,
          status: response.data.data[0].operationalStatus,
        });
        return response.data.data[0];
      }

      return null;
    } catch (error) {
      logger.error('Amadeus flight status request failed', {
        error: error instanceof AxiosError ? error.message : String(error),
        params,
      });
      return null;
    }
  }

  /**
   * Get airport details (for terminal, gate information)
   */
  async getAirportDetails(airportCode: string): Promise<Record<string, any> | null> {
    try {
      const token = await this.authenticate();

      const response = await this.axiosInstance.get('/v1/reference-data/locations', {
        params: {
          subType: 'AIRPORT',
          keyword: airportCode,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.requestCount++;
      return response.data.data?.[0] || null;
    } catch (error) {
      logger.error('Amadeus airport details request failed', {
        error: error instanceof AxiosError ? error.message : String(error),
        airportCode,
      });
      return null;
    }
  }

  /**
   * Batch process flight offers to normalized format
   */
  normalizeFlightData(amadeusData: AmadeusFlightData): AirlineFlightData | null {
    try {
      if (!amadeusData.itineraries || amadeusData.itineraries.length === 0) {
        return null;
      }

      const outboundItinerary = amadeusData.itineraries[0];
      const firstSegment = outboundItinerary.segments[0];

      if (!firstSegment) return null;

      const departureTime = new Date(firstSegment.departure.at);
      const arrivalTime = new Date(firstSegment.arrival.at);
      const priceInCents = Math.round(
        parseFloat(amadeusData.price.grandTotal) * 100
      );

      return {
        flightNumber: firstSegment.number,
        airlineCode: firstSegment.operatingAirline.carrierCode,
        departureAirport: firstSegment.departure.iataCode,
        arrivalAirport: firstSegment.arrival.iataCode,
        scheduledDeparture: departureTime,
        scheduledArrival: arrivalTime,
        status: 'SCHEDULED' as FlightStatus,
        gate: firstSegment.departure.terminal || undefined,
        terminal: firstSegment.departure.terminal || undefined,
        aircraft: firstSegment.aircraft.code,
        capacity: amadeusData.numberOfBookableSeats * 2, // Estimate
        seatsAvailable: amadeusData.numberOfBookableSeats,
        price: priceInCents,
        priceCurrency: amadeusData.price.currency,
      };
    } catch (error) {
      logger.error('Failed to normalize Amadeus flight data', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const token = await this.authenticate();
      return !!token;
    } catch {
      return false;
    }
  }

  /**
   * Get analytics
   */
  getAnalytics() {
    return {
      requestCount: this.requestCount,
      rateLimitRemaining: this.rateLimitRemaining,
      hasValidToken: this.accessToken !== null && Date.now() < this.tokenExpiresAt,
    };
  }
}
