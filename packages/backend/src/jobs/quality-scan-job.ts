/**
 * Daily data quality scan job — issue #253.
 *
 * Schedules a nightly cron run (configurable via QUALITY_SCAN_CRON, default
 * "0 2 * * *" = 02:00 UTC daily) that calls DataQualityService.scan() over
 * all registered datasets and logs results. Alerts are emitted via logger when
 * quality degrades below the configured threshold.
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { DataQualityService, DataQualityConfig, QualityScanResult } from '../services/analytics/dataQualityService';

export interface DatasetDescriptor {
  name: string;
  config: DataQualityConfig;
  fetch: () => Promise<Record<string, unknown>[]>;
}

const CRON_EXPRESSION = process.env.QUALITY_SCAN_CRON || '0 2 * * *';

export class QualityScanJob {
  private readonly svc: DataQualityService;
  private readonly datasets: DatasetDescriptor[];
  private task: ScheduledTask | null = null;
  readonly lastResults: Map<string, QualityScanResult> = new Map();

  constructor(datasets: DatasetDescriptor[] = [], svc?: DataQualityService) {
    this.datasets = datasets;
    this.svc = svc ?? new DataQualityService();
  }

  /** Run the scan immediately (also called by the cron tick). */
  async runNow(): Promise<void> {
    logger.info('quality-scan-job: starting scan', { datasets: this.datasets.map((d) => d.name) });
    for (const descriptor of this.datasets) {
      try {
        const records = await descriptor.fetch();
        const result = this.svc.scan(records, descriptor.config);
        this.lastResults.set(descriptor.name, result);
        logger.info('quality-scan-job: scan complete', {
          dataset: descriptor.name,
          qualityScore: result.qualityScore,
          violations: result.violations.length,
          duplicates: result.duplicates.length,
          staleFields: result.staleFields,
        });
        const alerts = this.svc.getAlerts();
        if (alerts.length > 0) {
          logger.warn('quality-scan-job: quality degradation alert', { dataset: descriptor.name, alerts });
          this.svc.clearAlerts();
        }
      } catch (err) {
        logger.error('quality-scan-job: scan failed', { dataset: descriptor.name, err });
      }
    }
  }

  /** Start the scheduled cron job. Call once at application startup. */
  start(): void {
    if (this.task) return;
    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.runNow().catch((err) => logger.error('quality-scan-job: unhandled error', { err }));
    });
    logger.info('quality-scan-job: scheduled', { cron: CRON_EXPRESSION });
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }
}
