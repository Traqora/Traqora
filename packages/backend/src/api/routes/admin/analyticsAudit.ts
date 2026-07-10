import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { exportAnalyticsAuditLogs, searchAnalyticsAuditLogs, writeAnalyticsAuditLog } from '../../../database/audit-log';
import { requireAdmin, requireRole } from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../utils/errorHandler';

const router = Router();

const auditQuerySchema = z.object({
  action: z.enum(['analytics_access', 'analytics_query', 'analytics_export', 'dashboard_view']).optional(),
  actorId: z.string().optional(),
  route: z.string().optional(),
  tenantId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get('/audit', requireAdmin, requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const filters = auditQuerySchema.parse(req.query);
  const result = await searchAnalyticsAuditLogs(filters);
  await writeAnalyticsAuditLog({
    action: 'analytics_access',
    route: '/api/v1/admin/analytics/audit',
    method: req.method,
    actorId: req.admin?.adminId ?? null,
    actorEmail: req.admin?.email ?? null,
    actorType: 'admin',
    queryParams: filters,
    metadata: { resultCount: result.logs.length, total: result.total },
    statusCode: 200,
    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    userAgent: req.header('user-agent') ?? null,
  });
  res.json({
    data: result.logs,
    pagination: {
      total: result.total,
      limit: filters.limit ?? 100,
      offset: filters.offset ?? 0,
    },
    retentionDays: 365,
  });
}));

router.get('/audit/export', requireAdmin, requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
  const filters = auditQuerySchema.parse(req.query);
  const csv = await exportAnalyticsAuditLogs(filters);
  await writeAnalyticsAuditLog({
    action: 'analytics_export',
    route: '/api/v1/admin/analytics/audit/export',
    method: req.method,
    actorId: req.admin?.adminId ?? null,
    actorEmail: req.admin?.email ?? null,
    actorType: 'admin',
    queryParams: filters,
    metadata: { exportType: 'csv' },
    statusCode: 200,
    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    userAgent: req.header('user-agent') ?? null,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="analytics-audit-log.csv"');
  res.send(csv);
}));

router.post('/audit/dashboard-view', asyncHandler(async (req: Request, res: Response) => {
  await writeAnalyticsAuditLog({
    action: 'dashboard_view',
    route: String(req.body?.dashboardId || 'analytics/main'),
    method: 'VIEW',
    actorId: req.user?.walletAddress ?? req.admin?.adminId ?? null,
    actorEmail: req.admin?.email ?? null,
    actorType: req.admin ? 'admin' : req.user ? 'user' : 'anonymous',
    tenantId: typeof req.body?.tenantId === 'string' ? req.body.tenantId : null,
    queryParams: { dashboardId: req.body?.dashboardId },
    metadata: { source: 'frontend' },
    statusCode: 200,
    durationMs: 0,
    ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    userAgent: req.header('user-agent') ?? null,
  });
  res.status(202).json({ success: true });
}));

export const analyticsAuditRoutes = router;
