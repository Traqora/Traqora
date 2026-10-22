/**
 * Health Status Aggregation Service
 * Aggregates health status from multiple sources and provides unified health reporting
 */

import { logger } from '../utils/logger';
import { HealthCheckService, SystemHealth, HealthStatus, HealthCheckResult } from './healthCheckService';
import { UptimeTracker, UptimeReport } from './uptimeTracker';
import { EventEmitter } from 'events';

export interface AggregatedHealth {
  timestamp: Date;
  overallStatus: HealthStatus;
  components: {
    healthChecks: SystemHealth;
    uptime: UptimeReport;
    systemMetrics: SystemMetrics;
  };
  alerts: HealthAlert[];
  recommendations: string[];
}

export interface SystemMetrics {
  cpu: {
    usagePercent: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    usagePercent: number;
  };
  disk: {
    used: number;
    total: number;
    usagePercent: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connections: number;
  };
}

export interface HealthAlert {
  id: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  component: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface HealthAggregatorConfig {
  enabled: boolean;
  aggregationIntervalMs: number;
  alertThresholds: {
    cpuUsagePercent: number;
    memoryUsagePercent: number;
    diskUsagePercent: number;
    responseTimeMs: number;
    uptimePercentage: number;
  };
}

const DEFAULT_CONFIG: HealthAggregatorConfig = {
  enabled: true,
  aggregationIntervalMs: 60000, // 1 minute
  alertThresholds: {
    cpuUsagePercent: 80,
    memoryUsagePercent: 85,
    diskUsagePercent: 90,
    responseTimeMs: 2000,
    uptimePercentage: 99.5,
  },
};

export class HealthAggregator extends EventEmitter {
  private config: HealthAggregatorConfig;
  private healthCheckService: HealthCheckService;
  private uptimeTracker: UptimeTracker;
  private alerts: Map<string, HealthAlert> = new Map();
  private intervalId?: NodeJS.Timeout;
  private lastAggregatedHealth?: AggregatedHealth;

  constructor(
    healthCheckService: HealthCheckService,
    uptimeTracker: UptimeTracker,
    config?: Partial<HealthAggregatorConfig>
  ) {
    super();
    this.healthCheckService = healthCheckService;
    this.uptimeTracker = uptimeTracker;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Listen to health check events
    this.healthCheckService.on('healthCheck', this.handleHealthCheck.bind(this));
    this.healthCheckService.on('criticalFailure', this.handleCriticalFailure.bind(this));

    // Listen to uptime events
    this.uptimeTracker.on('statusChange', this.handleStatusChange.bind(this));
    this.uptimeTracker.on('systemDown', this.handleSystemDown.bind(this));
    this.uptimeTracker.on('systemUp', this.handleSystemUp.bind(this));
    this.uptimeTracker.on('slaBreach', this.handleSlaBreach.bind(this));
  }

  /**
   * Initialize the aggregator
   */
  initialize(): void {
    if (this.config.enabled) {
      this.startAggregation();
    }
    logger.info('Health aggregator initialized');
  }

  /**
   * Get aggregated health
   */
  async getAggregatedHealth(): Promise<AggregatedHealth> {
    const healthChecks = await this.healthCheckService.getSystemHealth();
    const uptime = this.uptimeTracker.getUptimeReport();
    const systemMetrics = this.collectSystemMetrics();

    const overallStatus = this.calculateOverallStatus(healthChecks, uptime, systemMetrics);
    const recommendations = this.generateRecommendations(healthChecks, uptime, systemMetrics);
    const activeAlerts = this.getActiveAlerts();

    const aggregatedHealth: AggregatedHealth = {
      timestamp: new Date(),
      overallStatus,
      components: {
        healthChecks,
        uptime,
        systemMetrics,
      },
      alerts: activeAlerts,
      recommendations,
    };

    this.lastAggregatedHealth = aggregatedHealth;
    return aggregatedHealth;
  }

  /**
   * Get health summary
   */
  async getHealthSummary(): Promise<{
    status: HealthStatus;
    uptime: number;
    uptimePercentage: number;
    activeAlerts: number;
    criticalIssues: number;
    lastCheck: Date;
  }> {
    const aggregated = await this.getAggregatedHealth();

    return {
      status: aggregated.overallStatus,
      uptime: process.uptime(),
      uptimePercentage: aggregated.components.uptime.summary.uptimePercentage,
      activeAlerts: aggregated.alerts.filter(a => !a.resolved).length,
      criticalIssues: aggregated.alerts.filter(a => !a.resolved && a.severity === 'CRITICAL').length,
      lastCheck: aggregated.timestamp,
    };
  }

