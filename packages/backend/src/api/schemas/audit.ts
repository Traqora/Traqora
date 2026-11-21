import { z } from 'zod';

/** Interactive views are bounded to a small page so a request stays cheap. */
export const AUDIT_QUERY_LIMIT = 500;
/** Exports intentionally allow a larger bounded page than interactive views. */
export const AUDIT_EXPORT_LIMIT = 10_000;

const auditFilterFields = {
  action: z.string().optional(),
  actorType: z.enum(['user', 'admin', 'system', 'anonymous']).optional(),
  userId: z.string().optional(),
  adminId: z.string().optional(),
  resource: z.string().optional(),
  resourceId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
};

export const auditQuerySchema = z.object({
  ...auditFilterFields,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(AUDIT_QUERY_LIMIT).default(50),
});

export const auditExportQuerySchema = z.object({
  ...auditFilterFields,
  page: z.literal(1).default(1),
  limit: z.coerce.number()
    .int()
    .positive()
    .max(AUDIT_EXPORT_LIMIT)
    .default(AUDIT_EXPORT_LIMIT),
});

export interface AuditFilters {
  action?: string;
  actorType?: 'user' | 'admin' | 'system' | 'anonymous';
  userId?: string;
  adminId?: string;
  resource?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
