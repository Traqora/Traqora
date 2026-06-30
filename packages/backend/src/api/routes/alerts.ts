import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import PriceAlert from '../../models/PriceAlert';
import PriceHistory from '../../models/PriceHistory';
import { PriceOracleService } from '../../services/PriceOracleService';
import { NotificationService } from '../../services/NotificationService';
import { getWebSocketServer } from '../../websockets/server';

const router = Router();

// Validation schemas
const createAlertSchema = z.object({
  flightId: z.string().min(1),
  targetPrice: z.number().positive(),
  currency: z.string().default('USD'),
  notificationMethod: z.enum(['email', 'push', 'both']).default('email'),
});

const updateAlertSchema = z.object({
  targetPrice: z.number().positive().optional(),
  currency: z.string().optional(),
  notificationMethod: z.enum(['email', 'push', 'both']).optional(),
  isActive: z.boolean().optional(),
});

const checkPriceSchema = z.object({
  flightId: z.string().min(1),
});

/**
 * GET /api/v1/alerts
 * Get all price alerts for the authenticated user
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const alerts = await PriceAlert.find({ userId, isActive: true })
      .sort({ createdAt: -1 })
      .exec();

    return res.json({
      success: true,
      data: alerts,
    });
  })
);

/**
 * GET /api/v1/alerts/history
 * Get price alert history for the authenticated user
 */
router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const alerts = await PriceAlert.find({ userId })
      .sort({ createdAt: -1 })
      .exec();

    return res.json({
      success: true,
      data: alerts,
    });
  })
);

/**
 * POST /api/v1/alerts
 * Create a new price alert
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    // Check if alert already exists for this flight and user
    const existingAlert = await PriceAlert.findOne({
      userId,
      flightId: parsed.data.flightId,
      isActive: true,
    }).exec();

    if (existingAlert) {
      throw new BadRequestError('You already have an active alert for this flight');
    }

    // Get current price for this flight
    const oracle = PriceOracleService.getInstance();
    let currentPrice = null;
    try {
      const prices = await oracle.fetchPrices([parsed.data.flightId]);
      if (prices && prices.length > 0) {
        currentPrice = prices[0].price;
      }
    } catch (error) {
      logger.warn('Could not fetch current price for flight', { flightId: parsed.data.flightId });
    }

    const alert = await PriceAlert.create({
      userId,
      flightId: parsed.data.flightId,
      targetPrice: parsed.data.targetPrice,
      currency: parsed.data.currency,
      notificationMethod: parsed.data.notificationMethod,
      currentPrice,
    });

    logger.info(`Price alert created: ${alert.id} for user ${userId}`);

    return res.status(201).json({
      success: true,
      data: alert,
    });
  })
);

/**
 * PUT /api/v1/alerts/:id
 * Update an existing price alert
 */
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const alert = await PriceAlert.findOne({
      _id: req.params.id,
      userId,
    }).exec();

    if (!alert) {
      throw new NotFoundError('Alert not found');
    }

    if (parsed.data.targetPrice !== undefined) {
      alert.targetPrice = parsed.data.targetPrice;
    }
    if (parsed.data.currency !== undefined) {
      alert.currency = parsed.data.currency;
    }
    if (parsed.data.notificationMethod !== undefined) {
      alert.notificationMethod = parsed.data.notificationMethod;
    }
    if (parsed.data.isActive !== undefined) {
      alert.isActive = parsed.data.isActive;
    }

    await alert.save();

    logger.info(`Price alert updated: ${alert.id}`);

    return res.json({
      success: true,
      data: alert,
    });
  })
);

/**
 * DELETE /api/v1/alerts/:id
 * Delete (deactivate) a price alert
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const alert = await PriceAlert.findOne({
      _id: req.params.id,
      userId,
    }).exec();

    if (!alert) {
      throw new NotFoundError('Alert not found');
    }

    // Soft delete - set isActive to false
    alert.isActive = false;
    await alert.save();

    logger.info(`Price alert deactivated: ${alert.id}`);

    return res.json({
      success: true,
      message: 'Alert deactivated successfully',
    });
  })
);

/**
 * POST /api/v1/alerts/:id/activate
 * Reactivate a deactivated price alert
 */
router.post(
  '/:id/activate',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const alert = await PriceAlert.findOne({
      _id: req.params.id,
      userId,
    }).exec();

    if (!alert) {
      throw new NotFoundError('Alert not found');
    }

    alert.isActive = true;
    await alert.save();

    logger.info(`Price alert reactivated: ${alert.id}`);

    return res.json({
      success: true,
      data: alert,
    });
  })
);

/**
 * POST /api/v1/alerts/check
 * Manually check price for a flight and trigger alerts if threshold is met
 */
router.post(
  '/check',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = checkPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const { flightId } = parsed.data;

    // Fetch current price
    const oracle = PriceOracleService.getInstance();
    const prices = await oracle.fetchPrices([flightId]);

    if (!prices || prices.length === 0) {
      throw new BadRequestError('Could not fetch current price for this flight');
    }

    const currentPrice = prices[0].price;

    // Save price history
    await PriceHistory.create({
      flightId,
      price: currentPrice,
      currency: prices[0].currency || 'USD',
      source: prices[0].source || 'oracle',
    });

    // Find active alerts for this flight
    const alerts = await PriceAlert.find({
      flightId,
      isActive: true,
    }).exec();

    const triggeredAlerts = [];
    const notifier = NotificationService.getInstance();

    for (const alert of alerts) {
      if (currentPrice <= alert.targetPrice) {
        // Check throttling (24h cooldown)
        const throttleTime = 24 * 60 * 60 * 1000;
        if (!alert.lastNotifiedAt || (Date.now() - alert.lastNotifiedAt.getTime() > throttleTime)) {
          // Send notification
          const message = `Price Drop Alert! Flight ${flightId} is now ${currentPrice} ${alert.currency}. Target price was ${alert.targetPrice}.`;

          if (alert.notificationMethod === 'email' || alert.notificationMethod === 'both') {
            await notifier.sendEmail(alert.userId, 'Price Alert', message);
          }
          if (alert.notificationMethod === 'push' || alert.notificationMethod === 'both') {
            await notifier.sendPushNotification(alert.userId, message);
          }

          alert.lastNotifiedAt = new Date();
          await alert.save();
          triggeredAlerts.push(alert);
        }
      }
    }

    // Broadcast via WebSocket if any alerts were triggered
    if (triggeredAlerts.length > 0) {
      try {
        const ws = getWebSocketServer();
        ws.broadcastPriceUpdate(flightId, currentPrice);
      } catch (e) {
        logger.warn('WebSocket server not ready, skipping broadcast');
      }
    }

    return res.json({
      success: true,
      data: {
        currentPrice,
        triggeredAlerts: triggeredAlerts.length,
        alerts: triggeredAlerts.map((a) => a.id),
      },
    });
  })
);

export const alertRoutes = router;