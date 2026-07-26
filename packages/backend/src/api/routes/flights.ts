import { Router, Request, Response } from "express";
import { asyncHandler } from "../../utils/errorHandler";
import { AppDataSource } from "../../db/dataSource";
import { Flight } from "../../db/entities/Flight";
import { z } from "zod";
import { FlightSearchService } from "../../services/flightSearchService";
import { CurrencyService } from "../../services/currencyService";
import { BadRequestError } from "../../utils/errors";

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
    stops: z.coerce.number().int().min(0).max(2).optional(),
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

export const createFlightRoutes = (
  flightSearchService: FlightSearchService,
  searchRateLimitMiddleware?: any,
) => {
  const router = Router();
  const currencyService = CurrencyService.getInstance();

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

  return router;
};