  /**
   * Get alerts
   */
  getAlerts(filter?: {
    severity?: HealthAlert['severity'];
    resolved?: boolean;
    component?: string;
  }): HealthAlert[] {
    let alerts = Array.from(this.alerts.values());

    if (filter?.severity) {
      alerts = alerts.filter(a => a.severity === filter.severity);
    }
    if (filter?.resolved !== undefined) {
      alerts = alerts.filter(a => a.resolved === filter.resolved);
    }
    if (filter?.component) {
      alerts = alerts.filter(a => a.component === filter.component);
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return alerts;
  }

  /**
   * Create alert
   */
  createAlert(
    severity: HealthAlert['severity'],
    component: string,
    message: string
  ): string {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: HealthAlert = {
      id,
      severity,
      component,
      message,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.set(id, alert);
    this.emit('alertCreated', alert);

    logger.warn('Health alert created', { id, severity, component, message });

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
    this.emit('alertResolved', alert);

    logger.info('Health alert resolved', { id, component: alert.component });

    return true;
  }

  /**
   * Start aggregation
   */
  startAggregation(): void {
    if (this.intervalId) {
      logger.warn('Health aggregation already running');
      return;
    }

    this.intervalId = setInterval(async () => {
      try {
        const health = await this.getAggregatedHealth();
        this.emit('aggregatedHealth', health);
      } catch (error) {
        logger.error('Health aggregation failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.aggregationIntervalMs);

    logger.info('Health aggregation started', { 
      intervalMs: this.config.aggregationIntervalMs 
    });
  }

  /**
   * Stop aggregation
   */
  stopAggregation(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Health aggregation stopped');
    }
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    this.stopAggregation();
    logger.info('Health aggregator shutdown');
  }

  /**
   * Handle health check event
   */
  private handleHealthCheck(systemHealth: SystemHealth): void {
    // Check for degraded or unhealthy components
    for (const check of systemHealth.checks) {
      if (check.status === 'unhealthy' || check.status === 'degraded') {
        const severity = check.status === 'unhealthy' ? 'ERROR' : 'WARNING';
        this.createAlert(severity, check.name, check.message || 'Health check failed');
      }
    }
  }

  /**
   * Handle critical failure event
   */
  private handleCriticalFailure(systemHealth: SystemHealth): void {
    this.createAlert('CRITICAL', 'system', 'Critical system failure detected');
  }

  /**
   * Handle status change event
   */
  private handleStatusChange(event: any): void {
    if (event.eventType === 'DOWN') {
      this.createAlert('CRITICAL', 'system', 'System went down');
    } else if (event.eventType === 'DEGRADED') {
      this.createAlert('WARNING', 'system', 'System degraded');
    }
  }

  /**
   * Handle system down event
   */
  private handleSystemDown(event: any): void {
    this.createAlert('CRITICAL', 'system', 'System is down');
  }

  /**
   * Handle system up event
   */
  private handleSystemUp(event: any): void {
    // Resolve any critical system alerts
    const systemAlerts = Array.from(this.alerts.values())
      .filter(a => a.component === 'system' && !a.resolved);
    
    for (const alert of systemAlerts) {
      this.resolveAlert(alert.id);
    }
  }

  /**
   * Handle SLA breach event
   */
  private handleSlaBreach(report: UptimeReport): void {
    this.createAlert(
      'ERROR',
      'sla',
      `SLA breach detected: ${report.slaCompliance?.actual.toFixed(2)}% uptime (target: ${report.slaCompliance?.target}%)`
    );
  }

  /**
   * Calculate overall status
   */
  private calculateOverallStatus(
    healthChecks: SystemHealth,
    uptime: UptimeReport,
    metrics: SystemMetrics
  ): HealthStatus {
    // Start with health check status
    let status = healthChecks.status;

    // Downgrade if uptime is below threshold
    if (uptime.slaCompliance && uptime.slaCompliance.actual < this.config.alertThresholds.uptimePercentage) {
      if (status === 'healthy') {
        status = 'degraded';
      }
    }

    // Downgrade if CPU is high
    if (metrics.cpu.usagePercent > this.config.alertThresholds.cpuUsagePercent) {
      if (status === 'healthy') {
        status = 'degraded';
      }
    }

    // Downgrade if memory is high
    if (metrics.memory.usagePercent > this.config.alertThresholds.memoryUsagePercent) {
      if (status === 'healthy') {
        status = 'degraded';
      }
    }

    // Downgrade if disk is high
    if (metrics.disk.usagePercent > this.config.alertThresholds.diskUsagePercent) {
      if (status === 'healthy') {
        status = 'degraded';
      }
    }

    return status;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    healthChecks: SystemHealth,
    uptime: UptimeReport,
    metrics: SystemMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Health check recommendations
    for (const check of healthChecks.checks) {
      if (check.status === 'unhealthy') {
        recommendations.push(`Investigate ${check.name} health check failure`);
      } else if (check.status === 'degraded') {
        recommendations.push(`Monitor ${check.name} performance`);
      }
    }

    // Uptime recommendations
    if (uptime.slaCompliance && !uptime.slaCompliance.met) {
      recommendations.push('Improve system reliability to meet SLA targets');
    }

    // CPU recommendations
    if (metrics.cpu.usagePercent > this.config.alertThresholds.cpuUsagePercent) {
      recommendations.push('High CPU usage detected - consider scaling or optimization');
    }

    // Memory recommendations
    if (metrics.memory.usagePercent > this.config.alertThresholds.memoryUsagePercent) {
      recommendations.push('High memory usage detected - consider scaling or optimization');
    }

    // Disk recommendations
    if (metrics.disk.usagePercent > this.config.alertThresholds.diskUsagePercent) {
      recommendations.push('Disk space running low - consider cleanup or expansion');
    }

    return recommendations;
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();

    return {
      cpu: {
        usagePercent: 0, // Would implement actual CPU monitoring
        loadAverage: [0, 0, 0], // Would implement actual load average
      },
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        usagePercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      disk: {
        used: 0, // Would implement actual disk monitoring
        total: 0,
        usagePercent: 0,
      },
      network: {
        bytesIn: 0, // Would implement actual network monitoring
        bytesOut: 0,
        connections: 0,
      },
    };
  }

  /**
   * Get active alerts
   */
  private getActiveAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthAggregatorConfig>): void {
    const oldInterval = this.config.aggregationIntervalMs;
    this.config = { ...this.config, ...config };

    // Restart aggregation if interval changed
    if (oldInterval !== this.config.aggregationIntervalMs && this.intervalId) {
      this.stopAggregation();
      if (this.config.enabled) {
        this.startAggregation();
      }
    }

    logger.info('Health aggregator configuration updated', { config: this.config });
  }
}
