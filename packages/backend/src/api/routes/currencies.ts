import { Router } from "express";
import { asyncHandler } from "../../utils/errorHandler";
import { CurrencyService } from "../../services/currencyService";
import { BadRequestError } from "../../utils/errors";
import { z } from "zod";

const convertQuerySchema = z.object({
  amount: z.coerce.number().positive(),
  from: z.string().length(3),
  to: z.string().length(3),
});

const ratesQuerySchema = z.object({
  base: z.string().length(3).default("USD"),
});

export const createCurrencyRoutes = () => {
  const router = Router();
  const currencyService = CurrencyService.getInstance();

  router.get("/", asyncHandler(async (_req, res) => {
    const currencies = currencyService.getSupportedCurrencies().map((code) => ({
      code,
      ...CurrencyService.CURRENCY_CONFIG[code],
    }));
    res.json({ success: true, data: currencies });
  }));

  router.get("/rates", asyncHandler(async (req, res) => {
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
    const result = await currencyService.convert(amount, from, to);
    res.json({ success: true, data: result });
  }));

  return router;
};
