/**
 * Retry Policies Configuration
 * Defines retry policies for different operations and error types
 */

import { RetryConfig, CircuitBreakerConfig } from '../utils/retryHandler';
import { DeadLetterQueueConfig as DLQConfig } from '../services/deadLetterQueue';
import { ErrorRecoveryConfig as RecoveryConfig } from '../services/errorRecoveryService';

export interface FlightSyncRetryPolicies {
  syncFlight: RetryConfig;
  batchSyncFlights: RetryConfig;
  fetchFlightStatus: RetryConfig;
  processWebhook: RetryConfig;
  healthCheck: RetryConfig;
}

export interface FlightSyncCircuitBreakerPolicies {
  amadeus: CircuitBreakerConfig;
  airlineAdapter: CircuitBreakerConfig;
  database: CircuitBreakerConfig;
  cache: CircuitBreakerConfig;
}

export interface FlightSyncDeadLetterQueueConfig extends DLQConfig {
  operationPriorities: {
    SYNC_FLIGHT: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    BATCH_SYNC: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    WEBHOOK_PROCESS: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    STATUS_UPDATE: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

export interface FlightSyncErrorRecoveryConfig extends RecoveryConfig {
  strategyPriorities: {
    NETWORK_RETRY: number;
    RATE_LIMIT_BACKOFF: number;
    DATABASE_RETRY: number;
    API_ENDPOINT_FALLBACK: number;
    CACHE_FALLBACK: number;
    STALE_DATA_FALLBACK: number;
  };
}

/**
 * Default retry policies for flight sync operations
 */
export const DEFAULT_RETRY_POLICIES: FlightSyncRetryPolicies = {
  syncFlight: {
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
      '503',
      '502',
      '504',
    ],
    nonRetryableErrors: [
      'VALIDATION_ERROR',
      'AUTHENTICATION_ERROR',
      'AUTHORIZATION_ERROR',
      'NOT_FOUND',
      'INVALID_REQUEST',
      '400',
      '401',
      '403',
      '404',
    ],
  },
  batchSyncFlights: {
    maxAttempts: 2,
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'NETWORK_ERROR',
      'RATE_LIMIT_EXCEEDED',
      'SERVICE_UNAVAILABLE',
    ],
    nonRetryableErrors: [
      'VALIDATION_ERROR',
      'AUTHENTICATION_ERROR',
      'NOT_FOUND',
    ],
  },
  fetchFlightStatus: {
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 15000,
    backoffMultiplier: 1.5,
    jitter: true,
    retryableErrors: [
      'TIMEOUT',
      'NETWORK_ERROR',
      'SERVICE_UNAVAILABLE',
    ],
    nonRetryableErrors: [
      'NOT_FOUND',
      'INVALID_REQUEST',
    ],
  },
  processWebhook: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitter: false,
    retryableErrors: [
      'TIMEOUT',
      'NETWORK_ERROR',
    ],
    nonRetryableErrors: [
      'VALIDATION_ERROR',
      'SIGNATURE_INVALID',
    ],
  },
  healthCheck: {
    maxAttempts: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 1,
    jitter: false,
    retryableErrors: [
      'TIMEOUT',
      'NETWORK_ERROR',
    ],
    nonRetryableErrors: [
      'AUTHENTICATION_ERROR',
    ],
  },
};

/**
 * Circuit breaker policies for different services
 */
export const DEFAULT_CIRCUIT_BREAKER_POLICIES: FlightSyncCircuitBreakerPolicies = {
  amadeus: {
    failureThreshold: 5,
    successThreshold: 3,
    timeoutMs: 60000, // 1 minute
    halfOpenMaxCalls: 5,
  },
  airlineAdapter: {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 120000, // 2 minutes
    halfOpenMaxCalls: 3,
  },
  database: {
    failureThreshold: 10,
    successThreshold: 5,
    timeoutMs: 30000, // 30 seconds
    halfOpenMaxCalls: 10,
  },
  cache: {
    failureThreshold: 15,
    successThreshold: 5,
    timeoutMs: 10000, // 10 seconds
    halfOpenMaxCalls: 5,
  },
};

/**
 * Dead letter queue configuration
 */
export const DEFAULT_DLQ_CONFIG: FlightSyncDeadLetterQueueConfig = {
  maxEntries: 10000,
  maxAgeHours: 168, // 7 days
  defaultMaxRetries: 5,
  retryIntervals: [60000, 300000, 900000, 3600000, 7200000], // 1m, 5m, 15m, 1h, 2h
  autoRetryEnabled: true,
  autoRetryIntervalMinutes: 5,
  operationPriorities: {
    SYNC_FLIGHT: 'HIGH',
    BATCH_SYNC: 'MEDIUM',
    WEBHOOK_PROCESS: 'HIGH',
    STATUS_UPDATE: 'LOW',
  },
};

