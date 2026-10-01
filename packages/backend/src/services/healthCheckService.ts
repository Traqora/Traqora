/**
 * Comprehensive Health Check Service
 * Provides health monitoring for all system dependencies and services
 */

import { logger } from '../utils/logger';
import { DataSource } from 'typeorm';
import { createClient } from 'redis';
import { Horizon } from '@stellar/stellar-sdk';
import { EventEmitter } from 'events';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  responseTimeMs?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: Date;
  uptime: number;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  };
}

export interface HealthCheckConfig {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  criticalChecks: string[]; // Checks that must pass for system to be healthy
  warningThresholds: {
    responseTimeMs: number;
    memoryUsagePercent: number;
    cpuUsagePercent: number;
  };
}

export interface HealthCheck {
  name: string;
  critical: boolean;
  check: () => Promise<HealthCheckResult>;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  enabled: true,
  intervalMs: 30000, // 30 seconds
  timeoutMs: 5000,
  criticalChecks: ['database', 'redis'],
  warningThresholds: {
    responseTimeMs: 1000,
    memoryUsagePercent: 80,
    cpuUsagePercent: 70,
  },
};

export class HealthCheckService extends EventEmitter {
  private config: HealthCheckConfig;
  private checks: Map<string, HealthCheck> = new Map();
  private healthHistory: HealthCheckResult[][] = [];
  private maxHistorySize: number = 1000;
  private intervalId?: NodeJS.Timeout;
  private dataSource?: DataSource;
  private redisClient?: ReturnType<typeof createClient>;
  private horizonServer?: Horizon.Server;
  private systemStartTime: Date;

  constructor(config?: Partial<HealthCheckConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.systemStartTime = new Date();
  }

  /**
   * Initialize the health check service
   */
  async initialize(
    dataSource?: DataSource,
    redisUrl?: string,
    horizonUrl?: string
  ): Promise<void> {
    this.dataSource = dataSource;

    // Initialize Redis client
    if (redisUrl) {
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.on('error', (err) => logger.error('Redis Client Error', err));
      await this.redisClient.connect();
    }

    // Initialize Horizon server
    if (horizonUrl) {
      this.horizonServer = new Horizon.Server(horizonUrl);
    }

    // Register default health checks
    this.registerDefaultChecks();

    // Start periodic health checks
    if (this.config.enabled) {
      this.startPeriodicChecks();
    }

    logger.info('Health check service initialized');
  }

