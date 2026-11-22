import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Booking } from '../../../db/entities/Booking';
import { requireAdmin } from '../../../middleware/adminAuth';
import { recordSupportAudit } from '../../../middleware/audit';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../utils/errors';

const router = Router();

router.use(requireAdmin);

const reasonSchema = z.string().trim().min(5).max(500);

const changeStatusSchema = z.object({
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
    reason: reasonSchema,
});

function supportAuditContext(req: Request) {
    return {
        actorId: req.admin!.adminId,
        actorEmail: req.admin!.email,
        ipAddress: req.ip || req.socket?.remoteAddress,
        userAgent: req.header('user-agent') ?? null,
    };
}

function parseReason(value: unknown, source: string): string {
    const parsed = reasonSchema.safeParse(value);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', {
            reason: `A support reason between 5 and 500 characters is required in the ${source}.`,
        });
    }
    return parsed.data;
}

// GET /api/v1/admin/support/bookings/:bookingId?reason=<ticket or ticket reference>
// A support read is audited explicitly because the global HTTP audit middleware
// only records successful mutations.
router.get('/bookings/:bookingId', asyncHandler(async (req: Request, res: Response) => {
    const reason = parseReason(req.query.reason, 'query string');
    const booking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: req.params.bookingId },
        relations: { flight: true },
    });
    if (!booking) throw new NotFoundError('Booking not found');

    await recordSupportAudit({
        action: 'support_booking_access',
        ...supportAuditContext(req),
        reason,
        bookingReference: booking.bookingReference ?? booking.id,
        bookingId: booking.id,
    });

    return res.json({
        success: true,
        data: {
            bookingId: booking.id,
            bookingReference: booking.bookingReference ?? null,
            bookingState: booking.status,
            flightNumber: booking.flight?.flightNumber ?? 'unavailable',
            paymentReference: booking.stripePaymentIntentId ?? booking.sorobanTxHash ?? null,
        },
    });
}));

// PATCH /api/v1/admin/support/bookings/:bookingId/status
// Records the actor and reason for the change, and records denied or failed
// attempts so no support mutation disappears from the audit trail.
router.patch('/bookings/:bookingId/status', asyncHandler(async (req: Request, res: Response) => {
    const parsed = changeStatusSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
    }

    const { status, reason } = parsed.data;
    const context = supportAuditContext(req);
    const booking = await AppDataSource.getRepository(Booking).findOneBy({ id: req.params.bookingId });
    if (!booking) throw new NotFoundError('Booking not found');

    const bookingReference = booking.bookingReference ?? booking.id;
    if (req.admin?.role === 'support') {
        await recordSupportAudit({
            action: 'support_access_denied',
            ...context,
            reason,
            bookingReference,
            bookingId: booking.id,
        });
        throw new ForbiddenError('Support role cannot change booking status');
    }

    const previousStatus = booking.status;
    booking.status = status;
    try {
        const saved = await AppDataSource.getRepository(Booking).save(booking);
        await recordSupportAudit({
            action: 'support_booking_change',
            ...context,
            reason,
            bookingReference,
            bookingId: booking.id,
            metadata: { previousStatus, newStatus: status },
        });
        return res.json({ success: true, data: { bookingId: saved.id, status: saved.status } });
    } catch (err) {
        await recordSupportAudit({
            action: 'support_change_failed',
            ...context,
            reason,
            bookingReference,
            bookingId: booking.id,
            metadata: { attemptedStatus: status, error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
    }
}));

export const adminSupportRoutes = router;
