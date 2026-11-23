import { Between, FindOptionsWhere, LessThan } from 'typeorm';
import { AppDataSource, initDataSource } from '../db/dataSource';
import { AnalyticsAuditAction, AnalyticsAuditLog } from '../db/entities/AnalyticsAuditLog';
import { logger } from '../utils/logger';

export const AUDIT_RETENTION_DAYS = 365;

export interface AnalyticsAuditInput {
  action: AnalyticsAuditAction;
  route: string;
  method: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorType?: 'admin' | 'user' | 'anonymous' | 'system';
  tenantId?: string | null;
  queryParams?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  statusCode?: number | null;
  durationMs?: number | null;
  ipAddress?: string;
  userAgent?: string | null;
  createdAt?: Date;
}

export interface AuditLogSearchFilters {
  action?: AnalyticsAuditAction;
  actorId?: string;
  route?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const memoryLogs: AnalyticsAuditLog[] = [];

export async function writeAnalyticsAuditLog(input: AnalyticsAuditInput): Promise<void> {
  const log = normalizeLog(input);
  memoryLogs.push(log);
  pruneMemoryLogs();

  try {
    await initDataSource();
    if (!AppDataSource.isInitialized) return;

    const repo = AppDataSource.getRepository(AnalyticsAuditLog);
    await repo.save(repo.create({
      ...log,
      queryParams: log.queryParams,
      metadata: log.metadata,
    }));
  } catch (error) {
    logger.warn('Failed to persist analytics audit log', {
      action: input.action,
      route: input.route,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function searchAnalyticsAuditLogs(filters: AuditLogSearchFilters = {}) {
  await enforceAuditRetention();

  try {
    await initDataSource();
    if (AppDataSource.isInitialized) {
      const repo = AppDataSource.getRepository(AnalyticsAuditLog);
      const where = buildWhere(filters);
      const [logs, total] = await repo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        take: clampLimit(filters.limit),
        skip: filters.offset ?? 0,
      });
      return { logs: logs.map(serializeLog), total };
    }
  } catch (error) {
    logger.warn('Falling back to in-memory analytics audit search', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const filtered = filterMemoryLogs(filters);
  return {
    logs: filtered.slice(filters.offset ?? 0, (filters.offset ?? 0) + clampLimit(filters.limit)).map(serializeLog),
    total: filtered.length,
  };
}

export async function exportAnalyticsAuditLogs(filters: AuditLogSearchFilters = {}) {
  const result = await searchAnalyticsAuditLogs({ ...filters, limit: 10_000, offset: 0 });
  const rows = result.logs;
  const header = [
    'id',
    'createdAt',
    'action',
    'actorType',
    'actorId',
    'actorEmail',
    'tenantId',
    'method',
    'route',
    'statusCode',
    'durationMs',
    'ipAddress',
    'userAgent',
    'queryParams',
    'metadata',
  ];

  return [
    header.join(','),
    ...rows.map((row) => header.map((key) => csvEscape(String(row[key as keyof typeof row] ?? ''))).join(',')),
  ].join('\n');
}

export async function enforceAuditRetention(): Promise<void> {
  pruneMemoryLogs();

  try {
    await initDataSource();
    if (!AppDataSource.isInitialized) return;
    const cutoff = retentionCutoff();
    await AppDataSource.getRepository(AnalyticsAuditLog).delete({ createdAt: LessThan(cutoff) });
  } catch (error) {
    logger.warn('Failed to enforce analytics audit retention', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeLog(input: AnalyticsAuditInput): AnalyticsAuditLog {
  const now = input.createdAt ?? new Date();
  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
    action: input.action,
    route: input.route,
    method: input.method.toUpperCase(),
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    actorType: input.actorType ?? 'anonymous',
    tenantId: input.tenantId ?? null,
    queryParams: stringifySafe(input.queryParams),
    metadata: stringifySafe(input.metadata),
    statusCode: input.statusCode ?? null,
    durationMs: input.durationMs ?? null,
    ipAddress: input.ipAddress ?? 'unknown',
    userAgent: input.userAgent ?? null,
    createdAt: now,
  };
}

function buildWhere(filters: AuditLogSearchFilters): FindOptionsWhere<AnalyticsAuditLog> {
  const where: FindOptionsWhere<AnalyticsAuditLog> = {};
  if (filters.action) where.action = filters.action;
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.route) where.route = filters.route;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.from || filters.to) {
    where.createdAt = Between(
      filters.from ? new Date(filters.from) : new Date(0),
      filters.to ? new Date(filters.to) : new Date()
    );
  }
  return where;
}

function filterMemoryLogs(filters: AuditLogSearchFilters) {
  return memoryLogs
    .filter((log) => !filters.action || log.action === filters.action)
    .filter((log) => !filters.actorId || log.actorId === filters.actorId)
    .filter((log) => !filters.route || log.route === filters.route)
    .filter((log) => !filters.tenantId || log.tenantId === filters.tenantId)
    .filter((log) => !filters.from || log.createdAt >= new Date(filters.from))
    .filter((log) => !filters.to || log.createdAt <= new Date(filters.to))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function serializeLog(log: AnalyticsAuditLog) {
  return {
    id: log.id,
    action: log.action,
    route: log.route,
    method: log.method,
    actorId: log.actorId,
    actorEmail: log.actorEmail,
    actorType: log.actorType,
    tenantId: log.tenantId,
    queryParams: log.queryParams,
    metadata: log.metadata,
    statusCode: log.statusCode,
    durationMs: log.durationMs,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
  };
}

function pruneMemoryLogs() {
  const cutoff = retentionCutoff().getTime();
  for (let index = memoryLogs.length - 1; index >= 0; index -= 1) {
    if (memoryLogs[index].createdAt.getTime() < cutoff) {
      memoryLogs.splice(index, 1);
    }
  }
}

function retentionCutoff() {
  return new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function stringifySafe(value?: Record<string, unknown> | null) {
  if (!value) return null;
  return JSON.stringify(redactSecrets(value));
}

function redactSecrets(value: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/token|secret|password|authorization|api[-_]?key/i.test(key)) {
      redacted[key] = '[redacted]';
    } else {
      redacted[key] = entry;
    }
  }
  return redacted;
}

function clampLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) return 100;
  return Math.min(Math.max(limit, 1), 500);
}

function csvEscape(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
