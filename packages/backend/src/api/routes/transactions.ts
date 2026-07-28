import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import {
  getTransactionStatus,
  submitSignedSorobanXdr,
  explorerUrlForTx,
  generateTransactionReceiptPdf,
} from '../../services/soroban';
import { withRetries } from '../../services/retry';
import { getWebSocketServer } from '../../websockets/server';
import { logger } from '../../utils/logger';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors';

const router = Router();

function serializeTransaction(booking: Booking) {
  return {
    bookingId: booking.id,
    bookingStatus: booking.status,
    txHash: booking.sorobanTxHash || null,
    explorerUrl: booking.sorobanTxHash ? explorerUrlForTx(booking.sorobanTxHash) : null,
    contractSubmitAttempts: booking.contractSubmitAttempts,
    lastError: booking.lastError || null,
    updatedAt: booking.updatedAt,
  };
}

// GET /api/v1/transactions - list recent on-chain transactions for bookings owned by the caller
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const walletAddress = req.user?.walletAddress;

    const qb = bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.passenger', 'passenger')
      .leftJoinAndSelect('booking.flight', 'flight')
      .where('booking.sorobanTxHash IS NOT NULL');

    if (walletAddress) {
      qb.andWhere('passenger.sorobanAddress = :walletAddress', { walletAddress });
    }

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const bookings = await qb
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
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.bookingId } });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (!booking.sorobanTxHash) {
      return res.json({
        success: true,
        data: serializeTransaction(booking),
      });
    }

    const txStatus = await getTransactionStatus(booking.sorobanTxHash);

    if (txStatus.status === 'success' && booking.status !== 'confirmed') {
      booking.status = 'confirmed';
      if (txStatus.result) {
        booking.sorobanBookingId = txStatus.result.bookingId || null;
      }
      await bookingRepo.save(booking);
      broadcastStatus(booking);
    } else if (txStatus.status === 'failed' && booking.status !== 'failed') {
      booking.status = 'failed';
      booking.lastError = txStatus.error || 'Transaction failed';
      await bookingRepo.save(booking);
      broadcastStatus(booking);
    }

    return res.json({
      success: true,
      data: {
        ...serializeTransaction(booking),
        chainStatus: txStatus.status,
      },
    });
  }),
);

// POST /api/v1/transactions/:bookingId/retry - resubmit a failed on-chain transaction
router.post(
  '/:bookingId/retry',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = { signedXdr: req.body?.signedXdr };
    if (!schema.signedXdr || typeof schema.signedXdr !== 'string') {
      throw new BadRequestError('signedXdr is required to retry submission');
    }

    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.bookingId } });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'failed' && booking.status !== 'onchain_pending') {
      throw new ConflictError('Booking transaction is not in a retryable state');
    }

    booking.status = 'onchain_pending';
    await bookingRepo.save(booking);

    const result = await withRetries(
      async () => submitSignedSorobanXdr(schema.signedXdr),
      { retries: 3, baseDelayMs: 300 },
    );

    booking.sorobanTxHash = result.txHash;
    booking.status = 'onchain_submitted';
    booking.contractSubmitAttempts = (booking.contractSubmitAttempts || 0) + 1;
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
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.bookingId } });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }
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

function broadcastStatus(booking: Booking) {
  try {
    const ws = getWebSocketServer();
    ws.broadcastBookingStatus(booking.id, booking.status);
  } catch (e) {
    logger.warn('WebSocket server not ready - skipping booking status broadcast');
  }
}

export default router;
