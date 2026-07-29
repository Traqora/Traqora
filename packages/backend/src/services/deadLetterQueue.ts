/**
 * Dead Letter Queue for Failed Flight Sync Operations
 * Provides persistent storage and retry management for failed operations
 */

import { logger } from '../utils/logger';
import { DataSource } from 'typeorm';
import { Flight } from '../db/entities/Flight';

export interface DeadLetterEntry {
  id: string;
  operation: 'SYNC_FLIGHT' | 'BATCH_SYNC' | 'WEBHOOK_PROCESS' | 'STATUS_UPDATE';
  payload: any;
  error: string;
  errorType: string;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metadata: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface DeadLetterQueueConfig {
  maxEntries: number;
  maxAgeHours: number;
  defaultMaxRetries: number;
  retryIntervals: number[]; // milliseconds between retries
  autoRetryEnabled: boolean;
  autoRetryIntervalMinutes: number;
}

const DEFAULT_CONFIG: DeadLetterQueueConfig = {
  maxEntries: 10000,
  maxAgeHours: 168, // 7 days
  defaultMaxRetries: 5,
  retryIntervals: [60000, 300000, 900000, 3600000, 7200000], // 1m, 5m, 15m, 1h, 2h
  autoRetryEnabled: true,
  autoRetryIntervalMinutes: 5,
};

export class DeadLetterQueue {
  private queue: Map<string, DeadLetterEntry> = new Map();
  private config: DeadLetterQueueConfig;
  private dataSource: DataSource;
  private retryCallbacks: Map<string, (entry: DeadLetterEntry) => Promise<boolean>> = new Map();
  private autoRetryTimer?: NodeJS.Timeout;

  constructor(
    dataSource: DataSource,
    config?: Partial<DeadLetterQueueConfig>
  ) {
    this.dataSource = dataSource;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.autoRetryEnabled) {
      this.startAutoRetry();
    }
  }

  /**
   * Add failed operation to dead letter queue
   */
  async addEntry(
    operation: DeadLetterEntry['operation'],
    payload: any,
    error: Error,
    priority: DeadLetterEntry['priority'] = 'MEDIUM',
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const id = this.generateId();
    const errorType = this.classifyError(error);
    
    const entry: DeadLetterEntry = {
      id,
      operation,
      payload,
      error: error.message,
      errorType,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: this.config.defaultMaxRetries,
      priority,
      metadata,
      resolved: false,
    };

    // Calculate next retry time
    entry.nextRetryAt = this.calculateNextRetryTime(entry.retryCount);

    // Add to queue
    this.queue.set(id, entry);

    // Enforce max entries limit (remove oldest low priority entries first)
    this.enforceMaxEntries();

    // Persist to database
    await this.persistEntry(entry);

    logger.warn('Added entry to dead letter queue', {
      id,
      operation,
      errorType,
      priority,
      retryCount: entry.retryCount,
    });

    return id;
  }

