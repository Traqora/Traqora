import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { config } from '../config';
import { AppDataSource } from '../db/dataSource';
import { logger } from '../utils/logger';
import {
  ReconciliationSummary,
  reconcileContractBookingStates,
} from '../services/contractBookingReconciliation';
import {
  TypeOrmContractEventSource,
  TypeOrmReconciliationAttemptStore,
  TypeOrmReconciliationBookingStore,
} from '../services/contractBookingReconciliationTypeOrm';
import { createJobLogger } from './jobLogger';

const CRON_EXPRESSION = process.env.CONTRACT_RECONCILIATION_CRON || '0 * * * *';
const RECONCILIATION_LIMIT = Number(
  process.env.CONTRACT_RECONCILIATION_LIMIT || 500,
);

const configuredContractIds = (): string[] =>
  [config.contracts.booking, config.contracts.refund].filter(
    (contractId) => Boolean(contractId) && contractId !== 'DEFAULT_ID',
  );

export const runContractBookingReconciliation = async (): Promise<ReconciliationSummary> => {
  const empty: ReconciliationSummary = {
    scannedEvents: 0,
    candidateBookings: 0,
    mismatches: 0,
    repaired: 0,
    failed: 0,
    unchanged: 0,
    skipped: 0,
    dryRun: false,
  };

  if (!AppDataSource.isInitialized) {
    logger.warn('Skipping contract booking reconciliation; database is not initialized');
    return empty;
  }

  return reconcileContractBookingStates({
    eventSource: new TypeOrmContractEventSource(),
    bookings: new TypeOrmReconciliationBookingStore(),
    attempts: new TypeOrmReconciliationAttemptStore(),
    contractIds: configuredContractIds(),
    limit: Number.isFinite(RECONCILIATION_LIMIT) && RECONCILIATION_LIMIT > 0
      ? Math.floor(RECONCILIATION_LIMIT)
      : 500,
  });
};

/**
 * Hourly (configurable) repair pass for bookings whose persisted state has
 * fallen behind the authoritative on-chain events (#934). Each repair attempt
 * is appended to `contract_reconciliation_attempts`; failures are retried on
 * the next run because the mismatch remains visible.
 */
export class ContractBookingReconciliationJob {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly reconcile: () => Promise<ReconciliationSummary> =
      runContractBookingReconciliation,
  ) {}

  async runNow(): Promise<ReconciliationSummary> {
    if (this.isRunning) {
      logger.warn('Contract booking reconciliation already running; skipping tick');
      return {
        scannedEvents: 0,
        candidateBookings: 0,
        mismatches: 0,
        repaired: 0,
        failed: 0,
        unchanged: 0,
        skipped: 0,
        dryRun: false,
      };
    }

    const log = createJobLogger('contract-booking-reconciliation');
    this.isRunning = true;
    log.start();

    try {
      const summary = await this.reconcile();
      log.complete({ ...summary });
      return summary;
    } catch (error) {
      log.fail({
        step: 'reconcile_contract_bookings',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  start(): void {
    if (this.task) return;

    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.runNow().catch((error) => {
        logger.error('contractBookingReconciliationJob: unhandled error during scheduled run', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }
}

let sharedJob: ContractBookingReconciliationJob | null = null;

export const initContractBookingReconciliationCron =
  (): ContractBookingReconciliationJob => {
    if (!sharedJob) {
      sharedJob = new ContractBookingReconciliationJob();
      sharedJob.start();
    }
    return sharedJob;
  };
