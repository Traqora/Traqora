import { AppDataSource, initDataSource } from '../db/dataSource';
import { SecurityAuditLog } from '../db/entities/SecurityAuditLog';
import { AdminAuditLog } from '../db/entities/AdminAuditLog';
import { SensitiveOperationApproval } from '../db/entities/SensitiveOperationApproval';
import { logger } from '../utils/logger';

export type ExportFormat = 'json' | 'csv';
export type LogType = 'security' | 'admin' | 'approvals' | 'all';

export interface ExportFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  adminId?: string;
  action?: string;
  resource?: string;
  ipAddress?: string;
  logType?: LogType;
  skip?: number;
  take?: number;
}

export interface PaginatedExportResult {
  format: ExportFormat;
  logType: LogType;
  pageNumber: number;
  pageSize: number;
  recordCount: number;
  hasNextPage: boolean;
  data: string;
  filename: string;
  exportedAt: Date;
}

export interface ExportResult {
  format: ExportFormat;
  logType: LogType;
  recordCount: number;
  data: string;
  filename: string;
  exportedAt: Date;
}

/**
 * Service for exporting audit logs in various formats for regulatory compliance
 */
export class AuditLogExportService {
   /**
   * Export audit logs by streaming in pages to prevent high memory usage,
   * outputting a consistent schema optimized for compliance tooling.
   */
  static async exportLogsStream(filters: ExportFilters = {}, pageSize = 1000): Promise<import('stream').Readable> {
    const { Readable } = await import('stream');
    let page = 1;
    let keepStreaming = true;
    const self = this;

    return new Readable({
      objectMode: true,
      async read() {
        try {
          if (!keepStreaming) {
            this.push(null); // End the stream channel gracefully
            return;
          }

          // Merge our pagination limits into your existing filter logic
          const paginatedFilters = {
            ...filters,
            skip: (page - 1) * pageSize,
            take: pageSize
          };

          // Fetch discrete database rows page-by-page using your existing helper method
          const logs = await (self as any).getLogs(paginatedFilters);

          if (!logs || logs.length === 0) {
            keepStreaming = false;
            this.push(null);
            return;
          }

          // Format entries row-by-row into a consistent schema structure for compliance tools
          for (const log of logs) {
            this.push({
              timestamp: new Date(log.createdAt || log.timestamp).toISOString(),
              actorId: log.userId || log.actorId || 'SYSTEM',
              actionPerformed: log.action || log.event || 'UNKNOWN',
              resourceTarget: log.targetResource || 'N/A',
              status: log.status || 'SUCCESS',
              checksum: log.stellarTransactionHash || 'N/A' // Mandatory Stellar audit tracking
            });
          }

          // If the page returned fewer items than the max, we reached the end
          if (logs.length < pageSize) {
            keepStreaming = false;
          } else {
            page++;
          }
        } catch (err) {
          this.destroy(err as Error);
        }
      }
    });
  }


  /**
   * Export audit logs in CSV format
   */
  static async exportLogsCSV(filters: ExportFilters = {}): Promise<ExportResult> {
    const logs = await this.getLogs(filters);
    const filename = this.generateFilename('csv', filters.logType || 'all');
    const data = this.convertToCSV(logs);

    return {
      format: 'csv',
      logType: filters.logType || 'all',
      recordCount: logs.length,
      data,
      filename,
      exportedAt: new Date(),
    };
  }

  /**
   * Export audit logs in paginated format (CSV or JSON)
   * Supports large result sets by returning records page-by-page
   */
  static async exportLogsPaginated(
    filters: ExportFilters = {},
    pageNumber: number = 1,
    pageSize: number = 1000,
    format: ExportFormat = 'json'
  ): Promise<PaginatedExportResult> {
    if (pageNumber < 1) {
      throw new Error('Page number must be >= 1');
    }
    if (pageSize < 1 || pageSize > 10000) {
      throw new Error('Page size must be between 1 and 10000');
    }

    const skip = (pageNumber - 1) * pageSize;
    const take = pageSize + 1; // Fetch one extra to determine if there's a next page

    const logsWithExtra = await this.getLogs({ ...filters, skip, take });
    const hasNextPage = logsWithExtra.length > pageSize;
    const logs = hasNextPage ? logsWithExtra.slice(0, pageSize) : logsWithExtra;

    let data: string;
    if (format === 'csv') {
      data = this.convertToCSV(logs);
    } else {
      data = JSON.stringify(logs, null, 2);
    }

    const filename = this.generateFilename(format, filters.logType || 'all', pageNumber, pageSize);

    return {
      format,
      logType: filters.logType || 'all',
      pageNumber,
      pageSize,
      recordCount: logs.length,
      hasNextPage,
      data,
      filename,
      exportedAt: new Date(),
    };
  }

