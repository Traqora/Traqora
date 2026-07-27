import { Router, Request, Response } from "express";
import { asyncHandler } from "../../utils/errorHandler";
import { AppDataSource } from "../../db/dataSource";
import { Flight } from "../../db/entities/Flight";
import { z } from "zod";
import { FlightSearchService } from "../../services/flightSearchService";
import { CurrencyService } from "../../services/currencyService";
import { FareRulesService, FareClass } from "../../services/fareRulesService";
import { BadRequestError } from "../../utils/errors";
import { requireAuth } from "../../middleware/authMiddleware";
import { SearchHistoryEntry } from "../../db/entities/SearchHistoryEntry";
import { SavedSearch } from "../../db/entities/SavedSearch";

const searchQuerySchema = z
  .object({
    from: z.string().min(3).max(3).optional(),
    to: z.string().min(3).max(3).optional(),
    origin: z.string().min(3).max(3).optional(),
    destination: z.string().min(3).max(3).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    passengers: z.coerce.number().int().min(1).max(9),
    class: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
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
    stops: z
      .string()
      .optional()
      .transform((value: string | undefined) =>
        value
          ? value
              .split(",")
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 2)
          : undefined,
      ),
    duration_max: z.coerce.number().int().min(30).max(2000).optional(),
    sort: z
      .enum(["price", "duration", "departure_time", "rating"])
      .default("price"),
    sort_order: z.enum(["asc", "desc"]).optional(),
    cursor: z.string().optional(),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    currency: z.string().length(3).default("USD"),
  })
  .superRefine((query, ctx) => {
    const hasFromTo = Boolean(query.from && query.to);
    const hasOriginDestination = Boolean(query.origin && query.destination);

    if (!hasFromTo && !hasOriginDestination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either from/to or origin/destination",
      });
    }
  });

const convertSchema = z.object({
  amount: z.coerce.number().positive(),
  from: z.string().length(3),
  to: z.string().length(3),
});

const searchMemoryPayloadSchema = z.object({
  from: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  to: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.coerce.number().int().min(1).max(9),
  class: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
});

const savedSearchSchema = searchMemoryPayloadSchema.extend({
  name: z.string().trim().max(80).optional().or(z.literal("")),
});

const HISTORY_LIMIT = 10;
const HISTORY_PRUNE_KEEP = 50;
const SAVED_SEARCH_LIMIT = 25;

