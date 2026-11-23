import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { CheckInService } from '../../services/checkinService';
import { getWebSocketServer } from '../../websockets/server';
import { logger } from '../../utils/logger';
import { validateBody, validateParams } from '../../middleware/requestValidation';
import { getBookingForRequester } from '../../middleware/bookingAccess';

const router = Router();
const checkInService = new CheckInService();

const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() }).strict();

const checkInSchema = z
  .object({
    seatNumber: z.string().min(1).max(8).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .strict();

const seatSchema = z
  .object({
    seatNumber: z.string().min(1).max(8),
  })
  .strict();

router.get(
  '/:bookingId/window',
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req);
    const { window } = await checkInService.getWindow(req.params.bookingId);
    return res.json({ success: true, data: window });
  }),
);

router.post(
  '/:bookingId',
  validateParams(bookingIdParamSchema),
  validateBody(checkInSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req);
    const checkIn = await checkInService.checkIn({
      bookingId: req.params.bookingId,
      seatNumber: req.body.seatNumber,
      timezone: req.body.timezone || 'UTC',
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
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req);
    const checkIn = await checkInService.getCheckIn(req.params.bookingId);
    return res.json({ success: true, data: checkIn });
  }),
);

router.patch(
  '/:bookingId/seat',
  validateParams(bookingIdParamSchema),
  validateBody(seatSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req);
    const checkIn = await checkInService.reselectSeat(req.params.bookingId, req.body.seatNumber);
    return res.json({ success: true, data: checkIn });
  }),
);

router.get(
  '/:bookingId/boarding-pass.pdf',
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req);
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
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req);
    const pass = await checkInService.generateWalletPass(req.params.bookingId);
    return res.json({ success: true, data: pass });
  }),
);

router.get(
  '/:bookingId/google-wallet-pass',
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req);
    const pass = await checkInService.generateGoogleWalletPass(req.params.bookingId);
    return res.json({ success: true, data: pass });
  }),
);

export default router;
