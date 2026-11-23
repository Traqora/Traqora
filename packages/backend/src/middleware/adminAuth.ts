import { NextFunction, Request, RequestHandler, Response } from 'express';
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
 * Minimum v1 operator permissions. Keep this list closed: every
 * administrative route must name one of these permissions explicitly (#1168).
 */
export const ADMIN_PERMISSIONS = [
    'booking:read',
    'booking:reconcile',
    'booking:cancel',
    'config:read',
    'config:write',
    'analytics:read',
    'admin:manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * Least-privilege role map (#1168).
 * Support may look up bookings and read configuration but cannot change
 * state. Admin may reconcile, cancel and manage configuration, but cannot
 * manage other admin accounts. Only super_admin holds every permission.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
    support: ['booking:read', 'config:read'],
    admin: [
        'booking:read',
        'booking:reconcile',
        'booking:cancel',
        'config:read',
        'config:write',
        'analytics:read',
    ],
    super_admin: [...ADMIN_PERMISSIONS],
};

export const permissionsForRole = (role: AdminRole): readonly AdminPermission[] =>
    ROLE_PERMISSIONS[role] ?? [];

/**
 * Middleware that authenticates admin requests via:
 *  1. `Authorization: Bearer <jwt>` - verified against config.jwtSecret
 *  2. `X-Admin-Api-Key` - compared against config.adminApiKey (grants super_admin)
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
        const payload = jwt.verify(token, config.jwtSecret) as Partial<AdminPayload>;
        if (
            !payload?.adminId ||
            !payload?.email ||
            !payload?.role ||
            !['support', 'admin', 'super_admin'].includes(payload.role)
        ) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired admin token.' } });
            return;
        }
        req.admin = { adminId: payload.adminId, email: payload.email, role: payload.role };
        next();
    } catch {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired admin token.' } });
    }
};

/**
 * Returns middleware that checks the authenticated admin has at least the given role.
 * Must be used AFTER requireAdmin. Retained for callers that still express
 * authorization as a hierarchy; new routes should use requirePermission.
 */
export const requireRole = (minRole: AdminRole): RequestHandler => {
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

/**
 * Returns middleware that requires a specific permission. Must be used AFTER
 * requireAdmin. Uses a stable machine-readable code so clients and tests can
 * distinguish a permission denial from other 403 responses (#1169).
 */
export const requirePermission = (permission: AdminPermission): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.admin) {
            res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin authentication required.' } });
            return;
        }
        if (!permissionsForRole(req.admin.role).includes(permission)) {
            res.status(403).json({
                error: {
                    code: 'INSUFFICIENT_PERMISSION',
                    message: `Requires permission '${permission}'.`,
                },
            });
            return;
        }
        next();
    };
};

/** Authentication plus one permission, in the correct order. */
export const adminGuard = (permission: AdminPermission): RequestHandler[] => [
    requireAdmin,
    requirePermission(permission),
];
