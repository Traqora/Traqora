/**
 * Coordinates wallet signature requests (#938).
 *
 * A wallet extension can only usefully show one approval dialog at a time.
 * This gate coalesces duplicate requests for the same pending action and
 * rejects a different action while one is already pending, so a double click
 * or a re-rendered component cannot open a second prompt.
 *
 * Every request is also bounded by a timeout. On timeout the caller's signal is
 * aborted; the booking hook checks that signal after the wallet returns so a
 * late approval is never submitted.
 */

export const DEFAULT_SIGNING_TIMEOUT_MS = 120_000;

export type SigningRequestErrorCode =
  | 'SIGNING_BUSY'
  | 'SIGNING_TIMEOUT'
  | 'SIGNING_REJECTED';

export class SigningRequestError extends Error {
  readonly code: SigningRequestErrorCode;
  readonly retryable: boolean;

  constructor(
    code: SigningRequestErrorCode,
    message: string,
    retryable = true,
  ) {
    super(message);
    this.name = 'SigningRequestError';
    this.code = code;
    this.retryable = retryable;
  }
}

export class SigningRequestTimeoutError extends SigningRequestError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      'SIGNING_TIMEOUT',
      'The wallet did not respond in time. Your checkout is safe; try signing again.',
    );
    this.name = 'SigningRequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class SigningRequestBusyError extends SigningRequestError {
  constructor() {
    super(
      'SIGNING_BUSY',
      'Another wallet request is already pending. Finish or cancel it before trying again.',
    );
    this.name = 'SigningRequestBusyError';
  }
}

export interface SigningRequestOptions {
  /** Set to 0 to disable the timeout (not recommended in a browser flow). */
  timeoutMs?: number;
}

interface PendingRequest {
  key: string;
  promise: Promise<unknown>;
  controller: AbortController;
}

export class SigningRequestGate {
  private pending: PendingRequest | null = null;

  isPending(key?: string): boolean {
    if (!this.pending) return false;
    return key === undefined || this.pending.key === key;
  }

  pendingKey(): string | null {
    return this.pending?.key ?? null;
  }

  /**
   * Run `operation` unless an equivalent request is already in flight.
   * Duplicate calls for the same key receive the exact same promise.
   */
  run<T>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: SigningRequestOptions = {},
  ): Promise<T> {
    if (this.pending) {
      if (this.pending.key === key) {
        return this.pending.promise as Promise<T>;
      }
      return Promise.reject(new SigningRequestBusyError());
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_SIGNING_TIMEOUT_MS;

    let operationPromise: Promise<T>;
    try {
      // Start synchronously so a second call in the same tick observes the
      // pending request immediately.
      operationPromise = Promise.resolve(operation(controller.signal));
    } catch (error) {
      operationPromise = Promise.reject(error);
    }

    let promise: Promise<T>;
    if (timeoutMs > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new SigningRequestTimeoutError(timeoutMs);
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      });

      promise = Promise.race([operationPromise, timeoutPromise]).finally(() => {
        if (timer !== undefined) clearTimeout(timer);
      });
    } else {
      promise = operationPromise;
    }

    const pending: PendingRequest = {
      key,
      promise,
      controller,
    };
    this.pending = pending;

    const cleanup = () => {
      if (this.pending === pending) {
        this.pending = null;
      }
    };
    promise.then(cleanup, cleanup);

    return promise;
  }

  /** Abort any in-flight request and allow a fresh request immediately. */
  reset(): void {
    if (!this.pending) return;
    const { controller } = this.pending;
    this.pending = null;
    controller.abort(
      new SigningRequestError(
        'SIGNING_REJECTED',
        'The signing request was cancelled.',
      ),
    );
  }
}

const REJECTION_PATTERNS = [
  /\buser\s+(?:declined|denied|rejected|cancell?ed)\b/i,
  /\b(?:declined|denied|rejected|cancell?ed)\s+by\s+(?:the\s+)?user\b/i,
  /\brequest\s+(?:was\s+)?(?:rejected|cancell?ed|denied)\b/i,
  /\b(?:rejected|cancell?ed|denied)\b/i,
];

/** Best-effort detection of a user-initiated wallet rejection. */
export function isWalletSignatureRejection(error: unknown): boolean {
  if (error instanceof SigningRequestTimeoutError) return false;
  if (error instanceof SigningRequestBusyError) return false;

  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    message =
      (typeof record.message === 'string' && record.message) ||
      (typeof record.error === 'string' && record.error) ||
      '';
  }

  if (!message) return false;
  return REJECTION_PATTERNS.some((pattern) => pattern.test(message));
}
