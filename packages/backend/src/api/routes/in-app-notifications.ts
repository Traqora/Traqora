import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { notificationDeliveryService } from '../../services/NotificationDeliveryService';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/v1/notifications/in-app
 * Get in-app notifications for the authenticated user
 */
router.get(
  '/in-app',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';
    const includeArchived = req.query.includeArchived === 'true';

    const result = await notificationDeliveryService.getNotifications(userId, {
      limit,
      offset,
      unreadOnly,
      includeArchived,
    });

    return res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/v1/notifications/in-app/unread-count
 * Get unread notification count
 */
router.get(
  '/in-app/unread-count',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const count = await notificationDeliveryService.getUnreadCount(userId);

    return res.json({
      success: true,
      data: { unreadCount: count },
    });
  })
);

/**
 * PUT /api/v1/notifications/in-app/:id/read
 * Mark a specific notification as read
 */
router.put(
  '/in-app/:id/read',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const success = await notificationDeliveryService.markAsRead(userId, req.params.id);

    if (!success) {
      throw new NotFoundError('Notification not found');
    }

    return res.json({
      success: true,
      message: 'Notification marked as read',
    });
  })
);

/**
 * PUT /api/v1/notifications/in-app/read-all
 * Mark all notifications as read
 */
router.put(
  '/in-app/read-all',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const affected = await notificationDeliveryService.markAllAsRead(userId);

    return res.json({
      success: true,
      data: { markedAsRead: affected },
    });
  })
);

/**
 * PUT /api/v1/notifications/in-app/:id/archive
 * Archive a notification
 */
router.put(
  '/in-app/:id/archive',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const success = await notificationDeliveryService.archiveNotification(userId, req.params.id);

    if (!success) {
      throw new NotFoundError('Notification not found');
    }

    return res.json({
      success: true,
      message: 'Notification archived',
    });
  })
);

/**
 * GET /api/v1/notifications/delivery-log
 * Get delivery log for the authenticated user
 */
router.get(
  '/delivery-log',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const channel = req.query.channel as string | undefined;
    const status = req.query.status as any | undefined;
    const notificationId = req.query.notificationId as string | undefined;

    const result = await notificationDeliveryService.getDeliveryLog(userId, {
      limit,
      offset,
      channel,
      status,
      notificationId,
    });

    return res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/v1/notifications/delivery-log/retry
 * Retry failed delivery attempts
 */
router.post(
  '/delivery-log/retry',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const retryCount = await notificationDeliveryService.retryFailedDeliveries(userId);

    return res.json({
      success: true,
      data: { retried: retryCount },
    });
  })
);

export const inAppNotificationRoutes = router;