import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../utils/errorHandler';
import { AppDataSource } from '../../../db/dataSource';
import { Passenger } from '../../../db/entities/Passenger';
import { requireAdmin } from '../../../middleware/adminAuth';
import { auditLog } from '../../../middleware/adminAudit';
import { paginationSchema } from '../../schemas/common';
import { BadRequestError, NotFoundError } from '../../../utils/errors';

const router = Router();

const userPaginationSchema = paginationSchema.extend({
    email: z.string().optional(),
});

// GET /api/v1/admin/users
router.get('/', requireAdmin, asyncHandler(async (req: Request, res: Response) => {
    const parsed = userPaginationSchema.safeParse(req.query);
    if (!parsed.success) {
        throw new BadRequestError('Validation Error', parsed.error.flatten());
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
    const passenger = await AppDataSource.getRepository(Passenger).findOne({ where: { id: req.params.id } });
    if (!passenger) {
        throw new NotFoundError('User not found.');
    }
    return res.json({ success: true, data: passenger });
}));

// DELETE /api/v1/admin/users/:id
router.delete(
    '/:id',
    requireAdmin,
    auditLog('USER_DELETED', 'passengers'),
    asyncHandler(async (req: Request, res: Response) => {
        const repo = AppDataSource.getRepository(Passenger);
        const passenger = await repo.findOne({ where: { id: req.params.id } });
        if (!passenger) {
            throw new NotFoundError('User not found.');
        }
        res.locals.resourceId = passenger.id;
        await repo.remove(passenger);
        return res.status(204).send();
    })
);

export const adminUserRoutes = router;
