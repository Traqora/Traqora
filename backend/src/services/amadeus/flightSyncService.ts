/**
 * Flight Synchronization Service
 * Main service for synchronizing flight data from multiple airline systems
 * Handles caching, conflict resolution, webhooks, and scheduled syncs
 */

import { getRepository, DataSource } from 'typeorm';
import { logger } from '../../utils/logger';
import { Flight } from '../../db/entities/Flight';
import {
  AirlineFlightData,
  SyncFlightRequest,
  SyncFlightResponse,
  FlightSyncJob,
  SyncError,
  FlightDataConflict,
  IAirlineAdapter,
  AmadeusFlightData,
  CircuitBreakerStatus,
  CircuitBreakerState,
  SyncWebhookPayload,
} from '../../types/flightSync';

/**
 * Circuit Breaker for external API calls
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private threshold: number;
  private resetTimeout: number;

  constructor(threshold: number = 5, resetTimeout: number = 60000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        logger.info('Circuit breaker closed after successful recovery');
      }
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      logger.warn('Circuit breaker opened due to repeated failures', {
        failureCount: this.failureCount,
      });

      // Schedule recovery attempt
      setTimeout(() => {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
        this.successCount = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN state');
      }, this.resetTimeout);
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - service unavailable');
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime:
        this.state === 'OPEN'
          ? new Date(Date.now() + this.resetTimeout)
          : undefined,
    };
  }
}

/**
 * Cache Manager for flight data
 */
export class FlightCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number; // seconds

  interface CacheEntry {
    data: AirlineFlightData | Partial<AirlineFlightData>;
    timestamp: Date;
    expiresAt: Date;
    source: string;
  }

  constructor(ttlSeconds: number = 300) {
    this.ttl = ttlSeconds;
  }

  private getCacheKey(flightNumber: string, date: string, source: string): string {
    return `${flightNumber}:${date}:${source}`;
  }

  set(
    flightNumber: string,
    date: string,
    source: string,
    data: AirlineFlightData | Partial<AirlineFlightData>
  ): void {
    const key = this.getCacheKey(flightNumber, date, source);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttl * 1000);

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt,
      source,
    });
  }

  get(
    flightNumber: string,
    date: string,
    source: string
  ): AirlineFlightData | Partial<AirlineFlightData> | null {
    const key = this.getCacheKey(flightNumber, date, source);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
    logger.info('Flight cache cleared');
  }

  getStats() {
    return {
      size: this.cache.size,
      ttl: this.ttl,
    };
  }
}

/**
 * Main Flight Synchronization Service
 */
export class FlightSynchronizationService {
  private dataSource: DataSource;
  private adapters: Map<string, IAirlineAdapter>;
  private cacheManager: FlightCacheManager;
  private circuitBreaker: CircuitBreaker;
  private conflictResolutionMode: 'MANUAL' | 'AUTOMATIC' | 'PRIORITY' = 'PRIORITY';
  private webhookCallbacks: Set<(payload: SyncWebhookPayload) => void> = new Set();
  private lastSyncJob: FlightSyncJob | null = null;

  constructor(
    dataSource: DataSource,
    adapters: Map<string, IAirlineAdapter>,
    cacheTTL: number = 300
  ) {
    this.dataSource = dataSource;
    this.adapters = adapters;
    this.cacheManager = new FlightCacheManager(cacheTTL);
    this.circuitBreaker = new CircuitBreaker(5, 60000);
  }