  /**
   * Retry a specificentry
   */
  async retryEntry(id: string): Promise<boolean> {
    const entry = this.queue.get(id);
    if (!entry) {
      logger.error('Entry not found in dead letter queue', { id });
      return false;
    }

    if (entry.resolved) {
      logger.warn('Entry already resolved, skipping retry', { id });
      return false;
    }

    if (entry.retryCount >= entry.maxRetries) {
      logger.warn('Max retries exceeded for entry', { id, retryCount: entry.retryCount });
      return false;
    }

    const callback = this.retryCallbacks.get(entry.operation);
    if (!callback) {
      logger.error('No retry callback registered for operation', { operation: entry.operation });
      return false;
    }

    try {
      entry.retryCount++;
      const success = await callback(entry);

      if (success) {
        entry.resolved = true;
        entry.resolvedAt = new Date();
        await this.updateEntry(entry);
        logger.info('Successfully retried dead letter entry', { id, retryCount: entry.retryCount });
        return true;
      } else {
        entry.nextRetryAt = this.calculateNextRetryTime(entry.retryCount);
        await this.updateEntry(entry);
        logger.warn('Retry failed, scheduling next retry', { 
          id, 
          retryCount: entry.retryCount,
          nextRetryAt: entry.nextRetryAt 
        });
        return false;
      }
    } catch (error) {
      entry.nextRetryAt = this.calculateNextRetryTime(entry.retryCount);
      await this.updateEntry(entry);
      logger.error('Retry callback threw error', { 
        id, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Register retry callback for an operation type
   */
  registerRetryCallback(
    operation: DeadLetterEntry['operation'],
    callback: (entry: DeadLetterEntry) => Promise<boolean>
  ): void {
    this.retryCallbacks.set(operation, callback);
    logger.info('Registered retry callback', { operation });
  }

  /**
   * Get all entries
   */
  getEntries(filter?: {
    operation?: DeadLetterEntry['operation'];
    priority?: DeadLetterEntry['priority'];
    resolved?: boolean;
  }): DeadLetterEntry[] {
    let entries = Array.from(this.queue.values());

    if (filter?.operation) {
      entries = entries.filter(e => e.operation === filter.operation);
    }
    if (filter?.priority) {
      entries = entries.filter(e => e.priority === filter.priority);
    }
    if (filter?.resolved !== undefined) {
      entries = entries.filter(e => e.resolved === filter.resolved);
    }

    // Sort by priority (CRITICAL first) and timestamp (newest first)
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    entries.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return entries;
  }

  /**
   * Get entry by ID
   */
  getEntry(id: string): DeadLetterEntry | undefined {
    return this.queue.get(id);
  }

  /**
   * Remove entry from queue
   */
  async removeEntry(id: string): Promise<boolean> {
    const entry = this.queue.get(id);
    if (!entry) return false;

    this.queue.delete(id);
    await this.deletePersistedEntry(id);
    logger.info('Removed entry from dead letter queue', { id });
    return true;
  }

  /**
   * Mark entry as resolved
   */
  async markResolved(id: string): Promise<boolean> {
    const entry = this.queue.get(id);
    if (!entry) return false;

    entry.resolved = true;
    entry.resolvedAt = new Date();
    await this.updateEntry(entry);
    logger.info('Marked entry as resolved', { id });
    return true;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const entries = Array.from(this.queue.values());
    const byOperation: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byErrorType: Record<string, number> = {};

    for (const entry of entries) {
      byOperation[entry.operation] = (byOperation[entry.operation] || 0) + 1;
      byPriority[entry.priority] = (byPriority[entry.priority] || 0) + 1;
      byErrorType[entry.errorType] = (byErrorType[entry.errorType] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      unresolvedEntries: entries.filter(e => !e.resolved).length,
      resolvedEntries: entries.filter(e => e.resolved).length,
      byOperation,
      byPriority,
      byErrorType,
      config: this.config,
    };
  }

  /**
   * Clean up old entries
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    const maxAge = this.config.maxAgeHours * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, entry] of this.queue.entries()) {
      const age = now.getTime() - entry.timestamp.getTime();
      if (age > maxAge || (entry.resolved && entry.resolvedAt && 
          now.getTime() - entry.resolvedAt.getTime() > maxAge)) {
        await this.removeEntry(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cleaned up old dead letter entries', { removed });
    }

    return removed;
  }

  /**
   * Start automatic retry process
   */
  private startAutoRetry(): void {
    const intervalMs = this.config.autoRetryIntervalMinutes * 60 * 1000;
    
    this.autoRetryTimer = setInterval(async () => {
      await this.processAutoRetry();
    }, intervalMs);

    logger.info('Started automatic retry process', { intervalMinutes: this.config.autoRetryIntervalMinutes });
  }

  /**
   * Stop automatic retry process
   */
  stopAutoRetry(): void {
    if (this.autoRetryTimer) {
      clearInterval(this.autoRetryTimer);
      this.autoRetryTimer = undefined;
      logger.info('Stopped automatic retry process');
    }
  }

  /**
   * Process automatic retries
   */
  private async processAutoRetry(): Promise<void> {
    const now = new Date();
    const entriesToRetry = Array.from(this.queue.values()).filter(
      entry => !entry.resolved && 
               entry.retryCount < entry.maxRetries &&
               entry.nextRetryAt && 
               entry.nextRetryAt <= now
    );

    if (entriesToRetry.length === 0) {
      return;
    }

    logger.info('Processing automatic retries', { count: entriesToRetry.length });

    for (const entry of entriesToRetry) {
      try {
        await this.retryEntry(entry.id);
      } catch (error) {
        logger.error('Auto retry failed', { 
          id: entry.id, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  }

  /**
   * Calculate next retry time based on retry count
   */
  private calculateNextRetryTime(retryCount: number): Date {
    const intervalIndex = Math.min(retryCount, this.config.retryIntervals.length - 1);
    const intervalMs = this.config.retryIntervals[intervalIndex];
    return new Date(Date.now() + intervalMs);
  }

  /**
   * Classify error type
   */
  private classifyError(error: Error): string {
    const message = error.message.toUpperCase();
    
    if (message.includes('TIMEOUT') || message.includes('ETIMEDOUT')) return 'TIMEOUT';
    if (message.includes('NETWORK') || message.includes('ECONN')) return 'NETWORK_ERROR';
    if (message.includes('RATE_LIMIT')) return 'RATE_LIMIT';
    if (message.includes('AUTH')) return 'AUTHENTICATION_ERROR';
    if (message.includes('VALIDATION')) return 'VALIDATION_ERROR';
    if (message.includes('NOT_FOUND')) return 'NOT_FOUND';
    if (message.includes('DATABASE') || message.includes('SQL')) return 'DATABASE_ERROR';
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enforce max entries limit
   */
  private enforceMaxEntries(): void {
    if (this.queue.size <= this.config.maxEntries) return;

    const entries = Array.from(this.queue.entries());
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    
    // Sort by priority (ascending) and timestamp (oldest first)
    entries.sort(([, a], [, b]) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

    // Remove excess entries (starting with lowest priority, oldest)
    const toRemove = entries.slice(0, entries.length - this.config.maxEntries);
    for (const [id] of toRemove) {
      this.queue.delete(id);
      this.deletePersistedEntry(id).catch(err => 
        logger.error('Failed to delete persisted entry', { error: err })
      );
    }

    logger.warn('Enforced max entries limit', { 
      removed: toRemove.length, 
      maxEntries: this.config.maxEntries 
    });
  }

  /**
   * Persist entry to database
   */
  private async persistEntry(entry: DeadLetterEntry): Promise<void> {
    try {
      // In a real implementation, this would save to a dedicated dead_letter_queue table
      // For now, we'll use the Flight entity's sync attempts as a proxy
      const flightRepo = this.dataSource.getRepository(Flight);
      
      if (entry.operation === 'SYNC_FLIGHT' && entry.payload.flightNumber) {
        const flight = await flightRepo.findOne({
          where: { flightNumber: entry.payload.flightNumber }
        });
        
        if (flight) {
          flight.syncAttempts = (flight.syncAttempts || 0) + 1;
          await flightRepo.save(flight);
        }
      }
    } catch (error) {
      logger.error('Failed to persist dead letter entry', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Update persisted entry
   */
  private async updateEntry(entry: DeadLetterEntry): Promise<void> {
    try {
      // Similar to persistEntry, update the database record
      const flightRepo = this.dataSource.getRepository(Flight);
      
      if (entry.operation === 'SYNC_FLIGHT' && entry.payload.flightNumber) {
        const flight = await flightRepo.findOne({
          where: { flightNumber: entry.payload.flightNumber }
        });
        
        if (flight) {
          flight.syncAttempts = entry.retryCount;
          await flightRepo.save(flight);
        }
      }
    } catch (error) {
      logger.error('Failed to update dead letter entry', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Delete persisted entry
   */
  private async deletePersistedEntry(id: string): Promise<void> {
    try {
      // In a real implementation, this would delete from the dead_letter_queue table
      // For now, this is a no-op as we're using Flight entity as a proxy
    } catch (error) {
      logger.error('Failed to delete persisted entry', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Shutdown cleanup
   */
  async shutdown(): Promise<void> {
    this.stopAutoRetry();
    await this.cleanup();
    logger.info('Dead letter queue shutdown complete');
  }
}
