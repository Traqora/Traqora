/**
 * Flight status polling job (issue #332) — periodically re-fetches status
 * for every flight with at least one active alert, and notifies subscribers
 * for anything that changed since the last known status.
 *
 * FlightStatusService.fetchStatuses() is still the mock/echo implementation
 * described in its own docstring (no live airline status feed integrated
 * yet), so this job's near-term value is as a catch-up/safety-net path — a
 * status recorded through some other route (e.g. an ops tool calling
 * recordStatus directly) still reaches subscribers even if /report was
 * never called for it — and as the place a real provider gets plugged in
 * later without touching callers.
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import FlightStatusAlert from '../models/FlightStatusAlert';
import { FlightStatusService } from '../services/FlightStatusService';
import { notifyFlightStatusChange } from '../services/flightStatusNotifier';
import { logger } from '../utils/logger';

const CRON_EXPRESSION = process.env.FLIGHT_STATUS_POLLING_CRON || '*/5 * * * *';

export class FlightStatusPollingJob {
  private readonly statusService: FlightStatusService;
  private task: ScheduledTask | null = null;

  constructor(statusService?: FlightStatusService) {
    this.statusService = statusService ?? FlightStatusService.getInstance();
  }

  /** Runs one polling pass immediately (also invoked by the cron tick). */
  async runNow(): Promise<{ polled: number; changed: number; notified: number }> {
    let flightIds: string[];
    try {
      flightIds = await FlightStatusAlert.distinct('flightId', { isActive: true }).exec();
    } catch (err) {
      logger.error('flightStatusPollingJob: failed to load actively-followed flights', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { polled: 0, changed: 0, notified: 0 };
    }

    if (flightIds.length === 0) {
      return { polled: 0, changed: 0, notified: 0 };
    }

    let changed = 0;
    let notified = 0;

    let updates;
    try {
      updates = await this.statusService.fetchStatuses(flightIds);
    } catch (err) {
      logger.error('flightStatusPollingJob: fetchStatuses failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { polled: flightIds.length, changed: 0, notified: 0 };
    }

    for (const update of updates) {
      const { changed: didChange } = this.statusService.recordStatus(update);
      if (!didChange) continue;

      changed += 1;
      try {
        const { notifiedCount } = await notifyFlightStatusChange(update);
        notified += notifiedCount;
      } catch (err) {
        logger.warn('flightStatusPollingJob: failed to notify subscribers', {
          flightId: update.flightId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('flightStatusPollingJob: pass complete', { polled: flightIds.length, changed, notified });
    return { polled: flightIds.length, changed, notified };
  }

  start(): void {
    if (this.task) {
      return;
    }
    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.runNow().catch((err) => {
        logger.error('flightStatusPollingJob: unhandled error during scheduled run', {
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

let sharedJob: FlightStatusPollingJob | null = null;

export const initFlightStatusPollingCron = (): FlightStatusPollingJob => {
  if (!sharedJob) {
    sharedJob = new FlightStatusPollingJob();
    sharedJob.start();
  }
  return sharedJob;
};
