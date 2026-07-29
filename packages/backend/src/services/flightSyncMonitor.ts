/**
 * Flight Sync Monitoring and Alerting Service
 * Provides real-time monitoring, metrics collection, and alerting for flight sync operations
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface SyncMetrics {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageSyncTime: number;
  successRate: number;
  lastSyncTime?: Date;
  lastFailureTime?: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface RetryMetrics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  averageRetryAttempts: number;
  retryRate: number;
  byOperation: Record<string, {
    total: number;
    successful: number;
    failed: number;
  }>;
}

export interface CircuitBreakerMetrics {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastStateChange?: Date;
  totalOpenTime: number;
  totalHalfOpenTime: number;
}

export interface DeadLetterQueueMetrics {
  totalEntries: number;
  unresolvedEntries: number;
  resolvedEntries: number;
  byPriority: Record<string, number>;
  byErrorType: Record<string, number>;
  averageResolutionTime: number;
}

export interface FlightSyncAlert {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  type: string;
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsRetentionHours: number;
  alertRetentionHours: number;
  alertThresholds: {
    consecutiveFailures: number;
    failureRate: number; // percentage
    averageSyncTime: number; // milliseconds
    deadLetterQueueSize: number;
  };
  alertChannels: {
    console: boolean;
    webhook?: string;
    email?: string;
  };
}

const DEFAULT_CONFIG: MonitoringConfig = {
  enabled: true,
  metricsRetentionHours: 24,
  alertRetentionHours: 168, // 7 days
  alertThresholds: {
    consecutiveFailures: 5,
    failureRate: 20, // 20%
    averageSyncTime: 30000, // 30 seconds
    deadLetterQueueSize: 100,
  },
  alertChannels: {
    console: true,
  },
};

export class FlightSyncMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private syncMetrics: SyncMetrics;
  private retryMetrics: RetryMetrics;
  private circuitBreakerMetrics: Map<string, CircuitBreakerMetrics> = new Map();
  private deadLetterQueueMetrics: DeadLetterQueueMetrics;
  private alerts: Map<string, FlightSyncAlert> = new Map();
  private syncTimes: number[] = [];
  private maxSyncTimes: number = 100;

  constructor(config?: Partial<MonitoringConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.syncMetrics = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncTime: 0,
      successRate: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };

    this.retryMetrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryAttempts: 0,
      retryRate: 0,
      byOperation: {},
    };

    this.deadLetterQueueMetrics = {
      totalEntries: 0,
      unresolvedEntries: 0,
      resolvedEntries: 0,
      byPriority: {},
      byErrorType: {},
      averageResolutionTime: 0,
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Record successful sync
   */
  recordSyncSuccess(durationMs: number, metadata?: Record<string, any>): void {
    this.syncMetrics.totalSyncs++;
    this.syncMetrics.successfulSyncs++;
    this.syncMetrics.consecutiveSuccesses++;
    this.syncMetrics.consecutiveFailures = 0;
    this.syncMetrics.lastSyncTime = new Date();

    // Update average sync time
    this.syncTimes.push(durationMs);
    if (this.syncTimes.length > this.maxSyncTimes) {
      this.syncTimes.shift();
    }
    this.syncMetrics.averageSyncTime = 
      this.syncTimes.reduce((sum, time) => sum + time, 0) / this.syncTimes.length;

    // Update success rate
    this.syncMetrics.successRate = 
      (this.syncMetrics.successfulSyncs / this.syncMetrics.totalSyncs) * 100;

    this.emit('sync:success', { durationMs, metadata });
    logger.debug('Sync success recorded', { durationMs, metadata });
  }

  /**
   * Record failed sync
   */
  recordSyncFailure(error: Error, metadata?: Record<string, any>): void {
    this.syncMetrics.totalSyncs++;
    this.syncMetrics.failedSyncs++;
    this.syncMetrics.consecutiveFailures++;
    this.syncMetrics.consecutiveSuccesses = 0;
    this.syncMetrics.lastFailureTime = new Date();

    // Update success rate
    this.syncMetrics.successRate = 
      (this.syncMetrics.successfulSyncs / this.syncMetrics.totalSyncs) * 100;

    this.emit('sync:failure', { error: error.message, metadata });

    // Check alert thresholds
    this.checkFailureAlerts(error, metadata);

    logger.warn('Sync failure recorded', { 
      error: error.message, 
      consecutiveFailures: this.syncMetrics.consecutiveFailures,
      metadata 
    });
  }

  /**
   * Record retry attempt
   */
  recordRetry(operation: string, success: boolean, attempts: number): void {
    this.retryMetrics.totalRetries++;

    if (!this.retryMetrics.byOperation[operation]) {
      this.retryMetrics.byOperation[operation] = {
        total: 0,
        successful: 0,
        failed: 0,
      };
    }

    this.retryMetrics.byOperation[operation].total++;

    if (success) {
      this.retryMetrics.successfulRetries++;
      this.retryMetrics.byOperation[operation].successful++;
    } else {
      this.retryMetrics.failedRetries++;
      this.retryMetrics.byOperation[operation].failed++;
    }

    // Update average retry attempts
    this.retryMetrics.averageRetryAttempts = 
      this.retryMetrics.totalRetries / (this.retryMetrics.successfulRetries + this.retryMetrics.failedRetries);

    // Update retry rate
    this.retryMetrics.retryRate = 
      (this.retryMetrics.successfulRetries / this.retryMetrics.totalRetries) * 100;

    this.emit(success ? 'retry:success' : 'retry:failure', { operation, attempts });

    logger.debug('Retry recorded', { operation, success, attempts });
  }

  /**
   * Update circuit breaker metrics
   */
  updateCircuitBreakerMetrics(serviceName: string, metrics: any): void {
    const existing = this.circuitBreakerMetrics.get(serviceName) || {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      totalOpenTime: 0,
      totalHalfOpenTime: 0,
    };

    const updated: CircuitBreakerMetrics = {
      ...existing,
      ...metrics,
      lastStateChange: existing.state !== metrics.state ? new Date() : existing.lastStateChange,
    };

    this.circuitBreakerMetrics.set(serviceName, updated);

    if (metrics.state === 'OPEN') {
      this.createAlert('ERROR', 'CIRCUIT_BREAKER_OPEN', 
        `Circuit breaker opened for service: ${serviceName}`, 
        { serviceName, metrics });
    }

    this.emit('circuitBreaker:change', { serviceName, metrics });
  }

  /**
   * Update dead letter queue metrics
   */
  updateDeadLetterQueueMetrics(metrics: DeadLetterQueueMetrics): void {
    this.deadLetterQueueMetrics = metrics;

    // Check alert threshold
    if (metrics.unresolvedEntries > this.config.alertThresholds.deadLetterQueueSize) {
      this.createAlert('WARNING', 'DEAD_LETTER_QUEUE_SIZE',
        `Dead letter queue size exceeded threshold: ${metrics.unresolvedEntries}`,
        { metrics }
      );
    }

    this.emit('deadLetterQueue:update', metrics);
  }

  /**
   * Create alert
   */
  createAlert(
    severity: FlightSyncAlert['severity'],
    type: string,
    message: string,
    metadata?: Record<string, any>
  ): string {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: FlightSyncAlert = {
      id,
      severity,
      type,
      message,
      timestamp: new Date(),
      metadata: metadata || {},
      resolved: false,
    };

    this.alerts.set(id, alert);

    // Send to configured channels
    this.sendAlert(alert);

    this.emit('alert:created', alert);
    logger.warn('Alert created', { id, severity, type, message });

    return id;
  }

  /**
   * Resolve alert
   */
  resolveAlert(id: string): boolean {
    const alert = this.alerts.get(id);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();

    this.emit('alert:resolved', alert);
    logger.info('Alert resolved', { id, type: alert.type });

    return true;
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    return {
      sync: this.syncMetrics,
      retry: this.retryMetrics,
      circuitBreaker: Object.fromEntries(this.circuitBreakerMetrics),
      deadLetterQueue: this.deadLetterQueueMetrics,
      alerts: {
        total: this.alerts.size,
        unresolved: Array.from(this.alerts.values()).filter(a => !a.resolved).length,
        resolved: Array.from(this.alerts.values()).filter(a => a.resolved).length,
      },
    };
  }

  /**
   * Get alerts
   */
  getAlerts(filter?: {
    severity?: FlightSyncAlert['severity'];
    resolved?: boolean;
    type?: string;
  }): FlightSyncAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (filter?.severity) {
      alerts = alerts.filter(a => a.severity === filter.severity);
    }
    if (filter?.resolved !== undefined) {
      alerts = alerts.filter(a => a.resolved === filter.resolved);
    }
    if (filter?.type) {
      alerts = alerts.filter(a => a.type === filter.type);
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return alerts;
  }

  /**
   * Check failure alert thresholds
   */
  private checkFailureAlerts(error: Error, metadata?: Record<string, any>): void {
    // Check consecutive failures
    if (this.syncMetrics.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      this.createAlert('ERROR', 'CONSECUTIVE_FAILURES',
        `Consecutive failures threshold exceeded: ${this.syncMetrics.consecutiveFailures}`,
        { consecutiveFailures: this.syncMetrics.consecutiveFailures, error: error.message, metadata }
      );
    }

    // Check failure rate
    if (this.syncMetrics.successRate < (100 - this.config.alertThresholds.failureRate)) {
      this.createAlert('WARNING', 'HIGH_FAILURE_RATE',
        `Failure rate exceeded threshold: ${100 - this.syncMetrics.successRate.toFixed(2)}%`,
        { failureRate: 100 - this.syncMetrics.successRate, metadata }
      );
    }

    // Check average sync time
    if (this.syncMetrics.averageSyncTime > this.config.alertThresholds.averageSyncTime) {
      this.createAlert('WARNING', 'SLOW_SYNC_PERFORMANCE',
        `Average sync time exceeded threshold: ${this.syncMetrics.averageSyncTime.toFixed(0)}ms`,
        { averageSyncTime: this.syncMetrics.averageSyncTime, metadata }
      );
    }
  }

  /**
   * Send alert to configured channels
   */
  private sendAlert(alert: FlightSyncAlert): void {
    if (this.config.alertChannels.console) {
      const consoleMethod = alert.severity === 'CRITICAL' || alert.severity === 'ERROR' 
        ? console.error 
        : alert.severity === 'WARNING' 
        ? console.warn 
        : console.log;

      consoleMethod(`[${alert.severity}] ${alert.type}: ${alert.message}`, alert.metadata);
    }

    if (this.config.alertChannels.webhook) {
      this.sendWebhookAlert(alert).catch(err => {
        logger.error('Failed to send webhook alert', { error: err });
      });
    }

    if (this.config.alertChannels.email) {
      this.sendEmailAlert(alert).catch(err => {
        logger.error('Failed to send email alert', { error: err });
      });
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: FlightSyncAlert): Promise<void> {
    if (!this.config.alertChannels.webhook) return;

    try {
      const response = await fetch(this.config.alertChannels.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      logger.info('Webhook alert sent successfully', { alertId: alert.id });
    } catch (error) {
      logger.error('Failed to send webhook alert', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send email alert (placeholder - would integrate with email service)
   */
  private async sendEmailAlert(alert: FlightSyncAlert): Promise<void> {
    // Placeholder for email integration
    logger.info('Email alert would be sent', { alertId: alert.id });
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    const intervalMs = 60 * 60 * 1000; // Every hour

    setInterval(() => {
      this.cleanupOldAlerts();
      this.cleanupOldMetrics();
    }, intervalMs);
  }

  /**
   * Cleanup old alerts
   */
  private cleanupOldAlerts(): void {
    const now = Date.now();
    const maxAge = this.config.alertRetentionHours * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, alert] of this.alerts.entries()) {
      const age = now - alert.timestamp.getTime();
      if (age > maxAge) {
        this.alerts.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cleaned up old alerts', { removed });
    }
  }

  /**
   * Cleanup old metrics
   */
  private cleanupOldMetrics(): void {
    // Reset sync times array periodically
    if (this.syncTimes.length > this.maxSyncTimes) {
      this.syncTimes = this.syncTimes.slice(-this.maxSyncTimes);
    }
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.syncMetrics = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageSyncTime: 0,
      successRate: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };

    this.retryMetrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryAttempts: 0,
      retryRate: 0,
      byOperation: {},
    };

    this.syncTimes = [];

    logger.info('Metrics reset');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Monitoring configuration updated', { config: this.config });
  }
}
