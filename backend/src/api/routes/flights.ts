import { Router, Request, Response } from "express";
import { asyncHandler } from "../../utils/errorHandler";
import { initDataSource, AppDataSource } from "../../db/dataSource";
import { Flight } from "../../db/entities/Flight";
import { z } from "zod";
import { FlightSearchService } from "../../services/flightSearchService";

const router = Router();

export const flightRoutes = router;

const searchQuerySchema = z.object({
  from: z.string().min(3).max(3),
  to: z.string().min(3).max(3),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.coerce.number().int().min(1).max(9),
  class: z.enum(["economy", "premium_economy", "business", "first"]),
  price_min: z.coerce.number().int().nonnegative().optional(),
  price_max: z.coerce.number().int().nonnegative().optional(),
  airlines: z
    .string()
    .optional()
    .transform((value: string | undefined) =>
      value
        ? value.split(",").map((airline: string) => airline.trim())
        : undefined,
    ),
  stops: z.coerce.number().int().min(0).max(2).optional(),
  duration_max: z.coerce.number().int().min(30).max(2000).optional(),
  sort: z
    .enum(["price", "duration", "departure_time", "rating"])
    .default("price"),
  sort_order: z.enum(["asc", "desc"]).optional(),
  cursor: z.string().optional(),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const createFlightRoutes = (
  flightSearchService: FlightSearchService,
  searchRateLimitMiddleware?: any,
) => {
  const router = Router();

  if (searchRateLimitMiddleware) {
    router.use("/search", searchRateLimitMiddleware);
  }

  router.get("/search", async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid search query parameters",
          details: parsed.error.flatten(),
        },
      });
    }

    const q = parsed.data;
    if (
      q.price_min !== undefined &&
      q.price_max !== undefined &&
      q.price_min > q.price_max
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "price_min must be less than or equal to price_max",
        },
      });
    }

    try {
      const result = await flightSearchService.searchFlights({
        from: q.from,
        to: q.to,
        date: q.date,
        passengers: q.passengers,
        travelClass: q.class,
        priceMin: q.price_min,
        priceMax: q.price_max,
        airlines: q.airlines,
        stops: q.stops,
        durationMax: q.duration_max,
        sortBy: q.sort,
        sortOrder: q.sort_order,
        cursor: q.cursor,
        pageSize: q.page_size,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: error.message || "Invalid request",
        },
      });
    }
  });

  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response) => {
      await initDataSource();
      const repo = AppDataSource.getRepository(Flight);
      const flights = await repo.find({ order: { departureTime: "ASC" } });
      res.json({ success: true, data: flights, total: flights.length });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      await initDataSource();
      const repo = AppDataSource.getRepository(Flight);
      const flight = repo.create(req.body);
      const saved = await repo.save(flight);
      res.status(201).json({ success: true, data: saved });
    }),
  );

  return router;
};
