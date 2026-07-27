import { NextFunction, Request, Response } from 'express';
import { writeAnalyticsAuditLog } from '../database/audit-log';
import { logger } from '../utils/logger';

const CRITICAL_OPERATION_PATTERNS = [
  /^\/api\/(v1\/)?bookings(\/|$)/i,
  /^\/api\/(v1\/)?transactions(\/|$)/i,
  /^\/api\/(v1\/)?refunds(\/|$)/i,
  /^\/api\/(v1\/)?users(\/|$)/i,
  /^\/api\/(v1\/)?auth(\/|$)/i,
  /^\/api\/(v1\/)?insurance(\/|$)/i,
];

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'jwt',
  'refresh_token',
];

const redactValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return value;
  return '[REDACTED]';
};

const redactObject = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactObject);
  if (typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = redactValue(nestedValue);
    } else {
      sanitized[key] = redactObject(nestedValue);
    }
  }
  return sanitized;
};

const shouldAudit = (path: string): boolean => CRITICAL_OPERATION_PATTERNS.some((pattern) => pattern.test(path));

const classifyAuditAction = (req: Request): string => {
  if (/^\/api\/(v1\/)?bookings(\/|$)/i.test(req.path)) {
    return req.method === 'DELETE' ? 'booking_deleted' : req.method === 'PATCH' || req.method === 'POST' ? 'booking_modified' : 'booking_accessed';
  }
  if (/^\/api\/(v1\/)?transactions(\/|$)/i.test(req.path)) {
    return req.method === 'POST' ? 'transaction_retry' : 'transaction_viewed';
  }
  if (/^\/api\/(v1\/)?refunds(\/|$)/i.test(req.path)) {
    return req.method === 'POST' ? 'refund_processed' : 'refund_viewed';
  }
  if (/^\/api\/(v1\/)?users(\/|$)/i.test(req.path)) {
    return req.method === 'PUT' || req.method === 'PATCH' ? 'user_profile_updated' : 'user_accessed';
  }
  if (/^\/api\/(v1\/)?auth(\/|$)/i.test(req.path)) {
    return 'authentication_event';
  }
  if (/^\/api\/(v1\/)?insurance(\/|$)/i.test(req.path)) {
    return req.method === 'POST' ? 'insurance_purchase' : 'insurance_accessed';
  }
  return 'api_access';
};

export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();
  res.on('finish', async () => {
    try {
      const path = req.originalUrl?.split('?')[0] || req.path;
      if (!shouldAudit(path)) return;

      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const payload = {
        action: classifyAuditAction(req),
        route: path,
        method: req.method,
        actorId: req.user?.walletAddress ?? req.admin?.adminId ?? null,
        actorEmail: req.user?.email ?? req.admin?.email ?? null,
        actorType: req.admin ? 'admin' : req.user ? 'user' : 'anonymous',
        tenantId: typeof req.query?.tenantId === 'string' ? req.query.tenantId : null,
        queryParams: redactObject(req.query) as Record<string, unknown>,
        metadata: redactObject(req.body) as Record<string, unknown>,
        statusCode: res.statusCode,
        durationMs,
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.header('user-agent') ?? null,
      };

      await writeAnalyticsAuditLog(payload);
      logger.info('audit_log_recorded', payload);
    } catch (error) {
      logger.warn('audit_logger_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  next();
};
