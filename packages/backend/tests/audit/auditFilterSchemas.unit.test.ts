import {
  AUDIT_EXPORT_LIMIT,
  AUDIT_QUERY_LIMIT,
  auditExportQuerySchema,
  auditQuerySchema,
} from '../../src/api/schemas/audit';

describe('audit filter schemas', () => {
  it('accepts time and reference filters on the interactive query', () => {
    const parsed = auditQuerySchema.parse({
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-19T00:00:00.000Z',
      resourceId: 'TQ-ABC123',
      resource: 'bookings',
      action: 'support_booking_access',
    });

    expect(parsed).toMatchObject({
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-19T00:00:00.000Z',
      resourceId: 'TQ-ABC123',
      resource: 'bookings',
      action: 'support_booking_access',
      page: 1,
      limit: 50,
    });
  });

  it('bounds interactive pages to a small limit', () => {
    expect(auditQuerySchema.safeParse({ limit: AUDIT_QUERY_LIMIT }).success).toBe(true);
    expect(auditQuerySchema.safeParse({ limit: AUDIT_QUERY_LIMIT + 1 }).success).toBe(false);
  });

  it('defaults an export to the full capped page and rejects a larger cap', () => {
    expect(auditExportQuerySchema.parse({}).limit).toBe(AUDIT_EXPORT_LIMIT);
    expect(AUDIT_EXPORT_LIMIT).toBe(10_000);
    expect(auditExportQuerySchema.safeParse({ limit: AUDIT_EXPORT_LIMIT }).success).toBe(true);
    expect(auditExportQuerySchema.safeParse({ limit: AUDIT_EXPORT_LIMIT + 1 }).success).toBe(false);
  });

  it('rejects a paged export and malformed time filters', () => {
    expect(auditExportQuerySchema.safeParse({ page: 2 }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false);
  });
});
