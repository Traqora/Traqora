import { SelectQueryBuilder } from 'typeorm';

/**
 * Applies a tenant filter to a TypeORM query builder.
 * The entity must have a `tenantId` column, or we join through a related entity.
 *
 * @param qb       - The query builder to scope
 * @param alias    - The entity alias used in the query builder
 * @param tenantId - The tenant ID to filter by (undefined = no filter / admin cross-tenant)
 */
export function scopeToTenant<T>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  tenantId: string | undefined
): SelectQueryBuilder<T> {
  if (!tenantId) return qb;
  return qb.andWhere(`${alias}.tenantId = :tenantId`, { tenantId });
}

/**
 * Builds a tenant-aware summary across multiple tenants (admin use).
 * Returns a SELECT clause fragment that groups by tenantId.
 */
export function crossTenantGroupBy<T>(
  qb: SelectQueryBuilder<T>,
  alias: string
): SelectQueryBuilder<T> {
  return qb.addSelect(`${alias}.tenantId`, 'tenantId').addGroupBy(`${alias}.tenantId`);
}

/**
 * Validates that a given tenantId is a non-empty string.
 */
export function isValidTenantId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns { tenantId } parameter object for use with TypeORM query builders.
 * Handles the undefined (admin cross-tenant) case gracefully.
 */
export function tenantParam(tenantId: string | undefined): Record<string, unknown> {
  return tenantId ? { tenantId } : {};
}
