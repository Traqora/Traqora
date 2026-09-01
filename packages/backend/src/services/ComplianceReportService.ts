import { AppDataSource, initDataSource } from '../db/dataSource';
import { ComplianceReport, ReportType } from '../db/entities/ComplianceReport';
import { SecurityAuditLog } from '../db/entities/SecurityAuditLog';
import { AdminAuditLog } from '../db/entities/AdminAuditLog';
import { logger } from '../utils/logger';

export interface ComplianceReportOptions {
  reportType: ReportType;
  reportName: string;
  startDate: Date;
  endDate: Date;
  generatedBy: string;
}

export interface AuditLogFilters {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  adminId?: string;
  action?: string;
  resource?: string;
  ipAddress?: string;
}

/**
 * Generate compliance reports for GDPR, PCI-DSS, and other regulatory requirements
 */
export class ComplianceReportService {
  /**
   * Generate a GDPR audit report
   */
  static async generateGDPRReport(options: ComplianceReportOptions): Promise<ComplianceReport> {
    await initDataSource();
    const repo = AppDataSource.getRepository(ComplianceReport);
    const securityLogRepo = AppDataSource.getRepository(SecurityAuditLog);

    // Gather GDPR-relevant data
    const dataAccessLogs = await securityLogRepo.find({
      where: {
        action: 'data_access_request' as any,
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const dataExportLogs = await securityLogRepo.find({
      where: {
        action: 'data_export_request' as any,
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const consentLogs = await securityLogRepo.find({
      where: {
        action: 'consent_given' as any,
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const deletionLogs = await securityLogRepo.find({
      where: {
        action: 'account_deletion_request' as any,
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const findings = {
      totalDataAccessRequests: dataAccessLogs.length,
      totalDataExportRequests: dataExportLogs.length,
      totalConsentChanges: consentLogs.length,
      totalDeletionRequests: deletionLogs.length,
      dataAccessByUser: this.groupByField(dataAccessLogs, 'userId'),
      dataExportByUser: this.groupByField(dataExportLogs, 'userId'),
      consentChangesByUser: this.groupByField(consentLogs, 'userId'),
      deletionRequestsByUser: this.groupByField(deletionLogs, 'userId'),
    };

    const reportContent = this.generateGDPRReportContent(findings, options);

    const report = repo.create({
      reportName: options.reportName,
      reportType: 'gdpr_audit',
      status: 'pending_review',
      reportContent,
      findings,
      recommendations: this.generateGDPRRecommendations(findings),
      totalRecordsProcessed: dataAccessLogs.length + dataExportLogs.length + consentLogs.length + deletionLogs.length,
      findingsCount: Object.keys(findings).length,
      dataBreachesIdentified: 0,
      reportPeriodStart: options.startDate,
      reportPeriodEnd: options.endDate,
      generatedBy: options.generatedBy,
    });

    await repo.save(report);
    logger.info('GDPR compliance report generated', { reportId: report.id });

    return report;
  }

  /**
   * Generate a PCI-DSS audit report
   */
  static async generatePCIDSSReport(options: ComplianceReportOptions): Promise<ComplianceReport> {
    await initDataSource();
    const repo = AppDataSource.getRepository(ComplianceReport);
    const securityLogRepo = AppDataSource.getRepository(SecurityAuditLog);
    const adminLogRepo = AppDataSource.getRepository(AdminAuditLog);

    // Gather PCI-DSS relevant data
    const paymentLogs = await securityLogRepo.find({
      where: {
        action: 'payment_processed' as any,
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const refundLogs = await securityLogRepo.find({
      where: {
        action: 'refund_processed' as any,
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const paymentMethodLogs = await securityLogRepo.find({
      where: {
        action: 'payment_method_added' as any,
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const adminPaymentActions = await adminLogRepo.find({
      where: {
        resource: 'payment',
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const findings = {
      totalPaymentTransactions: paymentLogs.length,
      totalRefundTransactions: refundLogs.length,
      totalPaymentMethodChanges: paymentMethodLogs.length,
      totalAdminPaymentActions: adminPaymentActions.length,
      paymentVolume: paymentLogs.reduce((sum: number, log: any) => sum + (log.metadata?.amount || 0), 0),
      refundVolume: refundLogs.reduce((sum: number, log: any) => sum + (log.metadata?.amount || 0), 0),
      paymentsByUser: this.groupByField(paymentLogs, 'userId'),
      refundsByUser: this.groupByField(refundLogs, 'userId'),
      adminActionsByAdmin: this.groupByField(adminPaymentActions, 'adminId'),
    };

    const reportContent = this.generatePCIDSSReportContent(findings, options);

    const report = repo.create({
      reportName: options.reportName,
      reportType: 'ccpa_audit', // Using existing type for PCI-DSS
      status: 'pending_review',
      reportContent,
      findings,
      recommendations: this.generatePCIDSSRecommendations(findings),
      totalRecordsProcessed: paymentLogs.length + refundLogs.length + paymentMethodLogs.length + adminPaymentActions.length,
      findingsCount: Object.keys(findings).length,
      dataBreachesIdentified: 0,
      reportPeriodStart: options.startDate,
      reportPeriodEnd: options.endDate,
      generatedBy: options.generatedBy,
    });

    await repo.save(report);
    logger.info('PCI-DSS compliance report generated', { reportId: report.id });

    return report;
  }

  /**
   * Generate a general security audit report
   */
  static async generateSecurityAuditReport(options: ComplianceReportOptions): Promise<ComplianceReport> {
    await initDataSource();
    const repo = AppDataSource.getRepository(ComplianceReport);
    const securityLogRepo = AppDataSource.getRepository(SecurityAuditLog);

    const logs = await securityLogRepo.find({
      where: {
        createdAt: options.startDate as any
      },
      order: { createdAt: 'ASC' }
    });

    const findings = {
      totalSecurityEvents: logs.length,
      eventsByAction: this.groupByField(logs, 'action'),
      eventsByActorType: this.groupByField(logs, 'actorType'),
      flaggedEvents: logs.filter(log => log.isFlagged).length,
      loginSuccesses: logs.filter((log: any) => log.action === 'login_success').length,
      loginFailures: logs.filter((log: any) => log.action === 'login_failure').length,
      suspiciousActivities: logs.filter((log: any) => log.action === 'suspicious_activity_detected').length,
      eventsByCountry: this.groupByField(logs, 'countryCode'),
    };

    const reportContent = this.generateSecurityAuditContent(findings, options);

    const report = repo.create({
      reportName: options.reportName,
      reportType: 'access_log',
      status: 'pending_review',
      reportContent,
      findings,
      recommendations: this.generateSecurityRecommendations(findings),
      totalRecordsProcessed: logs.length,
      findingsCount: Object.keys(findings).length,
      dataBreachesIdentified: findings.suspiciousActivities,
      reportPeriodStart: options.startDate,
      reportPeriodEnd: options.endDate,
      generatedBy: options.generatedBy,
    });

    await repo.save(report);
    logger.info('Security audit report generated', { reportId: report.id });

    return report;
  }

  /**
   * Get audit logs with filtering
   */
  static async getAuditLogs(filters: AuditLogFilters = {}): Promise<SecurityAuditLog[]> {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);

    const queryBuilder = repo.createQueryBuilder('log');

    if (filters.startDate) {
      queryBuilder.andWhere('log.createdAt >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      queryBuilder.andWhere('log.createdAt <= :endDate', { endDate: filters.endDate });
    }
    if (filters.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: filters.userId });
    }
    if (filters.adminId) {
      queryBuilder.andWhere('log.adminId = :adminId', { adminId: filters.adminId });
    }
    if (filters.action) {
      queryBuilder.andWhere('log.action = :action', { action: filters.action });
    }
    if (filters.resource) {
      queryBuilder.andWhere('log.resource = :resource', { resource: filters.resource });
    }
    if (filters.ipAddress) {
      queryBuilder.andWhere('log.ipAddress = :ipAddress', { ipAddress: filters.ipAddress });
    }

    return queryBuilder.orderBy('log.createdAt', 'DESC').getMany();
  }

  /**
   * Approve a compliance report
   */
  static async approveReport(reportId: string, reviewedBy: string, reviewNotes?: string): Promise<ComplianceReport> {
    await initDataSource();
    const repo = AppDataSource.getRepository(ComplianceReport);

    const report = await repo.findOne({ where: { id: reportId } });
    if (!report) {
      throw new Error('Report not found');
    }

    report.status = 'approved';
    report.reviewedBy = reviewedBy;
    report.reviewedAt = new Date();
    report.reviewNotes = reviewNotes || null;

    await repo.save(report);
    logger.info('Compliance report approved', { reportId, reviewedBy });

    return report;
  }

  /**
   * Reject a compliance report
   */
  static async rejectReport(reportId: string, reviewedBy: string, rejectionReason: string): Promise<ComplianceReport> {
    await initDataSource();
    const repo = AppDataSource.getRepository(ComplianceReport);

    const report = await repo.findOne({ where: { id: reportId } });
    if (!report) {
      throw new Error('Report not found');
    }

    report.status = 'pending_review'; // Reset to pending review instead of approved
    report.reviewedBy = reviewedBy;
    report.reviewedAt = new Date();
    report.reviewNotes = rejectionReason; // Use reviewNotes instead of rejectionReason

    await repo.save(report);
    logger.info('Compliance report rejected', { reportId, reviewedBy, rejectionReason });

    return report;
  }

  // Helper methods

  private static groupByField(items: any[], field: string): Record<string, number> {
    return items.reduce((acc, item) => {
      const key = item[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private static generateGDPRReportContent(findings: any, options: ComplianceReportOptions): string {
    return `
GDPR Compliance Audit Report
=============================
Report Name: ${options.reportName}
Report Period: ${options.startDate.toISOString()} to ${options.endDate.toISOString()}
Generated: ${new Date().toISOString()}
Generated By: ${options.generatedBy}

Executive Summary
-----------------
Total Data Access Requests: ${findings.totalDataAccessRequests}
Total Data Export Requests: ${findings.totalDataExportRequests}
Total Consent Changes: ${findings.totalConsentChanges}
Total Deletion Requests: ${findings.totalDeletionRequests}

Detailed Findings
    const dataAccessStr = JSON.stringify(findings.dataAccessByUser || {}, null, 2);
    const dataExportStr = JSON.stringify(findings.dataExportByUser || {}, null, 2);
    const consentChangesStr = JSON.stringify(findings.consentChangesByUser || {}, null, 2);
    const deletionRequestsStr = JSON.stringify(findings.deletionRequestsByUser || {}, null, 2);

    return `
Detailed Findings

Data Access by User: ${dataAccessStr}
Data Export by User: ${dataExportStr}
Consent Changes by User: ${consentChangesStr}
Deletion Requests by User: ${deletionRequestsStr}
`;
  }

  private static generatePCIDSSReportContent(findings: any, options: ComplianceReportOptions): string {
    return `
PCI-DSS Compliance Audit Report

===============================

Report Name: ${options.reportName}
Report Period: ${options.startDate.toISOString()} to ${options.endDate.toISOString()}
Generated: ${new Date().toISOString()}
Generated By: ${options.generatedBy}

Executive Summary
-----------------
Total Payment Transactions: ${findings.totalPaymentTransactions}
Total Refund Transactions: ${findings.totalRefundTransactions}
Total Payment Method Changes: ${findings.totalPaymentMethodChanges}
Total Admin Payment Actions: ${findings.totalAdminPaymentActions}

Financial Summary
-----------------
Payment Volume: ${findings.paymentVolume}
Refund Volume: ${findings.refundVolume}

Detailed Findings
----------------
Payments by User: ${JSON.stringify(findings.paymentsByUser, null, 2)}
Refunds by User: ${JSON.stringify(findings.refundsByUser, null, 2)}
Admin Actions by Admin: ${JSON.stringify(findings.adminActionsByAdmin, null, 2)}
`;
  }

  private static generateSecurityAuditContent(findings: any, options: ComplianceReportOptions): string {
    return `
Security Audit Report
=====================
Report Name: ${options.reportName}
Report Period: ${options.startDate.toISOString()} to ${options.endDate.toISOString()}
Generated: ${new Date().toISOString()}
Generated By: ${options.generatedBy}

Executive Summary
-----------------
Total Security Events: ${findings.totalSecurityEvents}
Flagged Events: ${findings.flaggedEvents}
Login Successes: ${findings.loginSuccesses}
Login Failures: ${findings.loginFailures}
Suspicious Activities: ${findings.suspiciousActivities}

Detailed Findings
----------------
Events by Action: ${JSON.stringify(findings.eventsByAction, null, 2)}
Events by Actor Type: ${JSON.stringify(findings.eventsByActorType, null, 2)}
Events by Country: ${JSON.stringify(findings.eventsByCountry, null, 2)}
`;
  }

  private static generateGDPRRecommendations(findings: any): string {
    const recommendations: string[] = [];

    if (findings.totalDeletionRequests > 0) {
      recommendations.push('Review deletion request processing times to ensure compliance with GDPR 30-day requirement.');
    }

    if (findings.totalDataAccessRequests > 100) {
      recommendations.push('Consider implementing automated data access request handling to improve efficiency.');
    }

    if (Object.keys(findings.consentChangesByUser).length > 50) {
      recommendations.push('Monitor frequent consent changes which may indicate user confusion or consent fatigue.');
    }

    return recommendations.join('\n') || 'No specific recommendations at this time.';
  }

  private static generatePCIDSSRecommendations(findings: any): string {
    const recommendations: string[] = [];

    if (findings.totalAdminPaymentActions > 10) {
      recommendations.push('Review admin payment actions to ensure proper authorization and segregation of duties.');
    }

    if (findings.totalRefundTransactions / (findings.totalPaymentTransactions || 1) > 0.1) {
      recommendations.push('High refund ratio detected. Review refund policies and processes.');
    }

    if (findings.totalPaymentMethodChanges > 50) {
      recommendations.push('Monitor frequent payment method changes for potential fraud indicators.');
    }

    return recommendations.join('\n') || 'No specific recommendations at this time.';
  }

  private static generateSecurityRecommendations(findings: any): string {
    const recommendations: string[] = [];

    if (findings.loginFailures / (findings.loginSuccesses || 1) > 0.5) {
      recommendations.push('High login failure rate detected. Consider implementing additional security measures.');
    }

    if (findings.suspiciousActivities > 10) {
      recommendations.push('Multiple suspicious activities detected. Review security logs and consider account lockouts.');
    }

    if (findings.flaggedEvents > 20) {
      recommendations.push('High number of flagged events. Review flagging criteria and investigate patterns.');
    }

    return recommendations.join('\n') || 'No specific recommendations at this time.';
  }
}
