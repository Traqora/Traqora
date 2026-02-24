import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';
import { initDataSource, AppDataSource } from '../../db/dataSource';
import { Flight } from '../../db/entities/Flight';

const router = Router();

export const flightRoutes = router;

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  await initDataSource();
  const repo = AppDataSource.getRepository(Flight);
  const flights = await repo.find({ order: { departureTime: 'ASC' } });
  res.json({ success: true, data: flights, total: flights.length });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();
  const repo = AppDataSource.getRepository(Flight);
  const flight = repo.create(req.body);
  const saved = await repo.save(flight);
  res.status(201).json({ success: true, data: saved });
}));
