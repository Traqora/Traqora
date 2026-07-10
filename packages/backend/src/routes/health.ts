import { Router } from 'express';
import { AppDataSource } from '../db/dataSource';
import { performanceMonitor } from '../monitoring/performance';

const router = Router();

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

export default router;
