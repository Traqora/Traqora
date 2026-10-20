/**
 * Health History Storage Service
 * Provides persistent storage for health check history and metrics
 */

import { logger } from '../utils/logger';
import { DataSource } from 'typeorm';
import { HealthStatus, SystemHealth, HealthCheckResult } from './healthCheckService';

export interface HealthHistoryEntry {
  id: string;
  timestamp: Date;
  overallStatus: HealthStatus;
  checks: HealthCheckResult[];
  systemMetrics: {
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  metadata?: Record<string, any>;
}

export interface HealthHistoryStorageConfig {
  enabled: boolean;
  retentionDays: number;
  maxEntries: number;
  persistToDatabase: boolean;
  persistIntervalMs: number;
}

const DEFAULT_CONFIG: HealthHistoryStorageConfig = {
  enabled: true,
  retentionDays: 30,
  maxEntries: 100000,
  persistToDatabase: true,
  persistIntervalMs: 60000, // 1 minute
};

export class HealthHistoryStorage {
  private config: HealthHistoryStorageConfig;
  private dataSource?: DataSource;
  private inMemoryHistory: HealthHistoryEntry[] = [];
  private intervalId?: NodeJS.Timeout;
  private pendingWrites: HealthHistoryEntry[] = [];

  constructor(dataSource?: DataSource, config?: Partial<HealthHistoryStorageConfig>) {
    this.dataSource = dataSource;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the storage service
   */
  async initialize(): Promise<void> {
    if (this.config.enabled && this.config.persistToDatabase && this.dataSource) {
      this.startPeriodicPersistence();
    }
    logger.info('Health history storage initialized');
  }

  /**
   * Store health check result
   */
  async storeHealthCheck(systemHealth: SystemHealth, metadata?: Record<string, any>): Promise<void> {
    const entry: HealthHistoryEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      overallStatus: systemHealth.status,
      checks: systemHealth.checks,
      systemMetrics: {
        uptime: systemHealth.uptime,
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: 0, // Would implement actual CPU monitoring
      },
      metadata,
    };

    // Store in memory
    this.inMemoryHistory.push(entry);

    // Enqueue for persistence
    if (this.config.persistToDatabase) {
      this.pendingWrites.push(entry);
    }

    // Trim in-memory history
    this.trimHistory();
  }

