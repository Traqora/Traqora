/**
 * Health Alerting Service
 * Provides alerting capabilities for health monitoring events
 */

import { logger } from '../utils/logger';
import { HealthStatus } from './healthCheckService';
import { EventEmitter } from 'events';

export interface AlertChannel {
  name: string;
  type: 'EMAIL' | 'WEBHOOK' | 'SLACK' | 'PAGERDUTY' | 'SMS';
  enabled: boolean;
  config: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: AlertCondition[];
  channels: string[];
  cooldownMs: number;
  lastTriggered?: Date;
}

export interface AlertCondition {
  type: 'STATUS_CHANGE' | 'UPTIME_BELOW' | 'RESPONSE_TIME_HIGH' | 'ERROR_RATE_HIGH' | 'CUSTOM';
  component?: string;
  threshold?: number;
  operator?: 'GREATER_THAN' | 'LESS_THAN' | 'EQUALS' | 'NOT_EQUALS';
  value?: any;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: Date;
  data: Record<string, any>;
  channelsSent: string[];
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface HealthAlertingConfig {
  enabled: boolean;
  defaultChannels: string[];
  alertRetentionDays: number;
  maxAlerts: number;
}

const DEFAULT_CONFIG: HealthAlertingConfig = {
  enabled: true,
  defaultChannels: [],
  alertRetentionDays: 30,
  maxAlerts: 10000,
};

export class HealthAlertingService extends EventEmitter {
  private config: HealthAlertingConfig;
  private channels: Map<string, AlertChannel> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private alerts: Alert[] = [];
  private alertHistory: Map<string, Date> = new Map(); // For cooldown tracking

  constructor(config?: Partial<HealthAlertingConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the alerting service
   */
  initialize(): void {
    this.registerDefaultChannels();
    this.registerDefaultRules();
    logger.info('Health alerting service initialized');
  }

  /**
   * Register an alert channel
   */
  registerChannel(channel: AlertChannel): void {
    this.channels.set(channel.name, channel);
    logger.info('Alert channel registered', { name: channel.name, type: channel.type });
  }

  /**
   * Unregister an alert channel
   */
  unregisterChannel(name: string): boolean {
    const removed = this.channels.delete(name);
    if (removed) {
      logger.info('Alert channel unregistered', { name });
    }
    return removed;
  }

  /**
   * Register an alert rule
   */
  registerRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    logger.info('Alert rule registered', { id: rule.id, name: rule.name });
  }

  /**
   * Unregister an alert rule
   */
  unregisterRule(id: string): boolean {
    const removed = this.rules.delete(id);
    if (removed) {
      logger.info('Alert rule unregistered', { id });
    }
    return removed;
  }

  /**
   * Process health event and trigger alerts if rules match
   */
  async processHealthEvent(data: {
    status: HealthStatus;
    component?: string;
    responseTimeMs?: number;
    uptimePercentage?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      // Check cooldown
      if (rule.lastTriggered && Date.now() - rule.lastTriggered.getTime() < rule.cooldownMs) {
        continue;
      }

      // Check if rule conditions match
      if (this.evaluateRule(rule, data)) {
        await this.triggerAlert(rule, data);
        rule.lastTriggered = new Date();
      }
    }
  }

  /**
   * Manually trigger an alert
   */
  async triggerAlert(
    rule: AlertRule,
    data: Record<string, any>,
    severity?: Alert['severity']
  ): Promise<void> {
    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: severity || this.determineSeverity(data),
      message: this.generateMessage(rule, data),
      timestamp: new Date(),
      data,
      channelsSent: [],
      acknowledged: false,
    };

    this.alerts.push(alert);
    this.trimAlerts();

