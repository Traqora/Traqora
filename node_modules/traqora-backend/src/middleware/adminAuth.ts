import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AdminRole } from '../db/entities/AdminUser';

export interface AdminPayload {
    adminId: string;
    email: string;
    role: AdminRole;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            admin?: AdminPayload;
        }
    }
}

const ROLE_HIERARCHY: Record<AdminRole, number> = {
    super_admin: 3,
    admin: 2,
    support: 1,
};

/**
 * Middleware that authenticates admin requests via:
 *  1. `Authorization: Bearer <jwt>` — verified against config.jwtSecret
 *  2. `X-Admin-Api-Key` — compared against config.adminApiKey (grants super_admin)
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.header('X-Admin-Api-Key');
    if (apiKey) {
        if (apiKey !== config.adminApiKey) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid admin API key.' } });
            return;
        }
        req.admin = { adminId: 'system', email: 'system@traqora.io', role: 'super_admin' };
        next();
        return;
    }

    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin authentication required.' } });
        return;
    }

    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, config.jwtSecret) as AdminPayload;
        req.admin = { adminId: payload.adminId, email: payload.email, role: payload.role };
        next();
    } catch {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired admin token.' } });
    }
};

/**
 * Returns middleware that checks the authenticated admin has at least the given role.
 * Must be used AFTER requireAdmin.
 */
export const requireRole = (minRole: AdminRole) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin authentication required.' } });
            return;
        }
        if (ROLE_HIERARCHY[req.admin.role] < ROLE_HIERARCHY[minRole]) {
            res.status(403).json({ error: { code: 'FORBIDDEN', message: `Requires role '${minRole}' or higher.` } });
            return;
        }
        next();
    };
};
