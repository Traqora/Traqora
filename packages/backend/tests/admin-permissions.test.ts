import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '../src/config';
import type { AdminRole } from '../src/db/entities/AdminUser';
import {
    ADMIN_PERMISSIONS,
    ROLE_PERMISSIONS,
    adminGuard,
    permissionsForRole,
    requirePermission,
} from '../src/middleware/adminAuth';

/** Builds a signed admin JWT without touching the database. */
const tokenFor = (role: AdminRole): string =>
    jwt.sign({ adminId: `${role}-id`, email: `${role}@traqora.io`, role }, config.jwtSecret, {
        expiresIn: '1d',
    });

describe('Admin permission model (#1168)', () => {
    it('defines a closed permission set covering read, reconcile, cancel, config and admin management', () => {
        expect(ADMIN_PERMISSIONS).toEqual([
            'booking:read',
            'booking:reconcile',
            'booking:cancel',
            'config:read',
            'config:write',
            'analytics:read',
            'admin:manage',
        ]);
    });

    it('grants support only booking lookup and configuration read', () => {
        expect(permissionsForRole('support')).toEqual(['booking:read', 'config:read']);
    });

    it('grants admin operational permissions but not admin account management', () => {
        const admin = permissionsForRole('admin');
        expect(admin).toContain('booking:reconcile');
        expect(admin).toContain('booking:cancel');
        expect(admin).toContain('config:write');
        expect(admin).toContain('analytics:read');
        expect(admin).not.toContain('admin:manage');
    });

    it('grants super_admin every defined permission', () => {
        expect(permissionsForRole('super_admin')).toEqual([...ADMIN_PERMISSIONS]);
    });

    it('never grants an undefined permission to any role', () => {
        for (const permissions of Object.values(ROLE_PERMISSIONS)) {
            for (const permission of permissions) {
                expect(ADMIN_PERMISSIONS).toContain(permission);
            }
        }
    });
});

describe('requirePermission middleware (#1169)', () => {
    const run = (permission: Parameters<typeof requirePermission>[0], role: AdminRole | null) => {
        const middleware = requirePermission(permission);
        const req = { admin: role ? { adminId: 'id', email: 'a@b.c', role } : undefined } as Request;
        let status: number | undefined;
        let body: unknown;
        const res = {
            status(code: number) {
                status = code;
                return this;
            },
            json(payload: unknown) {
                body = payload;
                return this;
            },
        } as unknown as Response;
        let nextCalled = false;
        const next = (() => {
            nextCalled = true;
        }) as NextFunction;

        middleware(req, res, next);
        return { status, body, nextCalled };
    };

    it('calls next when the role has the permission', () => {
        expect(run('booking:read', 'support').nextCalled).toBe(true);
    });

    it('returns 401 when there is no authenticated admin', () => {
        const result = run('booking:read', null);
        expect(result.status).toBe(401);
        expect(result.nextCalled).toBe(false);
    });

    it('returns 403 with a stable machine code on denial', () => {
        const result = run('booking:reconcile', 'support');
        expect(result.status).toBe(403);
        expect(result.body).toMatchObject({
            error: {
                code: 'INSUFFICIENT_PERMISSION',
                message: "Requires permission 'booking:reconcile'.",
            },
        });
        expect(result.nextCalled).toBe(false);
    });

    it('denies admin:manage to admin but allows super_admin', () => {
        expect(run('admin:manage', 'admin').status).toBe(403);
        expect(run('admin:manage', 'super_admin').nextCalled).toBe(true);
    });
});

describe('Admin guard enforced through Express (#1169)', () => {
    /**
     * A minimal app exercises the real requireAdmin + requirePermission chain
     * without importing the full application, whose entry module has unrelated
     * pre-existing failures on this branch.
     */
    const app = express();
    app.use(express.json());
    app.get('/bookings', ...adminGuard('booking:read'), (_req, res) => res.json({ ok: true }));
    app.post('/recovery', ...adminGuard('booking:reconcile'), (_req, res) =>
        res.json({ ok: true }),
    );
    app.put('/rate-limits', ...adminGuard('config:write'), (_req, res) => res.json({ ok: true }));
    app.get('/analytics', ...adminGuard('analytics:read'), (_req, res) => res.json({ ok: true }));
    app.delete('/users/:id', ...adminGuard('admin:manage'), (_req, res) =>
        res.status(204).send(),
    );

    it('allows support to look up bookings', async () => {
        await request(app)
            .get('/bookings')
            .set('Authorization', `Bearer ${tokenFor('support')}`)
            .expect(200, { ok: true });
    });

    it('denies support access to booking recovery before the handler runs', async () => {
        const response = await request(app)
            .post('/recovery')
            .set('Authorization', `Bearer ${tokenFor('support')}`)
            .send({ action: 'retry_confirmation', reason: 'stuck booking' })
            .expect(403);

        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('denies support access to analytics', async () => {
        const response = await request(app)
            .get('/analytics')
            .set('Authorization', `Bearer ${tokenFor('support')}`)
            .expect(403);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('denies support access to configuration writes', async () => {
        const response = await request(app)
            .put('/rate-limits')
            .set('Authorization', `Bearer ${tokenFor('support')}`)
            .send({})
            .expect(403);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('denies admin access to admin account management', async () => {
        const response = await request(app)
            .delete('/users/any-id')
            .set('Authorization', `Bearer ${tokenFor('admin')}`)
            .expect(403);
        expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('allows admin to reconcile a booking', async () => {
        await request(app)
            .post('/recovery')
            .set('Authorization', `Bearer ${tokenFor('admin')}`)
            .send({ action: 'retry_confirmation', reason: 'stuck booking' })
            .expect(200, { ok: true });
    });

    it('still rejects unauthenticated requests with 401', async () => {
        await request(app).get('/bookings').expect(401);
    });

    it('rejects an invalid admin API key with 401', async () => {
        await request(app).get('/bookings').set('X-Admin-Api-Key', 'wrong-key').expect(401);
    });
});