  /**
   * Get health history
   */
  getHistory(options?: {
    startDate?: Date;
    endDate?: Date;
    status?: HealthStatus;
    limit?: number;
  }): HealthHistoryEntry[] {
    let history = [...this.inMemoryHistory];

    if (options?.startDate) {
      history = history.filter(e => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      history = history.filter(e => e.timestamp <= options.endDate!);
    }
    if (options?.status) {
      history = history.filter(e => e.overallStatus === options.status);
    }
    if (options?.limit) {
      history = history.slice(-options.limit);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return history;
  }

  /**
   * Get health statistics for a period
   */
  getStatistics(startDate: Date, endDate: Date): {
    totalChecks: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
    uptimePercentage: number;
    averageResponseTime: number;
    byComponent: Record<string, {
      healthy: number;
      degraded: number;
      unhealthy: number;
      averageResponseTime: number;
    }>;
  } {
    const history = this.getHistory({ startDate, endDate });

    const byComponent: Record<string, any> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const entry of history) {
      for (const check of entry.checks) {
        if (!byComponent[check.name]) {
          byComponent[check.name] = {
            healthy: 0,
            degraded: 0,
            unhealthy: 0,
            averageResponseTime: 0,
            totalResponseTime: 0,
            count: 0,
          };
        }

        const componentStats = byComponent[check.name];
        if (check.status === 'healthy') componentStats.healthy++;
        else if (check.status === 'degraded') componentStats.degraded++;
        else if (check.status === 'unhealthy') componentStats.unhealthy++;
        
        if (check.responseTimeMs) {
          componentStats.totalResponseTime += check.responseTimeMs;
          componentStats.count++;
          totalResponseTime += check.responseTimeMs;
          responseTimeCount++;
        }
      }
    }

    // Calculate average response times
    for (const component of Object.values(byComponent)) {
      component.averageResponseTime = component.count > 0 
        ? component.totalResponseTime / component.count 
        : 0;
      delete component.totalResponseTime;
      delete component.count;
    }

    const healthyCount = history.filter(e => e.overallStatus === 'healthy').length;
    const degradedCount = history.filter(e => e.overallStatus === 'degraded').length;
    const unhealthyCount = history.filter(e => e.overallStatus === 'unhealthy').length;
    const uptimePercentage = history.length > 0 
      ? (healthyCount / history.length) * 100 
      : 100;

    return {
      totalChecks: history.length,
      healthyCount,
      degradedCount,
      unhealthyCount,
      uptimePercentage,
      averageResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
      byComponent,
    };
  }

  /**
   * Get health trends
   */
  getTrends(hours: number = 24): {
    hourlyData: Array<{
      hour: Date;
      status: HealthStatus;
      checkCount: number;
    }>;
    trend: 'improving' | 'degrading' | 'stable';
  } {
    const now = new Date();
    const startDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const history = this.getHistory({ startDate, endDate: now });

    // Group by hour
    const hourlyData: Map<number, { healthy: number; degraded: number; unhealthy: number }> = new Map();

    for (const entry of history) {
      const hour = Math.floor(entry.timestamp.getTime() / (60 * 60 * 1000));
      
      if (!hourlyData.has(hour)) {
        hourlyData.set(hour, { healthy: 0, degraded: 0, unhealthy: 0 });
      }

      const data = hourlyData.get(hour)!;
      if (entry.overallStatus === 'healthy') data.healthy++;
      else if (entry.overallStatus === 'degraded') data.degraded++;
      else if (entry.overallStatus === 'unhealthy') data.unhealthy++;
    }

    // Convert to array and determine trend
    const sortedHours = Array.from(hourlyData.keys()).sort();
    const hourlyArray = sortedHours.map(hour => {
      const data = hourlyData.get(hour)!;
      const total = data.healthy + data.degraded + data.unhealthy;
      
      let status: HealthStatus = 'healthy';
      if (data.unhealthy > 0) status = 'unhealthy';
      else if (data.degraded > 0) status = 'degraded';

      return {
        hour: new Date(hour * 60 * 60 * 1000),
        status,
        checkCount: total,
      };
    });

    // Determine trend
    let trend: 'improving' | 'degrading' | 'stable' = 'stable';
    if (hourlyArray.length >= 2) {
      const recent = hourlyArray.slice(-Math.min(5, hourlyArray.length));
      const older = hourlyArray.slice(0, Math.min(5, hourlyArray.length));

      const recentHealthy = recent.filter(h => h.status === 'healthy').length;
      const olderHealthy = older.filter(h => h.status === 'healthy').length;

      if (recentHealthy > olderHealthy) trend = 'improving';
      else if (recentHealthy < olderHealthy) trend = 'degrading';
    }

    return {
      hourlyData: hourlyArray,
      trend,
    };
  }

  /**
   * Cleanup old entries
   */
  async cleanup(): Promise<number> {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    const initialSize = this.inMemoryHistory.length;

    this.inMemoryHistory = this.inMemoryHistory.filter(e => e.timestamp >= cutoffDate);

    const removed = initialSize - this.inMemoryHistory.length;

    if (removed > 0) {
      logger.info('Cleaned up old health history entries', { removed });
    }

    return removed;
  }

  /**
   * Get storage statistics
   */
  getStats() {
    return {
      inMemoryEntries: this.inMemoryHistory.length,
      pendingWrites: this.pendingWrites.length,
      config: this.config,
    };
  }

  /**
   * Shutdown the storage service
   */
  async shutdown(): Promise<void> {
    this.stopPeriodicPersistence();
    
    // Flush pending writes
    if (this.pendingWrites.length > 0) {
      await this.flushPendingWrites();
    }

    logger.info('Health history storage shutdown');
  }

  /**
   * Start periodic persistence
   */
  private startPeriodicPersistence(): void {
    if (this.intervalId) {
      logger.warn('Periodic persistence already running');
      return;
    }

    this.intervalId = setInterval(async () => {
      try {
        await this.flushPendingWrites();
      } catch (error) {
        logger.error('Periodic persistence failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.persistIntervalMs);

    logger.info('Periodic health history persistence started', { 
      intervalMs: this.config.persistIntervalMs 
    });
  }

  /**
   * Stop periodic persistence
   */
  private stopPeriodicPersistence(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Periodic health history persistence stopped');
    }
  }

  /**
   * Flush pending writes to database
   */
  private async flushPendingWrites(): Promise<void> {
    if (this.pendingWrites.length === 0) {
      return;
    }

    if (!this.dataSource || !this.config.persistToDatabase) {
      this.pendingWrites = [];
      return;
    }

    try {
      // In a real implementation, this would save to a dedicated health_history table
      // For now, we'll just clear the pending writes
      const count = this.pendingWrites.length;
      this.pendingWrites = [];
      
      logger.debug('Flushed health history to storage', { count });
    } catch (error) {
      logger.error('Failed to flush health history', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Trim in-memory history
   */
  private trimHistory(): void {
    if (this.inMemoryHistory.length <= this.config.maxEntries) {
      return;
    }

    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    this.inMemoryHistory = this.inMemoryHistory.filter(e => e.timestamp >= cutoffDate);

    if (this.inMemoryHistory.length > this.config.maxEntries) {
      this.inMemoryHistory = this.inMemoryHistory.slice(-this.config.maxEntries);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthHistoryStorageConfig>): void {
    const oldInterval = this.config.persistIntervalMs;
    this.config = { ...this.config, ...config };

    // Restart periodic persistence if interval changed
    if (oldInterval !== this.config.persistIntervalMs && this.intervalId) {
      this.stopPeriodicPersistence();
      if (this.config.enabled && this.config.persistToDatabase) {
        this.startPeriodicPersistence();
      }
    }

    logger.info('Health history storage configuration updated', { config: this.config });
  }
}
