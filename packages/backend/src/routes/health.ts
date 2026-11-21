import { Router } from 'express';
import { MoreThan } from 'typeorm';
import Redis from 'ioredis';
import { Horizon } from '@stellar/stellar-sdk';
import { AppDataSource } from '../db/dataSource';
import { ContractReconciliationAttempt } from '../db/entities/ContractReconciliationAttempt';
import { requireAdmin } from '../middleware/adminAuth';
import { asyncHandler } from '../utils/errorHandler';
import { getStripeCircuitState } from '../services/stripe';
import {
  getOperationsHealth,
  getSupplierRequestData,
  type ContractHealthData,
} from '../services/operationsHealthService';
import { performanceMonitor } from '../monitoring/performance';
import { getConfig } from '../config';
import { updateSystemHealth, updateUptimeMetric, uptimeSeconds } from '../services/metrics';
import { logger } from '../utils/logger';

const router = Router();

const CHECK_TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function checkDatabase(): Promise<{ healthy: boolean; error?: string }> {
  try {
    if (!AppDataSource.isInitialized) return { healthy: false, error: 'not initialized' };
    await withTimeout(AppDataSource.query('SELECT 1'), CHECK_TIMEOUT_MS);
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: (error as Error).message };
  }
}

async function checkRedis(redisUrl: string): Promise<{ healthy: boolean; error?: string }> {
  const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await withTimeout(client.connect(), CHECK_TIMEOUT_MS);
    await withTimeout(client.ping(), CHECK_TIMEOUT_MS);
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: (error as Error).message };
  } finally {
    client.disconnect();
  }
}

async function checkStellar(horizonUrl: string): Promise<{ healthy: boolean; error?: string }> {
  try {
    const server = new Horizon.Server(horizonUrl);
    await withTimeout(server.ledgers().limit(1).call(), CHECK_TIMEOUT_MS);
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: (error as Error).message };
  }
}

router.get('/', async (_req, res) => {
  const database = await checkDatabase();
  const status = database.healthy ? 200 : 503;
  res.status(status).json({
    status: database.healthy ? 'ok' : 'degraded',
    db: database.healthy ? 'ok' : 'unavailable',
  });
});

router.get('/performance', async (_req, res) => {
  const snapshot = performanceMonitor.getSnapshot();
  const status = snapshot.status === 'critical' ? 503 : 200;

  res.status(status).json(snapshot);
});

/**
 * Per-service health check (issue #375). Unlike the boot-time-only checks
 * in utils/health-check.ts, this runs on demand so an admin dashboard or
 * uptime monitor can poll live status for each dependency independently.
 * Skips real network calls in the test environment, matching the
 * convention in utils/health-check.ts.
 */
router.get('/services', async (_req, res) => {
  const config = getConfig();

  const [database, redis, stellar] =
    process.env.NODE_ENV === 'test'
      ? [{ healthy: true }, { healthy: true }, { healthy: true }]
      : await Promise.all([
          checkDatabase(),
          checkRedis(config.redisUrl),
          checkStellar(config.horizonUrl),
        ]);

  updateSystemHealth('database', database.healthy);
  updateSystemHealth('redis', redis.healthy);
  updateSystemHealth('stellar', stellar.healthy);
  updateUptimeMetric();

  const services = { database, redis, stellar };
  const allHealthy = Object.values(services).every((s) => s.healthy);
  const anyHealthy = Object.values(services).some((s) => s.healthy);
  const overall = allHealthy ? 'operational' : anyHealthy ? 'degraded' : 'down';

  for (const [name, result] of Object.entries(services)) {
    if (!result.healthy) {
      logger.warn('Health check failed for service', { service: name, error: result.error });
    }
  }

  res.status(allHealthy ? 200 : 503).json({
    overall,
    uptimeSeconds: (await uptimeSeconds.get()).values[0]?.value ?? 0,
    services,
    checkedAt: new Date().toISOString(),
  });
});

const CONTRACT_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

async function readContractHealth(): Promise<ContractHealthData> {
  if (!AppDataSource.isInitialized) {
    return { available: false, lastReconciledAt: null, needsReviewCount: 0 };
  }
  try {
    const repo = AppDataSource.getRepository(ContractReconciliationAttempt);
    const [latest, needsReviewCount] = await Promise.all([
      repo.findOne({ order: { attemptedAt: 'DESC' } }),
      repo.count({
        where: {
          outcome: 'failed',
          attemptedAt: MoreThan(new Date(Date.now() - CONTRACT_REVIEW_WINDOW_MS)),
        },
      }),
    ]);
    return {
      available: true,
      lastReconciledAt: latest?.attemptedAt ?? null,
      needsReviewCount,
    };
  } catch (error) {
    logger.warn('Contract health read failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { available: false, lastReconciledAt: null, needsReviewCount: 0 };
  }
}

/**
 * Operations health snapshot (#1172, #1173). Admin-only because it exposes
 * infrastructure state. The payload contains states and counters only: no
 * keys, endpoints, signing material or upstream error text.
 */
router.get('/operations', requireAdmin, asyncHandler(async (_req, res) => {
  const snapshot = await getOperationsHealth({
    supplier: async () => getSupplierRequestData(),
    payment: async () => ({ circuitState: getStripeCircuitState() }),
    contract: readContractHealth,
  });
  res.json(snapshot);
}));

export default router;
