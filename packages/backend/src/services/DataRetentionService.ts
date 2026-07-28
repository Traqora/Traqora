import { AppDataSource, initDataSource } from '../db/dataSource';
import { SecurityAuditLog } from '../db/entities/SecurityAuditLog';
import { AdminAuditLog } from '../db/entities/AdminAuditLog';
import { SensitiveOperationApproval } from '../db/entities/SensitiveOperationApproval';
import { logger } from '../utils/logger';
import { LessThan } from 'typeorm';

export interface RetentionPolicy {
  logType: 'security' | 'admin' | 'approvals';
  retentionYears: number;
  archiveAfterYears: number;
}

const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  { logType: 'security', retentionYears: 7, archiveAfterYears: 2 },
  { logType: 'admin', retentionYears: 7, archiveAfterYears: 2 },
  { logType: 'approvals', retentionYears: 7, archiveAfterYears: 2 },
];

export interface ArchivalStats {
  logType: string;
  totalRecords: number;
  archivedRecords: number;
  expiredRecords: number;
  archivalDate: Date;
}

/**
 * Service for managing data retention policies and automated archival
 */
export class DataRetentionService {
  private policies: RetentionPolicy[];

  constructor(policies: Partial<RetentionPolicy>[] = []) {
    this.policies = this.mergePolicies(policies);
  }

  /**
   * Merge default policies with custom policies
   */
  private mergePolicies(customPolicies: Partial<RetentionPolicy>[]): RetentionPolicy[] {
    const merged = [...DEFAULT_RETENTION_POLICIES];
    
    for (const custom of customPolicies) {
      const index = merged.findIndex(p => p.logType === custom.logType);
      if (index !== -1) {
        merged[index] = { ...merged[index], ...custom };
      } else {
        merged.push(custom as RetentionPolicy);
      }
    }
    
    return merged;
  }

  /**
   * Get policy for a specific log type
   */
  getPolicy(logType: 'security' | 'admin' | 'approvals'): RetentionPolicy {
    return this.policies.find(p => p.logType === logType) || DEFAULT_RETENTION_POLICIES[0];
  }

  /**
   * Archive logs that have reached the archival threshold
   */
  async archiveOldLogs(): Promise<ArchivalStats[]> {
    const stats: ArchivalStats[] = [];
    const archivalDate = new Date();

    for (const policy of this.policies) {
      const stat = await this.archiveLogsByType(policy, archivalDate);
      stats.push(stat);
    }

    logger.info('Data retention archival completed', { stats });
    return stats;
  }

  /**
   * Archive logs for a specific type
   */
  private async archiveLogsByType(policy: RetentionPolicy, archivalDate: Date): Promise<ArchivalStats> {
    await initDataSource();
    const archiveThreshold = new Date(Date.now() - policy.archiveAfterYears * 365 * 24 * 60 * 60 * 1000);

    let totalRecords = 0;
    let archivedRecords = 0;

    switch (policy.logType) {
      case 'security':
        ({ totalRecords, archivedRecords } = await this.archiveSecurityLogs(archiveThreshold));
        break;
      case 'admin':
        ({ totalRecords, archivedRecords } = await this.archiveAdminLogs(archiveThreshold));
        break;
      case 'approvals':
        ({ totalRecords, archivedRecords } = await this.archiveApprovalLogs(archiveThreshold));
        break;
    }

    return {
      logType: policy.logType,
      totalRecords,
      archivedRecords,
      expiredRecords: 0, // Calculated separately
      archivalDate,
    };
  }

  /**
   * Archive security audit logs
   */
  private async archiveSecurityLogs(archiveThreshold: Date): Promise<{ totalRecords: number; archivedRecords: number }> {
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const unarchivedLogs = await repo.find({
      where: {
        isArchived: false,
        createdAt: LessThan(archiveThreshold) as any,
      },
    });

    const totalRecords = unarchivedLogs.length;
    let archivedRecords = 0;

    for (const log of unarchivedLogs) {
      try {
        log.isArchived = true;
        log.archivedAt = new Date();
        await repo.save(log);
        archivedRecords++;
      } catch (err) {
        logger.error('Failed to archive security log', { logId: log.id, error: err });
      }
    }

    return { totalRecords, archivedRecords };
  }

