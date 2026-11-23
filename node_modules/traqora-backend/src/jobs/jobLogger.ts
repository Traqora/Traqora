/**
 * Structured logging helper for background jobs (issue #594).
 *
 * Every job in `packages/backend/src/jobs` emits machine-parseable JSON log
 * lines with a stable set of fields so Loki queries can analyse failures:
 *
 *   - `job`       : stable job name (e.g. "cache-warming")
 *   - `jobId`     : unique id for one invocation of the job (a uuid for cron
 *                   runs, or the queue's job id for Bull/Redis-queue jobs so
 *                   retries of the same unit of work share an id)
 *   - `step`      : where in the job lifecycle the event happened
 *                   ("start", a named step, "complete", "failed")
 *   - `durationMs`: milliseconds elapsed since this run started
 *   - `outcome`   : "success" | "failure" (present on terminal events)
 *   - `error`     : human-readable error message (present on failures)
 *
 * Example Loki query:
 *
 *   {job="traqora-backend"} | json | job="cache-warming" | outcome="failure"
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

export interface JobLogMeta {
  [key: string]: unknown;
}

export interface JobLogger {
  /** Stable job name. */
  readonly job: string;
  /** Unique id for this run. Pass a stable id (e.g. a queue job id) to group retries. */
  readonly jobId: string;
  /** Emit the "start" event for the run. */
  start(meta?: JobLogMeta): void;
  /** Emit an intermediate step event. */
  step(step: string, meta?: JobLogMeta): void;
  /** Emit a terminal success event (outcome: "success"). */
  complete(meta?: JobLogMeta): void;
  /** Emit a terminal failure event (outcome: "failure"). */
  fail(meta?: JobLogMeta): void;
  /** Wrap an async fn, emitting start/complete/fail around it. */
  run<T>(fn: () => Promise<T>, meta?: JobLogMeta): Promise<T>;
}

/**
 * Create a structured logger bound to one job run.
 *
 * @param job    Stable job name used as the `job` field on every log line.
 * @param jobId  Unique id for this run; defaults to a fresh uuid. Pass a
 *               stable id (Bull job id, DB record id, ...) so retries of the
 *               same unit of work are groupable in Loki.
 */
export function createJobLogger(job: string, jobId: string = randomUUID()): JobLogger {
  const startedAt = Date.now();

  const log = (level: 'info' | 'warn' | 'error', event: string, meta: JobLogMeta = {}) => {
    logger[level](`${job}: ${event}`, {
      job,
      jobId,
      event,
      durationMs: Date.now() - startedAt,
      ...meta,
    });
  };

  return {
    job,
    jobId,
    start: (meta = {}) => log('info', 'start', { step: 'start', ...meta }),
    step: (step, meta = {}) => log('info', 'step', { step, ...meta }),
    complete: (meta = {}) => log('info', 'complete', { step: 'complete', outcome: 'success', ...meta }),
    fail: (meta = {}) => log('error', 'failed', { step: 'failed', outcome: 'failure', ...meta }),
    async run<T>(fn: () => Promise<T>, meta: JobLogMeta = {}): Promise<T> {
      log('info', 'start', { step: 'start', ...meta });
      try {
        const result = await fn();
        log('info', 'complete', { step: 'complete', outcome: 'success', ...meta });
        return result;
      } catch (error) {
        log('error', 'failed', {
          step: 'failed',
          outcome: 'failure',
          error: error instanceof Error ? error.message : String(error),
          ...meta,
        });
        throw error;
      }
    },
  };
}
