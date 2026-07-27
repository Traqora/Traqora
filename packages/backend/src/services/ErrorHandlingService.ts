import { logger } from '../utils/logger';
import { AppDataSource, initDataSource } from '../db/dataSource';
import { SecurityAuditLog, SecurityAction, ActorType } from '../db/entities/SecurityAuditLog';

export interface AppErrorOptions {
  statusCode?: number;
  code: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.context = options.context;
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  operationName?: string;
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getDelay = (
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean
) => {
  const backoffDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  if (!jitter) return backoffDelay;

  const jitterValue = Math.floor(Math.random() * Math.max(25, baseDelayMs));
  return Math.min(backoffDelay + jitterValue, maxDelayMs);
};

export const isTransientError = (error: unknown): boolean => {
  const anyError = error as Record<string, any>;
  const message =
    typeof anyError?.message === 'string'
      ? anyError.message.toLowerCase()
      : '';

  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('temporarily unavailable') ||
    message.includes('network')
  ) {
    return true;
  }

  const statusCode =
    anyError?.statusCode ??
    anyError?.status ??
    anyError?.response?.status ??
    anyError?.response?.statusCode;

  return typeof statusCode === 'number' && statusCode >= 500;
};

export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const jitter = options.jitter ?? true;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < retries &&
        (options.shouldRetry ? options.shouldRetry(error, attempt) : isTransientError(error));

      if (!canRetry) {
        break;
      }

      const delay = getDelay(attempt, baseDelayMs, maxDelayMs, jitter);
      logger.warn('retrying_operation', {
        operation: options.operationName ?? 'external_operation',
        attempt: attempt + 1,
        retries,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delay);
    }
  }

  throw lastError;
};

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  halfOpenSuccesses?: number;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private openedAt: number | null = null;
  private halfOpenSuccessCount = 0;

  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly halfOpenSuccesses: number;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30_000;
    this.halfOpenSuccesses = options.halfOpenSuccesses ?? 1;
  }

  getState(): CircuitState {
    if (
      this.state === 'OPEN' &&
      this.openedAt &&
      Date.now() - this.openedAt >= this.recoveryTimeoutMs
    ) {
      this.state = 'HALF_OPEN';
      this.halfOpenSuccessCount = 0;
      logger.warn('circuit_half_open', { circuit: this.name });
    }

    return this.state;
  }

  async execute<T>(
    operation: () => Promise<T>,
    context: Record<string, unknown> = {}
  ): Promise<T> {
    const state = this.getState();
    if (state === 'OPEN') {
      const retryAfterMs = Math.max(
        0,
        this.recoveryTimeoutMs - (Date.now() - (this.openedAt ?? Date.now()))
      );
      throw new AppError('External service is temporarily unavailable', {
        statusCode: 503,
        code: 'CIRCUIT_OPEN',
        retryable: true,
        retryAfterMs,
        context: { circuit: this.name, ...context },
      });
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error, context);
      throw error;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccessCount += 1;
      if (this.halfOpenSuccessCount >= this.halfOpenSuccesses) {
        this.reset();
      }
      return;
    }

    this.failures = 0;
  }

  private onFailure(error: unknown, context: Record<string, unknown>) {
    this.failures += 1;

    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      this.halfOpenSuccessCount = 0;
      logger.error('circuit_opened', {
        circuit: this.name,
        failures: this.failures,
        error: error instanceof Error ? error.message : String(error),
        ...context,
      });
      return;
    }

    this.state = 'CLOSED';
  }

  private reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenSuccessCount = 0;
    logger.info('circuit_closed', { circuit: this.name });
  }
}

export interface ExternalExecutionOptions {
  operationName: string;
  context?: Record<string, unknown>;
  retry?: RetryOptions;
}

export interface WorkflowStep {
  name: string;
  run: () => Promise<void>;
  compensate?: () => Promise<void>;
}

export const executeWithResilience = async <T>(
  breaker: CircuitBreaker,
  fn: () => Promise<T>,
  options: ExternalExecutionOptions
): Promise<T> => {
  const operationContext = options.context ?? {};

  try {
    return await breaker.execute(
      () =>
        withRetry(fn, {
          operationName: options.operationName,
          ...options.retry,
        }),
      operationContext
    );
  } catch (error) {
    logger.error('external_operation_failed', {
      operation: options.operationName,
      error: error instanceof Error ? error.message : String(error),
      ...operationContext,
    });
    throw error;
  }
};

export const executeCompensatedWorkflow = async (
  operationName: string,
  steps: WorkflowStep[]
): Promise<void> => {
  const completed: WorkflowStep[] = [];

  try {
    for (const step of steps) {
      await step.run();
      completed.push(step);
    }
  } catch (error) {
    const failedStep = steps[completed.length]?.name ?? 'unknown_step';

    for (const step of completed.reverse()) {
      if (!step.compensate) continue;
      try {
        await step.compensate();
      } catch (compensationError) {
        logger.error('workflow_compensation_failed', {
          operation: operationName,
          step: step.name,
          error:
            compensationError instanceof Error
              ? compensationError.message
              : String(compensationError),
        });
      }
    }

    throw new AppError('Operation partially failed and rollback was triggered', {
      statusCode: 503,
      code: 'PARTIAL_FAILURE_RECOVERED',
      retryable: true,
      details: {
        operation: operationName,
        failedStep,
      },
    });
  }
};

/**
 * Log security-related events to SecurityAuditLog
 */
export async function logSecurityEvent(params: {
  action: SecurityAction;
  actorType: ActorType;
  userId?: string | null;
  userEmail?: string | null;
  adminId?: string | null;
  adminEmail?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  details?: string | null;
  metadata?: any;
  ipAddress: string;
  userAgent?: string | null;
  sessionId?: string | null;
  countryCode?: string | null;
}): Promise<void> {
  try {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    // Get previous log hash for chain integrity
    const previousLog = await repo.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const previousHash = previousLog?.logHash || null;

    const log = repo.create({
      userId: params.userId || null,
      userEmail: params.userEmail || null,
      adminId: params.adminId || null,
      adminEmail: params.adminEmail || null,
      actorType: params.actorType,
      action: params.action,
      resource: params.resource || null,
      resourceId: params.resourceId || null,
      details: params.details || null,
      metadata: params.metadata || null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent || null,
      sessionId: params.sessionId || null,
      countryCode: params.countryCode || null,
      previousLogHash: previousHash,
      logHash: '',
    });

    log.logHash = log.generateLogHash(previousHash);
    await repo.save(log);

    logger.info('Security audit log recorded', {
      action: params.action,
      actorType: params.actorType,
      logId: log.id
    });
  } catch (err) {
    logger.error('Failed to write security audit log', {
      action: params.action,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Log application errors for security monitoring
 */
export async function logSecurityError(
  error: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = error instanceof AppError ? error.code : 'UNKNOWN_ERROR';

  // Determine if this is a security-relevant error
  const isSecurityRelevant = [
    'AUTH_FAILED',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'RATE_LIMIT_EXCEEDED',
    'INVALID_TOKEN',
    'CREDENTIALS_INVALID',
  ].includes(errorCode);

  if (isSecurityRelevant) {
    await logSecurityEvent({
      action: 'suspicious_activity_detected',
      actorType: 'system',
      details: `Security error: ${errorMessage}`,
      metadata: {
        errorCode,
        ...context
      },
      ipAddress: context.ipAddress as string || 'system',
    });
  }
}
