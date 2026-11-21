import { NextFunction, Request, Response } from 'express';
import { writeAnalyticsAuditLog } from '../database/audit-log';
import { AnalyticsAuditAction } from '../db/entities/AnalyticsAuditLog';

const ANALYTICS_PATH_PATTERN = /\/analytics(\/|$)/i;

export function analyticsAuditLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    if (!shouldAudit(req)) return;

    const action = classifyAction(req);
    const admin = req.admin;
    const user = req.user;

    void writeAnalyticsAuditLog({
      action,
      route: req.originalUrl?.split('?')[0] || req.path,
      method: req.method,
      actorId: admin?.adminId ?? user?.walletAddress ?? null,
      actorEmail: admin?.email ?? null,
      actorType: admin ? 'admin' : user ? 'user' : 'anonymous',
      tenantId: extractTenantId(req),
      queryParams: normalizeParams(req),
      metadata: {
        dashboardId: req.body?.dashboardId,
        exportJobId: req.params?.id,
        statusMessage: res.statusMessage,
      },
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.header('user-agent') ?? null,
    });
  });

  next();
}

function shouldAudit(req: Request) {
  return ANALYTICS_PATH_PATTERN.test(req.originalUrl || req.path);
}

function classifyAction(req: Request): AnalyticsAuditAction {
  const path = req.originalUrl || req.path;
  if (/dashboard-view/i.test(path) || req.body?.event === 'dashboard_view') {
    return 'dashboard_view';
  }
  if (/export/i.test(path)) {
    return 'analytics_export';
  }
  if (req.method.toUpperCase() === 'GET') {
    return 'analytics_query';
  }
  return 'analytics_access';
}

function extractTenantId(req: Request) {
  const value = req.params?.tenantId || req.query?.tenantId || req.body?.tenantId;
  return typeof value === 'string' ? value : null;
}

function normalizeParams(req: Request) {
  return {
    query: req.query,
    params: req.params,
    body: req.method.toUpperCase() === 'GET' ? undefined : req.body,
  };
}
