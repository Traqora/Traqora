import { Router } from 'express';
import Redis from 'ioredis';
import { Horizon } from '@stellar/stellar-sdk';
import { AppDataSource } from '../db/dataSource';
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
  const db = AppDataSource.isInitialized ? 'ok' : 'unavailable';
  const status = db === 'ok' ? 200 : 503;
  res.status(status).json({ status: db === 'ok' ? 'ok' : 'degraded', db });
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

export default router;
