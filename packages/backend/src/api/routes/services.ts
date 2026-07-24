import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import { logger } from '../../utils/logger';

const router = Router();

// ── Seat Selection ────────────────────────────────────────────────────────────

const seatPreferenceSchema = z.object({
  bookingId: z.string().uuid(),
  seatNumber: z.string().regex(/^[0-9]{1,2}[A-F]$/, 'Invalid seat number (e.g. 12A)'),
  preference: z.enum(['window', 'aisle', 'middle', 'extra_legroom']).optional(),
});

/**
 * POST /api/services/seat
 * Select a seat for a booking.
 */
router.post(
  '/seat',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = seatPreferenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, seatNumber, preference } = parsed.data;
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: bookingId } });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Store seat selection in booking metadata
    const meta: Record<string, unknown> = (booking as any).metadata ?? {};
    meta.seatNumber = seatNumber;
    meta.seatPreference = preference ?? null;
    meta.seatSelectedAt = new Date().toISOString();
    (booking as any).metadata = meta;

    await bookingRepo.save(booking);
    logger.info('Seat selected', { bookingId, seatNumber, preference });

    return res.json({
      bookingId,
      seatNumber,
      preference: preference ?? null,
      message: 'Seat selection confirmed',
    });
  }),
);

/**
 * GET /api/services/seats/:flightId
 * Return seat availability map for a flight.
 */
router.get(
  '/seats/:flightId',
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const bookings = await bookingRepo.find({
      where: { flightId: req.params.flightId },
    });

    const takenSeats = bookings
      .map((b) => ((b as any).metadata as Record<string, unknown>)?.seatNumber as string)
      .filter(Boolean);

    return res.json({ flightId: req.params.flightId, takenSeats });
  }),
);

// ── In-flight Services ────────────────────────────────────────────────────────

const inFlightServiceSchema = z.object({
  bookingId: z.string().uuid(),
  services: z.array(
    z.object({
      type: z.enum(['meal', 'wifi', 'extra_baggage', 'entertainment']),
      option: z.string().max(100),
      quantity: z.number().int().positive().max(10).default(1),
    }),
  ).min(1),
});

/**
 * POST /api/services/inflight
 * Add in-flight services to a booking.
 */
router.post(
  '/inflight',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = inFlightServiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, services } = parsed.data;
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: bookingId } });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const meta: Record<string, unknown> = (booking as any).metadata ?? {};
    const existing: unknown[] = Array.isArray(meta.inflightServices) ? meta.inflightServices as unknown[] : [];
    meta.inflightServices = [
      ...existing,
      ...services.map((s) => ({ ...s, addedAt: new Date().toISOString() })),
    ];
    (booking as any).metadata = meta;

    await bookingRepo.save(booking);
    logger.info('In-flight services added', { bookingId, count: services.length });

    return res.json({
      bookingId,
      inflightServices: meta.inflightServices,
      message: 'In-flight services added successfully',
    });
  }),
);

/**
 * GET /api/services/inflight/:bookingId
 * List in-flight services for a booking.
 */
router.get(
  '/inflight/:bookingId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: req.params.bookingId } });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const meta: Record<string, unknown> = (booking as any).metadata ?? {};
    return res.json({
      bookingId: req.params.bookingId,
      seatNumber: meta.seatNumber ?? null,
      seatPreference: meta.seatPreference ?? null,
      inflightServices: meta.inflightServices ?? [],
    });
  }),
);

export default router;
