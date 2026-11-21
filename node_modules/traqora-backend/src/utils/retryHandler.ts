/**
 * Comprehensive Retry Handler with Exponential Backoff
 * Provides configurable retry mechanisms for flight sync operations
 */

import { logger } from './logger';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean; // Add randomness to prevent thundering herd
  retryableErrors: string[]; // Error types that should trigger retry
  nonRetryableErrors: string[]; // Error types that should NOT trigger retry
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

export interface RetryMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  averageRetryCount: number;
  errorDistribution: Record<string, number>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'TIMEOUT',
    'NETWORK_ERROR',
    'RATE_LIMIT_EXCEEDED',
    'SERVICE_UNAVAILABLE',
    'GATEWAY_TIMEOUT',
  ],
  nonRetryableErrors: [
    'VALIDATION_ERROR',
    'AUTHENTICATION_ERROR',
    'AUTHORIZATION_ERROR',
    'NOT_FOUND',
    'INVALID_REQUEST',
  ],
};

export class RetryHandler {
  private config: RetryConfig;
  private metrics: RetryMetrics = {
    totalAttempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    averageRetryCount: 0,
    errorDistribution: {},
  };

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      attempts = attempt;
      this.metrics.totalAttempts++;

      try {
        logger.debug(`Retry attempt ${attempt}/${this.config.maxAttempts}`, {
          context,
        });

        const result = await fn();
        
        this.metrics.successfulAttempts++;
        this.updateErrorMetrics('SUCCESS');

        return {
          success: true,
          data: result,
          attempts,
          totalDelayMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;
        this.metrics.failedAttempts++;
        this.updateErrorMetrics(lastError.message || 'UNKNOWN_ERROR');

        const errorType = this.classifyError(error);
        logger.warn(`Retry attempt ${attempt} failed`, {
          context,
          error: lastError.message,
          errorType,
        });

        // Check if error is non-retryable
        if (this.isNonRetryableError(error)) {
          logger.error('Non-retryable error encountered, aborting retry', {
            context,
            error: lastError.message,
          });
          break;
        }

        // Check if we've exhausted max attempts
        if (attempt >= this.config.maxAttempts) {
          logger.error('Max retry attempts exhausted', {
            context,
            maxAttempts: this.config.maxAttempts,
          });
          break;
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt);
        logger.debug(`Waiting ${delay}ms before next retry`, {
          context,
          attempt,
          delay,
        });
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalDelayMs: Date.now() - startTime,
    };
  }

  /**
   * Execute with custom retry condition
   */
  async executeWithCondition<T>(
    fn: () => Promise<T>,
    shouldRetry: (error: Error) => boolean,
    context?: string
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      attempts = attempt;
      this.metrics.totalAttempts++;

      try {
        const result = await fn();
        this.metrics.successfulAttempts++;
        return {
          success: true,
          data: result,
          attempts,
          totalDelayMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;
        this.metrics.failedAttempts++;

        if (!shouldRetry(lastError) || attempt >= this.config.maxAttempts) {
          break;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalDelayMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelayMs
    );

    if (this.config.jitter) {
      // Add ±25% randomness
      const jitterAmount = baseDelay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
      return Math.max(0, Math.floor(baseDelay + jitter));
    }

    return baseDelay;
  }

  /**
   * Classify error type
   */
  private classifyError(error: Error): string {
    const message = error.message.toUpperCase();
    
    for (const retryable of this.config.retryableErrors) {
      if (message.includes(retryable)) {
        return 'RETRYABLE';
      }
    }

    for (const nonRetryable of this.config.nonRetryableErrors) {
      if (message.includes(nonRetryable)) {
        return 'NON_RETRYABLE';
      }
    }

    return 'UNKNOWN';
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toUpperCase();
    return this.config.nonRetryableErrors.some(nonRetryable =>
      message.includes(nonRetryable)
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(errorType: string): void {
    this.metrics.errorDistribution[errorType] =
      (this.metrics.errorDistribution[errorType] || 0) + 1;
  }

  /**
   * Get retry metrics
   */
  getMetrics(): RetryMetrics {
    const successRate = this.metrics.totalAttempts > 0
      ? (this.metrics.successfulAttempts / this.metrics.totalAttempts) * 100
      : 0;

    return {
      ...this.metrics,
      averageRetryCount: this.metrics.totalAttempts > 0
        ? this.metrics.totalAttempts / this.metrics.successfulAttempts
        : 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageRetryCount: 0,
      errorDistribution: {},
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Retry handler configuration updated', { config: this.config });
  }
}

/**
 * Circuit Breaker with Retry Integration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenMaxCalls: number;
}

export class CircuitBreakerWithRetry {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private halfOpenCalls: number = 0;
  private config: CircuitBreakerConfig;
  private retryHandler: RetryHandler;

  constructor(
    retryConfig?: Partial<RetryConfig>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.retryHandler = new RetryHandler(retryConfig);
    this.config = {
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 60000,
      halfOpenMaxCalls: 3,
      ...circuitBreakerConfig,
    };
  }

  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN', { context });
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await this.retryHandler.execute(fn, context);
      
      if (result.success) {
        this.recordSuccess();
        return result.data!;
      } else {
        throw result.error;
      }
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime.getTime() > this.config.timeoutMs;
  }

  private recordSuccess(): void {
    this.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        logger.info('Circuit breaker closed after successful recovery');
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.successCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn('Circuit breaker opened during HALF_OPEN state');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      logger.warn('Circuit breaker opened due to repeated failures', {
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
      });
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.state === 'OPEN' && this.lastFailureTime
        ? new Date(this.lastFailureTime.getTime() + this.config.timeoutMs)
        : undefined,
      retryMetrics: this.retryHandler.getMetrics(),
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = undefined;
    this.retryHandler.resetMetrics();
    logger.info('Circuit breaker reset');
  }
}
