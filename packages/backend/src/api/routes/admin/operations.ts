import { Router, Request, Response } from 'express';
import { In, IsNull } from 'typeorm';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Booking, BookingStatus } from '../../../db/entities/Booking';
import { ContractEventLog } from '../../../db/entities/ContractEventLog';
import { ContractReconciliationAttempt } from '../../../db/entities/ContractReconciliationAttempt';
import { adminGuard, requireAdmin } from '../../../middleware/adminAuth';
import { adminPaginationSchema } from '../../schemas/common';
import { BadRequestError, ConflictError, InternalServerError, NotFoundError } from '../../../utils/errors';
import { createPaginationMeta } from '../../../types/pagination';
import {
  expectedStatusForEventType,
  IndexedContractEvent,
  selectLatestAuthoritativeEvents,
} from '../../../services/contractBookingReconciliation';

const router = Router();

export type ReconciliationStatus = 'not_attempted' | 'detected' | 'repaired' | 'needs_review';

export type ReconciliationMismatchType =
  | 'contract_backend_mismatch'
  | 'supplier_backend_mismatch'
  | 'supplier_sync_conflict'
  | 'payment_reference_missing'
  | 'payment_state_unresolved'
  | 'reconciliation_failed'
  | 'reconciliation_detected';

export type ReconciliationSeverity = 'high' | 'medium' | 'low';

export interface BookingReconciliationMismatch {
  type: ReconciliationMismatchType;
  severity: ReconciliationSeverity;
  detail: string;
}

export interface OperationsReconciliationSummary {
  scannedBookings: number;
  mismatchedBookings: number;
  mismatchCount: number;
  byType: Record<string, number>;
  bySeverity: Record<ReconciliationSeverity, number>;
}

