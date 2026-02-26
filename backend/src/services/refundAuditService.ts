import { AppDataSource } from '../db/dataSource';
import { logger } from '../utils/logger';

export interface RefundAuditEntry {
  refundId: string;
  action: string;
  actor?: string;
  previousStatus?: string;
  newStatus?: string;
  metadata?: Record<string, any>;
}

export class RefundAuditService {
  private static instance: RefundAuditService;

  private constructor() {}

  public static getInstance(): RefundAuditService {
    if (!RefundAuditService.instance) {
      RefundAuditService.instance = new RefundAuditService();
    }
    return RefundAuditService.instance;
  }

  /**
   * Log a refund action to the audit trail
   */
  public async logAction(entry: RefundAuditEntry): Promise<void> {
    try {
      await AppDataSource.query(
        `INSERT INTO refund_audit_log 
         (refund_id, action, actor, previous_status, new_status, metadata) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          entry.refundId,
          entry.action,
          entry.actor || null,
          entry.previousStatus || null,
          entry.newStatus || null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
        ]
      );

      logger.info('Refund audit log entry created', {
        refundId: entry.refundId,
        action: entry.action,
        actor: entry.actor,
      });
    } catch (error) {
      logger.error('Failed to create refund audit log entry', error);
      // Don't throw - audit logging should not break the main flow
    }
  }

  /**
   * Get audit trail for a specific refund
   */
  public async getAuditTrail(refundId: string): Promise<any[]> {
    try {
      const result = await AppDataSource.query(
        `SELECT * FROM refund_audit_log 
         WHERE refund_id = $1 
         ORDER BY created_at DESC`,
        [refundId]
      );
      return result;
    } catch (error) {
      logger.error('Failed to retrieve refund audit trail', error);
      return [];
    }
  }

  /**
   * Get recent audit entries across all refunds
   */
  public async getRecentAuditEntries(limit: number = 100): Promise<any[]> {
    try {
      const result = await AppDataSource.query(
        `SELECT ral.*, r.booking_id 
         FROM refund_audit_log ral
         JOIN refunds r ON ral.refund_id = r.id
         ORDER BY ral.created_at DESC 
         LIMIT $1`,
        [limit]
      );
      return result;
    } catch (error) {
      logger.error('Failed to retrieve recent audit entries', error);
      return [];
    }
  }
}
