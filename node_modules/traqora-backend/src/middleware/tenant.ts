import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../db/dataSource';
import { Tenant } from '../db/entities/Tenant';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenantRole?: 'owner' | 'admin' | 'member' | 'viewer';
    }
  }
}

/**
 * Resolves tenant context from:
 *  1. `X-Tenant-ID` header (admin bypass — validated separately by requireAdmin)
 *  2. `tenantId` route param
 *  3. DB lookup: find tenant where the authenticated walletAddress is a member
 *
 * Attaches `req.tenantId` and `req.tenantRole` so downstream handlers can scope queries.
 * Does NOT block the request — routes that require a tenant must check req.tenantId themselves.
 */
export const tenantMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    // Admin override via explicit header
    const headerTenantId = req.header('X-Tenant-ID');
    if (headerTenantId && req.admin) {
      req.tenantId = headerTenantId;
      req.tenantRole = 'admin';
      return next();
    }

    // From route param
    const paramTenantId = req.params.tenantId ?? (req.query.tenantId as string | undefined);
    const walletAddress = req.user?.walletAddress;

    if (!walletAddress) {
      return next();
    }

    if (!AppDataSource.isInitialized) {
      return next();
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);

    // If tenant explicitly specified, validate membership
    if (paramTenantId) {
      const tenant = await tenantRepo.findOne({
        where: { id: paramTenantId },
      });

      if (tenant) {
        const member = (tenant.members as TenantMember[]).find(
          (m) => m.walletAddress === walletAddress
        );
        if (member) {
          req.tenantId = tenant.id;
          req.tenantRole = member.role;
        }
      }
      return next();
    }

    // Auto-resolve: find a tenant the user belongs to
    const tenants = await tenantRepo
      .createQueryBuilder('tenant')
      .where(`tenant.members @> :member::jsonb`, {
        member: JSON.stringify([{ walletAddress }]),
      })
      .getMany();

    if (tenants.length === 1) {
      const tenant = tenants[0];
      const member = (tenant.members as TenantMember[]).find(
        (m) => m.walletAddress === walletAddress
      );
      req.tenantId = tenant.id;
      req.tenantRole = member?.role ?? 'viewer';
    }

    next();
  } catch {
    // Non-fatal — proceed without tenant context
    next();
  }
};

export interface TenantMember {
  walletAddress: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  addedAt: string;
}

/** Middleware that rejects requests without a resolved tenantId */
export const requireTenant = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.tenantId) {
    res.status(403).json({
      success: false,
      error: { code: 'NO_TENANT', message: 'No tenant context. Provide X-Tenant-ID header or join a tenant.' },
    });
    return;
  }
  next();
};

/** Middleware that requires at least a specific role within the tenant */
export const requireTenantRole = (minRole: 'owner' | 'admin' | 'member' | 'viewer') => {
  const hierarchy: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenantId || !req.tenantRole) {
      res.status(403).json({ success: false, error: { code: 'NO_TENANT', message: 'No tenant context.' } });
      return;
    }
    if ((hierarchy[req.tenantRole] ?? 0) < (hierarchy[minRole] ?? 0)) {
      res.status(403).json({
        success: false,
        error: { code: 'INSUFFICIENT_ROLE', message: `Requires '${minRole}' or higher within this tenant.` },
      });
      return;
    }
    next();
  };
};
