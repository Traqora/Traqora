/**
 * Flight Sync Job Scheduler
 * Handles scheduled flight synchronization jobs (every 15 minutes)
 * Uses node-cron for scheduling
 */

import cron from 'node-cron';
import { logger } from '../../utils/logger';
import { FlightSynchronizationService } from './flightSyncService';
import { SyncFlightRequest } from '../../types/flightSync';
import { DataSource } from 'typeorm';
import { Flight } from '../../db/entities/Flight';

interface ScheduledSyncConfig {
  enabled: boolean;
  intervalCron: string; // Cron expression
  batchSize: number;
  prioritizeActive: boolean; // Prioritize flights departing soon
}

export class FlightSyncScheduler {
  private syncService: FlightSynchronizationService;
  private dataSource: DataSource;
  private isRunning: boolean = false;
  private lastRun?: Date;
  private nextRun?: Date;
  private cronJob?: cron.ScheduledTask;
  private config: ScheduledSyncConfig;
  private syncStats = {
    totalRuns: 0,
    totalFlightsSynced: 0,
    totalFailures: 0,
    averageDuration: 0,
  };

  constructor(
    syncService: FlightSynchronizationService,
    dataSource: DataSource,
    config?: Partial<ScheduledSyncConfig>
  ) {
    this.syncService = syncService;
    this.dataSource = dataSource;
    this.config = {
      enabled: true,
      intervalCron: '*/15 * * * *', // Every 15 minutes
      batchSize: 100,
      prioritizeActive: true,
      ...config,
    };
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Flight sync scheduler is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Flight sync scheduler is disabled');
      return;
    }

    this.cronJob = cron.schedule(this.config.intervalCron, async () => {
      await this.runSync();
    });

    this.isRunning = true;
    logger.info('Flight sync scheduler started', {
      interval: this.config.intervalCron,
    });
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      logger.info('Flight sync scheduler stopped');
    }
  }

  /**
   * Manually trigger sync
   */
  async runSync(): Promise<void> {
    if (this.isRunning) {
      logger.info('Sync already in progress, skipping scheduled run');
      return;
    }

    const startTime = Date.now();
    this.isRunning = true;
    this.lastRun = new Date();
    this.nextRun = new Date(this.lastRun.getTime() + 15 * 60 * 1000);

    try {
      logger.info('Starting scheduled flight sync');

      // Get flights that need syncing
      const flights = await this.getFlightsToSync();

      if (flights.length === 0) {
        logger.info('No flights to sync');
        this.isRunning = false;
        return;
      }

      // Create sync requests
      const requests: SyncFlightRequest[] = flights.map((flight) => ({
        flightNumber: flight.flightNumber,
        airline: flight.airlineCode,
        departureDate: new Date(flight.departureTime)
          .toISOString()
          .split('T')[0],
        departureAirport: flight.fromAirport,
        arrivalAirport: flight.toAirport,
      }));

      // Sync flights in batches
      const batchSize = this.config.batchSize;
      let totalSynced = 0;
      let totalFailed = 0;

      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);

        try {
          const result = await this.syncService.batchSyncFlights(batch);
          totalSynced += result.successful.length;
          totalFailed += result.failed.length;

          logger.debug('Batch sync completed', {
            batchNumber: Math.floor(i / batchSize) + 1,
            successful: result.successful.length,
            failed: result.failed.length,
          });
        } catch (error) {
          logger.error('Batch sync failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          totalFailed += batch.length;
        }
      }

      // Update stats
      const duration = Date.now() - startTime;
      this.syncStats.totalRuns++;
      this.syncStats.totalFlightsSynced += totalSynced;
      this.syncStats.totalFailures += totalFailed;
      this.syncStats.averageDuration = (
        (this.syncStats.averageDuration * (this.syncStats.totalRuns - 1) +
          duration) /
        this.syncStats.totalRuns
      );

      logger.info('Scheduled flight sync completed', {
        totalRecords: flights.length,
        synced: totalSynced,
        failed: totalFailed,
        duration: `${duration}ms`,
        averageDuration: `${this.syncStats.averageDuration.toFixed(2)}ms`,
      });
    } catch (error) {
      logger.error('Scheduled flight sync failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get flights that need syncing
   */
  private async getFlightsToSync(): Promise<Flight[]> {
    try {
      const flightRepo = this.dataSource.getRepository(Flight);
      const now = new Date();

      // Get flights departing in the next 7 days that haven't been synced recently
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      let query = flightRepo
        .createQueryBuilder('flight')
        .where('flight.departureTime BETWEEN :now AND :endDate', {
          now,
          endDate: sevenDaysFromNow,
        })
        .andWhere(
          'flight.lastSyncedAt IS NULL OR flight.lastSyncedAt < :thirtyMinutesAgo',
          {
            thirtyMinutesAgo,
          }
        )
        .andWhere('flight.status != :cancelled', { cancelled: 'CANCELLED' });

      // Prioritize active flights (departing soon)
      if (this.config.prioritizeActive) {
        query = query
          .orderBy('flight.departureTime', 'ASC')
          .addOrderBy('flight.status', 'ASC'); // DELAYED flights first
      }

      query = query.limit(this.config.batchSize * 10); // Fetch enough for several batches

      const flights = await query.getMany();
      return flights;
    } catch (error) {
      logger.error('Failed to get flights for sync', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      stats: this.syncStats,
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(config: Partial<ScheduledSyncConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // Restart if interval changed
    if (oldConfig.intervalCron !== this.config.intervalCron && this.isRunning) {
      this.stop();
      this.start();
    }

    logger.info('Flight sync scheduler configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.syncStats = {
      totalRuns: 0,
      totalFlightsSynced: 0,
      totalFailures: 0,
      averageDuration: 0,
    };
    logger.info('Sync statistics reset');
  }
}
