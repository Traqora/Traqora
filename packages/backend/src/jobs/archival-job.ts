/**
 * Daily archival job — issue #246.
 *
 * Schedules a nightly cron run (configurable via ARCHIVAL_JOB_CRON, default
 * "0 3 * * *" = 03:00 UTC daily) that feeds registered live datasets through
 * DataRetentionService and reports archived/purged counts.
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { DataRetentionService, DataType } from '../services/analytics/dataRetentionService';

export interface LiveDataset {
  dataType: DataType;
  records: Array<{ id: string; createdAt: Date; [key: string]: unknown }>;
}

const CRON_EXPRESSION = process.env.ARCHIVAL_JOB_CRON || '0 3 * * *';

export class ArchivalJob {
  private readonly svc: DataRetentionService;
  private readonly datasets: LiveDataset[];
  private task: ScheduledTask | null = null;

  constructor(datasets: LiveDataset[] = [], svc?: DataRetentionService) {
    this.datasets = datasets;
    this.svc = svc ?? new DataRetentionService();
  }

  /** Run the archival pass immediately (also called by the cron tick). */
  async runNow(): Promise<void> {
    logger.info('archival-job: starting', { datasets: this.datasets.map((d) => d.dataType) });
    for (const dataset of this.datasets) {
      try {
        const result = this.svc.processDataType(dataset.dataType, dataset.records);
        logger.info('archival-job: processed', result);
      } catch (err) {
        logger.error('archival-job: failed', { dataType: dataset.dataType, err });
      }
    }
    logger.info('archival-job: done', { archiveSize: this.svc.archiveSize() });
  }

  /** Start the scheduled cron job. Call once at application startup. */
  start(): void {
    if (this.task) return;
    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.runNow().catch((err) => logger.error('archival-job: unhandled error', { err }));
    });
    logger.info('archival-job: scheduled', { cron: CRON_EXPRESSION });
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }

  getService(): DataRetentionService {
    return this.svc;
  }
}