  /**
   * Get logs based on filters with pagination support
   */
  private static async getLogs(filters: ExportFilters): Promise<any[]> {
    await initDataSource();
    const allLogs: any[] = [];
    
    const skip = filters.skip ?? 0;
    const take = filters.take ?? 1000;

    const logType = filters.logType || 'all';

    if (logType === 'security' || logType === 'all') {
      const securityLogs = await this.getSecurityLogs({ ...filters, skip, take });
      allLogs.push(...securityLogs.map(log => this.transformSecurityLog(log)));
    }

    if (logType === 'admin' || logType === 'all') {
      const adminLogs = await this.getAdminLogs({ ...filters, skip, take });
      allLogs.push(...adminLogs.map(log => this.transformAdminLog(log)));
    }

    if (logType === 'approvals' || logType === 'all') {
      const approvalLogs = await this.getApprovalLogs({ ...filters, skip, take });
      allLogs.push(...approvalLogs.map(log => this.transformApprovalLog(log)));
    }

    // Sort by creation date
    return allLogs.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  /**
   * Get security audit logs with filters and pagination
   */
  private static async getSecurityLogs(filters: ExportFilters): Promise<SecurityAuditLog[]> {
    const repo = AppDataSource.getRepository(SecurityAuditLog);
    const queryBuilder = repo.createQueryBuilder('log');

    this.applyCommonFilters(queryBuilder, filters, 'log');

    if (filters.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: filters.userId });
    }
    if (filters.action) {
      queryBuilder.andWhere('log.action = :action', { action: filters.action });
    }

    queryBuilder.orderBy('log.createdAt', 'DESC');
    
    if (filters.skip !== undefined) {
      queryBuilder.skip(filters.skip);
    }
    if (filters.take !== undefined) {
      queryBuilder.take(filters.take);
    }

