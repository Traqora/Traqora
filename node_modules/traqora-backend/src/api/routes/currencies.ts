import { Router } from "express";
import { asyncHandler } from "../../utils/errorHandler";
import { CurrencyService } from "../../services/currencyService";
import { PriceOracleService, SupportedCurrency } from "../../services/PriceOracleService";
import { VolatilityService, IPriceHistorySimple } from "../../services/VolatilityService";
import { BadRequestError } from "../../utils/errors";
import { cacheResponse } from "../../services/cache";
import { z } from "zod";

const convertQuerySchema = z.object({
  amount: z.coerce.number().positive(),
  from: z.string().length(3),
  to: z.string().length(3),
});

const ratesQuerySchema = z.object({
  base: z.string().length(3).default("USD"),
});

const volatilitySchema = z.object({
  flightId: z.string(),
  currentPrice: z.coerce.number().positive(),
});

export const createCurrencyRoutes = () => {
  const router = Router();
  const currencyService = CurrencyService.getInstance();
  const priceOracle = PriceOracleService.getInstance();

  router.get("/", cacheResponse(), asyncHandler(async (_req, res) => {
    const currencies = currencyService.getSupportedCurrencies().map((code) => ({
      code,
      ...CurrencyService.CURRENCY_CONFIG[code],
    }));
    res.json({ success: true, data: currencies });
  }));

  router.get("/rates", cacheResponse(), asyncHandler(async (req, res) => {
    const parsed = ratesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError("Invalid parameters", parsed.error.flatten());
    }
    const base = parsed.data.base.toUpperCase();
    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(base as any)) {
      throw new BadRequestError(`Unsupported base currency: ${base}`);
    }
    const rates = await currencyService.getRates(base);
    res.json({ success: true, data: { base, rates, timestamp: new Date() } });
  }));

  router.get("/oracle-rates", asyncHandler(async (_req, res) => {
    // Fetch real-time rates from oracle
    await priceOracle.fetchExchangeRates();
    res.json({ success: true, message: "Rates updated from oracle" });
  }));

  router.get("/convert", asyncHandler(async (req, res) => {
    const parsed = convertQuerySchema.safeParse(req.query);
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

  router.post("/convert", asyncHandler(async (req, res) => {
    const parsed = convertQuerySchema.safeParse(req.body);
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
    
    // Use PriceOracle for conversion with slippage protection
    const quote = priceOracle.convertCurrency(
      amount,
      from.toUpperCase() as SupportedCurrency,
      to.toUpperCase() as SupportedCurrency
    );
    
    res.json({ success: true, data: quote });
  }));

  router.post("/volatility-check", asyncHandler(async (req, res) => {
    const parsed = volatilitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError("Invalid volatility check parameters", parsed.error.flatten());
    }
    
    const { flightId, currentPrice } = parsed.data;
    
    // Get historical prices for volatility check
    const priceHistory = await priceOracle.getHistoricalPrices(flightId, 30);
    
    // Convert to IPriceHistorySimple format
    const history: IPriceHistorySimple[] = priceHistory.map(ph => ({
      price: ph.price,
      timestamp: ph.date
    }));
    
    const volatilityCheck = VolatilityService.checkVolatility(currentPrice, history);
    
    res.json({ success: true, data: volatilityCheck });
  }));

  router.get("/flight-prices", asyncHandler(async (req, res) => {
    const flightIds = req.query.flightIds as string;
    const currency = (req.query.currency as string) || 'USD';
    
    if (!flightIds) {
      throw new BadRequestError("flightIds parameter is required");
    }
    
    const flightIdArray = flightIds.split(',');
    const prices = await priceOracle.fetchPrices(
      flightIdArray,
      currency.toUpperCase() as SupportedCurrency
    );
    
    res.json({ success: true, data: prices });
  }));

  return router;
};
