/**
 * Admin routes: rate limiting dashboard + throttle event monitoring.
 *
 * Scope (issue #305):
 *   GET  /admin/rate-limits/stats   — current usage vs limits per tier
 *   GET  /admin/rate-limits/events  — recent throttle events (paginated)
 *   PUT  /admin/rate-limits/:tier   — adjust limits for a tier
 *   GET  /admin/metrics/summary     — aggregated Prometheus metrics summary
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAdmin } from '../../middleware/adminAuth';
import { logger } from '../../utils/logger';
import { SEARCH_LIMITS, BOOKING_LIMITS } from '../../middleware/rate-limit-tiers';

const router = Router();

router.use(requireAdmin);

interface ThrottleEvent {
  timestamp:  string;
  ip:         string;
  userId?:    string;
  tier:       string;
  endpoint:   string;
  retryAfter: number;
}

// In-memory ring buffer for recent throttle events (production: use Redis stream)
const MAX_EVENTS = 1000;
const throttleEvents: ThrottleEvent[] = [];

export function recordThrottleEvent(event: Omit<ThrottleEvent, 'timestamp'>): void {
  throttleEvents.push({ ...event, timestamp: new Date().toISOString() });
  if (throttleEvents.length > MAX_EVENTS) {
    throttleEvents.splice(0, throttleEvents.length - MAX_EVENTS);
  }
}

/**
 * GET /admin/rate-limits/stats
 * Returns current limit configuration for all endpoint categories and tiers.
 */
router.get(
  '/rate-limits/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      categories: {
        search: {
          limits: {
            anonymous:     SEARCH_LIMITS.anonymous,
            authenticated: SEARCH_LIMITS.authenticated,
            premium:       SEARCH_LIMITS.premium,
          },
        },
        booking: {
          limits: {
            anonymous:     BOOKING_LIMITS.anonymous,
            authenticated: BOOKING_LIMITS.authenticated,
            premium:       BOOKING_LIMITS.premium,
          },
        },
      },
      throttleEventCount: throttleEvents.length,
      note: 'Live per-key counters require Redis integration; this shows the configured limits.',
    });
  }),
);

/**
 * GET /admin/rate-limits/events?page=1&limit=50&tier=anonymous
 * Returns paginated recent throttle events, optionally filtered by tier.
 */
router.get(
  '/rate-limits/events',
  asyncHandler(async (req: Request, res: Response) => {
    const page     = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit    = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const tierFilter = req.query.tier ? String(req.query.tier) : null;

    let events = [...throttleEvents].reverse();
    if (tierFilter) {
      events = events.filter((e) => e.tier === tierFilter);
    }

    const total = events.length;
    const data  = events.slice((page - 1) * limit, page * limit);

    res.json({
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  }),
);

/**
 * PUT /admin/rate-limits/:tier
 * Adjust rate limit config for a tier at runtime.
 * Body: { category: 'search'|'booking', points: number, durationSeconds: number }
 */
router.put(
  '/rate-limits/:tier',
  asyncHandler(async (req: Request, res: Response) => {
    const { tier } = req.params as { tier: 'anonymous' | 'authenticated' | 'premium' };
    const { category, points, durationSeconds } = req.body ?? {};

    if (!['anonymous', 'authenticated', 'premium'].includes(tier)) {
      res.status(400).json({ error: 'Invalid tier; must be anonymous, authenticated, or premium' });
      return;
    }
    if (!['search', 'booking'].includes(category)) {
      res.status(400).json({ error: 'Invalid category; must be search or booking' });
      return;
    }
    if (typeof points !== 'number' || points < 1 || typeof durationSeconds !== 'number' || durationSeconds < 1) {
      res.status(400).json({ error: 'points and durationSeconds must be positive numbers' });
      return;
    }

    const target = category === 'search' ? SEARCH_LIMITS : BOOKING_LIMITS;
    target[tier] = { points, durationSeconds };

    logger.info('admin: rate limit updated', { tier, category, points, durationSeconds });
    res.json({ tier, category, points, durationSeconds, updated: true });
  }),
);

/**
 * GET /admin/metrics/summary
 * Returns a JSON summary of key application metrics for the dashboard.
 */
router.get(
  '/metrics/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      rateLimiting: {
        recentThrottleEvents: throttleEvents.length,
        oldestEvent: throttleEvents[0]?.timestamp ?? null,
        newestEvent: throttleEvents[throttleEvents.length - 1]?.timestamp ?? null,
      },
      note: 'For full Prometheus metrics, scrape /metrics with your metrics collector.',
    });
  }),
);

export const adminRateLimitRoutes = router;
