import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { queryAuditLogs, verifyAuditChain } from '../../middleware/audit';
import { requireAdmin, requireRole } from '../../middleware/adminAuth';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { SecurityAuditLog } from '../../db/entities/SecurityAuditLog';
import { getLogger } from '../../services/logger';

const router = Router();
const logger = getLogger({ component: 'audit-routes' });

const auditQuerySchema = z.object({
  action: z.string().optional(),
  actorType: z.enum(['user', 'admin', 'system', 'anonymous']).optional(),
  userId: z.string().optional(),
  adminId: z.string().optional(),
  resource: z.string().optional(),
  resourceId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function buildFiltersFromQuery(
  raw: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): {
  action?: string;
  actorType?: 'user' | 'admin' | 'system' | 'anonymous';
  userId?: string;
  adminId?: string;
  resource?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
} {
  const parsed = auditQuerySchema.parse(raw);
  return {
    action: parsed.action,
    actorType: parsed.actorType,
    userId: parsed.userId,
    adminId: parsed.adminId,
    resource: parsed.resource,
    resourceId: parsed.resourceId,
    from: parsed.from,
    to: parsed.to,
    limit: parsed.limit,
    offset: parsed.offset,
    ...overrides,
  };
}

router.get(
  '/audit-logs',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = buildFiltersFromQuery(req.query);
    const result = await queryAuditLogs(filters);

    logger.info('Audit log query', {
      actorId: req.admin?.adminId,
      resultCount: result.logs.length,
    });

    res.json({
      data: result.logs.map(serializeAuditLog),
      pagination: {
        total: result.total,
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      },
    });
  }),
);

router.get(
  '/audit-logs/export',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = buildFiltersFromQuery({ ...req.query, limit: 10_000 });
    const result = await queryAuditLogs(filters);
    const csv = generateCsv(result.logs);

    logger.info('Audit log export', {
      actorId: req.admin?.adminId,
      count: result.logs.length,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(csv);
  }),
);

router.get(
  '/audit-logs/mine',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.walletAddress || req.user?.id;
    const isAdmin = !!req.admin;
    const overrides = isAdmin ? { adminId: req.admin!.adminId } : { userId };

    const filters = buildFiltersFromQuery(req.query, overrides);
    const result = await queryAuditLogs(filters);

    res.json({
      data: result.logs.map(serializeAuditLog),
      pagination: {
        total: result.total,
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
      },
    });
  }),
);

router.get(
  '/audit-logs/chain-verify',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { adminId, userId } = req.query;
    const result = await verifyAuditChain({
      adminId: typeof adminId === 'string' ? adminId : undefined,
      userId: typeof userId === 'string' ? userId : undefined,
    });

    res.json(result);
  }),
);

function serializeAuditLog(log: SecurityAuditLog) {
  return {
    id: log.id,
    action: log.action,
    actorType: log.actorType,
    userId: log.userId || null,
    adminId: log.adminId || null,
    resource: log.resource || null,
    resourceId: log.resourceId || null,
    details: log.details || null,
    metadata: log.metadata as Record<string, unknown> | null || null,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent || null,
    createdAt: log.createdAt,
  };
}

function toRow(log: SecurityAuditLog): string[] {
  const vals: Record<string, unknown> = {
    id: log.id,
    createdAt: log.createdAt,
    action: log.action,
    actorType: log.actorType,
    userId: log.userId,
    adminId: log.adminId,
    resource: log.resource,
    resourceId: log.resourceId,
    ipAddress: log.ipAddress,
  };
  const headers = ['id', 'createdAt', 'action', 'actorType', 'userId', 'adminId', 'resource', 'resourceId', 'ipAddress'];
  return headers.map((h) => {
    const val = String(vals[h] ?? '');
    return `"${val.replace(/"/g, '""')}"`;
  });
}

function generateCsv(logs: SecurityAuditLog[]): string {
  const headers = ['id', 'createdAt', 'action', 'actorType', 'userId', 'adminId', 'resource', 'resourceId', 'ipAddress'];
  const rows = logs.map((log) => toRow(log).join(','));
  return [headers.join(','), ...rows].join('\n');
}

export const auditRoutes = router;
