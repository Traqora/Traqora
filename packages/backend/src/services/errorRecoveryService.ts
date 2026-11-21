/**
 * Error Recovery Service
 * Provides intelligent recovery strategies for different types of errors
 */

import { logger } from '../utils/logger';
import { DataSource } from 'typeorm';
import { Flight } from '../db/entities/Flight';
import { DeadLetterQueue } from './deadLetterQueue';

export interface RecoveryStrategy {
  name: string;
  canRecover: (error: Error) => boolean;
  recover: (error: Error, context: RecoveryContext) => Promise<RecoveryResult>;
  priority: number; // Lower = higher priority
}

export interface RecoveryContext {
  operation: string;
  payload: any;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface RecoveryResult {
  success: boolean;
  action: string;
  message: string;
  data?: any;
  shouldRetry: boolean;
  retryDelay?: number;
}

export interface ErrorRecoveryConfig {
  enabled: boolean;
  maxRecoveryAttempts: number;
  recoveryTimeoutMs: number;
  fallbackToCache: boolean;
  fallbackToStaleData: boolean;
  alertThreshold: number; // Alert after this many consecutive failures
}

const DEFAULT_CONFIG: ErrorRecoveryConfig = {
  enabled: true,
  maxRecoveryAttempts: 3,
  recoveryTimeoutMs: 30000,
  fallbackToCache: true,
  fallbackToStaleData: true,
  alertThreshold: 5,
};

export class ErrorRecoveryService {
  private strategies: Map<string, RecoveryStrategy[]> = new Map();
  private config: ErrorRecoveryConfig;
  private dataSource: DataSource;
  private deadLetterQueue: DeadLetterQueue;
  private failureCounts: Map<string, number> = new Map();
  private alertCallbacks: Set<(alert: RecoveryAlert) => void> = new Set();

  constructor(
    dataSource: DataSource,
    deadLetterQueue: DeadLetterQueue,
    config?: Partial<ErrorRecoveryConfig>
  ) {
    this.dataSource = dataSource;
    this.deadLetterQueue = deadLetterQueue;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.registerDefaultStrategies();
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(
    error: Error,
    context: RecoveryContext
  ): Promise<RecoveryResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        action: 'NO_RECOVERY',
        message: 'Error recovery is disabled',
        shouldRetry: true,
      };
    }

    const operation = context.operation;
    const strategies = this.strategies.get(operation) || [];
    
    // Sort strategies by priority
    strategies.sort((a, b) => a.priority - b.priority);

    logger.info('Attempting error recovery', {
      operation,
      errorType: error.name,
      errorMessage: error.message,
      strategiesAvailable: strategies.length,
    });

    for (const strategy of strategies) {
      if (!strategy.canRecover(error)) {
        continue;
      }

      try {
        logger.info('Applying recovery strategy', { strategy: strategy.name });
        
        const result = await Promise.race([
          strategy.recover(error, context),
          new Promise<RecoveryResult>((_, reject) =>
            setTimeout(() => reject(new Error('Recovery timeout')), this.config.recoveryTimeoutMs)
          ),
        ]) as RecoveryResult;

        if (result.success) {
          this.resetFailureCount(operation);
          logger.info('Recovery successful', { 
            strategy: strategy.name, 
            action: result.action 
          });
          return result;
        }
      } catch (recoveryError) {
        logger.warn('Recovery strategy failed', {
          strategy: strategy.name,
          error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
        });
      }
    }

    // Track failure count
    this.incrementFailureCount(operation);
    
    // Check if we should alert
    if (this.shouldAlert(operation)) {
      await this.sendAlert(error, context);
    }

    // Add to dead letter queue if all strategies failed
    await this.deadLetterQueue.addEntry(
      operation as any,
      context.payload,
      error,
      this.determinePriority(error, context),
      context.metadata
    );

