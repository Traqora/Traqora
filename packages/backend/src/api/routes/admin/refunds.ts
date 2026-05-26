import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { initDataSource, AppDataSource } from '../../../db/dataSource';
import { Booking, BookingStatus } from '../../../db/entities/Booking';
import { requireAdmin } from '../../../middleware/adminAuth';
import { auditLog } from '../../../middleware/adminAudit';
import { In } from 'typeorm';

const router = Router();

const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

const rejectSchema = z.object({
    reason: z.string().min(1),
});

const REFUNDABLE_STATUSES: BookingStatus[] = ['confirmed', 'failed'];

// GET /api/v1/admin/refunds — list refund-eligible bookings
router.get('/', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    await initDataSource();
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } });
    }
    const { limit, offset } = parsed.data;
    const repo = AppDataSource.getRepository(Booking);

    const [bookings, total] = await repo.findAndCount({
        where: { status: In(REFUNDABLE_STATUSES) },
        relations: ['flight', 'passenger'],
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
    });

    return res.json({ success: true, data: { bookings, total, limit, offset } });
}));

// POST /api/v1/admin/refunds/:id/approve
router.post(
    '/:id/approve',
    requireAdmin,
    auditLog('REFUND_APPROVED', 'bookings'),
    asyncHandler(async (req: Request, res: Response) => {
        await initDataSource();
        const repo = AppDataSource.getRepository(Booking);
        const booking = await repo.findOne({ where: { id: req.params.id } });
        if (!booking) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
        }
        if (!REFUNDABLE_STATUSES.includes(booking.status)) {
            return res.status(409).json({
                error: { code: 'REFUND_NOT_ELIGIBLE', message: `Booking status '${booking.status}' is not eligible for refund.` },
            });
        }
        booking.status = 'refunded' as BookingStatus;
        const saved = await repo.save(booking);
        res.locals.resourceId = saved.id;
        return res.json({ success: true, data: saved });
    })
);

// POST /api/v1/admin/refunds/:id/reject
router.post(
    '/:id/reject',
    requireAdmin,
    auditLog('REFUND_REJECTED', 'bookings'),
    asyncHandler(async (req: Request, res: Response) => {
        const parsed = rejectSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } });
        }
        await initDataSource();
        const repo = AppDataSource.getRepository(Booking);
        const booking = await repo.findOne({ where: { id: req.params.id } });
        if (!booking) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
        }
        if (!REFUNDABLE_STATUSES.includes(booking.status)) {
            return res.status(409).json({
                error: { code: 'REFUND_NOT_ELIGIBLE', message: `Booking status '${booking.status}' is not eligible for refund review.` },
            });
        }
        booking.status = 'refund_rejected' as BookingStatus;
        booking.lastError = parsed.data.reason;
        const saved = await repo.save(booking);
        res.locals.resourceId = saved.id;
        return res.json({ success: true, data: saved });
    })
);

export const adminRefundRoutes = router;