  /**
   * Sync a single flight
   */
  async syncFlight(request: SyncFlightRequest): Promise<SyncFlightResponse> {
    try {
      logger.info('Starting flight sync', {
        flightNumber: request.flightNumber,
        airline: request.airline,
      });

      // Fetch data from adapter
      const adapter = this.adapters.get(request.airline);
      if (!adapter) {
        return {
          success: false,
          message: `No adapter found for airline: ${request.airline}`,
          errors: ['Unknown airline'],
        };
      }

      // Get flight data
      const flightData = await this.circuitBreaker.execute(() =>
        adapter.fetchFlightData(request.flightNumber, request.departureDate)
      );

      if (!flightData) {
        return {
          success: false,
          message: `Failed to fetch flight data for ${request.flightNumber}`,
          errors: ['No data from adapter'],
        };
      }

      // Normalize and store
      const flight = await this.upsertFlight(flightData, adapter.airlineCode);

      // Cache the data
      this.cacheManager.set(
        request.flightNumber,
        request.departureDate,
        adapter.airlineCode,
        flightData
      );

      return {
        success: true,
        flightId: flight.id,
        updated: true,
        message: 'Flight synced successfully',
      };
    } catch (error) {
      logger.error('Flight sync failed', {
        error: error instanceof Error ? error.message : String(error),
        request,
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Sync multiple flights (batch)
   */
  async batchSyncFlights(
    requests: SyncFlightRequest[]
  ): Promise<{
    successful: SyncFlightResponse[];
    failed: SyncFlightResponse[];
  }> {
    const job: FlightSyncJob = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'MANUAL_SYNC',
      status: 'RUNNING',
      startTime: new Date(),
      flightsProcessed: 0,
      flightsUpdated: 0,
      errors: [],
    };

    const successful: SyncFlightResponse[] = [];
    const failed: SyncFlightResponse[] = [];

    for (const request of requests) {
      const result = await this.syncFlight(request);
      job.flightsProcessed++;

      if (result.success) {
        successful.push(result);
        job.flightsUpdated++;
      } else {
        failed.push(result);
        job.errors.push({
          flightNumber: request.flightNumber,
          airline: request.airline,
          timestamp: new Date(),
          error: result.errors?.[0] || 'Unknown error',
          source: 'BATCH_SYNC',
        });
      }
    }

    job.status = 'COMPLETED';
    job.endTime = new Date();
    this.lastSyncJob = job;

    logger.info('Batch sync completed', {
      jobId: job.id,
      processed: job.flightsProcessed,
      updated: job.flightsUpdated,
      failed: job.errors.length,
    });

    return { successful, failed };
  }

  /**
   * Resolve conflicts between data sources
   */
  async resolveConflict(conflict: FlightDataConflict): Promise<void> {
    try {
      const flightRepo = this.dataSource.getRepository(Flight);
      const flight = await flightRepo.findOne({ where: { id: conflict.flightId } });

      if (!flight) {
        throw new Error(`Flight not found: ${conflict.flightId}`);
      }

      let resolvedValue = conflict.currentValue;

      if (this.conflictResolutionMode === 'PRIORITY') {
        // Use priority-based resolution (adapters have priority)
        const adapter1Priority = this.adapters.get(conflict.source1)?.priority || 999;
        const adapter2Priority = this.adapters.get(conflict.source2)?.priority || 999;
        resolvedValue = adapter1Priority < adapter2Priority
          ? conflict.currentValue
          : conflict.newValue;
      } else if (this.conflictResolutionMode === 'AUTOMATIC') {
        // Use heuristics for automatic resolution
        resolvedValue = this.resolveConflictAutomatically(
          conflict.field,
          conflict.currentValue,
          conflict.newValue
        );
      }

      // Update flight
      (flight as any)[conflict.field] = resolvedValue;
      flight.syncStatus = 'EXACT_MATCH';
      await flightRepo.save(flight);

      logger.info('Conflict resolved', {
        flightNumber: conflict.flightNumber,
        field: conflict.field,
        resolution: conflict.resolution || 'AUTOMATIC',
      });
    } catch (error) {
      logger.error('Failed to resolve conflict', {
        error: error instanceof Error ? error.message : String(error),
        conflictId: conflict.flightId,
      });
      throw error;
    }
  }

  /**
   * Register webhook callback
   */
  registerWebhookCallback(callback: (payload: SyncWebhookPayload) => void): void {
    this.webhookCallbacks.add(callback);
    logger.info('Webhook callback registered');
  }

  /**
   * Processing webhook from airline
   */
  async processWebhook(payload: any): Promise<void> {
    try {
      logger.info('Processing flight sync webhook', {
        event: payload.event,
        flightNumber: payload.flightNumber,
      });

      // Validate webhook signature if provided
      if (payload.signature) {
        this.validateWebhookSignature(payload);
      }

      // Sync the flight
      const syncResult = await this.syncFlight({
        flightNumber: payload.flightNumber,
        airline: payload.airline,
        departureDate: payload.departureDate,
      });

      if (syncResult.success) {
        // Notify subscribers
        const webhookPayload: SyncWebhookPayload = {
          event: payload.event,
          flight: {
            id: syncResult.flightId!,
            flightNumber: payload.flightNumber,
            airline: payload.airline,
            status: payload.status,
            updatedAt: new Date(),
          },
          changes: payload.changes || {},
          timestamp: new Date(),
          source: 'WEBHOOK',
        };

        for (const callback of this.webhookCallbacks) {
          try {
            callback(webhookPayload);
          } catch (error) {
            logger.error('Webhook callback failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to process webhook', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get sync status
   */
  getLastSyncStatus(): FlightSyncJob | null {
    return this.lastSyncJob;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): CircuitBreakerStatus {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  // ==================== Private Methods ====================

  private async upsertFlight(data: AirlineFlightData, source: string): Promise<Flight> {
    const flightRepo = this.dataSource.getRepository(Flight);

    let flight = await flightRepo.findOne({
      where: {
        flightNumber: data.flightNumber,
        airlineCode: data.airlineCode,
        departureTime: data.scheduledDeparture,
      },
    });

    if (!flight) {
      flight = new Flight();
      flight.flightNumber = data.flightNumber;
      flight.airlineCode = data.airlineCode;
    }

    // Update fields
    const oldValues = { ...flight };

    flight.fromAirport = data.departureAirport;
    flight.toAirport = data.arrivalAirport;
    flight.departureTime = data.scheduledDeparture;
    flight.arrivalTime = data.scheduledArrival;
    flight.status = data.status;
    flight.seatsAvailable = data.seatsAvailable;
    flight.priceCents = data.price;
    flight.gate = data.gate;
    flight.terminal = data.terminal;
    flight.delayMinutes = data.delayMinutes || 0;
    flight.cancellationReason = data.cancellationReason;
    flight.dataSource = source;
    flight.lastSyncedAt = new Date();
    flight.syncAttempts++;
    flight.rawData = data;

    flight = await flightRepo.save(flight);

    // Emit webhook if there were changes
    if (this.hasChanges(oldValues, flight)) {
      this.emitFlightUpdateWebhook(flight, oldValues);
    }

    return flight;
  }

  private hasChanges(oldData: any, newData: Flight): boolean {
    const fields = ['status', 'gate', 'delayMinutes', 'seatsAvailable', 'terminal'];
    return fields.some((field) => oldData[field] !== (newData as any)[field]);
  }

  private emitFlightUpdateWebhook(flight: Flight, previousData: any): void {
    const payload: SyncWebhookPayload = {
      event: this.getEventType(flight),
      flight: {
        id: flight.id,
        flightNumber: flight.flightNumber,
        airline: flight.airlineCode,
        status: flight.status as any,
        delayMinutes: flight.delayMinutes,
        gate: flight.gate,
        updatedAt: new Date(),
      },
      changes: {
        status: { old: previousData.status, new: flight.status },
        gate: { old: previousData.gate, new: flight.gate },
        delayMinutes: { old: previousData.delayMinutes, new: flight.delayMinutes },
      },
      timestamp: new Date(),
      source: flight.dataSource,
    };

    for (const callback of this.webhookCallbacks) {
      try {
        callback(payload);
      } catch (error) {
        logger.error('Webhook callback error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private getEventType(flight: Flight): any {
    if (flight.status === 'CANCELLED') return 'FLIGHT_CANCELLED';
    if (flight.delayMinutes! > 0) return 'FLIGHT_DELAYED';
    if (flight.status === 'GATE_CHANGED') return 'GATE_CHANGED';
    return 'STATUS_CHANGED';
  }

  private validateWebhookSignature(payload: any): void {
    // Implement HMAC validation
    logger.debug('Validating webhook signature');
  }

  private resolveConflictAutomatically(
    field: string,
    value1: any,
    value2: any
  ): any {
    // Simple heuristics
    if (field === 'gate') {
      // Prefer non-empty gate
      return value2 || value1;
    }
    if (field === 'delayMinutes') {
      // Use maximum delay
      return Math.max(value1 || 0, value2 || 0);
    }
    if (field === 'seatsAvailable') {
      // Use minimum seats (conservative estimate)
      return Math.min(value1 || 0, value2 || 0);
    }
    return value1; // Default to first source
  }
}