export const createFlightRoutes = (
  flightSearchService: FlightSearchService,
  searchRateLimitMiddleware?: any,
) => {
  const router = Router();
  const currencyService = CurrencyService.getInstance();
  const ensureAuthenticatedUser = (req: Request) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError("Authenticated user is required");
    }
    return walletAddress;
  };

  if (searchRateLimitMiddleware) {
    router.use("/search", searchRateLimitMiddleware);
  }

  router.get("/search", asyncHandler(async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Invalid search query parameters", parsed.error.flatten());
    }

    const q = parsed.data;
    if (
      q.price_min !== undefined &&
      q.price_max !== undefined &&
      q.price_min > q.price_max
    ) {
      throw new BadRequestError("price_min must be less than or equal to price_max");
    }

    const targetCurrency = q.currency.toUpperCase();

    try {
      const result = await flightSearchService.searchFlights({
        from: (q.origin || q.from || "").toUpperCase(),
        to: (q.destination || q.to || "").toUpperCase(),
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

      if (targetCurrency !== "USD") {
        const convertedData = await Promise.all(
          result.data.map(async (flight) => {
            const usdPrice = flight.pricing.usd;
            const xlmPrice = flight.pricing.xlm;
            try {
              const conversion = await currencyService.convert(usdPrice, "USD", targetCurrency);
              const xlmConversion = await currencyService.convert(xlmPrice, "USD", targetCurrency);
              return {
                ...flight,
                price: conversion.total,
                pricing: {
                  ...flight.pricing,
                  [targetCurrency.toLowerCase()]: conversion.total,
                  usd: usdPrice,
                  xlm: xlmPrice,
                },
                currency: targetCurrency,
              };
            } catch {
              return flight;
            }
          }),
        );
        return res.status(200).json({ ...result, data: convertedData });
      }

      return res.status(200).json(result);
    } catch (error: any) {
      throw new BadRequestError(error.message || "Invalid request");
    }
  }));

  router.get(
    "/search/history",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const walletAddress = ensureAuthenticatedUser(req);
      const historyRepo = AppDataSource.getRepository(SearchHistoryEntry);
      const history = await historyRepo.find({
        where: { userId: walletAddress },
        order: { createdAt: "DESC" },
        take: HISTORY_LIMIT,
      });
      res.json({ success: true, data: history });
    }),
  );

  router.post(
    "/search/history",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const walletAddress = ensureAuthenticatedUser(req);
      const parsed = searchMemoryPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError("Validation error", parsed.error.flatten());
      }

      const historyRepo = AppDataSource.getRepository(SearchHistoryEntry);
      const payload = parsed.data;
      const existing = await historyRepo.findOne({
        where: {
          userId: walletAddress,
          fromAirport: payload.from,
          toAirport: payload.to,
          departureDate: payload.date,
          passengers: payload.passengers,
          cabinClass: payload.class,
        },
      });

      if (existing) {
        await historyRepo.remove(existing);
      }

      const historyEntry = historyRepo.create({
        userId: walletAddress,
        fromAirport: payload.from,
        toAirport: payload.to,
        departureDate: payload.date,
        passengers: payload.passengers,
        cabinClass: payload.class,
      });
      const saved = await historyRepo.save(historyEntry);

      const allIds = await historyRepo.find({
        where: { userId: walletAddress },
        select: { id: true },
        order: { createdAt: "DESC" },
      });
      if (allIds.length > HISTORY_PRUNE_KEEP) {
        const staleIds = allIds.slice(HISTORY_PRUNE_KEEP).map((entry) => entry.id);
        if (staleIds.length > 0) {
          await historyRepo.delete(staleIds);
        }
      }

      res.status(201).json({ success: true, data: saved });
    }),
  );

  router.delete(
    "/search/history/:id",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const walletAddress = ensureAuthenticatedUser(req);
      const historyRepo = AppDataSource.getRepository(SearchHistoryEntry);
      const entry = await historyRepo.findOne({ where: { id: req.params.id, userId: walletAddress } });
      if (!entry) {
        return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Search history entry not found" } });
      }
      await historyRepo.remove(entry);
      return res.status(204).send();
    }),
  );

  router.get(
    "/saved-searches",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const walletAddress = ensureAuthenticatedUser(req);
      const savedSearchRepo = AppDataSource.getRepository(SavedSearch);
      const savedSearches = await savedSearchRepo.find({
        where: { userId: walletAddress },
        order: { updatedAt: "DESC" },
      });
      res.json({ success: true, data: savedSearches });
    }),
  );

  router.post(
    "/saved-searches",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const walletAddress = ensureAuthenticatedUser(req);
      const parsed = savedSearchSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError("Validation error", parsed.error.flatten());
      }

      const savedSearchRepo = AppDataSource.getRepository(SavedSearch);
      const existingCount = await savedSearchRepo.count({ where: { userId: walletAddress } });
      if (existingCount >= SAVED_SEARCH_LIMIT) {
        throw new BadRequestError(`Saved search limit reached (${SAVED_SEARCH_LIMIT})`);
      }

      const payload = parsed.data;
      const savedSearch = savedSearchRepo.create({
        userId: walletAddress,
        name: payload.name?.trim() || null,
        fromAirport: payload.from,
        toAirport: payload.to,
        departureDate: payload.date,
        passengers: payload.passengers,
        cabinClass: payload.class,
      });
      const saved = await savedSearchRepo.save(savedSearch);
      res.status(201).json({ success: true, data: saved });
    }),
  );

  router.put(
    "/saved-searches/:id",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const walletAddress = ensureAuthenticatedUser(req);
      const parsed = savedSearchSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError("Validation error", parsed.error.flatten());
      }

      const savedSearchRepo = AppDataSource.getRepository(SavedSearch);
      const savedSearch = await savedSearchRepo.findOne({ where: { id: req.params.id, userId: walletAddress } });
      if (!savedSearch) {
        return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Saved search not found" } });
      }

      const payload = parsed.data;
      savedSearch.name = payload.name?.trim() || null;
      savedSearch.fromAirport = payload.from;
      savedSearch.toAirport = payload.to;
      savedSearch.departureDate = payload.date;
      savedSearch.passengers = payload.passengers;
      savedSearch.cabinClass = payload.class;
      const updated = await savedSearchRepo.save(savedSearch);
      res.json({ success: true, data: updated });
    }),
  );

  router.delete(
    "/saved-searches/:id",
    requireAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const walletAddress = ensureAuthenticatedUser(req);
      const savedSearchRepo = AppDataSource.getRepository(SavedSearch);
      const savedSearch = await savedSearchRepo.findOne({ where: { id: req.params.id, userId: walletAddress } });
      if (!savedSearch) {
        return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Saved search not found" } });
      }
      await savedSearchRepo.remove(savedSearch);
      return res.status(204).send();
    }),
  );

  router.get(
    "/price-trend",
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = z
        .object({
          from: z.string().min(3).max(3),
          to: z.string().min(3).max(3),
          days: z.coerce.number().int().min(2).max(60).default(14),
        })
        .safeParse(req.query);

      if (!parsed.success) {
        throw new BadRequestError("Invalid price trend query parameters", parsed.error.flatten());
      }

      const { from, to, days } = parsed.data;
      const trend = buildMockPriceTrend(from.toUpperCase(), to.toUpperCase(), days);
      res.json({ success: true, data: trend });
    }),
  );

  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response) => {
      const repo = AppDataSource.getRepository(Flight);
      const flights = await repo.find({ order: { departureTime: "ASC" } });
      res.json({ success: true, data: flights, total: flights.length });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const repo = AppDataSource.getRepository(Flight);
      const flight = repo.create(req.body);
      const saved = await repo.save(flight);
      res.status(201).json({ success: true, data: saved });
    }),
  );

  router.post("/convert", asyncHandler(async (req, res) => {
    const parsed = convertSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid conversion parameters", parsed.error.flatten());
    }

    const { amount, from, to } = parsed.data;

    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(from.toUpperCase() as any)) {
      throw new BadRequestError(`Unsupported currency: ${from}`);
    }
    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(to.toUpperCase() as any)) {
      throw new BadRequestError(`Unsupported currency: ${to}`);
    }

    const result = await currencyService.convert(amount, from, to);
    res.json({ success: true, data: result });
  }));

  router.get("/convert", asyncHandler(async (req, res) => {
    const parsed = convertSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Invalid conversion parameters", parsed.error.flatten());
    }

    const { amount, from, to } = parsed.data;

    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(from.toUpperCase() as any)) {
      throw new BadRequestError(`Unsupported currency: ${from}`);
    }
    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(to.toUpperCase() as any)) {
      throw new BadRequestError(`Unsupported currency: ${to}`);
    }

    const result = await currencyService.convert(amount, from, to);
    res.json({ success: true, data: result });
  }));

  router.get("/currencies", asyncHandler(async (_req, res) => {
    const currencies = currencyService.getSupportedCurrencies().map((code) => ({
      code,
      ...CurrencyService.CURRENCY_CONFIG[code],
    }));
    res.json({ success: true, data: currencies });
  }));

  router.get("/currencies/rates", asyncHandler(async (req, res) => {
    const base = (req.query.base as string || "USD").toUpperCase();
    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(base as any)) {
      throw new BadRequestError(`Unsupported base currency: ${base}`);
    }
    const rates = await currencyService.getRates(base);
    res.json({ success: true, data: { base, rates, timestamp: new Date() } });
  }));

  router.get("/fare-rules", asyncHandler(async (req, res) => {
    const schema = z.object({
      airline: z.string().min(2).max(3),
      class: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Validation error", parsed.error.flatten());
    }

    const fareService = new FareRulesService();
    const mockFlight = new Flight();
    mockFlight.airlineCode = parsed.data.airline.toUpperCase();
    mockFlight.rawData = { fareClass: parsed.data.class || 'economy' };

    const rules = fareService.getApplicableFareRules(mockFlight, parsed.data.class as FareClass);
    res.json({ success: true, data: rules });
  }));

  return router;
};

interface PriceTrendPoint {
  date: string;
  price: number;
}

interface PriceTrend {
  from: string;
  to: string;
  points: PriceTrendPoint[];
  currentPrice: number;
  changePercent: number;
}

/**
 * Deterministic pseudo-random price history for a route, since no historical
 * price-data pipeline exists yet. Seeded from the route pair so repeated
 * requests for the same route are stable.
 */
function buildMockPriceTrend(from: string, to: string, days: number): PriceTrend {
  const seed = `${from}-${to}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const basePrice = 150 + (seed % 350);

  let rngState = seed;
  const next = () => {
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
    return rngState / 0x7fffffff;
  };

  const points: PriceTrendPoint[] = [];
  let price = basePrice;
  const today = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const drift = (next() - 0.5) * 30;
    price = Math.max(60, Math.round(price + drift));
    points.push({ date: date.toISOString().split("T")[0], price });
  }

  const currentPrice = points[points.length - 1].price;
  const firstPrice = points[0].price;
  const changePercent = Math.round(((currentPrice - firstPrice) / firstPrice) * 1000) / 10;

  return { from, to, points, currentPrice, changePercent };
}
