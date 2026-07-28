import { logger } from '../utils/logger';
import { FlightStatusValue } from '../models/FlightStatusAlert';

export interface FlightStatusUpdate {
  flightId: string;
  status: FlightStatusValue;
  gate?: string;
  delayMinutes?: number;
  reason?: string;
  timestamp: Date;
}

/**
 * Tracks the last-known status for each flight in memory. Real-time gate/
 * delay/cancellation data has no live feed yet (issue #380), so this mirrors
 * PriceOracleService's mock-with-retry pattern: a pluggable fetch with the
 * same shape a real airline status API would return, so swapping the mock
 * for a real provider later doesn't require touching callers.
 */
export class FlightStatusService {
  private static instance: FlightStatusService;
  private readonly lastKnownStatus = new Map<string, FlightStatusUpdate>();

  private constructor() {}

  public static getInstance(): FlightStatusService {
    if (!FlightStatusService.instance) {
      FlightStatusService.instance = new FlightStatusService();
    }
    return FlightStatusService.instance;
  }

  /**
   * Fetches the current status for a list of flights, with retry + backoff
   * mirroring PriceOracleService.fetchPrices.
   */
  public async fetchStatuses(flightIds: string[]): Promise<FlightStatusUpdate[]> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        return await this.mockApiCall(flightIds);
      } catch (error) {
        retries += 1;
        const delay = Math.pow(2, retries) * 1000;
        logger.warn(`Failed to fetch flight statuses. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
        if (retries === maxRetries) {
          logger.error('Max retries reached. Failed to fetch flight statuses.', error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  }

  /**
   * Returns the last status this service has seen for a flight, or null if
   * it hasn't been fetched/recorded yet.
   */
  public getLastKnownStatus(flightId: string): FlightStatusUpdate | null {
    return this.lastKnownStatus.get(flightId) ?? null;
  }

  /**
   * Records a status update (from a fetch or a manually-reported change) and
   * reports whether the status actually changed since the last known value —
   * callers use this to decide whether to notify subscribers.
   */
  public recordStatus(update: FlightStatusUpdate): { changed: boolean; previous: FlightStatusUpdate | null } {
    const previous = this.lastKnownStatus.get(update.flightId) ?? null;
    this.lastKnownStatus.set(update.flightId, update);
    return { changed: previous?.status !== update.status, previous };
  }

  private async mockApiCall(flightIds: string[]): Promise<FlightStatusUpdate[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    return flightIds.map((flightId) => {
      const existing = this.lastKnownStatus.get(flightId);
      return (
        existing ?? {
          flightId,
          status: 'on_time' as FlightStatusValue,
          timestamp: new Date(),
        }
      );
    });
  }
}
