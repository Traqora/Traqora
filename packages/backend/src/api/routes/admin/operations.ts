import { Router, Request, Response } from 'express';
import { In, IsNull } from 'typeorm';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Booking, BookingStatus } from '../../../db/entities/Booking';
import { ContractReconciliationAttempt } from '../../../db/entities/ContractReconciliationAttempt';
import { adminGuard, requireAdmin } from '../../../middleware/adminAuth';
import { adminPaginationSchema } from '../../schemas/common';
import { BadRequestError, ConflictError, InternalServerError, NotFoundError } from '../../../utils/errors';
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

const supplierReferencePath = '/bookings/:id/supplier-reference';
const bookingIdSchema = z.string().uuid();
const supplierReferenceBody = z.object({
  supplierBookingReference: z.string().trim().min(1).max(128).regex(/^[\x21-\x7e]+$/),
}).strict();

function parseBookingId(req: Request): string {
  const id = bookingIdSchema.safeParse(req.params.id);
  if (!id.success) throw new BadRequestError('A valid booking ID is required');
  return id.data;
}

async function loadSupplierReference(id: string): Promise<Booking | null> {
  try {
    return await AppDataSource.getRepository(Booking)
      .createQueryBuilder('booking')
      .select(['booking.id'])
      .addSelect('booking.supplierBookingReference')
      .where('booking.id = :id', { id })
      .getOne();
  } catch {
    // ORM errors may contain parameters from the stored supplier reference.
    throw new InternalServerError('Unable to read the supplier booking reference');
  }
}

router.get(supplierReferencePath, ...adminGuard('booking:reconcile'), asyncHandler(async (req, res) => {
  const booking = await loadSupplierReference(parseBookingId(req));
  if (!booking) throw new NotFoundError('Booking not found');
  res.set('Cache-Control', 'no-store');
  return res.json({
    success: true,
    data: { supplierBookingReference: booking.supplierBookingReference ?? null },
  });
}));

router.put(supplierReferencePath, ...adminGuard('booking:reconcile'), asyncHandler(async (req, res) => {
  const id = parseBookingId(req);
  const parsed = supplierReferenceBody.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('A valid supplier booking reference is required');
  const { supplierBookingReference } = parsed.data;

  // Record the first confirmation atomically when more than one operator retries.
  let recorded: boolean;
  try {
    const result = await AppDataSource.getRepository(Booking).update(
      { id, supplierBookingReference: IsNull() },
      { supplierBookingReference },
    );
    recorded = result.affected === 1;
  } catch {
    throw new InternalServerError('Unable to record the supplier booking reference');
  }
  if (!recorded) {
    const booking = await loadSupplierReference(id);
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.supplierBookingReference !== supplierBookingReference) {
      throw new ConflictError('A different supplier reference is already recorded');
    }
  }

  return res.status(204).send();
}));

export const adminOperationsRoutes = router;
