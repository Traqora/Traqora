import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './authMiddleware';
import { requireAdmin, requireRole as requireAdminRole, AdminPayload } from './adminAuth';

// User roles
export enum UserRole {
  USER = 'user',
  PREMIUM = 'premium',
  ADMIN = 'admin',
}

// Enhanced middleware for role-based access
export const requireUserRole = (minRole: UserRole) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // First ensure user is authenticated
    requireAuth(req, res, () => {
      const user = req.user as any;
      
      // Check admin API key for admin access
      const apiKey = req.header('X-Admin-API-Key');
      if (apiKey === process.env.ADMIN_API_KEY) {
        req.admin = { adminId: 'system', email: 'system@traqora.io', role: 'super_admin' } as AdminPayload;
        return next();
      }
      
      // Simple role check (can be enhanced with database lookups)
      const isAdmin = process.env.ADMIN_WALLETS?.split(',').includes(user?.walletAddress);
      
      if (minRole === UserRole.ADMIN && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: { message: 'Admin access required', code: 'INSUFFICIENT_PRIVILEGES' }
        });
      }
      
      next();
    });
  };
};

// Specific middleware for admin endpoints
export const requireAdminAccess = requireUserRole(UserRole.ADMIN);

// Middleware for premium features
export const requirePremium = requireUserRole(UserRole.PREMIUM);
