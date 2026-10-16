/**
 * Cache warming job (issue #335) — periodically pre-populates the flight
 * search cache for the most frequently searched routes, so the first user
 * to search a popular route after a cache miss/expiry doesn't pay the full
 * provider-lookup latency.
 *
 * "Frequent" is derived from real usage recorded in search_history_entries
 * (recent window, configurable via CACHE_WARMING_LOOKBACK_HOURS) rather than
 * a hardcoded route list, so warming tracks actual traffic patterns.
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { AppDataSource } from '../db/dataSource';
import { SearchHistoryEntry } from '../db/entities/SearchHistoryEntry';
import { FlightSearchService, createDefaultFlightSearchService } from '../services/flightSearchService';
import { FlightSearchCriteria } from '../types/flight';
import { logger } from '../utils/logger';
import { createJobLogger } from './jobLogger';

const CRON_EXPRESSION = process.env.CACHE_WARMING_CRON || '*/30 * * * *';
const LOOKBACK_HOURS = Number.parseInt(process.env.CACHE_WARMING_LOOKBACK_HOURS || '24', 10);
const TOP_N = Number.parseInt(process.env.CACHE_WARMING_TOP_N || '20', 10);

interface FrequentRoute {
  fromAirport: string;
  toAirport: string;
  departureDate: string;
  passengers: number;
  cabinClass: FlightSearchCriteria['travelClass'];
  searchCount: number;
}

export class CacheWarmingJob {
  private readonly flightSearchService: FlightSearchService;
  private task: ScheduledTask | null = null;

  constructor(flightSearchService?: FlightSearchService) {
    this.flightSearchService = flightSearchService ?? createDefaultFlightSearchService();
  }

  /** Finds the top-N most-searched (route, date, passengers, cabin) combinations in the lookback window. */
  async findFrequentRoutes(): Promise<FrequentRoute[]> {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

    const rows = await AppDataSource.getRepository(SearchHistoryEntry)
      .createQueryBuilder('entry')
      .select('entry.fromAirport', 'fromAirport')
      .addSelect('entry.toAirport', 'toAirport')
      .addSelect('entry.departureDate', 'departureDate')
      .addSelect('entry.passengers', 'passengers')
      .addSelect('entry.cabinClass', 'cabinClass')
      .addSelect('COUNT(*)', 'searchCount')
      .where('entry.createdAt >= :since', { since })
      .andWhere('entry.departureDate >= :today', { today: new Date().toISOString().slice(0, 10) })
      .groupBy('entry.fromAirport')
      .addGroupBy('entry.toAirport')
      .addGroupBy('entry.departureDate')
      .addGroupBy('entry.passengers')
      .addGroupBy('entry.cabinClass')
      .orderBy('"searchCount"', 'DESC')
      .limit(TOP_N)
      .getRawMany<{
        fromAirport: string;
        toAirport: string;
        departureDate: string;
        passengers: number | string;
        cabinClass: FlightSearchCriteria['travelClass'];
        searchCount: string;
      }>();

    return rows.map((row) => ({
      fromAirport: row.fromAirport,
      toAirport: row.toAirport,
      departureDate: row.departureDate,
      passengers: Number(row.passengers),
      cabinClass: row.cabinClass,
      searchCount: Number(row.searchCount),
    }));
  }

  /** Runs one warming pass immediately (also invoked by the cron tick). */
  async runNow(): Promise<{ warmed: number; failed: number }> {
    const log = createJobLogger('cache-warming');
    log.start();

    let warmed = 0;
    let failed = 0;

    let routes: FrequentRoute[];
    try {
      routes = await this.findFrequentRoutes();
    } catch (err) {
      log.fail({
        step: 'load_frequent_routes',
        error: err instanceof Error ? err.message : String(err),
      });
      return { warmed, failed };
    }
    log.step('load_frequent_routes', { candidates: routes.length });

    for (const route of routes) {
      const criteria: FlightSearchCriteria = {
        from: route.fromAirport,
        to: route.toAirport,
        date: route.departureDate,
        passengers: route.passengers,
        travelClass: route.cabinClass,
        sortBy: 'price',
        pageSize: 20,
      };

      try {
        // searchFlights() itself checks the cache first and writes through
        // on a miss, so this both avoids duplicate work when already warm
        // and populates the cache exactly the way a real request would.
        await this.flightSearchService.searchFlights(criteria);
        warmed += 1;
      } catch (err) {
        failed += 1;
        log.step('warm_route', {
          outcome: 'failure',
          from: route.fromAirport,
          to: route.toAirport,
          date: route.departureDate,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.complete({ warmed, failed, candidates: routes.length });
    return { warmed, failed };
  }

  start(): void {
    if (this.task) {
      return;
    }
    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.runNow().catch((err) => {
        logger.error('cacheWarmingJob: unhandled error during scheduled run', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }
}

let sharedJob: CacheWarmingJob | null = null;

export const initCacheWarmingCron = (): CacheWarmingJob => {
  if (!sharedJob) {
    sharedJob = new CacheWarmingJob();
    sharedJob.start();
  }
  return sharedJob;
};