  /**
   * Archive admin audit logs
   */
  private async archiveAdminLogs(archiveThreshold: Date): Promise<{ totalRecords: number; archivedRecords: number }> {
    const repo = AppDataSource.getRepository(AdminAuditLog);

    const unarchivedLogs = await repo.find({
      where: {
        isArchived: false,
        createdAt: LessThan(archiveThreshold) as any,
      },
    });

    const totalRecords = unarchivedLogs.length;
    let archivedRecords = 0;

    for (const log of unarchivedLogs) {
      try {
        log.isArchived = true;
        log.archivedAt = new Date();
        await repo.save(log);
        archivedRecords++;
      } catch (err) {
        logger.error('Failed to archive admin log', { logId: log.id, error: err });
      }
    }

    return { totalRecords, archivedRecords };
  }

  /**
   * Archive sensitive operation approvals
   */
  private async archiveApprovalLogs(archiveThreshold: Date): Promise<{ totalRecords: number; archivedRecords: number }> {
    const repo = AppDataSource.getRepository(SensitiveOperationApproval);

    const unarchivedLogs = await repo.find({
      where: {
        isArchived: false,
        createdAt: LessThan(archiveThreshold) as any,
      },
    });

    const totalRecords = unarchivedLogs.length;
    let archivedRecords = 0;

    for (const log of unarchivedLogs) {
      try {
        log.isArchived = true;
        log.archivedAt = new Date();
        await repo.save(log);
        archivedRecords++;
      } catch (err) {
        logger.error('Failed to archive approval log', { logId: log.id, error: err });
      }
    }

    return { totalRecords, archivedRecords };
  }

  /**
   * Delete logs that have exceeded retention period
   * WARNING: This is irreversible. Use with caution.
   */
  async deleteExpiredLogs(): Promise<ArchivalStats[]> {
    const stats: ArchivalStats[] = [];
    const deletionDate = new Date();

    for (const policy of this.policies) {
      const stat = await this.deleteExpiredLogsByType(policy, deletionDate);
      stats.push(stat);
    }

    logger.warn('Data retention deletion completed', { stats });
    return stats;
  }

  /**
   * Delete expired logs for a specific type
   */
  private async deleteExpiredLogsByType(policy: RetentionPolicy, deletionDate: Date): Promise<ArchivalStats> {
    await initDataSource();
    const retentionThreshold = new Date(Date.now() - policy.retentionYears * 365 * 24 * 60 * 60 * 1000);

    let totalRecords = 0;
    let expiredRecords = 0;

    switch (policy.logType) {
      case 'security':
        ({ totalRecords, expiredRecords } = await this.deleteExpiredSecurityLogs(retentionThreshold));
        break;
      case 'admin':
        ({ totalRecords, expiredRecords } = await this.deleteExpiredAdminLogs(retentionThreshold));
        break;
      case 'approvals':
        ({ totalRecords, expiredRecords } = await this.deleteExpiredApprovalLogs(retentionThreshold));
        break;
    }

    return {
      logType: policy.logType,
      totalRecords,
      archivedRecords: 0,
      expiredRecords,
      archivalDate: deletionDate,
    };
  }

  /**
   * Delete expired security audit logs
   */
  private async deleteExpiredSecurityLogs(retentionThreshold: Date): Promise<{ totalRecords: number; expiredRecords: number }> {
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const expiredLogs = await repo.find({
      where: {
        createdAt: LessThan(retentionThreshold) as any,
      },
    });

    const totalRecords = expiredLogs.length;
    let expiredRecords = 0;

    for (const log of expiredLogs) {
      try {
        await repo.remove(log);
        expiredRecords++;
      } catch (err) {
        logger.error('Failed to delete expired security log', { logId: log.id, error: err });
      }
    }

    return { totalRecords, expiredRecords };
  }

  /**
   * Delete expired admin audit logs
   */
  private async deleteExpiredAdminLogs(retentionThreshold: Date): Promise<{ totalRecords: number; expiredRecords: number }> {
    const repo = AppDataSource.getRepository(AdminAuditLog);

    const expiredLogs = await repo.find({
      where: {
        createdAt: LessThan(retentionThreshold) as any,
      },
    });

    const totalRecords = expiredLogs.length;
    let expiredRecords = 0;

    for (const log of expiredLogs) {
      try {
        await repo.remove(log);
        expiredRecords++;
      } catch (err) {
        logger.error('Failed to delete expired admin log', { logId: log.id, error: err });
      }
    }

    return { totalRecords, expiredRecords };
  }

