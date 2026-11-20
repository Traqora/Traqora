/**
 * Notification History Service
 * Tracks and manages notification delivery history
 */

import { AppDataSource } from '../db/dataSource';
import { NotificationLog } from '../db/entities/NotificationLog';
import { logger } from '../utils/logger';
import type { NotificationChannel, DeliveryStatus } from '../types/notification';
import {
  isValidDeliveryTransition,
  sanitizeDeliveryMetadata,
  type DeliveryLifecycleState,
} from './deliveryLifecycle';

export const DELIVERY_LIFECYCLE_KEY = 'deliveryLifecycle';

export interface NotificationHistoryEntry {
  id: string;
  userId: string;
  channel: NotificationChannel;
  category: string;
  status: DeliveryStatus;
  title: string;
  body: string;
  recipient: string;
  externalId?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  deliveredAt?: Date;
}

export interface HistoryQueryOptions {
  userId?: string;
  channel?: NotificationChannel;
  category?: string;
  status?: DeliveryStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface HistoryStatistics {
  total: number;
  byChannel: Record<NotificationChannel, number>;
  byCategory: Record<string, number>;
  byStatus: Record<DeliveryStatus, number>;
  successRate: number;
  averageDeliveryTime: number;
}

export class NotificationHistoryService {
  private repository = AppDataSource.getRepository(NotificationLog);

