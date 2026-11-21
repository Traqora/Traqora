/**
 * Extended analytics routes — issues #245 #249 #258 #260.
 *
 * Mounted at /api/v1/admin/analytics/extended by the existing admin router.
 * All routes require admin role (enforced by requireAdmin + requireRole('admin')).
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../../utils/errorHandler';
import { requireAdmin, requireRole } from '../../../middleware/adminAuth';
import { AnomalyDetectionService } from '../../../services/analytics/anomalyDetectionService';
import { CostAttributionService } from '../../../services/analytics/costAttributionService';
import { DataSourceService } from '../../../services/analytics/dataSourceService';

const router = Router();

// Singleton service instances (in production these would be injected)
export const anomalyService = new AnomalyDetectionService();
export const costService = new CostAttributionService();
export const dataSourceService = new DataSourceService();

// ── Anomaly Detection (#249) ─────────────────────────────────────────────────

/**
 * POST /api/v1/admin/analytics/extended/anomaly/detect
 * Body: { values: number[], threshold?: number, seriesKey?: string }
 * Returns anomaly report with detected outliers and their z-scores.
 */
router.post(
  '/anomaly/detect',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { values, threshold, seriesKey } = req.body as {
      values?: number[];
      threshold?: number;
      seriesKey?: string;
    };

    if (!Array.isArray(values) || values.some((v) => typeof v !== 'number')) {
      return res.status(400).json({ success: false, error: 'values must be a non-empty number array' });
    }

    const report = anomalyService.detect(values, threshold);

    // Filter out any user-marked false positives
    if (seriesKey) {
      report.anomalies = report.anomalies.filter(
        (a) => !anomalyService.isFalsePositive(seriesKey, a.index)
      );
    }

    return res.json({ success: true, data: report });
  })
);

/**
 * POST /api/v1/admin/analytics/extended/anomaly/false-positive
 * Body: { seriesKey: string, index: number }
 * Records user feedback that a flagged point is not a real anomaly.
 */
router.post(
  '/anomaly/false-positive',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { seriesKey, index } = req.body as { seriesKey?: string; index?: number };
    if (!seriesKey || typeof index !== 'number') {
      return res.status(400).json({ success: false, error: 'seriesKey and index are required' });
    }
    anomalyService.markFalsePositive(seriesKey, index);
    return res.json({ success: true, message: `Index ${index} in series "${seriesKey}" marked as false positive` });
  })
);

// ── Cost Attribution (#258) ──────────────────────────────────────────────────

/**
 * POST /api/v1/admin/analytics/extended/cost/record-storage
 * Body: { tenantId: string, bytes: number }
 */
router.post(
  '/cost/record-storage',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, bytes } = req.body as { tenantId?: string; bytes?: number };
    if (!tenantId || typeof bytes !== 'number' || bytes < 0) {
      return res.status(400).json({ success: false, error: 'tenantId and non-negative bytes are required' });
    }
    costService.recordStorage(tenantId, bytes);
    return res.json({ success: true });
  })
);

/**
 * POST /api/v1/admin/analytics/extended/cost/record-query
 * Body: { tenantId: string, queryId: string, durationMs: number }
 */
router.post(
  '/cost/record-query',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, queryId, durationMs } = req.body as {
      tenantId?: string;
      queryId?: string;
      durationMs?: number;
    };
    if (!tenantId || !queryId || typeof durationMs !== 'number' || durationMs < 0) {
      return res.status(400).json({ success: false, error: 'tenantId, queryId, and non-negative durationMs are required' });
    }
    costService.recordQuery(tenantId, queryId, durationMs);
    return res.json({ success: true });
  })
);

/**
 * GET /api/v1/admin/analytics/extended/cost/summary/:tenantId
 */
router.get(
  '/cost/summary/:tenantId',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const summary = costService.getSummary(tenantId);
    return res.json({ success: true, data: summary });
  })
);

/**
 * POST /api/v1/admin/analytics/extended/cost/check-threshold
 * Body: { tenantId: string, thresholdCents: number }
 */
router.post(
  '/cost/check-threshold',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { tenantId, thresholdCents } = req.body as { tenantId?: string; thresholdCents?: number };
    if (!tenantId || typeof thresholdCents !== 'number') {
      return res.status(400).json({ success: false, error: 'tenantId and thresholdCents are required' });
    }
    const alert = costService.checkThreshold(tenantId, thresholdCents);
    return res.json({ success: true, data: { alert, triggered: alert !== null } });
  })
);

// ── Data Source Integration (#260) ───────────────────────────────────────────

/**
 * POST /api/v1/admin/analytics/extended/datasource/register
 * Body: DataSourceConfig (without transformFn)
 */
router.post(
  '/datasource/register',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id, name, type, url, schedule, headers } = req.body as {
      id?: string;
      name?: string;
      type?: string;
      url?: string;
      schedule?: string;
      headers?: Record<string, string>;
    };
    if (!id || !name || !type || !url) {
      return res.status(400).json({ success: false, error: 'id, name, type, and url are required' });
    }
    if (!['rest', 'graphql', 'webhook'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be rest, graphql, or webhook' });
    }
    dataSourceService.registerSource({ id, name, type: type as 'rest' | 'graphql' | 'webhook', url, schedule, headers });
    return res.status(201).json({ success: true, message: `Data source "${id}" registered` });
  })
);

/**
 * POST /api/v1/admin/analytics/extended/datasource/:sourceId/ingest
 * Body: raw data payload
 */
router.post(
  '/datasource/:sourceId/ingest',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { sourceId } = req.params;
    try {
      const records = dataSourceService.ingest(sourceId, req.body);
      return res.json({ success: true, data: { ingested: records.length } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(404).json({ success: false, error: msg });
    }
  })
);

/**
 * GET /api/v1/admin/analytics/extended/datasource/catalog
 */
router.get(
  '/datasource/catalog',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (_req: Request, res: Response) => {
    return res.json({ success: true, data: dataSourceService.getCatalog() });
  })
);

/**
 * GET /api/v1/admin/analytics/extended/datasource/:sourceId/lineage
 */
router.get(
  '/datasource/:sourceId/lineage',
  requireAdmin,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { sourceId } = req.params;
    const lineage = dataSourceService.getLineage(sourceId);
    return res.json({ success: true, data: lineage });
  })
);

export default router;