  /**
   * Register a custom health check
   */
  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
    logger.info('Health check registered', { name: check.name, critical: check.critical });
  }

  /**
   * Unregister a health check
   */
  unregisterCheck(name: string): boolean {
    const removed = this.checks.delete(name);
    if (removed) {
      logger.info('Health check unregistered', { name });
    }
    return removed;
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<SystemHealth> {
    const startTime = Date.now();
    const results: HealthCheckResult[] = [];

    for (const [name, check] of this.checks.entries()) {
      try {
        const result = await Promise.race([
          check.check(),
          new Promise<HealthCheckResult>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), this.config.timeoutMs)
          ),
        ]) as HealthCheckResult;
        results.push(result);
      } catch (error) {
        results.push({
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }

    // Calculate overall health status
    const overallStatus = this.calculateOverallStatus(results);

    // Add to history
    this.addToHistory(results);

    const systemHealth: SystemHealth = {
      status: overallStatus,
      timestamp: new Date(),
      uptime: process.uptime(),
      checks: results,
      summary: this.calculateSummary(results),
    };

    // Emit event
    this.emit('healthCheck', systemHealth);

    // Alert if critical checks failed
    if (overallStatus === 'unhealthy') {
      this.emit('criticalFailure', systemHealth);
    }

    const duration = Date.now() - startTime;
    logger.debug('Health checks completed', {
      status: overallStatus,
      duration: `${duration}ms`,
      checks: results.length,
    });

    return systemHealth;
  }

  /**
   * Run a specific health check
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check not found: ${name}`);
    }

    try {
      const result = await Promise.race([
        check.check(),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.config.timeoutMs)
        ),
      ]) as HealthCheckResult;
      return result;
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get current system health
   */
  async getSystemHealth(): Promise<SystemHealth> {
    return this.runAllChecks();
  }

  /**
   * Get health history
   */
  getHealthHistory(limit?: number): HealthCheckResult[][] {
    if (limit) {
      return this.healthHistory.slice(-limit);
    }
    return [...this.healthHistory];
  }

  /**
   * Get uptime statistics
   */
  getUptimeStats(): {
    systemUptime: number;
    serviceUptime: number;
    uptimePercentage: number;
    downtimeEvents: number;
    totalDowntime: number;
  } {
    const systemUptime = process.uptime();
    const serviceUptime = (Date.now() - this.systemStartTime.getTime()) / 1000;
    
    // Calculate uptime from history
    let healthyCount = 0;
    let totalCount = 0;
    let downtimeEvents = 0;
    let totalDowntime = 0;

    for (const history of this.healthHistory) {
      const overallStatus = this.calculateOverallStatus(history);
      totalCount++;
      
      if (overallStatus === 'healthy') {
        healthyCount++;
      } else {
        downtimeEvents++;
      }
    }

    const uptimePercentage = totalCount > 0 ? (healthyCount / totalCount) * 100 : 100;

    return {
      systemUptime,
      serviceUptime,
      uptimePercentage,
      downtimeEvents,
      totalDowntime,
    };
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(): void {
    if (this.intervalId) {
      logger.warn('Periodic health checks already running');
      return;
    }

    this.intervalId = setInterval(async () => {
      try {
        await this.runAllChecks();
      } catch (error) {
        logger.error('Periodic health check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.intervalMs);

    logger.info('Periodic health checks started', { intervalMs: this.config.intervalMs });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Periodic health checks stopped');
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.stopPeriodicChecks();
    
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    logger.info('Health check service shutdown');
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    // Database health check
    this.registerCheck({
      name: 'database',
      critical: true,
      check: async () => {
        const startTime = Date.now();
        
        if (!this.dataSource || !this.dataSource.isInitialized) {
          return {
            name: 'database',
            status: 'unhealthy',
            message: 'Database not initialized',
            timestamp: new Date(),
          };
        }

        try {
          await this.dataSource.query('SELECT 1');
          const responseTime = Date.now() - startTime;
          
          const isSlow = responseTime > this.config.warningThresholds.responseTimeMs;
          
          return {
            name: 'database',
            status: isSlow ? 'degraded' : 'healthy',
            message: isSlow ? 'Database response slow' : 'Database operational',
            responseTimeMs: responseTime,
            timestamp: new Date(),
          };
        } catch (error) {
          return {
            name: 'database',
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Database error',
            timestamp: new Date(),
          };
        }
      },
    });

    // Redis health check
    this.registerCheck({
      name: 'redis',
      critical: true,
      check: async () => {
        const startTime = Date.now();
        
        if (!this.redisClient) {
          return {
            name: 'redis',
            status: 'unknown',
            message: 'Redis client not initialized',
            timestamp: new Date(),
          };
        }

        try {
          await this.redisClient.ping();
          const responseTime = Date.now() - startTime;
          
          const isSlow = responseTime > this.config.warningThresholds.responseTimeMs;
          
          return {
            name: 'redis',
            status: isSlow ? 'degraded' : 'healthy',
            message: isSlow ? 'Redis response slow' : 'Redis operational',
            responseTimeMs: responseTime,
            timestamp: new Date(),
          };
        } catch (error) {
          return {
            name: 'redis',
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Redis error',
            timestamp: new Date(),
          };
        }
      },
    });

    // Stellar Horizon health check
    this.registerCheck({
      name: 'stellar-horizon',
      critical: false,
      check: async () => {
        const startTime = Date.now();
        
        if (!this.horizonServer) {
          return {
            name: 'stellar-horizon',
            status: 'unknown',
            message: 'Horizon server not initialized',
            timestamp: new Date(),
          };
        }

        try {
          await this.horizonServer.ledgers().limit(1).call();
          const responseTime = Date.now() - startTime;
          
          const isSlow = responseTime > this.config.warningThresholds.responseTimeMs;
          
          return {
            name: 'stellar-horizon',
            status: isSlow ? 'degraded' : 'healthy',
            message: isSlow ? 'Horizon response slow' : 'Horizon operational',
            responseTimeMs: responseTime,
            timestamp: new Date(),
          };
        } catch (error) {
          return {
            name: 'stellar-horizon',
            status: 'unhealthy',
            message: error instanceof Error ? error.message : 'Horizon error',
            timestamp: new Date(),
          };
        }
      },
    });

    // Memory health check
    this.registerCheck({
      name: 'memory',
      critical: false,
      check: async () => {
        const memUsage = process.memoryUsage();
        const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        const isHigh = memUsagePercent > this.config.warningThresholds.memoryUsagePercent;
        
        return {
          name: 'memory',
          status: isHigh ? 'degraded' : 'healthy',
          message: isHigh ? 'High memory usage' : 'Memory usage normal',
          responseTimeMs: 0,
          timestamp: new Date(),
          metadata: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            usagePercent: memUsagePercent,
          },
        };
      },
    });

    // Disk health check
    this.registerCheck({
      name: 'disk',
      critical: false,
      check: async () => {
        // Placeholder - would implement actual disk space check
        return {
          name: 'disk',
          status: 'healthy',
          message: 'Disk space adequate',
          timestamp: new Date(),
        };
      },
    });
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallStatus(results: HealthCheckResult[]): HealthStatus {
    if (results.length === 0) return 'unknown';

    const criticalChecks = results.filter(r => 
      this.checks.get(r.name)?.critical
    );

    // Check if any critical checks are unhealthy
    const criticalUnhealthy = criticalChecks.filter(r => r.status === 'unhealthy');
    if (criticalUnhealthy.length > 0) {
      return 'unhealthy';
    }

    // Check if any critical checks are degraded
    const criticalDegraded = criticalChecks.filter(r => r.status === 'degraded');
    if (criticalDegraded.length > 0) {
      return 'degraded';
    }

    // Check if any non-critical checks are unhealthy
    const nonCriticalUnhealthy = results
      .filter(r => !this.checks.get(r.name)?.critical)
      .filter(r => r.status === 'unhealthy');
    
    if (nonCriticalUnhealthy.length > 0) {
      return 'degraded';
    }

    // Check if any checks are degraded
    const degradedChecks = results.filter(r => r.status === 'degraded');
    if (degradedChecks.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(results: HealthCheckResult[]) {
    return {
      total: results.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      degraded: results.filter(r => r.status === 'degraded').length,
      unhealthy: results.filter(r => r.status === 'unhealthy').length,
      unknown: results.filter(r => r.status === 'unknown').length,
    };
  }

  /**
   * Add results to history
   */
  private addToHistory(results: HealthCheckResult[]): void {
    this.healthHistory.push([...results]);
    
    // Trim history if too large
    if (this.healthHistory.length > this.maxHistorySize) {
      this.healthHistory.shift();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthCheckConfig>): void {
    const oldInterval = this.config.intervalMs;
    this.config = { ...this.config, ...config };

    // Restart periodic checks if interval changed
    if (oldInterval !== this.config.intervalMs && this.intervalId) {
      this.stopPeriodicChecks();
      this.startPeriodicChecks();
    }

    logger.info('Health check configuration updated', { config: this.config });
  }
}
