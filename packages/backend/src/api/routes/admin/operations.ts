import { Router, Request, Response } from 'express';
import { In } from 'typeorm';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Booking, BookingStatus } from '../../../db/entities/Booking';
import { ContractReconciliationAttempt } from '../../../db/entities/ContractReconciliationAttempt';
import { requireAdmin } from '../../../middleware/adminAuth';
import { adminPaginationSchema } from '../../schemas/common';
import { BadRequestError } from '../../../utils/errors';
import { createPaginationMeta } from '../../../types/pagination';

const router = Router();

export type ReconciliationStatus = 'not_attempted' | 'detected' | 'repaired' | 'needs_review';

export interface OperationsBookingRow {
  bookingId: string;
  bookingReference: string | null;
  bookingState: BookingStatus;
  supplierState: string;
  paymentReference: string | null;
  reconciliationStatus: ReconciliationStatus;
  reconciliationDetail: string | null;
  flightNumber: string;
  departureTime: string;
  amountCents: number;
  updatedAt: string;
}

const RECONCILIATION_OUTCOMES: Record<string, ReconciliationStatus> = {
  repaired: 'repaired',
  detected: 'detected',
  failed: 'needs_review',
};

/** Map one loaded booking and its latest reconciliation attempt to an operator row. */
export function toOperationsRow(
  booking: Booking,
  attempt?: ContractReconciliationAttempt
): OperationsBookingRow {
  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference ?? null,
    bookingState: booking.status,
    supplierState: booking.flight?.status || 'unavailable',
    paymentReference: booking.stripePaymentIntentId ?? booking.sorobanTxHash ?? null,
    reconciliationStatus: attempt
      ? RECONCILIATION_OUTCOMES[attempt.outcome] ?? 'needs_review'
      : 'not_attempted',
    reconciliationDetail: attempt?.error ?? null,
    flightNumber: booking.flight?.flightNumber ?? 'unavailable',
    departureTime: booking.flight?.departureTime?.toISOString() ?? 'unavailable',
    amountCents: booking.amountCents,
    updatedAt: booking.updatedAt.toISOString(),
  };
}

// GET /api/v1/admin/operations/bookings
// Authoritative booking state for operators. Fields with no recorded
// telemetry are returned as null or 'unavailable', never fabricated.
router.get('/bookings', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const parsed = adminPaginationSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new BadRequestError('Validation Error', parsed.error.flatten());
  }
  const { page, limit, status } = parsed.data;

  const bookingRepo = AppDataSource.getRepository(Booking);
  const query = bookingRepo
    .createQueryBuilder('booking')
    .leftJoinAndSelect('booking.flight', 'flight');

  if (status) query.andWhere('booking.status = :status', { status });

  const [bookings, total] = await query
    .orderBy('booking.createdAt', 'DESC')
    .take(limit)
    .skip((page - 1) * limit)
    .getManyAndCount();

  const bookingIds = bookings.map((booking) => booking.id);
  const attempts = bookingIds.length
    ? await AppDataSource.getRepository(ContractReconciliationAttempt).find({
        where: { bookingId: In(bookingIds) },
        order: { attemptedAt: 'DESC' },
      })
    : [];

  const latestAttemptByBooking = new Map<string, ContractReconciliationAttempt>();
  for (const attempt of attempts) {
    if (!latestAttemptByBooking.has(attempt.bookingId)) {
      latestAttemptByBooking.set(attempt.bookingId, attempt);
    }
  }

  const data: OperationsBookingRow[] = bookings.map((booking) =>
    toOperationsRow(booking, latestAttemptByBooking.get(booking.id))
  );

  return res.json({ success: true, data, pagination: createPaginationMeta(page, limit, total) });
}));

export const adminOperationsRoutes = router;
