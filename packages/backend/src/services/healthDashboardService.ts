/**
 * Health Dashboard and Reporting Service
 * Provides comprehensive health reporting and dashboard data
 */

import { logger } from '../utils/logger';
import { HealthCheckService, SystemHealth } from './healthCheckService';
import { UptimeTracker, UptimeReport } from './uptimeTracker';
import { HealthAggregator } from './healthAggregator';
import { HealthHistoryStorage } from './healthHistoryStorage';
import { HealthAlertingService, Alert } from './healthAlertingService';

export interface DashboardData {
  timestamp: Date;
  overall: {
    status: string;
    uptime: number;
    uptimePercentage: number;
    activeAlerts: number;
  };
  components: {
    healthChecks: SystemHealth;
    uptime: UptimeReport;
  };
  trends: {
    hourly: Array<{
      hour: Date;
      status: string;
      checkCount: number;
    }>;
    direction: 'improving' | 'degrading' | 'stable';
  };
  alerts: Alert[];
  statistics: {
    totalChecks: number;
    healthyPercentage: number;
    averageResponseTime: number;
    byComponent: Record<string, any>;
  };
}

export interface HealthReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    overallStatus: string;
    uptimePercentage: number;
    totalDowntime: number;
    averageResponseTime: number;
    totalAlerts: number;
    criticalAlerts: number;
  };
  components: {
    database: {
      availability: number;
      averageResponseTime: number;
      incidents: number;
    };
    redis: {
      availability: number;
      averageResponseTime: number;
      incidents: number;
    };
    stellar: {
      availability: number;
      averageResponseTime: number;
      incidents: number;
    };
  };
  timeline: Array<{
    timestamp: Date;
    event: string;
    status: string;
  }>;
  recommendations: string[];
}

export interface HealthDashboardConfig {
  enabled: boolean;
  refreshIntervalMs: number;
  historyHours: number;
  includeAlerts: boolean;
  includeTrends: boolean;
}

const DEFAULT_CONFIG: HealthDashboardConfig = {
  enabled: true,
  refreshIntervalMs: 60000, // 1 minute
  historyHours: 24,
  includeAlerts: true,
  includeTrends: true,
};

export class HealthDashboardService {
  private config: HealthDashboardConfig;
  private healthCheckService: HealthCheckService;
  private uptimeTracker: UptimeTracker;
  private healthAggregator: HealthAggregator;
  private healthHistoryStorage: HealthHistoryStorage;
  private healthAlertingService: HealthAlertingService;

  constructor(
    healthCheckService: HealthCheckService,
    uptimeTracker: UptimeTracker,
    healthAggregator: HealthAggregator,
    healthHistoryStorage: HealthHistoryStorage,
    healthAlertingService: HealthAlertingService,
    config?: Partial<HealthDashboardConfig>
  ) {
    this.healthCheckService = healthCheckService;
    this.uptimeTracker = uptimeTracker;
    this.healthAggregator = healthAggregator;
    this.healthHistoryStorage = healthHistoryStorage;
    this.healthAlertingService = healthAlertingService;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    const healthChecks = await this.healthCheckService.getSystemHealth();
    const uptime = this.uptimeTracker.getUptimeReport();
    const aggregated = await this.healthAggregator.getAggregatedHealth();
    
    const startDate = new Date(Date.now() - this.config.historyHours * 60 * 60 * 1000);
    const endDate = new Date();
    
    const statistics = this.healthHistoryStorage.getStatistics(startDate, endDate);
    const trends = this.config.includeTrends 
      ? this.healthHistoryStorage.getTrends(this.config.historyHours)
      : { hourlyData: [], trend: 'stable' as const };
    
    const alerts = this.config.includeAlerts
      ? this.healthAlertingService.getAlerts({ acknowledged: false, limit: 10 })
      : [];

    return {
      timestamp: new Date(),
      overall: {
        status: aggregated.overallStatus,
        uptime: process.uptime(),
        uptimePercentage: uptime.summary.uptimePercentage,
        activeAlerts: alerts.length,
      },
      components: {
        healthChecks,
        uptime,
      },
      trends: {
        hourly: trends.hourlyData,
        direction: trends.trend,
      },
      alerts,
      statistics: {
        totalChecks: statistics.totalChecks,
        healthyPercentage: statistics.uptimePercentage,
        averageResponseTime: statistics.averageResponseTime,
        byComponent: statistics.byComponent,
      },
    };
  }

