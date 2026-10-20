/**
 * Uptime Tracking and Reporting Service
 * Tracks system uptime, downtime events, and generates uptime reports
 */

import { logger } from '../utils/logger';
import { HealthStatus } from './healthCheckService';
import { EventEmitter } from 'events';

export interface UptimeEvent {
  id: string;
  timestamp: Date;
  eventType: 'UP' | 'DOWN' | 'DEGRADED';
  previousStatus?: HealthStatus;
  newStatus: HealthStatus;
  duration?: number; // Duration of previous state in milliseconds
  metadata?: Record<string, any>;
}

export interface UptimeReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalUptime: number;
    totalDowntime: number;
    uptimePercentage: number;
    totalEvents: number;
    upEvents: number;
    downEvents: number;
    degradedEvents: number;
  };
  events: UptimeEvent[];
  currentStatus: HealthStatus;
  currentStatusSince: Date;
  averageResponseTime?: number;
  slaCompliance?: {
    target: number; // percentage
    actual: number;
    met: boolean;
  };
}

export interface UptimeTrackerConfig {
  enabled: boolean;
  maxEvents: number;
  slaTarget: number; // uptime percentage target
  reportingIntervalMs: number;
  alertOnSlaBreach: boolean;
}

const DEFAULT_CONFIG: UptimeTrackerConfig = {
  enabled: true,
  maxEvents: 10000,
  slaTarget: 99.9, // 99.9% uptime target
  reportingIntervalMs: 60000, // 1 minute
  alertOnSlaBreach: true,
};

export class UptimeTracker extends EventEmitter {
  private config: UptimeTrackerConfig;
  private events: UptimeEvent[] = [];
  private currentStatus: HealthStatus = 'unknown';
  private currentStatusSince: Date = new Date();
  private statusHistory: Array<{ status: HealthStatus; timestamp: Date }> = [];
  private intervalId?: NodeJS.Timeout;
  private responseTimes: number[] = [];
  private maxResponseTimes: number = 1000;

