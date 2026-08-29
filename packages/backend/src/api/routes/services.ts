import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authMiddleware";
import { asyncHandler } from "../../utils/errorHandler";
import { AppDataSource } from "../../db/dataSource";
import { Booking } from "../../db/entities/Booking";
import { logger } from "../../utils/logger";
import { seatAvailabilityService } from "../../services/seatAvailabilityService";
import { inflightServicesService } from "../../services/inflightServicesService";

const router = Router();

// ── Seat Selection ────────────────────────────────────────────────────────────

const seatPreferenceSchema = z.object({
  bookingId: z.string().uuid(),
  seatNumber: z
    .string()
    .regex(/^[0-9]{1,2}[A-F]$/, "Invalid seat number (e.g. 12A)"),
  preference: z.enum(["window", "aisle", "middle", "extra_legroom"]).optional(),
});

const seatLockSchema = z.object({
  flightId: z.string().uuid(),
  seatNumber: z.string().regex(/^[0-9]{1,2}[A-F]$/, "Invalid seat number"),
  bookingId: z.string().uuid(),
});

/**
 * GET /api/services/seats/:flightId
 * Get complete seat availability map for a flight with real-time occupancy
 */
router.get(
  "/seats/:flightId",
  asyncHandler(async (req: Request, res: Response) => {
    const { cabinClass } = req.query;
    const availability = await seatAvailabilityService.getSeatAvailability(
      req.params.flightId,
      (cabinClass as any) || undefined,
    );

    return res.json(availability);
  }),
);

/**
 * GET /api/services/seats/:flightId/available
 * Get available seats for a specific cabin class
 */
router.get(
  "/seats/:flightId/available",
  asyncHandler(async (req: Request, res: Response) => {
    const { cabinClass } = req.query;

    if (!cabinClass) {
      return res
        .status(400)
        .json({ error: "cabinClass query parameter required" });
    }

    const availableSeats =
      await seatAvailabilityService.getAvailableSeatsByClass(
        req.params.flightId,
        cabinClass as any,
      );

    return res.json({
      flightId: req.params.flightId,
      cabinClass,
      availableSeats,
      totalAvailable: availableSeats.length,
    });
  }),
);

/**
 * POST /api/services/seat/lock
 * Lock a seat temporarily (15 minutes) to prevent others from booking
 */
router.post(
  "/seat/lock",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = seatLockSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { flightId, seatNumber, bookingId } = parsed.data;
    await seatAvailabilityService.lockSeat(flightId, seatNumber, bookingId);

    return res.json({
      flightId,
      seatNumber,
      bookingId,
      locked: true,
      expiresInMinutes: 15,
      message: "Seat locked successfully",
    });
  }),
);

/**
 * POST /api/services/seat/unlock
 * Release a seat lock
 */
router.post(
  "/seat/unlock",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = seatLockSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { flightId, seatNumber, bookingId } = parsed.data;
    await seatAvailabilityService.releaseSeatLock(
      flightId,
      seatNumber,
      bookingId,
    );

    return res.json({
      flightId,
      seatNumber,
      bookingId,
      locked: false,
      message: "Seat lock released",
    });
  }),
);

/**
 * POST /api/services/seat
 * Select a seat for a booking (permanent booking)
 */
router.post(
  "/seat",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = seatPreferenceSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, seatNumber, preference } = parsed.data;

    // Get booking to access flight ID
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Calculate seat price
    const availability = await seatAvailabilityService.getSeatAvailability(
      booking.flight.id,
    );
    const [rowStr, col] = [seatNumber.slice(0, -1), seatNumber.slice(-1)];
    const row = parseInt(rowStr);
    const seatPrice = availability.seatMap[row]?.[col]?.price || 1500;

    // Select seat in service
    await seatAvailabilityService.selectSeat(
      bookingId,
      booking.flight.id,
      seatNumber,
      seatPrice,
      preference,
    );

    return res.json({
      bookingId,
      flightId: booking.flight.id,
      seatNumber,
      seatPrice,
      preference: preference ?? null,
      message: "Seat selection confirmed",
    });
  }),
);

// ── In-flight Services ────────────────────────────────────────────────────────

