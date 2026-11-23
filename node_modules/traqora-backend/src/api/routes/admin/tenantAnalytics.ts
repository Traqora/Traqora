/**
 * Tenant-scoped and cross-tenant analytics routes.
 *
 * Tenant users: GET /api/v1/admin/analytics/tenant/:tenantId/...
 * Admin cross-tenant: GET /api/v1/admin/analytics/cross-tenant/... (admin only)
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../utils/errorHandler';
import { requireAdmin, requireRole } from '../../../middleware/adminAuth';
import { AppDataSource } from '../../../db/dataSource';
import { Booking } from '../../../db/entities/Booking';
import { Tenant } from '../../../db/entities/Tenant';
import { TenantMember } from '../../../middleware/tenant';
import { scopeToTenant, isValidTenantId } from '../../../db/tenant-scoping';

const router = Router();

// ── Tenant registration / onboarding ─────────────────────────────────────────

/**
 * POST /api/v1/admin/analytics/tenants
 * Create (onboard) a new tenant.
 */
router.post(
  '/tenants',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, slug, contractId, organizationId, ownerWallet, rateLimitRpm } = req.body as {
      name?: string;
      slug?: string;
      contractId?: string;
      organizationId?: string;
      ownerWallet?: string;
      rateLimitRpm?: number;
    };

    if (!name || !slug || !ownerWallet) {
      return res.status(400).json({ success: false, error: 'name, slug, and ownerWallet are required' });
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);

    const existing = await tenantRepo.findOne({ where: { slug } });
    if (existing) {
      return res.status(409).json({ success: false, error: `Tenant with slug '${slug}' already exists` });
    }

    const initialMember: TenantMember = {
      walletAddress: ownerWallet,
      role: 'owner',
      addedAt: new Date().toISOString(),
    };

    const tenant = tenantRepo.create({
      name,
      slug,
      contractId: contractId ?? null,
      organizationId: organizationId ?? null,
      members: [initialMember] as unknown as TenantMember[],
      rateLimitRpm: rateLimitRpm ?? 1000,
      config: {},
      isActive: true,
    });

    const saved = await tenantRepo.save(tenant);
    return res.status(201).json({ success: true, data: saved });
  })
);

/**
 * GET /api/v1/admin/analytics/tenants
 * List all tenants (admin only).
 */
router.get(
  '/tenants',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenants = await tenantRepo.find({ order: { createdAt: 'DESC' } });
    return res.json({ success: true, data: tenants });
  })
);

/**
 * PATCH /api/v1/admin/analytics/tenants/:tenantId/members
 * Add or update a tenant member (admin only).
 */
router.patch(
  '/tenants/:tenantId/members',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { walletAddress, role } = req.body as { walletAddress?: string; role?: string };

    if (!walletAddress || !role) {
      return res.status(400).json({ success: false, error: 'walletAddress and role are required' });
    }

    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: `role must be one of: ${validRoles.join(', ')}` });
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = await tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const members: TenantMember[] = Array.isArray(tenant.members)
      ? [...(tenant.members as TenantMember[])]
      : JSON.parse(tenant.members as string);

    const existing = members.findIndex((m) => m.walletAddress === walletAddress);
    const entry: TenantMember = { walletAddress, role: role as TenantMember['role'], addedAt: new Date().toISOString() };
    if (existing >= 0) members[existing] = entry;
    else members.push(entry);

    tenant.members = members as unknown as TenantMember[];
    const saved = await tenantRepo.save(tenant);
    return res.json({ success: true, data: saved });
  })
);

/**
 * PATCH /api/v1/admin/analytics/tenants/:tenantId/config
 * Update tenant configuration (rate limits, etc.).
 */
router.patch(
  '/tenants/:tenantId/config',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const { rateLimitRpm, config } = req.body as { rateLimitRpm?: number; config?: Record<string, unknown> };

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = await tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    if (typeof rateLimitRpm === 'number') tenant.rateLimitRpm = rateLimitRpm;
    if (config && typeof config === 'object') {
      const existing = typeof tenant.config === 'string' ? JSON.parse(tenant.config) : tenant.config;
      tenant.config = { ...existing, ...config } as unknown as Record<string, unknown>;
    }

    const saved = await tenantRepo.save(tenant);
    return res.json({ success: true, data: saved });
  })
);

// ── Tenant-scoped analytics ───────────────────────────────────────────────────

/**
 * GET /api/v1/admin/analytics/tenants/:tenantId/summary
 * Analytics summary scoped to a single tenant.
 */
router.get(
  '/tenants/:tenantId/summary',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    if (!isValidTenantId(tenantId)) {
      return res.status(400).json({ success: false, error: 'Invalid tenantId' });
    }

    const bookingRepo = AppDataSource.getRepository(Booking);
    const qb = bookingRepo.createQueryBuilder('booking');
    scopeToTenant(qb, 'booking', tenantId);

    const [totalBookings, revenueResult, statusCounts] = await Promise.all([
      qb.getCount(),
      scopeToTenant(
        bookingRepo
          .createQueryBuilder('booking')
          .select('SUM(booking.amountCents)', 'total')
          .where("booking.status IN ('confirmed', 'paid', 'onchain_submitted', 'onchain_pending')"),
        'booking',
        tenantId
      ).andWhere('booking.tenantId = :tenantId', { tenantId }).getRawOne<{ total: string | null }>(),
      scopeToTenant(
        bookingRepo
          .createQueryBuilder('booking')
          .select('booking.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('booking.status'),
        'booking',
        tenantId
      ).getRawMany<{ status: string; count: string }>(),
    ]);

    const totalRevenueCents = Number(revenueResult?.total ?? 0);
    const bookingsByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      bookingsByStatus[row.status] = Number(row.count);
    }

    return res.json({
      success: true,
      data: { tenantId, totalBookings, totalRevenueCents, bookingsByStatus },
    });
  })
);

// ── Cross-tenant aggregation (admin only) ─────────────────────────────────────

/**
 * GET /api/v1/admin/analytics/cross-tenant/summary
 * Aggregate analytics across all tenants.
 */
router.get(
  '/cross-tenant/summary',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);

    const perTenant: Array<{ tenantId: string | null; totalBookings: string; totalRevenueCents: string | null }> =
      await bookingRepo
        .createQueryBuilder('booking')
        .select('booking.tenantId', 'tenantId')
        .addSelect('COUNT(*)', 'totalBookings')
        .addSelect('SUM(booking.amountCents)', 'totalRevenueCents')
        .groupBy('booking.tenantId')
        .getRawMany();

    return res.json({
      success: true,
      data: perTenant.map((row) => ({
        tenantId: row.tenantId ?? 'unassigned',
        totalBookings: Number(row.totalBookings),
        totalRevenueCents: Number(row.totalRevenueCents ?? 0),
      })),
    });
  })
);

export const tenantAnalyticsRoutes = router;
