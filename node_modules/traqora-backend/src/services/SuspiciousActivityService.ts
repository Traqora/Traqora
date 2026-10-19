import { AppDataSource, initDataSource } from '../db/dataSource';
import { SecurityAuditLog } from '../db/entities/SecurityAuditLog';
import { logSecurityEvent } from './ErrorHandlingService';
import { logger } from '../utils/logger';

export interface SuspiciousActivityConfig {
  maxFailedLogins: number;
  failedLoginWindowMinutes: number;
  maxRapidRequests: number;
  rapidRequestWindowSeconds: number;
  maxGeoChanges: number;
  geoChangeWindowHours: number;
  maxUnusualActions: number;
  unusualActionWindowMinutes: number;
}

const DEFAULT_CONFIG: SuspiciousActivityConfig = {
  maxFailedLogins: 5,
  failedLoginWindowMinutes: 15,
  maxRapidRequests: 100,
  rapidRequestWindowSeconds: 60,
  maxGeoChanges: 3,
  geoChangeWindowHours: 24,
  maxUnusualActions: 10,
  unusualActionWindowMinutes: 30,
};

export interface SuspiciousActivityAlert {
  type: 'multiple_failed_logins' | 'rapid_requests' | 'geo_location_change' | 'unusual_action_pattern' | 'impossible_travel';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  adminId?: string;
  ipAddress: string;
  details: string;
  metadata: any;
  timestamp: Date;
}

/**
 * Service for detecting suspicious activity patterns in audit logs
 */
export class SuspiciousActivityService {
  private config: SuspiciousActivityConfig;

