import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { initDataSource, AppDataSource } from '../../../db/dataSource';
import { Booking, BookingStatus } from '../../../db/entities/Booking';
import { requireAdmin } from '../../../middleware/adminAuth';
import { auditLog } from '../../../middleware/adminAudit';

const router = Router();

const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.string().optional(),
    flightId: z.string().uuid().optional(),
    passengerId: z.string().uuid().optional(),
});

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

// GET /api/v1/admin/bookings
router.get('/', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    await initDataSource();
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } });
    }
    const { limit, offset, status, flightId, passengerId } = parsed.data;
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
        .skip(offset)
        .getManyAndCount();

    return res.json({ success: true, data: { bookings, total, limit, offset } });
}));

// GET /api/v1/admin/bookings/:id
router.get('/:id', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    await initDataSource();
    const booking = await AppDataSource.getRepository(Booking).findOne({
        where: { id: req.params.id },
        relations: ['flight', 'passenger'],
    });
    if (!booking) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
    }
    return res.json({ success: true, data: booking });
}));

// PATCH /api/v1/admin/bookings/:id/status
router.patch(
    '/:id/status',
    requireAdmin,
    auditLog('BOOKING_STATUS_UPDATED', 'bookings'),
    asyncHandler(async (req: Request, res: Response) => {
        const parsed = updateStatusSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } });
        }
        await initDataSource();
        const repo = AppDataSource.getRepository(Booking);
        const booking = await repo.findOne({ where: { id: req.params.id } });
        if (!booking) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
        }
        booking.status = parsed.data.status as BookingStatus;
        if (parsed.data.reason) booking.lastError = parsed.data.reason;
        const saved = await repo.save(booking);
        res.locals.resourceId = saved.id;
        res.locals.auditDetails = { previousStatus: booking.status, newStatus: parsed.data.status };
        return res.json({ success: true, data: saved });
    })
);

export const adminBookingRoutes = router;
