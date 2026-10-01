import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../../middleware/adminAuth';
import { getRateLimitAbuseMetrics } from '../../../services/analytics/rateLimitMetricsService';

export const rateLimitMetricsRouter = Router();

rateLimitMetricsRouter.get(
  '/security/rate-limits/metrics',
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const metrics = await getRateLimitAbuseMetrics();
      return res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch rate-limit metrics',
        },
      });
    }
  },
);
