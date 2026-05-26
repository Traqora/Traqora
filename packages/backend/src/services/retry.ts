import { RetryOptions, sleep, withRetry } from './ErrorHandlingService';

export { sleep };

export type LegacyRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxAttempts?: number;
  delayMs?: number;
  backoff?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  operationName?: string;
};

const mapLegacyOptions = (opts?: LegacyRetryOptions): RetryOptions => {
  const retries =
    opts?.maxAttempts !== undefined
      ? Math.max(0, opts.maxAttempts - 1)
      : opts?.retries;

  return {
    retries,
    baseDelayMs: opts?.delayMs ?? opts?.baseDelayMs,
    jitter: opts?.backoff ?? true,
    shouldRetry: opts?.shouldRetry,
    operationName: opts?.operationName,
  };
};

export const withRetries = async <T>(
  fn: () => Promise<T>,
  opts?: LegacyRetryOptions
): Promise<T> => withRetry(fn, mapLegacyOptions(opts));