    // Send to configured channels
    for (const channelName of rule.channels) {
      const channel = this.channels.get(channelName);
      if (channel && channel.enabled) {
        try {
          await this.sendToChannel(channel, alert);
          alert.channelsSent.push(channelName);
        } catch (error) {
          logger.error('Failed to send alert to channel', {
            channel: channelName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Emit event
    this.emit('alertTriggered', alert);

    logger.info('Alert triggered', {
      alertId: alert.id,
      rule: rule.name,
      severity: alert.severity,
      channels: alert.channelsSent,
    });
  }

  /**
   * Get alerts
   */
  getAlerts(filter?: {
    severity?: Alert['severity'];
    acknowledged?: boolean;
    ruleId?: string;
    limit?: number;
  }): Alert[] {
    let alerts = [...this.alerts];

    if (filter?.severity) {
      alerts = alerts.filter(a => a.severity === filter.severity);
    }
    if (filter?.acknowledged !== undefined) {
      alerts = alerts.filter(a => a.acknowledged === filter.acknowledged);
    }
    if (filter?.ruleId) {
      alerts = alerts.filter(a => a.ruleId === filter.ruleId);
    }
    if (filter?.limit) {
      alerts = alerts.slice(-filter.limit);
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    this.emit('alertAcknowledged', alert);
    logger.info('Alert acknowledged', { alertId, acknowledgedBy });

    return true;
  }

  /**
   * Get alert statistics
   */
  getStatistics(): {
    totalAlerts: number;
    acknowledgedAlerts: number;
    unacknowledgedAlerts: number;
    bySeverity: Record<string, number>;
    byRule: Record<string, number>;
    byChannel: Record<string, number>;
  } {
    const bySeverity: Record<string, number> = {};
    const byRule: Record<string, number> = {};
    const byChannel: Record<string, number> = {};

    for (const alert of this.alerts) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
      byRule[alert.ruleName] = (byRule[alert.ruleName] || 0) + 1;
      
      for (const channel of alert.channelsSent) {
        byChannel[channel] = (byChannel[channel] || 0) + 1;
      }
    }

    return {
      totalAlerts: this.alerts.length,
      acknowledgedAlerts: this.alerts.filter(a => a.acknowledged).length,
      unacknowledgedAlerts: this.alerts.filter(a => !a.acknowledged).length,
      bySeverity,
      byRule,
      byChannel,
    };
  }

  /**
   * Cleanup old alerts
   */
  cleanup(): number {
    const cutoffDate = new Date(Date.now() - this.config.alertRetentionDays * 24 * 60 * 60 * 1000);
    const initialSize = this.alerts.length;

    this.alerts = this.alerts.filter(a => a.timestamp >= cutoffDate);

    const removed = initialSize - this.alerts.length;

    if (removed > 0) {
      logger.info('Cleaned up old alerts', { removed });
    }

    return removed;
  }

  /**
   * Evaluate if a rule matches the given data
   */
  private evaluateRule(rule: AlertRule, data: any): boolean {
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(condition, data)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: AlertCondition, data: any): boolean {
    switch (condition.type) {
      case 'STATUS_CHANGE':
        if (condition.component && data.component !== condition.component) {
          return false;
        }
        if (condition.value && data.status !== condition.value) {
          return false;
        }
        return true;

      case 'UPTIME_BELOW':
        if (condition.threshold !== undefined && data.uptimePercentage !== undefined) {
          return data.uptimePercentage < condition.threshold;
        }
        return false;

      case 'RESPONSE_TIME_HIGH':
        if (condition.threshold !== undefined && data.responseTimeMs !== undefined) {
          return data.responseTimeMs > condition.threshold;
        }
        return false;

      case 'ERROR_RATE_HIGH':
        // Would implement error rate calculation
        return false;

      case 'CUSTOM':
        // Would implement custom condition evaluation
        return false;

      default:
        return false;
    }
  }

  /**
   * Determine alert severity from data
   */
  private determineSeverity(data: any): Alert['severity'] {
    if (data.status === 'unhealthy') {
      return 'CRITICAL';
    }
    if (data.status === 'degraded') {
      return 'WARNING';
    }
    return 'INFO';
  }

  /**
   * Generate alert message
   */
  private generateMessage(rule: AlertRule, data: any): string {
    const component = data.component ? ` for ${data.component}` : '';
    const status = data.status ? `Status: ${data.status}` : '';
    
    return `${rule.name}${component}. ${status}`;
  }

  /**
   * Send alert to a channel
   */
  private async sendToChannel(channel: AlertChannel, alert: Alert): Promise<void> {
    switch (channel.type) {
      case 'EMAIL':
        await this.sendEmailAlert(channel, alert);
        break;
      case 'WEBHOOK':
        await this.sendWebhookAlert(channel, alert);
        break;
      case 'SLACK':
        await this.sendSlackAlert(channel, alert);
        break;
      case 'PAGERDUTY':
        await this.sendPagerDutyAlert(channel, alert);
        break;
      case 'SMS':
        await this.sendSMSAlert(channel, alert);
        break;
      default:
        logger.warn('Unknown channel type', { type: channel.type });
    }
  }

  /**
   * Send email alert (placeholder)
   */
  private async sendEmailAlert(channel: AlertChannel, alert: Alert): Promise<void> {
    logger.info('Email alert would be sent', { 
      to: channel.config.to,
      alert: alert.id 
    });
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(channel: AlertChannel, alert: Alert): Promise<void> {
    const url = channel.config.url;
    if (!url) {
      throw new Error('Webhook URL not configured');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alert),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    logger.info('Webhook alert sent', { url, alertId: alert.id });
  }

  /**
   * Send Slack alert (placeholder)
   */
  private async sendSlackAlert(channel: AlertChannel, alert: Alert): Promise<void> {
    logger.info('Slack alert would be sent', { 
      webhook: channel.config.webhook,
      alert: alert.id 
    });
  }

  /**
   * Send PagerDuty alert (placeholder)
   */
  private async sendPagerDutyAlert(channel: AlertChannel, alert: Alert): Promise<void> {
    logger.info('PagerDuty alert would be sent', { 
      integrationKey: channel.config.integrationKey,
      alert: alert.id 
    });
  }

  /**
   * Send SMS alert (placeholder)
   */
  private async sendSMSAlert(channel: AlertChannel, alert: Alert): Promise<void> {
    logger.info('SMS alert would be sent', { 
      to: channel.config.to,
      alert: alert.id 
    });
  }

  /**
   * Register default channels
   */
  private registerDefaultChannels(): void {
    // Webhook channel (disabled by default, requires configuration)
    this.registerChannel({
      name: 'webhook',
      type: 'WEBHOOK',
      enabled: false,
      config: {},
    });
  }

  /**
   * Register default rules
   */
  private registerDefaultRules(): void {
    // Rule for system going down
    this.registerRule({
      id: 'system-down',
      name: 'System Down',
      enabled: true,
      conditions: [
        {
          type: 'STATUS_CHANGE',
          value: 'unhealthy',
        },
      ],
      channels: this.config.defaultChannels,
      cooldownMs: 300000, // 5 minutes
    });

    // Rule for system degraded
    this.registerRule({
      id: 'system-degraded',
      name: 'System Degraded',
      enabled: true,
      conditions: [
        {
          type: 'STATUS_CHANGE',
          value: 'degraded',
        },
      ],
      channels: this.config.defaultChannels,
      cooldownMs: 600000, // 10 minutes
    });

    // Rule for low uptime
    this.registerRule({
      id: 'low-uptime',
      name: 'Low Uptime',
      enabled: true,
      conditions: [
        {
          type: 'UPTIME_BELOW',
          threshold: 99.0,
        },
      ],
      channels: this.config.defaultChannels,
      cooldownMs: 3600000, // 1 hour
    });

    // Rule for high response time
    this.registerRule({
      id: 'high-response-time',
      name: 'High Response Time',
      enabled: true,
      conditions: [
        {
          type: 'RESPONSE_TIME_HIGH',
          threshold: 5000,
        },
      ],
      channels: this.config.defaultChannels,
      cooldownMs: 600000, // 10 minutes
    });
  }

  /**
   * Trim alerts if too many
   */
  private trimAlerts(): void {
    if (this.alerts.length <= this.config.maxAlerts) {
      return;
    }

    this.alerts = this.alerts.slice(-this.config.maxAlerts);
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthAlertingConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Health alerting configuration updated', { config: this.config });
  }
}
