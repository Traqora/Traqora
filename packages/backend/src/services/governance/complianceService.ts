import { AppDataSource } from "../../db/dataSource";
import {
  ComplianceReport,
  ReportType,
  ReportStatus,
} from "../../db/entities/ComplianceReport";
import { AdminAuditLog } from "../../db/entities/AdminAuditLog";
import { logger } from "../../utils/logger";
import { LessThan } from "typeorm";

interface ComplianceReportInput {
  reportName: string;
  reportType: ReportType;
  reportContent: string;
  findings?: any;
  recommendations?: string;
  reportPeriodStart?: Date;
  reportPeriodEnd?: Date;
}

interface ComplianceReportQuery {
  reportType?: ReportType;
  status?: ReportStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class ComplianceService {
  private reportRepository = AppDataSource.getRepository(ComplianceReport);
  private auditRepository = AppDataSource.getRepository(AdminAuditLog);

  /**
   * Generate a new compliance report
   */
  async generateReport(
    input: ComplianceReportInput,
    generatedByEmail: string,
  ): Promise<ComplianceReport> {
    try {
      const totalRecordsProcessed = input.findings?.totalRecords || 0;
      const findingsCount = Array.isArray(input.findings?.issues)
        ? input.findings.issues.length
        : 0;

      const report = this.reportRepository.create({
        reportName: input.reportName,
        reportType: input.reportType,
        status: "draft",
        reportContent: input.reportContent,
        findings: input.findings,
        recommendations: input.recommendations,
        reportPeriodStart: input.reportPeriodStart,
        reportPeriodEnd: input.reportPeriodEnd,
        totalRecordsProcessed,
        findingsCount,
        dataBreachesIdentified: input.findings?.breaches || 0,
        generatedBy: generatedByEmail,
      });

      await this.reportRepository.save(report);

      await this.auditRepository.save({
        adminEmail: generatedByEmail,
        action: "compliance_report_generated",
        resource: "compliance_report",
        resourceId: report.id,
        details: JSON.stringify({
          reportType: report.reportType,
          findingsCount,
        }),
      });

      logger.info("Compliance report generated", {
        reportId: report.id,
        reportType: report.reportType,
        generatedBy: generatedByEmail,
      });

      return report;
    } catch (error) {
      logger.error("Error generating compliance report", {
        error: error instanceof Error ? error.message : String(error),
        input,
      });
      throw error;
    }
  }

  /**
   * Retrieve compliance reports with filtering
   */
  async getReports(query: ComplianceReportQuery): Promise<{
    reports: ComplianceReport[];
    total: number;
  }> {
    try {
      const builder = this.reportRepository.createQueryBuilder("report");

      if (query.reportType) {
        builder.andWhere("report.reportType = :reportType", {
          reportType: query.reportType,
        });
      }

      if (query.status) {
        builder.andWhere("report.status = :status", { status: query.status });
      }

      if (query.startDate) {
        builder.andWhere("report.createdAt >= :startDate", {
          startDate: query.startDate,
        });
      }

      if (query.endDate) {
        builder.andWhere("report.createdAt <= :endDate", {
          endDate: query.endDate,
        });
      }

      const total = await builder.getCount();

      builder.orderBy("report.createdAt", "DESC");

      if (query.limit) {
        builder.limit(query.limit);
      }
      if (query.offset) {
        builder.offset(query.offset);
      }

      const reports = await builder.getMany();

      return { reports, total };
    } catch (error) {
      logger.error("Error fetching compliance reports", {
        error: error instanceof Error ? error.message : String(error),
        query,
      });
      throw error;
    }
  }

  /**
   * Approve a compliance report
   */
  async approveReport(
    reportId: string,
    reviewedByEmail: string,
    notes?: string,
  ): Promise<ComplianceReport> {
    try {
      const report = await this.reportRepository.findOneBy({ id: reportId });

      if (!report) {
        throw new Error(`Compliance report not found: ${reportId}`);
      }

      report.status = "approved";
      report.reviewedBy = reviewedByEmail;
      report.reviewedAt = new Date();
      report.reviewNotes = notes || "";

      await this.reportRepository.save(report);

      await this.auditRepository.save({
        adminEmail: reviewedByEmail,
        action: "compliance_report_approved",
        resource: "compliance_report",
        resourceId: report.id,
        details: JSON.stringify({
          reportType: report.reportType,
          notes,
        }),
      });

      logger.info("Compliance report approved", {
        reportId,
        reviewedBy: reviewedByEmail,
      });

      return report;
    } catch (error) {
      logger.error("Error approving compliance report", {
        error: error instanceof Error ? error.message : String(error),
        reportId,
      });
      throw error;
    }
  }

  /**
   * Archive old reports
   */
  async archiveOldReports(olderThanDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.reportRepository.update(
        {
          createdAt: LessThan(cutoffDate),
          status: "approved",
        },
        { status: "archived" },
      );

      logger.info("Archived old compliance reports", {
        archivedCount: result.affected,
        olderThanDays,
      });

      return result.affected || 0;
    } catch (error) {
      logger.error("Error archiving compliance reports", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get compliance report summary
   */
  async getComplianceSummary(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalReports: number;
    reportsByType: Record<ReportType, number>;
    totalFindings: number;
    breachesIdentified: number;
    approvalRate: number;
  }> {
    try {
      const builder = this.reportRepository
        .createQueryBuilder("report")
        .where("report.createdAt >= :startDate", { startDate })
        .andWhere("report.createdAt <= :endDate", { endDate });

      const reports = await builder.getMany();
      const totalReports = reports.length;

      const reportsByType: Record<ReportType, number> = {
        gdpr_audit: 0,
        ccpa_audit: 0,
        data_inventory: 0,
        access_log: 0,
        breach_notification: 0,
        pia: 0,
      };

      let totalFindings = 0;
      let breachesIdentified = 0;
      let approvedReports = 0;

      reports.forEach((report) => {
        reportsByType[report.reportType]++;
        totalFindings += report.findingsCount;
        breachesIdentified += report.dataBreachesIdentified;
        if (report.status === "approved") {
          approvedReports++;
        }
      });

      const approvalRate =
        totalReports > 0 ? (approvedReports / totalReports) * 100 : 0;

      return {
        totalReports,
        reportsByType,
        totalFindings,
        breachesIdentified,
        approvalRate: Math.round(approvalRate * 100) / 100,
      };
    } catch (error) {
      logger.error("Error getting compliance summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const complianceService = new ComplianceService();