export interface OperationsBookingRow {
  bookingId: string;
  bookingReference: string | null;
  bookingState: BookingStatus;
  supplierState: string;
  paymentReference: string | null;
  contractState: string;
  reconciliationStatus: ReconciliationStatus;
  reconciliationDetail: string | null;
  mismatches: BookingReconciliationMismatch[];
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

const PAID_OR_LATER: ReadonlySet<BookingStatus> = new Set([
  'paid',
  'onchain_pending',
  'onchain_submitted',
  'confirmed',
  'refunded',
  'refund_rejected',
]);

const TERMINAL_BOOKING_STATES: ReadonlySet<BookingStatus> = new Set([
  'failed',
  'refunded',
  'refund_rejected',
]);

function paymentReferenceForBooking(booking: Booking): string | null {
  return booking.stripePaymentIntentId ?? booking.sorobanTxHash ?? null;
}

/** Expected backend status implied by the latest indexed contract event. */
export function contractStateForEvent(event?: IndexedContractEvent): string {
  return expectedStatusForEventType(event?.eventType) ?? 'unavailable';
}

/**
 * Compare the four reconciliation sources without mutating any of them.
 * Missing telemetry is not a mismatch; only contradictory recorded state is.
 */
export function detectBookingReconciliationMismatches(
  booking: Booking,
  attempt?: ContractReconciliationAttempt,
  contractEvent?: IndexedContractEvent,
): BookingReconciliationMismatch[] {
  const mismatches: BookingReconciliationMismatch[] = [];
  const contractState = contractStateForEvent(contractEvent);

  if (contractState !== 'unavailable' && contractState !== booking.status) {
    mismatches.push({
      type: 'contract_backend_mismatch',
      severity: 'high',
      detail: `Contract expects ${contractState} but backend is ${booking.status}`,
    });
  }

  const supplierState = booking.flight?.status || 'unavailable';
  if (supplierState === 'CANCELLED' && !TERMINAL_BOOKING_STATES.has(booking.status)) {
    mismatches.push({
      type: 'supplier_backend_mismatch',
      severity: 'high',
      detail: `Supplier reports CANCELLED but backend is ${booking.status}`,
    });
  }

  if (booking.flight?.syncStatus === 'CONFLICT') {
    mismatches.push({
      type: 'supplier_sync_conflict',
      severity: 'medium',
      detail: 'Supplier flight data has an unresolved sync conflict',
    });
  }

  const paymentReference = paymentReferenceForBooking(booking);
  if (PAID_OR_LATER.has(booking.status) && !paymentReference) {
    mismatches.push({
      type: 'payment_reference_missing',
      severity: 'high',
      detail: `Backend is ${booking.status} but no payment reference is recorded`,
    });
  }

  if (booking.status === 'failed' && paymentReference) {
    mismatches.push({
      type: 'payment_state_unresolved',
      severity: 'medium',
      detail: 'Backend is failed but a payment reference exists; verify capture and refund',
    });
  }

  if (attempt?.outcome === 'failed') {
    mismatches.push({
      type: 'reconciliation_failed',
      severity: 'high',
      detail: attempt.error ?? 'Contract reconciliation failed',
    });
  } else if (attempt?.outcome === 'detected') {
    mismatches.push({
      type: 'reconciliation_detected',
      severity: 'medium',
      detail: attempt.error ?? 'Contract reconciliation detected a mismatch',
    });
  }

  return mismatches;
}

export function summarizeOperationsRows(
  rows: OperationsBookingRow[],
): OperationsReconciliationSummary {
  const summary: OperationsReconciliationSummary = {
    scannedBookings: rows.length,
    mismatchedBookings: 0,
    mismatchCount: 0,
    byType: {},
    bySeverity: { high: 0, medium: 0, low: 0 },
  };

  for (const row of rows) {
    if (row.mismatches.length === 0) continue;
    summary.mismatchedBookings += 1;

    for (const mismatch of row.mismatches) {
      summary.mismatchCount += 1;
      summary.byType[mismatch.type] = (summary.byType[mismatch.type] ?? 0) + 1;
      summary.bySeverity[mismatch.severity] += 1;
    }
  }

  return summary;
}

/** Map one loaded booking and its reconciliation telemetry to an operator row. */
export function toOperationsRow(
  booking: Booking,
  attempt?: ContractReconciliationAttempt,
  contractEvent?: IndexedContractEvent,
): OperationsBookingRow {
  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference ?? null,
    bookingState: booking.status,
    supplierState: booking.flight?.status || 'unavailable',
    paymentReference: paymentReferenceForBooking(booking),
    contractState: contractStateForEvent(contractEvent),
    reconciliationStatus: attempt
      ? RECONCILIATION_OUTCOMES[attempt.outcome] ?? 'needs_review'
      : 'not_attempted',
    reconciliationDetail: attempt?.error ?? null,
    mismatches: detectBookingReconciliationMismatches(booking, attempt, contractEvent),
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

  const sorobanBookingIds = bookings
    .map((booking) => booking.sorobanBookingId)
    .filter((id): id is string => Boolean(id));

  const contractEvents = sorobanBookingIds.length
    ? await AppDataSource.getRepository(ContractEventLog).find({
        where: { sorobanBookingId: In(sorobanBookingIds) },
        order: { ledger: 'DESC', indexedAt: 'DESC' },
      })
    : [];

  const latestContractEventBySorobanId = selectLatestAuthoritativeEvents(
    contractEvents.map((event) => ({
      id: event.id,
      contractId: event.contractId,
      eventType: event.eventType,
      ledger: event.ledger,
      sorobanBookingId: event.sorobanBookingId,
      indexedAt: event.indexedAt,
    })),
  );

  const data: OperationsBookingRow[] = bookings.map((booking) =>
    toOperationsRow(
      booking,
      latestAttemptByBooking.get(booking.id),
      booking.sorobanBookingId
        ? latestContractEventBySorobanId.get(booking.sorobanBookingId)
        : undefined,
    ),
  );

  return res.json({
    success: true,
    data,
    summary: summarizeOperationsRows(data),
    pagination: createPaginationMeta(page, limit, total),
  });
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