    return queryBuilder.getMany();
  }

  /**
   * Get admin audit logs with filters and pagination
   */
  private static async getAdminLogs(filters: ExportFilters): Promise<AdminAuditLog[]> {
    const repo = AppDataSource.getRepository(AdminAuditLog);
    const queryBuilder = repo.createQueryBuilder('log');

    this.applyCommonFilters(queryBuilder, filters, 'log');

    if (filters.adminId) {
      queryBuilder.andWhere('log.adminId = :adminId', { adminId: filters.adminId });
    }
    if (filters.action) {
      queryBuilder.andWhere('log.action = :action', { action: filters.action });
    }
    if (filters.resource) {
      queryBuilder.andWhere('log.resource = :resource', { resource: filters.resource });
    }

    queryBuilder.orderBy('log.createdAt', 'DESC');
    
    if (filters.skip !== undefined) {
      queryBuilder.skip(filters.skip);
    }
    if (filters.take !== undefined) {
      queryBuilder.take(filters.take);
    }

    return queryBuilder.getMany();
  }

  /**
   * Get sensitive operation approval logs with filters and pagination
   */
  private static async getApprovalLogs(filters: ExportFilters): Promise<SensitiveOperationApproval[]> {
    const repo = AppDataSource.getRepository(SensitiveOperationApproval);
    const queryBuilder = repo.createQueryBuilder('log');

    this.applyCommonFilters(queryBuilder, filters, 'log');

    if (filters.adminId) {
      queryBuilder.andWhere('(log.requesterId = :adminId OR log.approverId = :adminId)', { adminId: filters.adminId });
    }

    queryBuilder.orderBy('log.createdAt', 'DESC');
    
    if (filters.skip !== undefined) {
      queryBuilder.skip(filters.skip);
    }
    if (filters.take !== undefined) {
      queryBuilder.take(filters.take);
    }

    return queryBuilder.getMany();
  }

  /**
   * Apply common date and IP filters
   */
  private static applyCommonFilters(queryBuilder: any, filters: ExportFilters, alias: string): void {
    if (filters.startDate) {
      queryBuilder.andWhere(`${alias}.createdAt >= :startDate`, { startDate: filters.startDate });
    }
    if (filters.endDate) {
      queryBuilder.andWhere(`${alias}.createdAt <= :endDate`, { endDate: filters.endDate });
    }
    if (filters.ipAddress) {
      queryBuilder.andWhere(`${alias}.ipAddress = :ipAddress`, { ipAddress: filters.ipAddress });
    }
  }

  /**
   * Transform security log for export
   */
  private static transformSecurityLog(log: SecurityAuditLog): any {
    return {
      logType: 'security',
      id: log.id,
      userId: log.userId || null,
      userEmail: log.userEmail || null,
      adminId: log.adminId || null,
      adminEmail: log.adminEmail || null,
      actorType: log.actorType,
      action: log.action,
      resource: log.resource || null,
      resourceId: log.resourceId || null,
      details: log.details || null,
      metadata: log.metadata || null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent || null,
      sessionId: log.sessionId || null,
      countryCode: log.countryCode || null,
      isFlagged: log.isFlagged,
      flagReason: log.flagReason || null,
      createdAt: log.createdAt.toISOString(),
    };
  }

  /**
   * Transform admin log for export
   */
  private static transformAdminLog(log: AdminAuditLog): any {
    return {
      logType: 'admin',
      id: log.id,
      adminId: log.adminId,
      adminEmail: log.adminEmail,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId || null,
      details: log.details || null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent || null,
      sessionId: log.sessionId || null,
      previousLogHash: log.previousLogHash || null,
      logHash: log.logHash,
      isArchived: log.isArchived,
      archivedAt: log.archivedAt?.toISOString() || null,
      createdAt: log.createdAt.toISOString(),
    };
  }

  /**
   * Transform approval log for export
   */
  private static transformApprovalLog(log: SensitiveOperationApproval): any {
    return {
      logType: 'approval',
      id: log.id,
      requesterId: log.requesterId || null,
      requesterEmail: log.requesterEmail || null,
      approverId: log.approverId || null,
      approverEmail: log.approverEmail || null,
      operationType: log.operationType,
      resource: log.resource || null,
      resourceId: log.resourceId || null,
      operationDetails: log.operationDetails || null,
      operationMetadata: log.operationMetadata || null,
      justification: log.justification || null,
      status: log.status,
      rejectionReason: log.rejectionReason || null,
      requesterIpAddress: log.requesterIpAddress,
      requesterUserAgent: log.requesterUserAgent || null,
      approverIpAddress: log.approverIpAddress,
      approverUserAgent: log.approverUserAgent || null,
      requiredApprovals: log.requiredApprovals,
      currentApprovals: log.currentApprovals,
      expiresAt: log.expiresAt?.toISOString() || null,
      approvedAt: log.approvedAt?.toISOString() || null,
      rejectedAt: log.rejectedAt?.toISOString() || null,
      relatedAuditLogId: log.relatedAuditLogId || null,
      isArchived: log.isArchived,
      archivedAt: log.archivedAt?.toISOString() || null,
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString(),
    };
  }

  /**
   * Convert logs to CSV format
   */
  private static convertToCSV(logs: any[]): string {
    if (logs.length === 0) {
      return '';
    }

    // Get all unique keys from all logs
    const allKeys = new Set<string>();
    for (const log of logs) {
      Object.keys(log).forEach(key => allKeys.add(key));
    }

    const headers = Array.from(allKeys);
    const csvRows: string[] = [];

    // Add header row
    csvRows.push(headers.join(','));

    // Add data rows
    for (const log of logs) {
      const values = headers.map(header => {
        const value = log[header];
        if (value === null || value === undefined) {
          return '';
        }
        // Escape quotes and wrap in quotes if contains comma or quote
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Generate filename for export
   */
  private static generateFilename(format: ExportFormat, logType: LogType, pageNumber?: number, pageSize?: number): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filename = `audit-logs-${logType}-${timestamp}`;
    if (pageNumber !== undefined && pageSize !== undefined) {
      filename += `-page-${pageNumber}-size-${pageSize}`;
    }
    return `${filename}.${format}`;
  }

  /**
   * Validate export request for compliance
   */
  static async validateExportRequest(
    _requestedBy: string,
    isRegulatoryRequest: boolean = false
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if user has permission to export
    // This would typically involve checking user roles/permissions
    // For now, we'll assume admins can always export and regulatory requests are always valid
    
    if (isRegulatoryRequest) {
      return { valid: true };
    }

    // Add additional validation logic here based on your permission system
    // _requestedBy can be used for permission checks
    return { valid: true };
  }

  /**
   * Log export event for audit trail
   */
  static async logExportEvent(
    requestedBy: string,
    format: ExportFormat,
    logType: LogType,
    recordCount: number,
    ipAddress: string
  ): Promise<void> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const log = repo.create({
      actorType: 'admin',
      action: 'data_export_request',
      details: `Exported ${recordCount} audit log records in ${format.toUpperCase()} format`,
      metadata: {
        format,
        logType,
        recordCount,
        requestedBy,
      },
      ipAddress,
      adminId: requestedBy,
      logHash: '', // Will be set by the service
    });

    // Get previous log hash
    const previousLog = await repo.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    log.previousLogHash = previousLog?.logHash || null;
    log.logHash = log.generateLogHash(previousLog?.logHash || null);

    await repo.save(log);
    logger.info('Audit log export recorded', {
      requestedBy,
      format,
      logType,
      recordCount,
    });
  }
}
