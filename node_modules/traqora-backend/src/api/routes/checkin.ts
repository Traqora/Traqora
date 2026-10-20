import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { BadRequestError } from '../../utils/errors';
import { CheckInService } from '../../services/checkinService';
import { getWebSocketServer } from '../../websockets/server';
import { logger } from '../../utils/logger';

const router = Router();
const checkInService = new CheckInService();

// Updated to include optional timezone string validation
const checkInSchema = z.object({
  seatNumber: z.string().min(1).max(8).optional(),
  timezone: z.string().optional(), // Added for 24-hour boundary timezone check
});

const seatSchema = z.object({
  seatNumber: z.string().min(1).max(8),
});

router.get(
  '/:bookingId/window',
  asyncHandler(async (req: Request, res: Response) => {
    const { window } = await checkInService.getWindow(req.params.bookingId);
    return res.json({ success: true, data: window });
  }),
);

router.post(
  '/:bookingId',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = checkInSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    // Pass the bookingId, seatNumber, and timezone into the hardened service
    const checkIn = await checkInService.checkIn({
      bookingId: req.params.bookingId,
      seatNumber: parsed.data.seatNumber,
      timezone: parsed.data.timezone || 'UTC', // Fallback safely to UTC if missing
    });

    try {
      const ws = getWebSocketServer();
      ws.broadcastBookingStatus(req.params.bookingId, 'checked_in');
    } catch (e) {
      logger.warn('WebSocket server not ready - skipping check-in broadcast');
    }

    return res.status(201).json({ success: true, data: checkIn });
  }),
);

router.get(
  '/:bookingId',
  asyncHandler(async (req: Request, res: Response) => {
    const checkIn = await checkInService.getCheckIn(req.params.bookingId);
    return res.json({ success: true, data: checkIn });
  }),
);

router.patch(
  '/:bookingId/seat',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = seatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const checkIn = await checkInService.reselectSeat(req.params.bookingId, parsed.data.seatNumber);
    return res.json({ success: true, data: checkIn });
  }),
);

router.get(
  '/:bookingId/boarding-pass.pdf',
  asyncHandler(async (req: Request, res: Response) => {
    const pdfBuffer = await checkInService.generateBoardingPassPdf(req.params.bookingId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="boarding-pass-${req.params.bookingId}.pdf"`,
    });
    return res.send(pdfBuffer);
  }),
);

router.get(
  '/:bookingId/wallet-pass',
  asyncHandler(async (req: Request, res: Response) => {
    const pass = await checkInService.generateWalletPass(req.params.bookingId);
    return res.json({ success: true, data: pass });
  }),
);

router.get(
  '/:bookingId/google-wallet-pass',
  asyncHandler(async (req: Request, res: Response) => {
    const pass = await checkInService.generateGoogleWalletPass(req.params.bookingId);
    return res.json({ success: true, data: pass });
  }),
);

export default router;