  /**
   * Delete expired approval logs
   */
  private async deleteExpiredApprovalLogs(retentionThreshold: Date): Promise<{ totalRecords: number; expiredRecords: number }> {
    const repo = AppDataSource.getRepository(SensitiveOperationApproval);

    const expiredLogs = await repo.find({
      where: {
        createdAt: LessThan(retentionThreshold) as any,
      },
    });

    const totalRecords = expiredLogs.length;
    let expiredRecords = 0;

    for (const expiredLog of expiredLogs) {
      try {
        await repo.remove(expiredLog);
        expiredRecords++;
      } catch (err) {
        logger.error('Failed to delete expired approval log', { logId: expiredLog.id, error: err });
      }
    }

    return { totalRecords, expiredRecords };
  }

  /**
   * Get retention statistics for all log types
   */
  async getRetentionStats(): Promise<Record<string, any>> {
    await initDataSource();
    const stats: Record<string, any> = {};

    for (const policy of this.policies) {
      const policyStats = await this.getStatsByType(policy);
      stats[policy.logType] = policyStats;
    }

    return stats;
  }

  /**
   * Get statistics for a specific log type
   */
  private async getStatsByType(policy: RetentionPolicy): Promise<any> {
    const archiveThreshold = new Date(Date.now() - policy.archiveAfterYears * 365 * 24 * 60 * 60 * 1000);
    const retentionThreshold = new Date(Date.now() - policy.retentionYears * 365 * 24 * 60 * 60 * 1000);

    let totalRecords = 0;
    let archivedRecords = 0;
    let activeRecords = 0;
    let expiringSoonRecords = 0;

    switch (policy.logType) {
      case 'security':
        ({ totalRecords, archivedRecords, activeRecords, expiringSoonRecords } = 
          await this.getSecurityStats(archiveThreshold, retentionThreshold));
        break;
      case 'admin':
        ({ totalRecords, archivedRecords, activeRecords, expiringSoonRecords } = 
          await this.getAdminStats(archiveThreshold, retentionThreshold));
        break;
      case 'approvals':
        ({ totalRecords, archivedRecords, activeRecords, expiringSoonRecords } = 
          await this.getApprovalStats(archiveThreshold, retentionThreshold));
        break;
    }

    return {
      policy,
      totalRecords,
      archivedRecords,
      activeRecords,
      expiringSoonRecords,
      retentionThreshold: retentionThreshold.toISOString(),
      archiveThreshold: archiveThreshold.toISOString(),
    };
  }

  /**
   * Get security log statistics
   */
  private async getSecurityStats(_archiveThreshold: Date, retentionThreshold: Date): Promise<any> {
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const totalRecords = await repo.count();
    const archivedRecords = await repo.count({ where: { isArchived: true } });
    const activeRecords = totalRecords - archivedRecords;
    
    // Records expiring within 30 days
    const expiringThreshold = new Date(retentionThreshold.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoonRecords = await repo.count({
      where: {
        createdAt: LessThan(expiringThreshold) as any,
        isArchived: false,
      },
    });

    return { totalRecords, archivedRecords, activeRecords, expiringSoonRecords };
  }

  /**
   * Get admin log statistics
   */
  private async getAdminStats(_archiveThreshold: Date, retentionThreshold: Date): Promise<any> {
    const repo = AppDataSource.getRepository(AdminAuditLog);

    const totalRecords = await repo.count();
    const archivedRecords = await repo.count({ where: { isArchived: true } });
    const activeRecords = totalRecords - archivedRecords;
    
    const expiringThreshold = new Date(retentionThreshold.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoonRecords = await repo.count({
      where: {
        createdAt: LessThan(expiringThreshold) as any,
        isArchived: false,
      },
    });

    return { totalRecords, archivedRecords, activeRecords, expiringSoonRecords };
  }

  /**
   * Get approval log statistics
   */
  private async getApprovalStats(_archiveThreshold: Date, retentionThreshold: Date): Promise<any> {
    const repo = AppDataSource.getRepository(SensitiveOperationApproval);

    const totalRecords = await repo.count();
    const archivedRecords = await repo.count({ where: { isArchived: true } });
    const activeRecords = totalRecords - archivedRecords;
    
    const expiringThreshold = new Date(retentionThreshold.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoonRecords = await repo.count({
      where: {
        createdAt: LessThan(expiringThreshold) as any,
        isArchived: false,
      },
    });

    return { totalRecords, archivedRecords, activeRecords, expiringSoonRecords };
  }

  /**
   * Schedule periodic archival (would typically be called by a job scheduler)
   */
  async schedulePeriodicArchival(intervalHours: number = 24): Promise<void> {
    logger.info(`Scheduled periodic archival every ${intervalHours} hours`);
    // This would typically integrate with your job scheduler (e.g., Bull, Agenda, cron)
    // For now, this is a placeholder for the integration point
  }
}
