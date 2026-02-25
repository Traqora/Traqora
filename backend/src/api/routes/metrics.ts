import { Router, Request, Response } from 'express';
import { register, updateSystemHealth } from '../../services/metrics';
import { AppDataSource } from '../../db/dataSource';
import { logger } from '../../utils/logger';

const router = Router();

// Prometheus metrics endpoint
router.get('/', async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error: any) {
    logger.error('Error generating metrics', { error: error.message });
    res.status(500).end('Error generating metrics');
  }
});

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: false,
      memory: false,
    },
  };

  try {
    // Check database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.query('SELECT 1');
      health.checks.database = true;
      updateSystemHealth('database', true);
    } else {
      updateSystemHealth('database', false);
    }
  } catch (error: any) {
    logger.error('Database health check failed', { error: error.message });
    health.checks.database = false;
    health.status = 'unhealthy';
    updateSystemHealth('database', false);
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  health.checks.memory = memUsagePercent < 90;
  updateSystemHealth('memory', health.checks.memory);

  if (!health.checks.memory) {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness check endpoint
router.get('/ready', async (req: Request, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      return res.status(503).json({ ready: false, reason: 'Database not initialized' });
    }

    await AppDataSource.query('SELECT 1');
    res.json({ ready: true });
  } catch (error: any) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({ ready: false, reason: error.message });
  }
});

// Liveness check endpoint
router.get('/live', (req: Request, res: Response) => {
  res.json({ alive: true });
});

export const metricsRoutes = router;