  constructor(config?: Partial<UptimeTrackerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the uptime tracker
   */
  initialize(): void {
    if (this.config.enabled) {
      this.startReporting();
    }
    logger.info('Uptime tracker initialized');
  }

  /**
   * Record a health status change
   */
  recordStatusChange(
    previousStatus: HealthStatus,
    newStatus: HealthStatus,
    metadata?: Record<string, any>
  ): void {
    if (previousStatus === newStatus) {
      return;
    }

    const now = new Date();
    const duration = now.getTime() - this.currentStatusSince.getTime();

    const event: UptimeEvent = {
      id: this.generateEventId(),
      timestamp: now,
      eventType: this.getEventType(newStatus),
      previousStatus,
      newStatus,
      duration,
      metadata,
    };

    this.events.push(event);
    this.currentStatus = newStatus;
    this.currentStatusSince = now;
    this.statusHistory.push({ status: newStatus, timestamp: now });

    // Trim events if too many
    if (this.events.length > this.config.maxEvents) {
      this.events.shift();
    }

    // Trim status history
    if (this.statusHistory.length > this.config.maxEvents) {
      this.statusHistory.shift();
    }

    // Emit event
    this.emit('statusChange', event);

    // Alert on status change to down
    if (newStatus === 'unhealthy') {
      this.emit('systemDown', event);
    }

    // Alert on status recovery
    if (previousStatus === 'unhealthy' && newStatus === 'healthy') {
      this.emit('systemUp', event);
    }

    logger.info('Status change recorded', {
      previousStatus,
      newStatus,
      duration: `${duration}ms`,
    });
  }

  /**
   * Record response time
   */
  recordResponseTime(responseTimeMs: number): void {
    this.responseTimes.push(responseTimeMs);
    
    if (this.responseTimes.length > this.maxResponseTimes) {
      this.responseTimes.shift();
    }
  }

  /**
   * Get current uptime report
   */
  getUptimeReport(periodMs?: number): UptimeReport {
    const now = new Date();
    const start = periodMs ? new Date(now.getTime() - periodMs) : this.getStartTime();
    const end = now;

    const eventsInPeriod = this.events.filter(
      e => e.timestamp >= start && e.timestamp <= end
    );

    const summary = this.calculateSummary(eventsInPeriod, start, end);
    const averageResponseTime = this.calculateAverageResponseTime();

    const report: UptimeReport = {
      period: { start, end },
      summary,
      events: eventsInPeriod,
      currentStatus: this.currentStatus,
      currentStatusSince: this.currentStatusSince,
      averageResponseTime,
    };

    // Add SLA compliance
    report.slaCompliance = {
      target: this.config.slaTarget,
      actual: summary.uptimePercentage,
      met: summary.uptimePercentage >= this.config.slaTarget,
    };

    // Alert on SLA breach
    if (this.config.alertOnSlaBreach && !report.slaCompliance.met) {
      this.emit('slaBreach', report);
    }

    return report;
  }

  /**
   * Get uptime for a specific period
   */
  getUptimeForPeriod(start: Date, end: Date): {
    uptime: number;
    downtime: number;
    uptimePercentage: number;
  } {
    const eventsInPeriod = this.events.filter(
      e => e.timestamp >= start && e.timestamp <= end
    );

    return this.calculateUptime(eventsInPeriod, start, end);
  }

  /**
   * Get current status
   */
  getCurrentStatus(): {
    status: HealthStatus;
    since: Date;
    duration: number;
  } {
    return {
      status: this.currentStatus,
      since: this.currentStatusSince,
      duration: Date.now() - this.currentStatusSince.getTime(),
    };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 50): UptimeEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get uptime events by type
   */
  getEventsByType(eventType: UptimeEvent['eventType'], limit?: number): UptimeEvent[] {
    let events = this.events.filter(e => e.eventType === eventType);
    if (limit) {
      events = events.slice(-limit);
    }
    return events;
  }

  /**
   * Get downtime events
   */
  getDowntimeEvents(limit?: number): UptimeEvent[] {
    return this.getEventsByType('DOWN', limit);
  }

  /**
   * Get uptime statistics
   */
  getStatistics(): {
    totalEvents: number;
    upEvents: number;
    downEvents: number;
    degradedEvents: number;
    averageDowntimeDuration: number;
    longestDowntime: number;
    totalDowntime: number;
    currentUptimeStreak: number;
    longestUptimeStreak: number;
  } {
    const downEvents = this.getDowntimeEvents();
    const upEvents = this.getEventsByType('UP');
    const degradedEvents = this.getEventsByType('DEGRADED');

    const totalDowntime = downEvents.reduce((sum, e) => sum + (e.duration || 0), 0);
    const averageDowntimeDuration = downEvents.length > 0 
      ? totalDowntime / downEvents.length 
      : 0;
    const longestDowntime = downEvents.length > 0
      ? Math.max(...downEvents.map(e => e.duration || 0))
      : 0;

    const currentUptimeStreak = this.calculateCurrentUptimeStreak();
    const longestUptimeStreak = this.calculateLongestUptimeStreak();

    return {
      totalEvents: this.events.length,
      upEvents: upEvents.length,
      downEvents: downEvents.length,
      degradedEvents: degradedEvents.length,
      averageDowntimeDuration,
      longestDowntime,
      totalDowntime,
      currentUptimeStreak,
      longestUptimeStreak,
    };
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.events = [];
    this.currentStatus = 'unknown';
    this.currentStatusSince = new Date();
    this.statusHistory = [];
    this.responseTimes = [];
    
    logger.info('Uptime tracker reset');
  }

  /**
   * Shutdown the tracker
   */
  shutdown(): void {
    this.stopReporting();
    logger.info('Uptime tracker shutdown');
  }

  /**
   * Start periodic reporting
   */
  private startReporting(): void {
    if (this.intervalId) {
      logger.warn('Uptime reporting already running');
      return;
    }

    this.intervalId = setInterval(() => {
      try {
        const report = this.getUptimeReport();
        this.emit('uptimeReport', report);
      } catch (error) {
        logger.error('Uptime reporting failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.reportingIntervalMs);

    logger.info('Uptime reporting started', { 
      intervalMs: this.config.reportingIntervalMs 
    });
  }

  /**
   * Stop periodic reporting
   */
  private stopReporting(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Uptime reporting stopped');
    }
  }

  /**
   * Get event type from status
   */
  private getEventType(status: HealthStatus): UptimeEvent['eventType'] {
    if (status === 'healthy') return 'UP';
    if (status === 'unhealthy') return 'DOWN';
    return 'DEGRADED';
  }

  /**
   * Calculate summary for uptime report
   */
  private calculateSummary(
    events: UptimeEvent[],
    start: Date,
    end: Date
  ): UptimeReport['summary'] {
    const uptime = this.calculateUptime(events, start, end);
    const totalPeriod = end.getTime() - start.getTime();

    return {
      totalUptime: uptime.uptime,
      totalDowntime: uptime.downtime,
      uptimePercentage: uptime.uptimePercentage,
      totalEvents: events.length,
      upEvents: events.filter(e => e.eventType === 'UP').length,
      downEvents: events.filter(e => e.eventType === 'DOWN').length,
      degradedEvents: events.filter(e => e.eventType === 'DEGRADED').length,
    };
  }

  /**
   * Calculate uptime from events
   */
  private calculateUptime(
    events: UptimeEvent[],
    start: Date,
    end: Date
  ): { uptime: number; downtime: number; uptimePercentage: number } {
    let uptime = 0;
    let downtime = 0;

    if (events.length === 0) {
      // No events, assume entire period is uptime
      const totalPeriod = end.getTime() - start.getTime();
      return {
        uptime: totalPeriod,
        downtime: 0,
        uptimePercentage: 100,
      };
    }

    // Calculate uptime/downtime from events
    let lastTime = start.getTime();
    let lastStatus: HealthStatus = 'healthy';

    for (const event of events) {
      const eventTime = event.timestamp.getTime();
      const duration = eventTime - lastTime;

      if (lastStatus === 'healthy') {
        uptime += duration;
      } else if (lastStatus === 'unhealthy') {
        downtime += duration;
      }

      lastTime = eventTime;
      lastStatus = event.newStatus;
    }

    // Add remaining time to current status
    const remainingTime = end.getTime() - lastTime;
    if (lastStatus === 'healthy') {
      uptime += remainingTime;
    } else if (lastStatus === 'unhealthy') {
      downtime += remainingTime;
    }

    const totalPeriod = end.getTime() - start.getTime();
    const uptimePercentage = totalPeriod > 0 ? (uptime / totalPeriod) * 100 : 100;

    return { uptime, downtime, uptimePercentage };
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(): number | undefined {
    if (this.responseTimes.length === 0) {
      return undefined;
    }

    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }

  /**
   * Get start time from first event or system start
   */
  private getStartTime(): Date {
    if (this.events.length > 0) {
      return this.events[0].timestamp;
    }
    return new Date(this.currentStatusSince);
  }

  /**
   * Calculate current uptime streak
   */
  private calculateCurrentUptimeStreak(): number {
    if (this.currentStatus !== 'healthy') {
      return 0;
    }

    return Date.now() - this.currentStatusSince.getTime();
  }

  /**
   * Calculate longest uptime streak
   */
  private calculateLongestUptimeStreak(): number {
    let longestStreak = 0;
    let currentStreak = 0;
    let streakStart?: Date;

    for (const event of this.events) {
      if (event.eventType === 'UP') {
        if (!streakStart) {
          streakStart = event.timestamp;
        }
        currentStreak = event.duration || 0;
      } else if (event.eventType === 'DOWN') {
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
        currentStreak = 0;
        streakStart = undefined;
      }
    }

    // Check current streak
    if (this.currentStatus === 'healthy') {
      currentStreak = Date.now() - this.currentStatusSince.getTime();
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
    }

    return longestStreak;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `uptime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<UptimeTrackerConfig>): void {
    const oldInterval = this.config.reportingIntervalMs;
    this.config = { ...this.config, ...config };

    // Restart reporting if interval changed
    if (oldInterval !== this.config.reportingIntervalMs && this.intervalId) {
      this.stopReporting();
      if (this.config.enabled) {
        this.startReporting();
      }
    }

    logger.info('Uptime tracker configuration updated', { config: this.config });
  }
}