    return {
      success: false,
      action: 'ALL_STRATEGIES_FAILED',
      message: 'All recovery strategies failed',
      shouldRetry: this.shouldRetryBasedOnError(error),
    };
  }

  /**
   * Register a recovery strategy for an operation
   */
  registerStrategy(operation: string, strategy: RecoveryStrategy): void {
    if (!this.strategies.has(operation)) {
      this.strategies.set(operation, []);
    }
    this.strategies.get(operation)!.push(strategy);
    
    // Sort by priority
    this.strategies.get(operation)!.sort((a, b) => a.priority - b.priority);
    
    logger.info('Registered recovery strategy', { operation, strategy: strategy.name });
  }

  /**
   * Register alert callback
   */
  registerAlertCallback(callback: (alert: RecoveryAlert) => void): void {
    this.alertCallbacks.add(callback);
    logger.info('Registered alert callback');
  }

  /**
   * Get recovery statistics
   */
  getStats() {
    return {
      strategiesRegistered: Array.from(this.strategies.entries()).map(([op, strategies]) => ({
        operation: op,
        strategies: strategies.map(s => s.name),
      })),
      failureCounts: Object.fromEntries(this.failureCounts),
      config: this.config,
    };
  }

  /**
   * Reset failure count for an operation
   */
  private resetFailureCount(operation: string): void {
    this.failureCounts.delete(operation);
  }

  /**
   * Increment failure count for an operation
   */
  private incrementFailureCount(operation: string): void {
    const current = this.failureCounts.get(operation) || 0;
    this.failureCounts.set(operation, current + 1);
  }

  /**
   * Check if we should send an alert
   */
  private shouldAlert(operation: string): boolean {
    const count = this.failureCounts.get(operation) || 0;
    return count >= this.config.alertThreshold;
  }

  /**
   * Send alert
   */
  private async sendAlert(error: Error, context: RecoveryContext): Promise<void> {
    const alert: RecoveryAlert = {
      operation: context.operation,
      error: error.message,
      errorType: error.name,
      timestamp: new Date(),
      failureCount: this.failureCounts.get(context.operation) || 0,
      payload: context.payload,
      metadata: context.metadata,
    };

    logger.error('Recovery alert triggered', alert);

    for (const callback of this.alertCallbacks) {
      try {
        await callback(alert);
      } catch (callbackError) {
        logger.error('Alert callback failed', {
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
        });
      }
    }
  }

  /**
   * Determine if operation should be retried based on error type
   */
  private shouldRetryBasedOnError(error: Error): boolean {
    const message = error.message.toUpperCase();
    
    const nonRetryableErrors = [
      'VALIDATION_ERROR',
      'AUTHENTICATION_ERROR',
      'AUTHORIZATION_ERROR',
      'NOT_FOUND',
      'INVALID_REQUEST',
    ];

    return !nonRetryableErrors.some(nonRetryable => message.includes(nonRetryable));
  }

  /**
   * Determine priority for dead letter queue
   */
  private determinePriority(error: Error, context: RecoveryContext): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const message = error.message.toUpperCase();

    if (message.includes('CRITICAL') || message.includes('EMERGENCY')) {
      return 'CRITICAL';
    }
    if (message.includes('TIMEOUT') || message.includes('DATABASE')) {
      return 'HIGH';
    }
    if (message.includes('NETWORK') || message.includes('RATE_LIMIT')) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Register default recovery strategies
   */
  private registerDefaultStrategies(): void {
    // Network error recovery
    this.registerStrategy('SYNC_FLIGHT', {
      name: 'NETWORK_RETRY',
      priority: 1,
      canRecover: (error) => {
        const message = error.message.toUpperCase();
        return message.includes('NETWORK') || 
               message.includes('ECONN') || 
               message.includes('TIMEOUT');
      },
      recover: async (error, context) => {
        // Wait and suggest retry
        return {
          success: false,
          action: 'WAIT_AND_RETRY',
          message: 'Network error detected, will retry with backoff',
          shouldRetry: true,
          retryDelay: 5000,
        };
      },
    });

    // Rate limit recovery
    this.registerStrategy('SYNC_FLIGHT', {
      name: 'RATE_LIMIT_BACKOFF',
      priority: 2,
      canRecover: (error) => {
        return error.message.toUpperCase().includes('RATE_LIMIT');
      },
      recover: async (error, context) => {
        return {
          success: false,
          action: 'EXPONENTIAL_BACKOFF',
          message: 'Rate limit exceeded, will retry with exponential backoff',
          shouldRetry: true,
          retryDelay: 60000, // 1 minute
        };
      },
    });

    // Cache fallback strategy
    this.registerStrategy('SYNC_FLIGHT', {
      name: 'CACHE_FALLBACK',
      priority: 10,
      canRecover: (error) => this.config.fallbackToCache,
      recover: async (error, context) => {
        try {
          const flightRepo = this.dataSource.getRepository(Flight);
          const flight = await flightRepo.findOne({
            where: { 
              flightNumber: context.payload.flightNumber,
              airlineCode: context.payload.airline,
            },
          });

          if (flight && flight.rawData) {
            logger.info('Using cached flight data as fallback', {
              flightNumber: flight.flightNumber,
            });

            return {
              success: true,
              action: 'CACHE_FALLBACK',
              message: 'Using cached data as fallback',
              data: flight.rawData,
              shouldRetry: false,
            };
          }

          return {
            success: false,
            action: 'NO_CACHE_AVAILABLE',
            message: 'No cached data available',
            shouldRetry: true,
          };
        } catch (cacheError) {
          logger.error('Cache fallback failed', {
            error: cacheError instanceof Error ? cacheError.message : String(cacheError),
          });

          return {
            success: false,
            action: 'CACHE_FALLBACK_FAILED',
            message: 'Cache fallback failed',
            shouldRetry: true,
          };
        }
      },
    });

    // Stale data fallback strategy
    this.registerStrategy('SYNC_FLIGHT', {
      name: 'STALE_DATA_FALLBACK',
      priority: 11,
      canRecover: (error) => this.config.fallbackToStaleData,
      recover: async (error, context) => {
        try {
          const flightRepo = this.dataSource.getRepository(Flight);
          const flight = await flightRepo.findOne({
            where: { 
              flightNumber: context.payload.flightNumber,
              airlineCode: context.payload.airline,
            },
            order: { lastSyncedAt: 'DESC' },
          });

          if (flight) {
            const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
            const isStale = Date.now() - flight.lastSyncedAt!.getTime() > staleThreshold;

            if (!isStale) {
              logger.info('Using stale flight data as fallback', {
                flightNumber: flight.flightNumber,
                age: Date.now() - flight.lastSyncedAt!.getTime(),
              });

              return {
                success: true,
                action: 'STALE_DATA_FALLBACK',
                message: 'Using stale data as fallback',
                data: flight,
                shouldRetry: false,
              };
            }
          }

          return {
            success: false,
            action: 'NO_STALE_DATA_AVAILABLE',
            message: 'No acceptable stale data available',
            shouldRetry: true,
          };
        } catch (staleError) {
          logger.error('Stale data fallback failed', {
            error: staleError instanceof Error ? staleError.message : String(staleError),
          });

          return {
            success: false,
            action: 'STALE_DATA_FALLBACK_FAILED',
            message: 'Stale data fallback failed',
            shouldRetry: true,
          };
        }
      },
    });

    // Database error recovery
    this.registerStrategy('SYNC_FLIGHT', {
      name: 'DATABASE_RETRY',
      priority: 5,
      canRecover: (error) => {
        const message = error.message.toUpperCase();
        return message.includes('DATABASE') || 
               message.includes('SQL') || 
               message.includes('CONNECTION');
      },
      recover: async (error, context) => {
        // Try to reconnect
        try {
          if (!this.dataSource.isInitialized) {
            await this.dataSource.initialize();
          }

          return {
            success: true,
            action: 'DATABASE_RECONNECTED',
            message: 'Database reconnected successfully',
            shouldRetry: true,
          };
        } catch (reconnectError) {
          return {
            success: false,
            action: 'DATABASE_RECONNECT_FAILED',
            message: 'Database reconnection failed',
            shouldRetry: true,
            retryDelay: 10000,
          };
        }
      },
    });

    // API endpoint fallback
    this.registerStrategy('SYNC_FLIGHT', {
      name: 'API_ENDPOINT_FALLBACK',
      priority: 3,
      canRecover: (error) => {
        const message = error.message.toUpperCase();
        return message.includes('API') || 
               message.includes('ENDPOINT') || 
               message.includes('503') || 
               message.includes('502');
      },
      recover: async (error, context) => {
        return {
          success: false,
          action: 'API_FALLBACK',
          message: 'API endpoint error, will retry with alternative endpoint',
          shouldRetry: true,
          retryDelay: 30000,
        };
      },
    });
  }
}

export interface RecoveryAlert {
  operation: string;
  error: string;
  errorType: string;
  timestamp: Date;
  failureCount: number;
  payload: any;
  metadata?: Record<string, any>;
}
