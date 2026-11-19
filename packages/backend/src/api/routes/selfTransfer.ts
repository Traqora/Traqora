import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { In } from 'typeorm';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { AppDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import { analyzeItinerary } from '../../services/selfTransferService';
import { logger } from '../../utils/logger';

const router = Router();

const analyzeQuerySchema = z.object({
  bookingIds: z
    .string()
    .min(1, 'bookingIds is required (comma-separated booking IDs)'),
});

router.get(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = analyzeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const walletAddress = (req as any).user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet address not found');
    }

    const bookingIds = parsed.data.bookingIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (bookingIds.length === 0) {
      throw new BadRequestError('At least one booking ID is required');
    }

    const bookingRepo = AppDataSource.getRepository(Booking);
    const bookings = await bookingRepo.find({
      where: { id: In(bookingIds) },
      relations: ['flight', 'passenger'],
    });

    if (bookings.length !== bookingIds.length) {
      const found = new Set(bookings.map((b) => b.id));
      const missing = bookingIds.filter((id) => !found.has(id));
      throw new NotFoundError(
        `Booking(s) not found: ${missing.join(', ')}`
      );
    }

    // Verify ownership: every booking must belong to the authenticated
    // passenger (wallet address matches passenger soroban address).
    const notOwned = bookings.filter(
      (b) => b.passenger?.sorobanAddress !== walletAddress
    );
    if (notOwned.length > 0) {
      logger.warn('Self-transfer analysis requested for bookings owned by another passenger', {
        walletAddress,
        bookingIds: notOwned.map((b) => b.id),
      });
      throw new BadRequestError('One or more bookings do not belong to you');
    }

    const inputs = bookings.map((b) => ({
      bookingId: b.id,
      bookingReference: b.bookingReference ?? null,
      passengerEmail: b.passenger?.email ?? '',
      flightNumber: b.flight?.flightNumber ?? '',
      airline: b.flight?.airlineCode ?? '',
      fromAirport: b.flight?.fromAirport ?? '',
      toAirport: b.flight?.toAirport ?? '',
      departure: b.flight?.departureTime?.toISOString() ?? '',
      arrival: b.flight?.arrivalTime?.toISOString() ?? '',
    }));

    const inputsWithFlights = inputs.filter(
      (i) => i.flightNumber && i.fromAirport && i.toAirport && i.departure
    );
    if (inputsWithFlights.length !== inputs.length) {
      throw new BadRequestError(
        'One or more bookings are missing flight details and cannot be analyzed'
      );
    }

    const itinerary = analyzeItinerary(inputsWithFlights);

    return res.json({
      success: true,
      data: {
        itinerary,
        analyzedAt: itinerary.generatedAt,
      },
    });
  })
);

export default router;
