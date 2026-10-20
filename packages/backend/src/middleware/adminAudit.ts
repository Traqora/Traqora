import { NextFunction, Request, Response } from 'express';
import { AppDataSource, initDataSource } from '../db/dataSource';
import { AdminAuditLog } from '../db/entities/AdminAuditLog';
import { logger } from '../utils/logger';

/**
 * Factory that returns an Express middleware which writes an AdminAuditLog row
 * after a mutating request (POST/PUT/PATCH/DELETE) completes with a 2xx status.
 *
 * The route handler can set `res.locals.resourceId` to attach the affected record id.
 */
export const auditLog = (action: string, resource: string) => {
    return (_req: Request, _res: Response, next: NextFunction): void => {
        const req = _req;
        const res = _res;

        res.on('finish', async () => {
            const method = req.method.toUpperCase();
            const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
            const isSuccess = res.statusCode >= 200 && res.statusCode < 300;

            if (!isMutation || !isSuccess) return;
            if (!req.admin) return;

            try {
                await initDataSource();
                const repo = AppDataSource.getRepository(AdminAuditLog);
                const log = repo.create({
                    adminId: req.admin.adminId,
                    adminEmail: req.admin.email,
                    action,
                    resource,
                    resourceId: (res.locals.resourceId as string | undefined) ?? null,
                    details: res.locals.auditDetails ? JSON.stringify(res.locals.auditDetails) : null,
                    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
                });
                await repo.save(log);
            } catch (err) {
                logger.warn('Failed to write audit log', { action, resource, error: (err as Error).message });
            }
        });

        next();
    };
};
