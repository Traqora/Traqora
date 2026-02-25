/**
 * Airline Adapters
 * Implements adapter pattern for multiple airline systems
 */

import { logger } from '../../utils/logger';
import {
  IAirlineAdapter,
  AirlineFlightData,
  FlightStatus as FlightStatusType,
} from '../../types/flightSync';

/**
 * Base Airline Adapter
 * Abstract base class for airline-specific implementations
 */
export abstract class BaseAirlineAdapter implements IAirlineAdapter {
  abstract airlineCode: string;
  abstract name: string;
  abstract priority: number;

  protected apiEndpoint: string = '';
  protected apiKey: string = '';
  protected timeout: number = 30000;

  constructor(apiKey: string, endpoint?: string) {
    this.apiKey = apiKey;
    if (endpoint) {
      this.apiEndpoint = endpoint;
    }
  }

  /**
   * Template method - implemented by subclasses
   */
  abstract fetchFlightData(
    flightNumber: string,
    departureDate: string
  ): Promise<AirlineFlightData | null>;

  abstract fetchFlights(filters: {
    airline?: string;
    flightPattern?: string;
    date?: string;
  }): Promise<AirlineFlightData[]>;

  abstract fetchFlightStatus(
    flightNumber: string,
    departureDate: string
  ): Promise<Partial<AirlineFlightData> | null>;

  abstract healthCheck(): Promise<boolean>;

  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      apiEndpoint: this.apiEndpoint,
    };
  }

  protected logRequest(method: string, params: Record<string, any>) {
    logger.debug(`${this.name} API request`, {
      airline: this.airlineCode,
      method,
      params,
    });
  }

  protected logError(method: string, error: Error, params?: Record<string, any>) {
    logger.error(`${this.name} API error`, {
      airline: this.airlineCode,
      method,
      error: error.message,
      params,
    });
  }
}

/**
 * Lufthansa Adapter
 * Integrates with Lufthansa API
 */
export class LufthansaAdapter extends BaseAirlineAdapter {
  airlineCode = 'LH';
  name = 'Lufthansa';
  priority = 1; // High priority

  constructor(apiKey: string) {
    super(apiKey, 'https://api.lufthansa.com/v1');
  }

