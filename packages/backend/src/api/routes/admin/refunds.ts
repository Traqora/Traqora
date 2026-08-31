import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Booking, BookingStatus } from '../../../db/entities/Booking';
import { requireAdmin } from '../../../middleware/adminAuth';
import { auditLog } from '../../../middleware/adminAudit';
import { paginationSchema } from '../../schemas/common';
import { BadRequestError, NotFoundError, ConflictError } from '../../../utils/errors';
import { In } from 'typeorm';

const router = Router();

const rejectSchema = z.object({
    reason: z.string().min(1),
});

const REFUNDABLE_STATUSES: BookingStatus[] = ['confirmed', 'failed'];

// GET /api/v1/admin/refunds/overview — aggregated refund overview
router.get('/overview', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const { getRefundDisputeRepository } = await import('../../../repositories/refundDisputeRepository');
    const recentLimit = req.query.recentLimit ? Math.min(50, Math.max(1, parseInt(String(req.query.recentLimit), 10))) : 5;
    const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
    const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;

    const repository = getRefundDisputeRepository();
    const refunds = await repository.getRefundOverview({
        recentLimit,
        startDate,
        endDate,
    });

    return res.json({ success: true, data: refunds });
}));

// GET /api/v1/admin/refunds — list refund-eligible bookings
router.get('/', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
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
        
        const repo = AppDataSource.getRepository(Booking);
        const booking = await repo.findOne({ where: { id: req.params.id } });
        if (!booking) {
            throw new NotFoundError('Booking not found.');
        }
        if (!REFUNDABLE_STATUSES.includes(booking.status)) {
            throw new ConflictError(`Booking status '${booking.status}' is not eligible for refund.`);
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
            throw new BadRequestError('Validation Error', parsed.error.flatten());
        }
        
        const repo = AppDataSource.getRepository(Booking);
        const booking = await repo.findOne({ where: { id: req.params.id } });
        if (!booking) {
            throw new NotFoundError('Booking not found.');
        }
        if (!REFUNDABLE_STATUSES.includes(booking.status)) {
            throw new ConflictError(`Booking status '${booking.status}' is not eligible for refund review.`);
        }
        booking.status = 'refund_rejected' as BookingStatus;
        booking.lastError = parsed.data.reason;
        const saved = await repo.save(booking);
        res.locals.resourceId = saved.id;
        return res.json({ success: true, data: saved });
    })
);

export const adminRefundRoutes = router;
