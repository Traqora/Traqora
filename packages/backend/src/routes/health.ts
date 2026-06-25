import { Router } from 'express';
import { AppDataSource } from '../db/dataSource';

const router = Router();

router.get('/', async (_req, res) => {
  const db = AppDataSource.isInitialized ? 'ok' : 'unavailable';
  const status = db === 'ok' ? 200 : 503;
  res.status(status).json({ status: db === 'ok' ? 'ok' : 'degraded', db });
});

export default router;
