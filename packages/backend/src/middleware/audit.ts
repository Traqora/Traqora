import { NextFunction, Request, Response } from 'express';
import { AppDataSource, initDataSource } from '../db/dataSource';
import { SecurityAuditLog, SecurityAction, ActorType } from '../db/entities/SecurityAuditLog';
import { getLogger } from '../services/logger';
import '../types/express/index.d';

export interface AuditOptions {
  action: SecurityAction;
  resource: string;
  getResourceId?: (req: Request, res: Response) => string | undefined | null;
  getDetails?: (req: Request, res: Response) => Record<string, unknown> | undefined | null;
  includeBody?: boolean;
  includeQuery?: boolean;
  maskFields?: string[];
}

const SENSITIVE_FIELDS = [
  'password', 'token', 'secret', 'authorization', 'api_key', 'apikey',
  'jwt', 'refresh_token', 'ssn', 'credit_card', 'cvv', 'pin',
  'stripe_key', 'private_key',
];

function redactFields(data: Record<string, unknown>, fields?: string[]): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  const maskList = fields || SENSITIVE_FIELDS;
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (maskList.some((f) => lowerKey.includes(f.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      redacted[key] = value.map((item: unknown) =>
        typeof item === 'object' && item !== null
          ? redactFields(item as Record<string, unknown>, fields)
          : item,
      );
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactFields(value as Record<string, unknown>, fields);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function determineActorType(req: Request): ActorType {
  if (req.admin) return 'admin';
  if (req.user) return 'user';
  return 'anonymous';
}

function determineActorId(req: Request): string | undefined | null {
  if (req.admin?.adminId) return req.admin.adminId;
  if (req.user?.walletAddress) return req.user.walletAddress;
  if (req.user?.id) return req.user.id;
  return null;
}

function determineActorEmail(req: Request): string | undefined | null {
  if (req.admin?.email) return req.admin.email;
  return null;
}

export interface AppendAuditLogInput {
  action: SecurityAction;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  maskFields?: string[];
  actorType: ActorType;
  actorId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string;
  userAgent?: string | null;
  sessionId?: string | null;
  occurredAt?: Date;
}

/**
 * Append one entry to the single tamper-evident audit chain.
 * Every audit producer (HTTP middleware and support actions alike) goes
 * through here so there is only one chain and one integrity story.
 */
export async function appendAuditLog(input: AppendAuditLogInput): Promise<SecurityAuditLog> {
  await initDataSource();
  const repo = AppDataSource.getRepository(SecurityAuditLog);

  const previousLog = await repo.findOne({
    where: {},
    order: { createdAt: 'DESC' },
  });
  const previousHash = previousLog?.logHash || null;
  const details = input.details
    ? JSON.stringify(redactFields(input.details, input.maskFields))
    : null;

  const entity = repo.create({
    userId: input.actorType === 'user' ? input.actorId ?? null : null,
    userEmail: input.actorType === 'user' ? input.actorEmail ?? null : null,
    adminId: input.actorType === 'admin' ? input.actorId ?? null : null,
    adminEmail: input.actorType === 'admin' ? input.actorEmail ?? null : null,
    actorType: input.actorType,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? undefined,
    details,
    metadata: input.metadata && Object.keys(input.metadata).length > 0 ? input.metadata : undefined,
    ipAddress: input.ipAddress || 'unknown',
    userAgent: input.userAgent ?? null,
    sessionId: input.sessionId ?? null,
    previousLogHash: previousHash,
    logHash: '',
    createdAt: input.occurredAt ?? new Date(),
  });

  entity.logHash = entity.generateLogHash(previousHash);
  return repo.save(entity);
}

export type SupportAuditAction =
  | 'support_booking_access'
  | 'support_booking_change'
  | 'support_access_denied'
  | 'support_change_failed';

export interface SupportAuditInput {
  action: SupportAuditAction;
  actorId: string;
  actorType?: 'admin' | 'user';
  actorEmail?: string | null;
  reason: string;
  bookingReference: string;
  bookingId?: string | null;
  occurredAt?: Date;
  ipAddress?: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record a support access or change that would otherwise be missed by the
 * HTTP audit middleware, which only records successful mutations. Reads and
 * denied or failed attempts are recorded here explicitly.
 */
export async function recordSupportAudit(input: SupportAuditInput): Promise<SecurityAuditLog> {
  const reason = input.reason?.trim();
  const bookingReference = input.bookingReference?.trim();
  const actorId = input.actorId?.trim();

  if (!reason) throw new Error('Support audit requires a reason');
  if (!bookingReference) throw new Error('Support audit requires a booking reference');
  if (!actorId) throw new Error('Support audit requires an actor');

  return appendAuditLog({
    action: input.action,
    resource: 'bookings',
    resourceId: bookingReference,
    details: {
      reason,
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    },
    metadata: input.metadata,
    actorType: input.actorType ?? 'admin',
    actorId,
    actorEmail: input.actorEmail ?? null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent ?? null,
    occurredAt: input.occurredAt,
  });
}

export function auditLog(options: AuditOptions) {
  const { action, resource, getResourceId, getDetails, includeBody, includeQuery, maskFields } = options;
  const logger = getLogger({ component: 'audit-middleware' });

  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();

    res.on('finish', () => {
      const method = req.method.toUpperCase();
      const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      const success = res.statusCode >= 200 && res.statusCode < 300;
      if (!mutation || !success) return;

      (async () => {
        try {
          const resourceId = getResourceId ? getResourceId(req, res) : (res.locals.resourceId as string | undefined) || null;
          const detailsRaw = getDetails ? getDetails(req, res) : (res.locals.auditDetails as Record<string, unknown> | undefined) || null;

          const meta: Record<string, unknown> = {};
          if (includeBody && req.body) meta.body = redactFields(req.body as Record<string, unknown>, maskFields);
          if (includeQuery && req.query) meta.query = redactFields(req.query as Record<string, unknown>, maskFields);

          const entity = await appendAuditLog({
            action,
            resource,
            resourceId,
            details: detailsRaw,
            metadata: meta,
            maskFields,
            actorType: determineActorType(req),
            actorId: determineActorId(req),
            actorEmail: determineActorEmail(req),
            ipAddress: req.ip || (req.socket?.remoteAddress) || 'unknown',
            userAgent: req.header('user-agent') || null,
            sessionId: (req as unknown as Record<string, unknown>).sessionID as string || null,
          });

          logger.info('Audit log recorded', {
            action,
            resource,
            resourceId,
            actorType: entity.actorType,
            durationMs: Date.now() - startedAt,
          });
        } catch (err) {
          logger.warn('Failed to write audit log', {
            action,
            resource,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })().catch(() => {});
    });

    next();
  };
}

export async function queryAuditLogs(filters: {
  action?: string;
  actorType?: ActorType;
  userId?: string;
  adminId?: string;
  resource?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  await initDataSource();
  const repo = AppDataSource.getRepository(SecurityAuditLog);
  const query = repo.createQueryBuilder('log');

  if (filters.action) query.andWhere('log.action = :action', { action: filters.action });
  if (filters.actorType) query.andWhere('log.actorType = :actorType', { actorType: filters.actorType });
  if (filters.userId) query.andWhere('log.userId = :userId', { userId: filters.userId });
  if (filters.adminId) query.andWhere('log.adminId = :adminId', { adminId: filters.adminId });
  if (filters.resource) query.andWhere('log.resource = :resource', { resource: filters.resource });
  if (filters.resourceId) query.andWhere('log.resourceId = :resourceId', { resourceId: filters.resourceId });
  if (filters.from) query.andWhere('log.createdAt >= :from', { from: new Date(filters.from) });
  if (filters.to) query.andWhere('log.createdAt <= :to', { to: new Date(filters.to) });

  const limit = Math.min(Math.max(filters.limit || 50, 1), 500);
  const offset = filters.offset || 0;

  const [logs, total] = await query
    .orderBy('log.createdAt', 'DESC')
    .skip(offset)
    .take(limit)
    .getManyAndCount();

  return { logs, total };
}

export async function verifyAuditChain(filters: {
  userId?: string;
  adminId?: string;
}): Promise<{ valid: boolean; brokenAt?: string; error?: string }> {
  try {
    await initDataSource();
    const repo = AppDataSource.getRepository(SecurityAuditLog);
    const where: Record<string, string> = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.adminId) where.adminId = filters.adminId;

    const logs = await repo.find({
      where,
      order: { createdAt: 'ASC' },
    });

    if (logs.length === 0) return { valid: true };

    let previousHash: string | null = null;
    for (const log of logs) {
      if (!log.verifyIntegrity(previousHash)) {
        return { valid: false, brokenAt: log.id, error: `Hash chain broken at log ${log.id}` };
      }
      previousHash = log.logHash;
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export { redactFields };
