import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../../../utils/errorHandler';
import { initDataSource, AppDataSource } from '../../../db/dataSource';
import { AdminUser } from '../../../db/entities/AdminUser';
import { config } from '../../../config';

const router = Router();

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

// POST /api/v1/admin/auth/login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.flatten() },
        });
    }

    await initDataSource();
    const adminRepo = AppDataSource.getRepository(AdminUser);
    const admin = await adminRepo.findOne({ where: { email: parsed.data.email } });

    if (!admin || !admin.isActive) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials.' } });
    }

    const valid = await bcrypt.compare(parsed.data.password, admin.passwordHash);
    if (!valid) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials.' } });
    }

    admin.lastLoginAt = new Date();
    await adminRepo.save(admin);

    const token = jwt.sign(
        { adminId: admin.id, email: admin.email, role: admin.role },
        config.jwtSecret,
        { expiresIn: '1d' }
    );

    return res.json({
        success: true,
        data: { token, admin: { id: admin.id, email: admin.email, role: admin.role } },
    });
}));

export const adminAuthRoutes = router;
