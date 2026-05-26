import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { initDataSource, AppDataSource } from '../../../db/dataSource';
import { Passenger } from '../../../db/entities/Passenger';
import { requireAdmin } from '../../../middleware/adminAuth';
import { auditLog } from '../../../middleware/adminAudit';

const router = Router();

const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    email: z.string().optional(),
});

// GET /api/v1/admin/users
router.get('/', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    await initDataSource();
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } });
    }
    const { limit, offset, email } = parsed.data;
    const repo = AppDataSource.getRepository(Passenger);

    const qb = repo.createQueryBuilder('passenger');
    if (email) qb.andWhere('passenger.email LIKE :email', { email: `%${email}%` });

    const [passengers, total] = await qb
        .orderBy('passenger.email', 'ASC')
        .take(limit)
        .skip(offset)
        .getManyAndCount();

    return res.json({ success: true, data: { passengers, total, limit, offset } });
}));

// GET /api/v1/admin/users/:id
router.get('/:id', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    await initDataSource();
    const passenger = await AppDataSource.getRepository(Passenger).findOne({ where: { id: req.params.id } });
    if (!passenger) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }
    return res.json({ success: true, data: passenger });
}));

// DELETE /api/v1/admin/users/:id
router.delete(
    '/:id',
    requireAdmin,
    auditLog('USER_DELETED', 'passengers'),
    asyncHandler(async (req: Request, res: Response) => {
        await initDataSource();
        const repo = AppDataSource.getRepository(Passenger);
        const passenger = await repo.findOne({ where: { id: req.params.id } });
        if (!passenger) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
        }
        res.locals.resourceId = passenger.id;
        await repo.remove(passenger);
        return res.status(204).send();
    })
);

export const adminUserRoutes = router;