  async fetchFlightData(
    flightNumber: string,
    departureDate: string
  ): Promise<AirlineFlightData | null> {
    this.logRequest('fetchFlightData', { flightNumber, departureDate });

    try {
      // Simulated API call - in production would use actual API
      const mockData: AirlineFlightData = {
        flightNumber,
        airlineCode: this.airlineCode,
        departureAirport: 'FRA',
        arrivalAirport: 'JFK',
        scheduledDeparture: new Date(departureDate),
        scheduledArrival: new Date(new Date(departureDate).getTime() + 10 * 3600000),
        status: 'SCHEDULED',
        gate: 'A12',
        terminal: '1',
        aircraft: '350',
        capacity: 290,
        seatsAvailable: 45,
        price: 85000,
        priceCurrency: 'EUR',
      };

      return mockData;
    } catch (error) {
      this.logError('fetchFlightData', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async fetchFlights(filters: {
    airline?: string;
    flightPattern?: string;
    date?: string;
  }): Promise<AirlineFlightData[]> {
    this.logRequest('fetchFlights', filters);

    try {
      // Return mock data
      return [
        {
          flightNumber: 'LH001',
          airlineCode: this.airlineCode,
          departureAirport: 'FRA',
          arrivalAirport: 'JFK',
          scheduledDeparture: new Date(),
          scheduledArrival: new Date(Date.now() + 10 * 3600000),
          status: 'SCHEDULED',
          gate: 'A12',
          terminal: '1',
          aircraft: '350',
          capacity: 290,
          seatsAvailable: 45,
          price: 85000,
          priceCurrency: 'EUR',
        },
      ];
    } catch (error) {
      this.logError('fetchFlights', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async fetchFlightStatus(
    flightNumber: string,
    departureDate: string
  ): Promise<Partial<AirlineFlightData> | null> {
    this.logRequest('fetchFlightStatus', { flightNumber, departureDate });

    try {
      return {
        status: 'SCHEDULED' as FlightStatusType,
        gate: 'A12',
        delayMinutes: 0,
      };
    } catch (error) {
      this.logError('fetchFlightStatus', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simulate health check
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Air France Adapter
 */
export class AirFranceAdapter extends BaseAirlineAdapter {
  airlineCode = 'AF';
  name = 'Air France';
  priority = 2;

  constructor(apiKey: string) {
    super(apiKey, 'https://api.airfrance.com/v1');
  }

  async fetchFlightData(
    flightNumber: string,
    departureDate: string
  ): Promise<AirlineFlightData | null> {
    this.logRequest('fetchFlightData', { flightNumber, departureDate });

    try {
      const mockData: AirlineFlightData = {
        flightNumber,
        airlineCode: this.airlineCode,
        departureAirport: 'CDG',
        arrivalAirport: 'LAX',
        scheduledDeparture: new Date(departureDate),
        scheduledArrival: new Date(new Date(departureDate).getTime() + 11 * 3600000),
        status: 'SCHEDULED',
        gate: 'K23',
        terminal: '2E',
        aircraft: '77W',
        capacity: 350,
        seatsAvailable: 28,
        price: 92000,
        priceCurrency: 'EUR',
      };

      return mockData;
    } catch (error) {
      this.logError('fetchFlightData', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async fetchFlights(filters: {
    airline?: string;
    flightPattern?: string;
    date?: string;
  }): Promise<AirlineFlightData[]> {
    this.logRequest('fetchFlights', filters);

    try {
      return [
        {
          flightNumber: 'AF206',
          airlineCode: this.airlineCode,
          departureAirport: 'CDG',
          arrivalAirport: 'LAX',
          scheduledDeparture: new Date(),
          scheduledArrival: new Date(Date.now() + 11 * 3600000),
          status: 'SCHEDULED',
          gate: 'K23',
          terminal: '2E',
          aircraft: '77W',
          capacity: 350,
          seatsAvailable: 28,
          price: 92000,
          priceCurrency: 'EUR',
        },
      ];
    } catch (error) {
      this.logError('fetchFlights', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async fetchFlightStatus(
    flightNumber: string,
    departureDate: string
  ): Promise<Partial<AirlineFlightData> | null> {
    this.logRequest('fetchFlightStatus', { flightNumber, departureDate });

    try {
      return {
        status: 'SCHEDULED' as FlightStatusType,
        gate: 'K23',
        delayMinutes: 0,
      };
    } catch (error) {
      this.logError('fetchFlightStatus', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * British Airways Adapter
 */
export class BritishAirwaysAdapter extends BaseAirlineAdapter {
  airlineCode = 'BA';
  name = 'British Airways';
  priority = 3;

  constructor(apiKey: string) {
    super(apiKey, 'https://api.britishairways.com/v1');
  }

  async fetchFlightData(
    flightNumber: string,
    departureDate: string
  ): Promise<AirlineFlightData | null> {
    this.logRequest('fetchFlightData', { flightNumber, departureDate });

    try {
      const mockData: AirlineFlightData = {
        flightNumber,
        airlineCode: this.airlineCode,
        departureAirport: 'LHR',
        arrivalAirport: 'SFO',
        scheduledDeparture: new Date(departureDate),
        scheduledArrival: new Date(new Date(departureDate).getTime() + 10.5 * 3600000),
        status: 'SCHEDULED',
        gate: 'A5',
        terminal: '3',
        aircraft: '789',
        capacity: 326,
        seatsAvailable: 18,
        price: 78000,
        priceCurrency: 'GBP',
      };

      return mockData;
    } catch (error) {
      this.logError('fetchFlightData', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async fetchFlights(filters: {
    airline?: string;
    flightPattern?: string;
    date?: string;
  }): Promise<AirlineFlightData[]> {
    this.logRequest('fetchFlights', filters);

    try {
      return [
        {
          flightNumber: 'BA112',
          airlineCode: this.airlineCode,
          departureAirport: 'LHR',
          arrivalAirport: 'SFO',
          scheduledDeparture: new Date(),
          scheduledArrival: new Date(Date.now() + 10.5 * 3600000),
          status: 'SCHEDULED',
          gate: 'A5',
          terminal: '3',
          aircraft: '789',
          capacity: 326,
          seatsAvailable: 18,
          price: 78000,
          priceCurrency: 'GBP',
        },
      ];
    } catch (error) {
      this.logError('fetchFlights', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async fetchFlightStatus(
    flightNumber: string,
    departureDate: string
  ): Promise<Partial<AirlineFlightData> | null> {
    this.logRequest('fetchFlightStatus', { flightNumber, departureDate });

    try {
      return {
        status: 'SCHEDULED' as FlightStatusType,
        gate: 'A5',
        delayMinutes: 0,
      };
    } catch (error) {
      this.logError('fetchFlightStatus', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Adapter Registry
 * Manages all airline adapters
 */
export class AirlineAdapterRegistry {
  private adapters: Map<string, IAirlineAdapter> = new Map();

  register(adapter: IAirlineAdapter): void {
    this.adapters.set(adapter.airlineCode, adapter);
    logger.info(`Airline adapter registered: ${adapter.name} (${adapter.airlineCode})`);
  }

  getAdapter(airlineCode: string): IAirlineAdapter | undefined {
    return this.adapters.get(airlineCode);
  }

  getAllAdapters(): IAirlineAdapter[] {
    return Array.from(this.adapters.values()).sort((a, b) => a.priority - b.priority);
  }

  hasAdapter(airlineCode: string): boolean {
    return this.adapters.has(airlineCode);
  }

  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }
}
