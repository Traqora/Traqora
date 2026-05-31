import { Router } from 'express';
import { AppDataSource, initDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import { Flight } from '../../db/entities/Flight';
import { IdempotencyKey } from '../../db/entities/IdempotencyKey';
import { Passenger } from '../../db/entities/Passenger';
import { asyncHandler } from '../../utils/errorHandler';

export const e2eRoutes = Router();

e2eRoutes.use((_req, res, next) => {
  if (process.env.E2E_TEST_MODE !== 'true') {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  }

  return next();
});

e2eRoutes.post(
  '/reset',
  asyncHandler(async (_req, res) => {
    await initDataSource();

    await AppDataSource.getRepository(Booking).clear();
    await AppDataSource.getRepository(IdempotencyKey).clear();
    await AppDataSource.getRepository(Passenger).clear();
    await AppDataSource.getRepository(Flight).clear();

    const departureTime = new Date('2026-07-15T14:00:00.000Z');
    const arrivalTime = new Date('2026-07-15T20:05:00.000Z');
    const flight = await AppDataSource.getRepository(Flight).save({
      flightNumber: 'TQ156',
      airlineCode: 'DL',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime,
      arrivalTime,
      seatsAvailable: 6,
      priceCents: 45000,
      airlineSorobanAddress: 'GAIRLINEE2E0000000000000000000000000000000000000000',
      status: 'SCHEDULED',
      dataSource: 'E2E',
      syncStatus: 'EXACT_MATCH',
    });

    return res.status(201).json({ success: true, data: { flight } });
  })
);

e2eRoutes.get(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    await initDataSource();

    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: req.params.id },
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND' } });
    }

    return res.json({ success: true, data: booking });
  })
);
