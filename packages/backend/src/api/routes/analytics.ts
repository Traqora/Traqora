/**
 * Analytics routes: price prediction and fare trend analytics (#376).
 *
 * Scope:
 *   GET /analytics/price-prediction    — predicted price for a route
 *   GET /analytics/fare-trends/:route  — historical fare data + summary stats
 *   GET /analytics/buy-signal          — buy now vs wait recommendation
 *
 * Price alert subscriptions (create/list/update/delete) already live in
 * ./alerts.ts against the same PriceAlert model — this file is read-only
 * analytics over PriceHistory, not alert management.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { PriceOracleService } from '../../services/PriceOracleService';
import { PricePredictionService } from '../../services/PricePredictionService';
import { logger } from '../../utils/logger';

const router = Router();

const pricePredictionSchema = z.object({
  origin: z.string().length(3),
  destination: z.string().length(3),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.coerce.number().int().min(1).max(9).default(1),
});

const fareTrendSchema = z.object({
  window: z.enum(['30', '60', '90']).default('30'),
});

/** Matches the flightId shape used elsewhere (alerts.ts, priceMonitor.ts,
 * PriceOracleService) so prediction/trend lookups line up with the same
 * PriceHistory rows the price-monitor cron and manual /alerts/check both
 * write to. */
function routeFlightId(origin: string, destination: string, date: string): string {
  return `${origin}-${destination}-${date}`;
}

/**
 * GET /analytics/price-prediction?origin=JFK&destination=LHR&date=2026-09-01
 *
 * Returns a predicted price, confidence score, and buy/wait recommendation,
 * computed from this route's actual PriceHistory (see PricePredictionService
 * for the method — a statistical two-window trend comparison, not ML).
 */
router.get(
  '/price-prediction',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = pricePredictionSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { origin, destination, date, passengers } = parsed.data;
    const oracle = PriceOracleService.getInstance();
    const predictor = PricePredictionService.getInstance();

    logger.debug('analytics: price prediction request', { origin, destination, date });

    const flightId = routeFlightId(origin, destination, date);
    const [priceData] = await oracle.fetchPrices([flightId]);

    if (!priceData) {
      res.status(404).json({ error: 'No pricing data available for this route and date' });
      return;
    }

    const prediction = await predictor.predict(flightId, priceData.price, priceData.currency);

    res.json({
      route: { origin, destination, date, passengers },
      prediction: {
        ...prediction,
        estimatedPrice: prediction.estimatedPrice * passengers,
      },
      generatedAt: new Date().toISOString(),
      note: 'Predictions are based on historical price patterns and should not be relied upon as guarantees.',
    });
  }),
);

/**
 * GET /analytics/fare-trends/:route?window=30
 *
 * Returns actual historical fare data points (from PriceHistory) for the
 * last 30/60/90 days, plus summary stats. `:route` is the flightId shape
 * (`ORIGIN-DEST-YYYY-MM-DD`) other services already key PriceHistory by.
 */
router.get(
  '/fare-trends/:route',
  asyncHandler(async (req: Request, res: Response) => {
    const { route } = req.params;
    const parsed = fareTrendSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const windowDays = parseInt(parsed.data.window, 10);
    logger.debug('analytics: fare trend request', { route, windowDays });

    const predictor = PricePredictionService.getInstance();
    const { dataPoints, summary } = await predictor.getFareTrend(route, windowDays);

    const seasonalNote =
      summary.dataPointCount === 0
        ? 'No price history yet for this route — check back after it has an active price alert.'
        : summary.currentPrice !== null && summary.currentPrice > summary.avgPrice * 1.1
          ? 'Prices are currently above average — consider waiting.'
          : 'Prices are at or below average — a good time to book.';

    res.json({
      route,
      windowDays,
      summary: { ...summary, seasonalNote },
      dataPoints,
    });
  }),
);

/**
 * GET /analytics/buy-signal?origin=JFK&destination=LHR&date=2026-09-01
 *
 * Returns a buy/wait signal based on the current price relative to this
 * route's actual historical average (PricePredictionService).
 */
router.get(
  '/buy-signal',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = pricePredictionSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { origin, destination, date } = parsed.data;
    const oracle = PriceOracleService.getInstance();
    const predictor = PricePredictionService.getInstance();
    const flightId = routeFlightId(origin, destination, date);
    const [priceData] = await oracle.fetchPrices([flightId]);

    const currentPrice = priceData?.price ?? 0;
    const currency = priceData?.currency ?? 'USD';
    const prediction = await predictor.predict(flightId, currentPrice, currency);

    res.json({
      route: { origin, destination, date },
      signal: prediction.recommendation,
      currentPrice,
      avgPrice: prediction.estimatedPrice,
      priceVsAvg:
        prediction.estimatedPrice === 0
          ? '0.0%'
          : `${((currentPrice / prediction.estimatedPrice - 1) * 100).toFixed(1)}%`,
      confidence: prediction.confidence,
      dataPointCount: prediction.dataPointCount,
      generatedAt: new Date().toISOString(),
    });
  }),
);

export const analyticsRoutes = router;