const mealsSchema = z.object({
  bookingId: z.string().uuid(),
  meals: z
    .array(
      z.object({
        mealId: z.string(),
        dietary: z
          .enum([
            "vegetarian",
            "vegan",
            "halal",
            "kosher",
            "gluten_free",
            "dairy_free",
            "nut_free",
            "low_sodium",
            "diabetic",
          ])
          .optional(),
        quantity: z.number().int().positive().max(10).default(1),
        specialInstructions: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

const wifiSchema = z.object({
  bookingId: z.string().uuid(),
  wifi: z
    .array(
      z.object({
        wifiId: z.string(),
        packageType: z.enum(["hourly", "daily", "monthly", "fullFlight"]),
        quantity: z.number().int().positive().default(1),
      }),
    )
    .min(1),
});

const baggageSchema = z.object({
  bookingId: z.string().uuid(),
  baggage: z
    .array(
      z.object({
        baggageId: z.string(),
        pieces: z.number().int().positive().max(5),
        baggageType: z.enum([
          "standard",
          "oversized",
          "sports_equipment",
          "fragile",
        ]),
      }),
    )
    .min(1),
});

const entertainmentSchema = z.object({
  bookingId: z.string().uuid(),
  entertainment: z
    .array(
      z.object({
        entertainmentId: z.string(),
        quantity: z.number().int().positive().default(1),
      }),
    )
    .min(1),
});

/**
 * GET /api/services/catalog
 * Get the service catalog for available meals, WiFi, baggage, entertainment
 */
router.get(
  "/catalog",
  asyncHandler(async (req: Request, res: Response) => {
    const { cabinClass } = req.query;

    if (!cabinClass) {
      return res
        .status(400)
        .json({ error: "cabinClass query parameter required" });
    }

    const catalog = await inflightServicesService.getServicesCatalog(
      cabinClass as any,
    );

    return res.json(catalog);
  }),
);

/**
 * POST /api/services/meals
 * Add meals to a booking
 */
router.post(
  "/meals",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = mealsSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, meals } = parsed.data;
    const mealOrders = await inflightServicesService.addMeals(bookingId, meals);

    logger.info("Meals added to booking", { bookingId, count: meals.length });

    return res.json({
      bookingId,
      meals: mealOrders,
      message: "Meals added successfully",
    });
  }),
);

/**
 * POST /api/services/wifi
 * Add WiFi service to a booking
 */
router.post(
  "/wifi",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = wifiSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, wifi } = parsed.data;
    const wifiOrders = await inflightServicesService.addWiFi(bookingId, wifi);

    logger.info("WiFi added to booking", { bookingId, count: wifi.length });

    return res.json({
      bookingId,
      wifi: wifiOrders,
      message: "WiFi service added successfully",
    });
  }),
);

/**
 * POST /api/services/baggage
 * Add baggage service to a booking
 */
router.post(
  "/baggage",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = baggageSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, baggage } = parsed.data;
    const baggageOrders = await inflightServicesService.addBaggage(
      bookingId,
      baggage,
    );

    logger.info("Baggage added to booking", {
      bookingId,
      count: baggage.length,
    });

    return res.json({
      bookingId,
      baggage: baggageOrders,
      message: "Baggage service added successfully",
    });
  }),
);

/**
 * POST /api/services/entertainment
 * Add entertainment service to a booking
 */
router.post(
  "/entertainment",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = entertainmentSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, entertainment } = parsed.data;
    const entertainmentOrders = await inflightServicesService.addEntertainment(
      bookingId,
      entertainment,
    );

    logger.info("Entertainment added to booking", {
      bookingId,
      count: entertainment.length,
    });

    return res.json({
      bookingId,
      entertainment: entertainmentOrders,
      message: "Entertainment service added successfully",
    });
  }),
);

/**
 * GET /api/services/inflight/:bookingId
 * List all in-flight services for a booking
 */
router.get(
  "/inflight/:bookingId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const services = await inflightServicesService.getBookingServices(
      req.params.bookingId,
    );

    return res.json(services);
  }),
);

/**
 * POST /api/services/pricing
 * Calculate total pricing with all services included
 */
router.post(
  "/pricing",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId is required" });
    }

    const services =
      await inflightServicesService.getBookingServices(bookingId);
    const pricing = inflightServicesService.calculateServicePricing(services);

    return res.json(pricing);
  }),
);

/**
 * DELETE /api/services/:serviceType/:serviceId
 * Remove a service from a booking
 */
router.delete(
  "/:bookingId/:serviceType/:serviceId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { bookingId, serviceType, serviceId } = req.params;

    await inflightServicesService.removeService(
      bookingId,
      serviceType,
      serviceId,
    );

    return res.json({
      bookingId,
      serviceType,
      serviceId,
      message: "Service removed successfully",
    });
  }),
);

// ── Legacy In-flight Services (Backward Compatibility) ────────────────────────

const inFlightServiceSchema = z.object({
  bookingId: z.string().uuid(),
  services: z
    .array(
      z.object({
        type: z.enum(["meal", "wifi", "extra_baggage", "entertainment"]),
        option: z.string().max(100),
        quantity: z.number().int().positive().max(10).default(1),
      }),
    )
    .min(1),
});

/**
 * POST /api/services/inflight (legacy)
 * Add in-flight services to a booking (backward compatibility)
 */
router.post(
  "/inflight",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = inFlightServiceSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { bookingId, services } = parsed.data;
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { id: bookingId } });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const meta: Record<string, unknown> = (booking as any).metadata ?? {};
    const existing: unknown[] = Array.isArray(meta.inflightServices)
      ? (meta.inflightServices as unknown[])
      : [];
    meta.inflightServices = [
      ...existing,
      ...services.map((s) => ({ ...s, addedAt: new Date().toISOString() })),
    ];
    (booking as any).metadata = meta;

    await bookingRepo.save(booking);
    logger.info("In-flight services added", {
      bookingId,
      count: services.length,
    });

    return res.json({
      bookingId,
      inflightServices: meta.inflightServices,
      message: "In-flight services added successfully",
    });
  }),
);

export default router;
