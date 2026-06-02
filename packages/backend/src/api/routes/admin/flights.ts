import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Flight } from '../../../db/entities/Flight';
import { requireAdmin } from '../../../middleware/adminAuth';
import { auditLog } from '../../../middleware/adminAudit';
import { paginationSchema } from '../../schemas/common';
import { BadRequestError, NotFoundError } from '../../../utils/errors';

const router = Router();

const flightSchema = z.object({
    flightNumber: z.string().min(2).max(16),
    fromAirport: z.string().min(3).max(10),
    toAirport: z.string().min(3).max(10),
    departureTime: z.string().datetime(),
    seatsAvailable: z.number().int().min(0),
    priceCents: z.number().int().min(0),
    airlineSorobanAddress: z.string().min(1),
});

const flightPaginationSchema = paginationSchema.extend({
    from: z.string().optional(),
    to: z.string().optional(),
    date: z.string().optional(),
});

// GET /api/v1/admin/flights
router.get('/', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    
    const parsed = flightPaginationSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
    }
    const { limit, offset, from, to, date } = parsed.data;
    const repo = AppDataSource.getRepository(Flight);

    const qb = repo.createQueryBuilder('flight');
    if (from) qb.andWhere('flight.fromAirport LIKE :from', { from: `%${from}%` });
    if (to) qb.andWhere('flight.toAirport LIKE :to', { to: `%${to}%` });
    if (date) {
        const day = new Date(date);
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        qb.andWhere('flight.departureTime >= :day AND flight.departureTime < :next', { day, next });
    }

    const [flights, total] = await qb
        .orderBy('flight.departureTime', 'ASC')
        .take(limit)
        .skip(offset)
        .getManyAndCount();

    return res.json({ success: true, data: { flights, total, limit, offset } });
}));

// GET /api/v1/admin/flights/:id
router.get('/:id', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    
    const flight = await AppDataSource.getRepository(Flight).findOne({ where: { id: req.params.id } });
    if (!flight) {
        throw new NotFoundError('Flight not found.');
    }
    return res.json({ success: true, data: flight });
}));

// POST /api/v1/admin/flights
router.post(
    '/',
    requireAdmin,
    auditLog('FLIGHT_CREATED', 'flights'),
    asyncHandler(async (req: Request, res: Response) => {
        const parsed = flightSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new BadRequestError('Validation Error', parsed.error.flatten());
        }
        
        const repo = AppDataSource.getRepository(Flight);
        const flight = repo.create({ ...parsed.data, departureTime: new Date(parsed.data.departureTime) });
        const saved = await repo.save(flight) as unknown as Flight;
        res.locals.resourceId = saved.id;
        return res.status(201).json({ success: true, data: saved });
    })
);

// PUT /api/v1/admin/flights/:id
router.put(
    '/:id',
    requireAdmin,
    auditLog('FLIGHT_UPDATED', 'flights'),
    asyncHandler(async (req: Request, res: Response) => {
        const parsed = flightSchema.partial().safeParse(req.body);
        if (!parsed.success) {
            throw new BadRequestError('Validation Error', parsed.error.flatten());
        }
        
        const repo = AppDataSource.getRepository(Flight);
        const flight = await repo.findOne({ where: { id: req.params.id } });
        if (!flight) {
            throw new NotFoundError('Flight not found.');
        }
        const update = { ...parsed.data };
        if (update.departureTime) {
            (update as any).departureTime = new Date(update.departureTime as string);
        }
        repo.merge(flight, update as Partial<Flight>);
        const saved = await repo.save(flight) as unknown as Flight;
        res.locals.resourceId = saved.id;
        return res.json({ success: true, data: saved });
    })
);

// DELETE /api/v1/admin/flights/:id
router.delete(
    '/:id',
    requireAdmin,
    auditLog('FLIGHT_DELETED', 'flights'),
    asyncHandler(async (req: Request, res: Response) => {
        
        const repo = AppDataSource.getRepository(Flight);
        const flight = await repo.findOne({ where: { id: req.params.id } });
        if (!flight) {
            throw new NotFoundError('Flight not found.');
        }
        res.locals.resourceId = flight.id;
        await repo.remove(flight);
        return res.status(204).send();
    })
);

export const adminFlightRoutes = router;
