import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import {
  submitSignedSorobanXdr,
  explorerUrlForTx,
  generateTransactionReceiptPdf,
} from '../../services/soroban';
import { confirmBookingTx } from '../../services/bookingConfirmRetry';
import { withRetries } from '../../services/retry';
import { getWebSocketServer } from '../../websockets/server';
import { logger } from '../../utils/logger';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { validateBody, validateParams, validateQuery } from '../../middleware/requestValidation';
import { getBookingForRequester } from '../../middleware/bookingAccess';

const router = Router();

const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() }).strict();
const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
const retrySchema = z.object({ signedXdr: z.string().min(1).max(200000) }).strict();

function serializeTransaction(booking: Booking) {
  return {
    bookingId: booking.id,
    bookingStatus: booking.status,
    txHash: booking.sorobanTxHash || null,
    innerTxHash: booking.sorobanInnerTxHash || null,
    feeBumpTxHash: booking.sorobanFeeBumpTxHash || null,
    isFeeBump: booking.sorobanIsFeeBump || false,
    bookingReference: booking.bookingReference || null,
    explorerUrl: booking.sorobanTxHash ? explorerUrlForTx(booking.sorobanTxHash) : null,
    contractSubmitAttempts: booking.contractSubmitAttempts,
    confirmationAttempts: booking.confirmationAttempts ?? 0,
    confirmationNextAttemptAt: booking.confirmationNextAttemptAt ?? null,
    lastError: booking.lastError || null,
    updatedAt: booking.updatedAt,
  };
}

function broadcastStatus(booking: Booking) {
  try {
    const ws = getWebSocketServer();
    ws.broadcastBookingStatus(booking.id, booking.status);
  } catch (e) {
    logger.warn('WebSocket server not ready - skipping booking status broadcast');
  }
}

// GET /api/v1/transactions - list recent on-chain transactions for bookings owned by the caller
router.get(
  '/',
  requireAuth,
  validateQuery(listQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) throw new NotFoundError('Booking not found');

    const limit = Number(req.query.limit) || 20;
    const bookings = await bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.passenger', 'passenger')
      .leftJoinAndSelect('booking.flight', 'flight')
      .where('booking.sorobanTxHash IS NOT NULL')
      .andWhere('passenger.sorobanAddress = :walletAddress', { walletAddress })
      .orderBy('booking.updatedAt', 'DESC')
      .take(limit)
      .getMany();

    return res.json({
      success: true,
      data: bookings.map(serializeTransaction),
    });
  }),
);

// GET /api/v1/transactions/:bookingId - single transaction status (polls chain if needed)
router.get(
  '/:bookingId',
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req, ['passenger', 'flight']);
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({
      where: { id: req.params.bookingId },
      relations: ['passenger', 'flight'],
    });
    if (!booking) throw new NotFoundError('Booking not found');

    if (!booking.sorobanTxHash) {
      return res.json({ success: true, data: serializeTransaction(booking) });
    }

    const { outcome, changed, booking: updated, transactionStatus: txStatus } =
      await confirmBookingTx(req.params.bookingId);

    if (changed) {
      broadcastStatus(updated);
    }

    return res.json({
      success: true,
      data: {
        ...serializeTransaction(updated),
        chainStatus: txStatus?.status ?? null,
        confirmOutcome: outcome,
      },
    });
  }),
);

// POST /api/v1/transactions/:bookingId/retry - resubmit a failed on-chain transaction
router.post(
  '/:bookingId/retry',
  requireAuth,
  validateParams(bookingIdParamSchema),
  validateBody(retrySchema),
  asyncHandler(async (req: Request, res: Response) => {
    await getBookingForRequester(req.params.bookingId, req, ['passenger', 'flight']);

    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({
      where: { id: req.params.bookingId },
      relations: ['passenger', 'flight'],
    });
    if (!booking) throw new NotFoundError('Booking not found');

    if (booking.status !== 'failed' && booking.status !== 'onchain_pending') {
      throw new ConflictError('Booking transaction is not in a retryable state');
    }

    booking.status = 'onchain_pending';
    await bookingRepo.save(booking);

    const result = await withRetries(
      async () => submitSignedSorobanXdr(req.body.signedXdr),
      { retries: 3, baseDelayMs: 300 },
    );

    booking.sorobanTxHash = result.txHash;
    booking.sorobanInnerTxHash = result.innerTxHash;
    booking.sorobanFeeBumpTxHash = result.feeBumpTxHash ?? null;
    booking.sorobanIsFeeBump = result.isFeeBump;
    booking.status = 'onchain_submitted';
    booking.contractSubmitAttempts = (booking.contractSubmitAttempts || 0) + 1;
    booking.confirmationAttempts = 0;
    booking.confirmationNextAttemptAt = null;
    booking.lastError = null;
    await bookingRepo.save(booking);
    broadcastStatus(booking);

    return res.status(202).json({
      success: true,
      data: serializeTransaction(booking),
    });
  }),
);

// GET /api/v1/transactions/:bookingId/receipt.pdf - printable receipt for a submitted on-chain transaction
router.get(
  '/:bookingId/receipt.pdf',
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const booking = await getBookingForRequester(req.params.bookingId, req, ['passenger', 'flight']);

    if (!booking.sorobanTxHash) {
      throw new ConflictError('Receipt is only available once a transaction has been submitted');
    }

    const pdfBuffer = await generateTransactionReceiptPdf({
      bookingId: booking.id,
      bookingStatus: booking.status,
      amountCents: booking.amountCents,
      passengerName: `${booking.passenger.firstName} ${booking.passenger.lastName}`,
      flightNumber: booking.flight.flightNumber,
      airlineCode: booking.flight.airlineCode,
      fromAirport: booking.flight.fromAirport,
      toAirport: booking.flight.toAirport,
      departureTime: booking.flight.departureTime,
      txHash: booking.sorobanTxHash,
      explorerUrl: explorerUrlForTx(booking.sorobanTxHash),
      createdAt: booking.createdAt,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${booking.id}.pdf"`,
    });
    return res.send(pdfBuffer);
  }),
);

export default router;