/**
 * Error recovery configuration
 */
export const DEFAULT_ERROR_RECOVERY_CONFIG: FlightSyncErrorRecoveryConfig = {
  enabled: true,
  maxRecoveryAttempts: 3,
  recoveryTimeoutMs: 30000,
  fallbackToCache: true,
  fallbackToStaleData: true,
  alertThreshold: 5,
  strategyPriorities: {
    NETWORK_RETRY: 1,
    RATE_LIMIT_BACKOFF: 2,
    DATABASE_RETRY: 3,
    API_ENDPOINT_FALLBACK: 4,
    CACHE_FALLBACK: 10,
    STALE_DATA_FALLBACK: 11,
  },
};

/**
 * Environment-specific configurations
 */
export const ENVIRONMENT_CONFIGS: Record<'development' | 'staging' | 'production', Partial<FlightSyncRetryPolicies>> = {
  development: {
    syncFlight: {
      maxAttempts: 1, // Fail fast in development
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 1,
      jitter: false,
      retryableErrors: DEFAULT_RETRY_POLICIES.syncFlight.retryableErrors,
      nonRetryableErrors: DEFAULT_RETRY_POLICIES.syncFlight.nonRetryableErrors,
    },
  },
  staging: {
    syncFlight: {
      maxAttempts: 2,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 1.5,
      jitter: true,
      retryableErrors: DEFAULT_RETRY_POLICIES.syncFlight.retryableErrors,
      nonRetryableErrors: DEFAULT_RETRY_POLICIES.syncFlight.nonRetryableErrors,
    },
  },
  production: DEFAULT_RETRY_POLICIES,
};

/**
 * Get retry policy for operation
 */
export function getRetryPolicy(
  operation: keyof FlightSyncRetryPolicies,
  environment: 'development' | 'staging' | 'production' = 'production'
): RetryConfig {
  const envConfig = ENVIRONMENT_CONFIGS[environment];
  const basePolicy = DEFAULT_RETRY_POLICIES[operation];
  const envPolicy = envConfig[operation];

  return envPolicy ? { ...basePolicy, ...envPolicy } : basePolicy;
}

/**
 * Get circuit breaker policy for service
 */
export function getCircuitBreakerPolicy(
  service: keyof FlightSyncCircuitBreakerPolicies
): CircuitBreakerConfig {
  return DEFAULT_CIRCUIT_BREAKER_POLICIES[service];
}

/**
 * Get complete configuration for environment
 */
export function getFlightSyncConfig(environment: 'development' | 'staging' | 'production' = 'production') {
  return {
    retry: {
      syncFlight: getRetryPolicy('syncFlight', environment),
      batchSyncFlights: getRetryPolicy('batchSyncFlights', environment),
      fetchFlightStatus: getRetryPolicy('fetchFlightStatus', environment),
      processWebhook: getRetryPolicy('processWebhook', environment),
      healthCheck: getRetryPolicy('healthCheck', environment),
    },
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_POLICIES,
    deadLetterQueue: DEFAULT_DLQ_CONFIG,
    errorRecovery: DEFAULT_ERROR_RECOVERY_CONFIG,
    environment,
  };
}

/**
 * Validate retry configuration
 */
export function validateRetryConfig(config: RetryConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.maxAttempts < 1) {
    errors.push('maxAttempts must be at least 1');
  }
  if (config.initialDelayMs < 0) {
    errors.push('initialDelayMs must be non-negative');
  }
  if (config.maxDelayMs < config.initialDelayMs) {
    errors.push('maxDelayMs must be greater than or equal to initialDelayMs');
  }
  if (config.backoffMultiplier < 1) {
    errors.push('backoffMultiplier must be at least 1');
  }
  if (config.retryableErrors.length === 0) {
    errors.push('retryableErrors must not be empty');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate circuit breaker configuration
 */
export function validateCircuitBreakerConfig(config: CircuitBreakerConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.failureThreshold < 1) {
    errors.push('failureThreshold must be at least 1');
  }
  if (config.successThreshold < 1) {
    errors.push('successThreshold must be at least 1');
  }
  if (config.timeoutMs < 1000) {
    errors.push('timeoutMs must be at least 1000ms');
  }
  if (config.halfOpenMaxCalls < 1) {
    errors.push('halfOpenMaxCalls must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
