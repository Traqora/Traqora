import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Booking, BookingStatus } from '../../../db/entities/Booking';
import { adminGuard } from '../../../middleware/adminAuth';
import { auditLog } from '../../../middleware/adminAudit';
import { adminPaginationSchema, paginationSchema } from '../../schemas/common';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { createPaginationMeta } from '../../../types/pagination';
import { supportBookingService } from '../../../services/SupportBookingService';
import { bookingRecoveryService, RECOVERY_ACTIONS } from '../../../services/bookingRecoveryService';
import { bookingDeadLetterService } from '../../../services/bookingDeadLetterService';

const router = Router();

const updateStatusSchema = z.object({
    status: z.enum([
        'created',
        'awaiting_payment',
        'payment_processing',
        'paid',
        'onchain_pending',
        'onchain_submitted',
        'confirmed',
        'failed',
        'refunded',
        'refund_rejected',
    ]),
    reason: z.string().optional(),
});

const recoverySchema = z.object({
    action: z.enum(RECOVERY_ACTIONS),
    reason: z.string().min(1).max(500),
});

const deadLetterListSchema = paginationSchema.extend({
    state: z.enum(['open', 'resolved']).optional(),
    bookingId: z.string().uuid().optional(),
});

// GET /api/v1/admin/bookings
router.get('/', ...adminGuard('booking:read'), asyncHandler(async (req: Request, res: Response) => {

    const parsed = adminPaginationSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
    }
    const { page, limit, status, flightId, passengerId } = parsed.data;
    const repo = AppDataSource.getRepository(Booking);

    const qb = repo
        .createQueryBuilder('booking')
        .leftJoinAndSelect('booking.flight', 'flight')
        .leftJoinAndSelect('booking.passenger', 'passenger');

    if (status) qb.andWhere('booking.status = :status', { status });
    if (flightId) qb.andWhere('booking.flightId = :flightId', { flightId });
    if (passengerId) qb.andWhere('booking.passengerId = :passengerId', { passengerId });

    const [bookings, total] = await qb
        .orderBy('booking.createdAt', 'DESC')
        .take(limit)
        .skip((page - 1) * limit)
        .getManyAndCount();

    const pagination = createPaginationMeta(page, limit, total);
    return res.json({ success: true, data: bookings, pagination });
}));

// GET /api/v1/admin/bookings/lookup
// Authorized support lookup by safe reference, with requester verification.
// Registered before /:id so "lookup" is not treated as a booking UUID.
router.get('/lookup', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const { reference, contact, reason } = req.query;
    const summary = await supportBookingService.lookup({
        reference: typeof reference === 'string' ? reference : '',
        claimedContact: typeof contact === 'string' ? contact : undefined,
        reason: typeof reason === 'string' ? reason : '',
        adminId: req.admin?.adminId ?? 'unknown',
        adminEmail: req.admin?.email ?? 'unknown',
        ipAddress: req.ip || req.socket?.remoteAddress,
    });
    return res.json({ success: true, data: summary });
}));

// GET /api/v1/admin/bookings/dead-letters
// Quarantined booking work that exhausted automatic recovery. Registered before
// /:id so "dead-letters" is not treated as a booking id.
router.get('/dead-letters', ...adminGuard('booking:read'), asyncHandler(async (req: Request, res: Response) => {
    const parsed = deadLetterListSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
    }
    const { page, limit, state, bookingId } = parsed.data;
    const { entries, total } = await bookingDeadLetterService.list({
        state,
        bookingId,
        limit,
        offset: (page - 1) * limit,
    });
    return res.json({
        success: true,
        data: entries,
        pagination: createPaginationMeta(page, limit, total),
    });
}));

// GET /api/v1/admin/bookings/dead-letters/:id
router.get('/dead-letters/:id', ...adminGuard('booking:read'), asyncHandler(async (req: Request, res: Response) => {
    const deadLetter = await bookingDeadLetterService.get(req.params.id);
    if (!deadLetter) {
        throw new NotFoundError('Dead-letter entry not found.');
    }
    return res.json({ success: true, data: deadLetter });
}));

// POST /api/v1/admin/bookings/dead-letters/:id/recover
// Recovery is audited by the booking recovery service, which also resolves the
// dead-letter entry with the acting admin and audit-log reference.
router.post('/dead-letters/:id/recover', ...adminGuard('booking:reconcile'), asyncHandler(async (req: Request, res: Response) => {
    const parsed = recoverySchema.safeParse(req.body);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
    }
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
        throw new BadRequestError('Idempotency-Key header is required.');
    }

    const result = await bookingRecoveryService.recoverFromDeadLetter({
        deadLetterId: req.params.id,
        action: parsed.data.action,
        reason: parsed.data.reason,
        idempotencyKey,
        admin: req.admin ?? null,
        ipAddress: req.ip,
    });

    res.locals.resourceId = result.booking.id;
    return res.status(200).json({
        success: true,
        data: {
            deadLetter: result.deadLetter,
            booking: result.booking,
            auditLogId: result.auditLogId,
        },
        idempotentReplay: result.replayed,
    });
}));

// GET /api/v1/admin/bookings/:id
router.get('/:id', ...adminGuard('booking:read'), asyncHandler(async (req: Request, res: Response) => {

    const booking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: req.params.id },
        relations: ['flight', 'passenger'],
    });
    if (!booking) {
        throw new NotFoundError('Booking not found.');
    }
    return res.json({ success: true, data: booking });
}));

// PATCH /api/v1/admin/bookings/:id/status
router.patch(
    '/:id/status',
    ...adminGuard('booking:reconcile'),
    auditLog('BOOKING_STATUS_UPDATED', 'bookings'),
    asyncHandler(async (req: Request, res: Response) => {
        const parsed = updateStatusSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new BadRequestError('Validation Error', parsed.error.flatten());
        }

        const repo = AppDataSource.getRepository(Booking);
        const booking = await repo.findOne({ where: { id: req.params.id } });
        if (!booking) {
            throw new NotFoundError('Booking not found.');
        }
        booking.status = parsed.data.status as BookingStatus;
        if (parsed.data.reason) booking.lastError = parsed.data.reason;
        const saved = await repo.save(booking);
        res.locals.resourceId = saved.id;
        res.locals.auditDetails = { previousStatus: booking.status, newStatus: parsed.data.status };
        return res.json({ success: true, data: saved });
    })
);

// POST /api/v1/admin/bookings/:id/recovery
// The service writes its own AdminAuditLog row inside the same transaction as
// the status change, so the audit middleware is deliberately not used here.
router.post(
    '/:id/recovery',
    ...adminGuard('booking:reconcile'),
    asyncHandler(async (req: Request, res: Response) => {
        const parsed = recoverySchema.safeParse(req.body);
        if (!parsed.success) {
            throw new BadRequestError('Validation Error', parsed.error.flatten());
        }
        const idempotencyKey = req.header('Idempotency-Key');
        if (!idempotencyKey) {
            throw new BadRequestError('Idempotency-Key header is required.');
        }

        const result = await bookingRecoveryService.recoverBooking({
            bookingId: req.params.id,
            action: parsed.data.action,
            reason: parsed.data.reason,
            idempotencyKey,
            admin: req.admin ?? null,
            ipAddress: req.ip,
        });

        res.locals.resourceId = result.booking.id;
        return res.status(200).json({
            success: true,
            data: {
                booking: result.booking,
                auditLogId: result.auditLogId,
            },
            idempotentReplay: result.replayed,
        });
    })
);

export const adminBookingRoutes = router;