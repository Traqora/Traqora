import { logger } from '../utils/logger';

export interface WorkerJob {
  id: string;
  name: string;
  execute(): Promise<void>;
}

export interface WorkerOptions {
  shutdownTimeoutMs?: number;
}

export class WorkerManager {
  private activeJobs: Set<Promise<void>> = new Set();
  private isShuttingDown: boolean = false;
  private shutdownTimeoutMs: number;

  constructor(options: WorkerOptions = {}) {
    this.shutdownTimeoutMs = options.shutdownTimeoutMs || 10000;
  }

  public async registerAndExecute(job: WorkerJob): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn(`Worker is shutting down. Rejecting new job: ${job.name} (${job.id})`);
      throw new Error('Worker is shutting down');
    }

    const jobPromise = (async () => {
      try {
        await job.execute();
      } catch (error) {
        logger.error(`Job execution failed for ${job.name} (${job.id})`, { error });
        throw error;
      } finally {
        this.activeJobs.delete(jobPromise);
      }
    })();

    this.activeJobs.add(jobPromise);
    return jobPromise;
  }

  public async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;
    logger.info(`Initiating graceful worker shutdown. Active jobs: ${this.activeJobs.size}`);

    if (this.activeJobs.size === 0) {
      logger.info('No active jobs. Worker shutdown complete.');
      return;
    }

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn(`Graceful shutdown timeout (${this.shutdownTimeoutMs}ms) reached with ${this.activeJobs.size} active jobs remaining. Forcing shutdown.`);
        resolve();
      }, this.shutdownTimeoutMs);
    });

    await Promise.race([
      Promise.allSettled(Array.from(this.activeJobs)),
      timeoutPromise,
    ]);

    logger.info('Worker shutdown sequence finished.');
  }

  public getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  public getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }
}

export const defaultWorkerManager = new WorkerManager();

export function setupWorkerSignalHandlers(manager: WorkerManager = defaultWorkerManager): void {
  const handleSignal = async (signal: string) => {
    logger.info(`Received signal ${signal}. Starting graceful worker shutdown...`);
    try {
      await manager.gracefulShutdown();
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful worker shutdown', { error: err });
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('SIGINT', () => handleSignal('SIGINT'));
}
