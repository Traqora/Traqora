import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { Flight } from '../../db/entities/Flight';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { createAirlineSchema } from '../schemas';

const router = Router();
const airlineMetadata: Record<string, { airlineCode: string; airlineName: string; airlineSorobanAddress?: string }> = {};

const normalizeCode = (code: string) => code.trim().toUpperCase();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const flightRepo = AppDataSource.getRepository(Flight);
    const airlineRows = await flightRepo
      .createQueryBuilder('flight')
      .select('flight.airlineCode', 'code')
      .addSelect('COUNT(*)', 'flightCount')
      .groupBy('flight.airlineCode')
      .getRawMany();

    const airlines = airlineRows.map((row) => ({
      code: row.code,
      flightCount: Number(row.flightCount),
      name: airlineMetadata[row.code]?.airlineName || null,
      sorobanAddress: airlineMetadata[row.code]?.airlineSorobanAddress || null,
    }));

    return res.json({ success: true, data: airlines });
  }),
);

router.get(
  '/:code',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const code = normalizeCode(req.params.code);
    if (!code) {
      throw new BadRequestError('Airline code is required');
    }

    const flightRepo = AppDataSource.getRepository(Flight);
    const flights = await flightRepo.find({ where: { airlineCode: code }, take: 5 });
    if (flights.length === 0 && !airlineMetadata[code]) {
      throw new NotFoundError('Airline not found');
    }

    return res.json({
      success: true,
      data: {
        code,
        name: airlineMetadata[code]?.airlineName || null,
        sorobanAddress: airlineMetadata[code]?.airlineSorobanAddress || null,
        flightSamples: flights,
      },
    });
  }),
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createAirlineSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const code = normalizeCode(parsed.data.airlineCode);
    airlineMetadata[code] = {
      airlineCode: code,
      airlineName: parsed.data.airlineName,
      airlineSorobanAddress: parsed.data.airlineSorobanAddress,
    };

    return res.status(201).json({ success: true, data: airlineMetadata[code] });
  }),
);

export const airlineRoutes = router;