  /**
   * Generate health report for a period
   */
  async generateReport(startDate: Date, endDate: Date): Promise<HealthReport> {
    const history = this.healthHistoryStorage.getHistory({ startDate, endDate });
    const statistics = this.healthHistoryStorage.getStatistics(startDate, endDate);
    const alerts = this.healthAlertingService.getAlerts();
    const uptimeStats = this.uptimeTracker.getStatistics();

    // Calculate component statistics
    const componentStats = this.calculateComponentStatistics(history);

    // Build timeline
    const timeline = this.buildTimeline(history, alerts);

    // Generate recommendations
    const recommendations = this.generateRecommendations(statistics, componentStats, alerts);

    return {
      period: { start: startDate, end: endDate },
      summary: {
        overallStatus: this.determineOverallStatus(statistics),
        uptimePercentage: statistics.uptimePercentage,
        totalDowntime: uptimeStats.totalDowntime,
        averageResponseTime: statistics.averageResponseTime,
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'CRITICAL').length,
      },
      components: componentStats,
      timeline,
      recommendations,
    };
  }

  /**
   * Get real-time health summary
   */
  async getRealTimeSummary(): Promise<{
    status: string;
    uptime: number;
    uptimePercentage: number;
    activeAlerts: number;
    lastCheck: Date;
    components: Record<string, string>;
  }> {
    const healthChecks = await this.healthCheckService.getSystemHealth();
    const uptime = this.uptimeTracker.getUptimeReport();
    const alerts = this.healthAlertingService.getAlerts({ acknowledged: false });

    const components: Record<string, string> = {};
    for (const check of healthChecks.checks) {
      components[check.name] = check.status;
    }

    return {
      status: healthChecks.status,
      uptime: process.uptime(),
      uptimePercentage: uptime.summary.uptimePercentage,
      activeAlerts: alerts.length,
      lastCheck: healthChecks.timestamp,
      components,
    };
  }

  /**
   * Get health metrics for monitoring systems
   */
  async getHealthMetrics(): Promise<{
    health_status: number;
    uptime_percentage: number;
    response_time_ms: number;
    active_alerts: number;
    critical_alerts: number;
    degraded_components: number;
    unhealthy_components: number;
  }> {
    const healthChecks = await this.healthCheckService.getSystemHealth();
    const uptime = this.uptimeTracker.getUptimeReport();
    const alerts = this.healthAlertingService.getAlerts({ acknowledged: false });

    const healthStatus = healthChecks.status === 'healthy' ? 1 : 
                        healthChecks.status === 'degraded' ? 0.5 : 0;
    
    const degradedComponents = healthChecks.checks.filter(c => c.status === 'degraded').length;
    const unhealthyComponents = healthChecks.checks.filter(c => c.status === 'unhealthy').length;
    
    const averageResponseTime = healthChecks.checks.reduce((sum, c) => 
      sum + (c.responseTimeMs || 0), 0) / healthChecks.checks.length;

    return {
      health_status: healthStatus,
      uptime_percentage: uptime.summary.uptimePercentage,
      response_time_ms: averageResponseTime,
      active_alerts: alerts.length,
      critical_alerts: alerts.filter(a => a.severity === 'CRITICAL').length,
      degraded_components: degradedComponents,
      unhealthy_components: unhealthyComponents,
    };
  }

  /**
   * Calculate component statistics
   */
  private calculateComponentStatistics(history: any[]): HealthReport['components'] {
    const stats = {
      database: { availability: 100, averageResponseTime: 0, incidents: 0 },
      redis: { availability: 100, averageResponseTime: 0, incidents: 0 },
      stellar: { availability: 100, averageResponseTime: 0, incidents: 0 },
    };

    for (const entry of history) {
      for (const check of entry.checks) {
        if (stats[check.name as keyof typeof stats]) {
          const componentStats = stats[check.name as keyof typeof stats];
          
          if (check.status === 'healthy') {
            componentStats.availability += 1;
          } else {
            componentStats.incidents++;
          }
          
          if (check.responseTimeMs) {
            componentStats.averageResponseTime += check.responseTimeMs;
          }
        }
      }
    }

    // Normalize statistics
    const totalEntries = history.length || 1;
    for (const component of Object.values(stats)) {
      component.availability = (component.availability / totalEntries) * 100;
      component.averageResponseTime = component.averageResponseTime / totalEntries;
    }

    return stats;
  }

  /**
   * Build timeline from history and alerts
   */
  private buildTimeline(history: any[], alerts: Alert[]): HealthReport['timeline'] {
    const timeline: HealthReport['timeline'] = [];

    // Add status changes from history
    for (const entry of history) {
      if (entry.overallStatus !== 'healthy') {
        timeline.push({
          timestamp: entry.timestamp,
          event: 'Status Change',
          status: entry.overallStatus,
        });
      }
    }

    // Add alerts
    for (const alert of alerts) {
      timeline.push({
        timestamp: alert.timestamp,
        event: `Alert: ${alert.ruleName}`,
        status: alert.severity,
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return timeline.slice(-50); // Limit to last 50 events
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    statistics: any,
    componentStats: HealthReport['components'],
    alerts: Alert[]
  ): string[] {
    const recommendations: string[] = [];

    // Overall health recommendations
    if (statistics.uptimePercentage < 99) {
      recommendations.push('System uptime is below 99% - investigate reliability issues');
    }

    if (statistics.averageResponseTime > 1000) {
      recommendations.push('Average response time is high - consider performance optimization');
    }

    // Component-specific recommendations
    if (componentStats.database.availability < 99.9) {
      recommendations.push('Database availability is below 99.9% - investigate database connectivity');
    }

    if (componentStats.redis.availability < 99.9) {
      recommendations.push('Redis availability is below 99.9% - investigate cache connectivity');
    }

    if (componentStats.stellar.availability < 99) {
      recommendations.push('Stellar Horizon availability is below 99% - investigate blockchain connectivity');
    }

    // Alert-based recommendations
    const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && !a.acknowledged);
    if (criticalAlerts.length > 0) {
      recommendations.push(`${criticalAlerts.length} unacknowledged critical alerts require attention`);
    }

    return recommendations;
  }

  /**
   * Determine overall status from statistics
   */
  private determineOverallStatus(statistics: any): string {
    if (statistics.uptimePercentage >= 99.9) return 'healthy';
    if (statistics.uptimePercentage >= 99) return 'degraded';
    return 'unhealthy';
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthDashboardConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Health dashboard configuration updated', { config: this.config });
  }
}