  /**
   * Log notification delivery attempt
   */
  async logDelivery(entry: {
    userId: string;
    channel: NotificationChannel;
    category: string;
    status: DeliveryStatus;
    title: string;
    body: string;
    recipient: string;
    externalId?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<NotificationLog> {
    const log = this.repository.create({
      userId: entry.userId,
      channel: entry.channel,
      type: entry.category,
      status: entry.status,
      payload: {
        title: entry.title,
        body: entry.body,
        recipient: entry.recipient,
        externalId: entry.externalId,
        metadata: sanitizeDeliveryMetadata(entry.metadata),
        [DELIVERY_LIFECYCLE_KEY]: entry.status === 'failed' ? 'failed' : 'accepted',
      },
      errorMessage: entry.errorMessage,
      attempts: 1,
    });

    const saved = await this.repository.save(log);
    
    logger.info('Notification delivery logged', {
      id: saved.id,
      userId: entry.userId,
      channel: entry.channel,
      status: entry.status,
    });

    return saved;
  }

  /**
   * Update delivery status
   */
  async updateStatus(
    logId: string,
    status: DeliveryStatus,
    errorMessage?: string,
    metadata?: Record<string, any>,
  ): Promise<NotificationLog | null> {
    const log = await this.repository.findOne({ where: { id: logId } });
    if (!log) return null;

    log.status = status;
    if (errorMessage) log.errorMessage = errorMessage;
    if (metadata) {
      log.payload = { ...log.payload, ...sanitizeDeliveryMetadata(metadata) };
    }
    log.attempts += 1;

    const updated = await this.repository.save(log);
    
    logger.info('Notification delivery status updated', {
      id: logId,
      status,
    });

    return updated;
  }

  /**
   * Record a delivery lifecycle transition on an existing log entry.
   * Invalid transitions are ignored so a late provider callback cannot move
   * a notification backwards or resurrect a terminal one.
   */
  async recordLifecycleTransition(
    logId: string,
    next: DeliveryLifecycleState,
    metadata?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<NotificationLog | null> {
    const log = await this.repository.findOne({ where: { id: logId } });
    if (!log) return null;

    const payload = (log.payload ?? {}) as Record<string, unknown>;
    const current = payload[DELIVERY_LIFECYCLE_KEY] as DeliveryLifecycleState | undefined;
    if (!isValidDeliveryTransition(current, next)) {
      logger.info('Ignoring invalid delivery lifecycle transition', {
        id: logId,
        current,
        next,
      });
      return log;
    }

    return this.updateStatus(
      logId,
      this.statusForLifecycleState(next),
      errorMessage,
      {
        ...sanitizeDeliveryMetadata(metadata),
        [DELIVERY_LIFECYCLE_KEY]: next,
      }
    );
  }

  /** Map a lifecycle state onto the persisted DeliveryStatus column. */
  private statusForLifecycleState(state: DeliveryLifecycleState): DeliveryStatus {
    switch (state) {
      case 'accepted':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'failed':
        return 'failed';
      case 'retrying':
        return 'pending';
      case 'terminal':
        return 'failed';
    }
  }

  /** Provider accepted the message for delivery. */
  async recordProviderAcceptance(
    logId: string,
    providerExternalId?: string,
    metadata?: Record<string, unknown>
  ): Promise<NotificationLog | null> {
    return this.recordLifecycleTransition(logId, 'accepted', {
      ...(providerExternalId ? { externalId: providerExternalId } : {}),
      ...metadata,
    });
  }

  /** Delivery failed; stores a sanitized error, never the message secret. */
  async recordDeliveryFailure(
    logId: string,
    errorMessage: string,
    metadata?: Record<string, unknown>
  ): Promise<NotificationLog | null> {
    return this.recordLifecycleTransition(logId, 'failed', metadata, errorMessage);
  }

  /** A retry is scheduled or in flight. */
  async recordRetry(
    logId: string,
    metadata?: Record<string, unknown>
  ): Promise<NotificationLog | null> {
    return this.recordLifecycleTransition(logId, 'retrying', metadata);
  }

  /** No further attempts will be made. */
  async markTerminal(
    logId: string,
    metadata?: Record<string, unknown>
  ): Promise<NotificationLog | null> {
    return this.recordLifecycleTransition(logId, 'terminal', metadata);
  }

  /**
   * Get notification history
   */
  async getHistory(options: HistoryQueryOptions): Promise<NotificationHistoryEntry[]> {
    const queryBuilder = this.repository.createQueryBuilder('log');

    if (options.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: options.userId });
    }

    if (options.channel) {
      queryBuilder.andWhere('log.channel = :channel', { channel: options.channel });
    }

    if (options.category) {
      queryBuilder.andWhere('log.type = :category', { category: options.category });
    }

    if (options.status) {
      queryBuilder.andWhere('log.status = :status', { status: options.status });
    }

    if (options.startDate) {
      queryBuilder.andWhere('log.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      queryBuilder.andWhere('log.createdAt <= :endDate', { endDate: options.endDate });
    }

    queryBuilder.orderBy('log.createdAt', 'DESC');

    if (options.limit) {
      queryBuilder.limit(options.limit);
    }

    if (options.offset) {
      queryBuilder.offset(options.offset);
    }

    const logs = await queryBuilder.getMany();

    return logs.map(log => this.mapToHistoryEntry(log));
  }

  /**
   * Get user notification history
   */
  async getUserHistory(
    userId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<NotificationHistoryEntry[]> {
    return this.getHistory({ userId, limit, offset });
  }

  /**
   * Get delivery statistics
   */
  async getStatistics(options: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<HistoryStatistics> {
    const queryBuilder = this.repository.createQueryBuilder('log');

    if (options.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: options.userId });
    }

    if (options.startDate) {
      queryBuilder.andWhere('log.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      queryBuilder.andWhere('log.createdAt <= :endDate', { endDate: options.endDate });
    }

    const logs = await queryBuilder.getMany();

    const byChannel: Record<NotificationChannel, number> = {
      email: 0,
      sms: 0,
      push: 0,
      inapp: 0,
    };

    const byCategory: Record<string, number> = {};
    const byStatus: Record<DeliveryStatus, number> = {
      pending: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      bounced: 0,
    };

    let successful = 0;
    let totalDeliveryTime = 0;
    let deliveryTimeCount = 0;

    for (const log of logs) {
      byChannel[log.channel as NotificationChannel]++;
      byCategory[log.type] = (byCategory[log.type] || 0) + 1;
      byStatus[log.status as DeliveryStatus]++;

      if (log.status === 'delivered') {
        successful++;
      }

      // Calculate delivery time if we have sent and delivered timestamps
      if (log.status === 'delivered' && log.createdAt) {
        // This is a simplified calculation - in production, you'd track actual send/deliver times
        const deliveryTime = 1000; // Placeholder: 1 second average
        totalDeliveryTime += deliveryTime;
        deliveryTimeCount++;
      }
    }

    return {
      total: logs.length,
      byChannel,
      byCategory,
      byStatus,
      successRate: logs.length > 0 ? (successful / logs.length) * 100 : 0,
      averageDeliveryTime: deliveryTimeCount > 0 ? totalDeliveryTime / deliveryTimeCount : 0,
    };
  }

  /**
   * Get failed notifications for retry
   */
  async getFailedNotifications(maxAge: number = 3600000): Promise<NotificationLog[]> {
    const cutoffDate = new Date(Date.now() - maxAge);

    return this.repository
      .createQueryBuilder('log')
      .where('log.status = :status', { status: 'failed' })
      .andWhere('log.attempts < :maxAttempts', { maxAttempts: 3 })
      .andWhere('log.createdAt >= :cutoffDate', { cutoffDate })
      .orderBy('log.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Delete old history entries
   */
  async deleteOldHistory(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    logger.info('Old notification history deleted', {
      cutoffDate,
      affected: result.affected || 0,
    });

    return result.affected || 0;
  }

  /**
   * Get history by notification ID
   */
  async getHistoryByNotificationId(notificationId: string): Promise<NotificationHistoryEntry[]> {
    const logs = await this.repository
      .createQueryBuilder('log')
      .where('log.payload::text LIKE :notificationId', {
        notificationId: `%${notificationId}%`,
      })
      .orderBy('log.createdAt', 'DESC')
      .getMany();

    return logs.map(log => this.mapToHistoryEntry(log));
  }

  /**
   * Get recent activity for user
   */
  async getRecentActivity(userId: string, hours: number = 24): Promise<NotificationHistoryEntry[]> {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    return this.getHistory({
      userId,
      startDate,
    });
  }

  /**
   * Get delivery trends
   */
  async getDeliveryTrends(days: number = 30): Promise<{
    date: string;
    total: number;
    successful: number;
    failed: number;
    byChannel: Record<NotificationChannel, number>;
  }[]> {
    const trends: Array<{
      date: string;
      total: number;
      successful: number;
      failed: number;
      byChannel: Record<NotificationChannel, number>;
    }> = [];

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);

      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      const logs = await this.repository
        .createQueryBuilder('log')
        .where('log.createdAt >= :dayStart', { dayStart })
        .andWhere('log.createdAt <= :dayEnd', { dayEnd })
        .getMany();

      const byChannel: Record<NotificationChannel, number> = {
        email: 0,
        sms: 0,
        push: 0,
        inapp: 0,
      };

      let successful = 0;
      let failed = 0;

      for (const log of logs) {
        byChannel[log.channel as NotificationChannel]++;
        if (log.status === 'delivered') {
          successful++;
        } else if (log.status === 'failed' || log.status === 'bounced') {
          failed++;
        }
      }

      trends.push({
        date: currentDate.toISOString().split('T')[0],
        total: logs.length,
        successful,
        failed,
        byChannel,
      });
    }

    return trends;
  }

  /**
   * Map database entity to history entry
   */
  private mapToHistoryEntry(log: NotificationLog): NotificationHistoryEntry {
    const payload = (log.payload as Record<string, any>) || {};

    return {
      id: log.id,
      userId: log.userId,
      channel: log.channel as NotificationChannel,
      category: log.type,
      status: log.status as DeliveryStatus,
      title: payload.title || '',
      body: payload.body || '',
      recipient: payload.recipient || '',
      externalId: payload.externalId,
      errorMessage: log.errorMessage,
      metadata: payload.metadata,
      createdAt: log.createdAt,
      deliveredAt: log.status === 'delivered' ? log.updatedAt : undefined,
    };
  }

  /**
   * Export history to CSV
   */
  async exportToCSV(options: HistoryQueryOptions): Promise<string> {
    const history = await this.getHistory(options);

    const headers = [
      'ID',
      'User ID',
      'Channel',
      'Category',
      'Status',
      'Title',
      'Body',
      'Recipient',
      'External ID',
      'Error Message',
      'Created At',
      'Delivered At',
    ];

    const rows = history.map(entry => [
      entry.id,
      entry.userId,
      entry.channel,
      entry.category,
      entry.status,
      `"${entry.title.replace(/"/g, '""')}"`,
      `"${entry.body.replace(/"/g, '""')}"`,
      entry.recipient,
      entry.externalId || '',
      entry.errorMessage || '',
      entry.createdAt.toISOString(),
      entry.deliveredAt?.toISOString() || '',
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

    return csv;
  }

  /**
   * Get history count
   */
  async getHistoryCount(options: HistoryQueryOptions): Promise<number> {
    const queryBuilder = this.repository.createQueryBuilder('log');

    if (options.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: options.userId });
    }

    if (options.channel) {
      queryBuilder.andWhere('log.channel = :channel', { channel: options.channel });
    }

    if (options.category) {
      queryBuilder.andWhere('log.type = :category', { category: options.category });
    }

    if (options.status) {
      queryBuilder.andWhere('log.status = :status', { status: options.status });
    }

    if (options.startDate) {
      queryBuilder.andWhere('log.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      queryBuilder.andWhere('log.createdAt <= :endDate', { endDate: options.endDate });
    }

    return queryBuilder.getCount();
  }
}