  constructor(config: Partial<SuspiciousActivityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check for multiple failed login attempts
   */
  async checkMultipleFailedLogins(ipAddress: string, userId?: string): Promise<SuspiciousActivityAlert | null> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const windowStart = new Date(Date.now() - this.config.failedLoginWindowMinutes * 60 * 1000);

    const queryBuilder = repo.createQueryBuilder('log')
      .where('log.action = :action', { action: 'login_failure' })
      .andWhere('log.ipAddress = :ipAddress', { ipAddress })
      .andWhere('log.createdAt >= :windowStart', { windowStart });

    if (userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId });
    }

    const failedLogins = await queryBuilder.getMany();

    if (failedLogins.length >= this.config.maxFailedLogins) {
      const alert: SuspiciousActivityAlert = {
        type: 'multiple_failed_logins',
        severity: failedLogins.length >= this.config.maxFailedLogins * 2 ? 'high' : 'medium',
        userId,
        ipAddress,
        details: `${failedLogins.length} failed login attempts detected within ${this.config.failedLoginWindowMinutes} minutes`,
        metadata: {
          failedLoginCount: failedLogins.length,
          windowMinutes: this.config.failedLoginWindowMinutes,
          timestamps: failedLogins.map(log => log.createdAt),
        },
        timestamp: new Date(),
      };

      await this.logAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Check for rapid request patterns (potential DoS or brute force)
   */
  async checkRapidRequests(ipAddress: string): Promise<SuspiciousActivityAlert | null> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const windowStart = new Date(Date.now() - this.config.rapidRequestWindowSeconds * 1000);

    const rapidRequests = await repo.find({
      where: {
        ipAddress,
        createdAt: windowStart as any,
      },
      order: { createdAt: 'DESC' }
    });

    if (rapidRequests.length >= this.config.maxRapidRequests) {
      const alert: SuspiciousActivityAlert = {
        type: 'rapid_requests',
        severity: rapidRequests.length >= this.config.maxRapidRequests * 2 ? 'critical' : 'high',
        ipAddress,
        details: `${rapidRequests.length} requests detected within ${this.config.rapidRequestWindowSeconds} seconds`,
        metadata: {
          requestCount: rapidRequests.length,
          windowSeconds: this.config.rapidRequestWindowSeconds,
          actions: rapidRequests.map(log => log.action),
        },
        timestamp: new Date(),
      };

      await this.logAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Check for unusual geographic location changes
   */
  async checkGeoLocationChanges(userId: string): Promise<SuspiciousActivityAlert | null> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const windowStart = new Date(Date.now() - this.config.geoChangeWindowHours * 60 * 60 * 1000);

    const logs = await repo.find({
      where: {
        userId,
        createdAt: windowStart as any,
      },
      order: { createdAt: 'ASC' }
    });

    const countryChanges = new Set<string>();
    const previousCountries: string[] = [];

    for (const log of logs) {
      if (log.countryCode && log.countryCode !== 'unknown') {
        if (previousCountries.length === 0 || previousCountries[previousCountries.length - 1] !== log.countryCode) {
          countryChanges.add(log.countryCode);
          previousCountries.push(log.countryCode);
        }
      }
    }

    if (countryChanges.size >= this.config.maxGeoChanges) {
      const alert: SuspiciousActivityAlert = {
        type: 'geo_location_change',
        severity: 'medium',
        userId,
        ipAddress: logs[logs.length - 1]?.ipAddress || 'unknown',
        details: `${countryChanges.size} different geographic locations detected within ${this.config.geoChangeWindowHours} hours`,
        metadata: {
          countryCount: countryChanges.size,
          countries: Array.from(countryChanges),
          windowHours: this.config.geoChangeWindowHours,
        },
        timestamp: new Date(),
      };

      await this.logAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Check for impossible travel (login from two distant locations in short time)
   */
  async checkImpossibleTravel(userId: string): Promise<SuspiciousActivityAlert | null> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const recentLogins = await repo.find({
      where: {
        userId,
        action: 'login_success' as any,
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (recentLogins.length < 2) {
      return null;
    }

    for (let i = 0; i < recentLogins.length - 1; i++) {
      const current = recentLogins[i];
      const previous = recentLogins[i + 1];

      const timeDiff = current.createdAt.getTime() - previous.createdAt.getTime();
      const timeDiffHours = timeDiff / (1000 * 60 * 60);

      // If same country codes, skip
      if (current.countryCode === previous.countryCode) {
        continue;
      }

      // If time difference is less than 1 hour and countries are different, flag as suspicious
      if (timeDiffHours < 1 && current.countryCode && previous.countryCode) {
        const alert: SuspiciousActivityAlert = {
          type: 'impossible_travel',
          severity: 'high',
          userId,
          ipAddress: current.ipAddress,
          details: `Login from ${current.countryCode} within ${timeDiffHours.toFixed(2)} hours of login from ${previous.countryCode}`,
          metadata: {
            currentCountry: current.countryCode,
            previousCountry: previous.countryCode,
            timeDiffHours,
            currentIp: current.ipAddress,
            previousIp: previous.ipAddress,
          },
          timestamp: new Date(),
        };

        await this.logAlert(alert);
        return alert;
      }
    }

    return null;
  }

  /**
   * Check for unusual action patterns
   */
  async checkUnusualActionPattern(userId: string): Promise<SuspiciousActivityAlert | null> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const windowStart = new Date(Date.now() - this.config.unusualActionWindowMinutes * 60 * 1000);

    const logs = await repo.find({
      where: {
        userId,
        createdAt: windowStart as any,
      },
      order: { createdAt: 'ASC' }
    });

    // Check for sensitive actions in short time
    const sensitiveActions = logs.filter(log =>
      ['payment_processed', 'refund_processed', 'booking_modification', 'data_export_request'].includes(log.action)
    );

    if (sensitiveActions.length >= this.config.maxUnusualActions) {
      const alert: SuspiciousActivityAlert = {
        type: 'unusual_action_pattern',
        severity: 'high',
        userId,
        ipAddress: logs[logs.length - 1]?.ipAddress || 'unknown',
        details: `${sensitiveActions.length} sensitive actions detected within ${this.config.unusualActionWindowMinutes} minutes`,
        metadata: {
          actionCount: sensitiveActions.length,
          windowMinutes: this.config.unusualActionWindowMinutes,
          actions: sensitiveActions.map(log => ({
            action: log.action,
            timestamp: log.createdAt,
            resource: log.resource,
          })),
        },
        timestamp: new Date(),
      };

      await this.logAlert(alert);
      return alert;
    }

    return null;
  }

  /**
   * Run all suspicious activity checks for a user/IP
   */
  async runAllChecks(params: {
    ipAddress: string;
    userId?: string;
    adminId?: string;
  }): Promise<SuspiciousActivityAlert[]> {
    const alerts: SuspiciousActivityAlert[] = [];

    // Check for multiple failed logins
    const failedLoginAlert = await this.checkMultipleFailedLogins(params.ipAddress, params.userId);
    if (failedLoginAlert) alerts.push(failedLoginAlert);

    // Check for rapid requests
    const rapidRequestAlert = await this.checkRapidRequests(params.ipAddress);
    if (rapidRequestAlert) alerts.push(rapidRequestAlert);

    // User-specific checks
    if (params.userId) {
      const geoAlert = await this.checkGeoLocationChanges(params.userId);
      if (geoAlert) alerts.push(geoAlert);

      const travelAlert = await this.checkImpossibleTravel(params.userId);
      if (travelAlert) alerts.push(travelAlert);

      const actionAlert = await this.checkUnusualActionPattern(params.userId);
      if (actionAlert) alerts.push(actionAlert);
    }

    return alerts;
  }

  /**
   * Log a suspicious activity alert to the audit log
   */
  private async logAlert(alert: SuspiciousActivityAlert): Promise<void> {
    await logSecurityEvent({
      action: 'suspicious_activity_detected',
      actorType: alert.userId ? 'user' : 'admin',
      userId: alert.userId || null,
      adminId: alert.adminId || null,
      details: alert.details,
      metadata: {
        alertType: alert.type,
        severity: alert.severity,
        ...alert.metadata,
      },
      ipAddress: alert.ipAddress,
    });

    logger.warn('Suspicious activity detected', {
      type: alert.type,
      severity: alert.severity,
      userId: alert.userId,
      adminId: alert.adminId,
      ipAddress: alert.ipAddress,
      details: alert.details,
    });
  }

  /**
   * Get recent suspicious activity alerts
   */
  async getRecentAlerts(hours: number = 24): Promise<SuspiciousActivityAlert[]> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await repo.find({
      where: {
        action: 'suspicious_activity_detected' as any,
        createdAt: windowStart as any,
        isFlagged: true,
      },
      order: { createdAt: 'DESC' }
    });

    return logs.map(log => ({
      type: log.metadata?.alertType || 'unknown',
      severity: log.metadata?.severity || 'medium',
      userId: log.userId || undefined,
      adminId: log.adminId || undefined,
      ipAddress: log.ipAddress,
      details: log.details || '',
      metadata: log.metadata,
      timestamp: log.createdAt,
    }));
  }
}
