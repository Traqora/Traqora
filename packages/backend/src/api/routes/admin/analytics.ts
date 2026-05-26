import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../utils/errorHandler';
import { initDataSource, AppDataSource } from '../../../db/dataSource';
import { Booking } from '../../../db/entities/Booking';
import { Flight } from '../../../db/entities/Flight';
import { Passenger } from '../../../db/entities/Passenger';
import { requireAdmin, requireRole } from '../../../middleware/adminAuth';

const router = Router();

// GET /api/v1/admin/analytics
router.get('/', requireAdmin, requireRole('admin'), asyncHandler(async (_req: Request, res: Response) => {
    await initDataSource();

    const bookingRepo = AppDataSource.getRepository(Booking);
    const flightRepo = AppDataSource.getRepository(Flight);
    const passengerRepo = AppDataSource.getRepository(Passenger);

    const [totalBookings, totalFlights, totalPassengers] = await Promise.all([
        bookingRepo.count(),
        flightRepo.count(),
        passengerRepo.count(),
    ]);

    // Aggregate revenue
    const revenueResult = await bookingRepo
        .createQueryBuilder('booking')
        .select('SUM(booking.amountCents)', 'total')
        .where("booking.status IN ('confirmed', 'paid', 'onchain_submitted', 'onchain_pending')")
        .getRawOne<{ total: string | null }>();

    const totalRevenueCents = Number(revenueResult?.total ?? 0);
    const averageFareCents = totalBookings > 0 ? Math.round(totalRevenueCents / totalBookings) : 0;

    // Per-status breakdown
    const statusCounts = await bookingRepo
        .createQueryBuilder('booking')
        .select('booking.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('booking.status')
        .getRawMany<{ status: string; count: string }>();

    const bookingsByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
        bookingsByStatus[row.status] = Number(row.count);
    }

    return res.json({
        success: true,
        data: {
            totalBookings,
            totalRevenueCents,
            averageFareCents,
            bookingsByStatus,
            totalFlights,
            totalPassengers,
        },
    });
}));

export const adminAnalyticsRoutes = router;
