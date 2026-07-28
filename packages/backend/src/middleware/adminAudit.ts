import { NextFunction, Request, Response } from 'express';
import { AppDataSource, initDataSource } from '../db/dataSource';
import { AdminAuditLog } from '../db/entities/AdminAuditLog';
import { logger } from '../utils/logger';
import '../types/express';

/**
 * Factory that returns an Express middleware which writes an AdminAuditLog row
 * after a mutating request (POST/PUT/PATCH/DELETE) completes with a 2xx status.
 *
 * The route handler can set `res.locals.resourceId` to attach the affected record id.
 * The route handler can set `res.locals.auditDetails` to attach additional context.
 *
 * Implements hash chaining for tamper-evident audit logs.
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

                // Get previous log hash for chain integrity
                const previousLog = await repo.findOne({
                    where: { adminId: req.admin.adminId },
                    order: { createdAt: 'DESC' }
                });

                const previousHash = previousLog?.logHash || null;

                const log = repo.create({
                    adminId: req.admin.adminId,
                    adminEmail: req.admin.email,
                    action,
                    resource,
                    resourceId: (res.locals.resourceId as string | undefined) ?? null,
                    details: res.locals.auditDetails ? JSON.stringify(res.locals.auditDetails) : null,
                    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
                    userAgent: req.header('user-agent') || null,
                    sessionId: (req as any).sessionID || null,
                    previousLogHash: previousHash,
                    logHash: '', // Will be set after creation
                });

                // Generate hash with the log's own ID
                log.logHash = log.generateLogHash(previousHash);

                await repo.save(log);
                logger.info('Admin audit log recorded', {
                    adminId: req.admin.adminId,
                    action,
                    resource,
                    logId: log.id
                });
            } catch (err) {
                logger.warn('Failed to write audit log', { action, resource, error: (err as Error).message });
            }
        });

        next();
    };
};

/**
 * Verify integrity of admin audit log chain for a specific admin
 */
export async function verifyAuditLogChain(adminId: string): Promise<{ valid: boolean; brokenAt?: string; error?: string }> {
    try {
        await initDataSource();
        const repo = AppDataSource.getRepository(AdminAuditLog);

        const logs = await repo.find({
            where: { adminId },
            order: { createdAt: 'ASC' }
        });

        if (logs.length === 0) {
            return { valid: true };
        }

        let previousHash: string | null = null;

        for (const log of logs) {
            if (!log.verifyIntegrity(previousHash)) {
                return {
                    valid: false,
                    brokenAt: log.id,
                    error: `Hash verification failed for log ${log.id}`
                };
            }
            previousHash = log.logHash;
        }

        return { valid: true };
    } catch (err) {
        logger.error('Failed to verify audit log chain', { adminId, error: (err as Error).message });
        return {
            valid: false,
            error: (err as Error).message
        };
    }
}
