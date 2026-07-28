import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import FlightStatusAlert from '../../models/FlightStatusAlert';
import { FlightStatusService, FlightStatusUpdate } from '../../services/FlightStatusService';
import { notifyFlightStatusChange } from '../../services/flightStatusNotifier';

const router = Router();

const FLIGHT_STATUS_VALUES = ['on_time', 'delayed', 'cancelled', 'gate_changed', 'boarding', 'departed'] as const;

const createAlertSchema = z.object({
  flightId: z.string().min(1),
  bookingId: z.string().optional(),
});

const getStatusSchema = z.object({
  flightId: z.string().min(1),
});

const reportStatusSchema = z.object({
  flightId: z.string().min(1),
  status: z.enum(FLIGHT_STATUS_VALUES),
  gate: z.string().optional(),
  delayMinutes: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});

/**
 * GET /api/v1/flight-status/alerts
 * Get all flight status subscriptions for the authenticated user
 */
router.get(
  '/alerts',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.walletAddress;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const alerts = await FlightStatusAlert.find({ userId, isActive: true })
      .sort({ createdAt: -1 })
      .exec();

    return res.json({ success: true, data: alerts });
  }),
);

/**
 * POST /api/v1/flight-status/alerts
 * Subscribe the authenticated user to status changes for a flight
 */
router.post(
  '/alerts',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.walletAddress;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const existingAlert = await FlightStatusAlert.findOne({
      userId,
      flightId: parsed.data.flightId,
      isActive: true,
    }).exec();

    if (existingAlert) {
      throw new BadRequestError('You already have an active status subscription for this flight');
    }

    const statusService = FlightStatusService.getInstance();
    const lastKnown = statusService.getLastKnownStatus(parsed.data.flightId);

    const alert = await FlightStatusAlert.create({
      userId,
      flightId: parsed.data.flightId,
      bookingId: parsed.data.bookingId,
      lastStatus: lastKnown?.status,
    });

    logger.info(`Flight status alert created: ${alert.id} for user ${userId}`);

    return res.status(201).json({ success: true, data: alert });
  }),
);

/**
 * DELETE /api/v1/flight-status/alerts/:id
 * Unsubscribe (soft delete) from flight status changes
 */
router.delete(
  '/alerts/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.walletAddress;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const alert = await FlightStatusAlert.findOne({
      _id: req.params.id,
      userId,
    }).exec();

    if (!alert) {
      throw new NotFoundError('Flight status subscription not found');
    }

    alert.isActive = false;
    await alert.save();

    logger.info(`Flight status alert deactivated: ${alert.id}`);

    return res.json({ success: true, message: 'Subscription deactivated successfully' });
  }),
);

/**
 * GET /api/v1/flight-status?flightId=...
 * Get the current known status for a flight
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = getStatusSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const statusService = FlightStatusService.getInstance();
    const [status] = await statusService.fetchStatuses([parsed.data.flightId]);

    return res.json({ success: true, data: status });
  }),
);

/**
 * POST /api/v1/flight-status/report
 * Report a status change for a flight (delay, cancellation, gate change,
 * etc.), notify active subscribers, and broadcast via WebSocket. This is the
 * ingestion point a real airline status feed would call into; for now it's
 * also reachable directly so the flow can be exercised without a live feed.
 */
router.post(
  '/report',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = reportStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const { flightId, status, gate, delayMinutes, reason } = parsed.data;

    const statusService = FlightStatusService.getInstance();
    const update: FlightStatusUpdate = {
      flightId,
      status,
      gate,
      delayMinutes,
      reason,
      timestamp: new Date(),
    };
    const { changed, previous } = statusService.recordStatus(update);

    if (!changed) {
      return res.json({ success: true, data: { flightId, status, notified: 0, changed: false } });
    }

    const { notifiedCount } = await notifyFlightStatusChange(update);

    logger.info(`Flight status change: ${flightId} ${previous?.status ?? 'unknown'} -> ${status}`, {
      notifiedCount,
    });

    return res.json({
      success: true,
      data: { flightId, status, notified: notifiedCount, changed: true },
    });
  }),
);

/**
 * GET /api/v1/flight-status/:flightId/performance
 * Historical on-time performance for a flight (issue #332), derived from
 * recorded status transitions this process has observed.
 */
router.get(
  '/:flightId/performance',
  asyncHandler(async (req: Request, res: Response) => {
    const flightId = req.params.flightId;
    if (!flightId) {
      throw new BadRequestError('flightId is required');
    }

    const statusService = FlightStatusService.getInstance();
    const performance = statusService.getOnTimePerformance(flightId);

    return res.json({ success: true, data: performance });
  }),
);

export const flightStatusRoutes = router;
