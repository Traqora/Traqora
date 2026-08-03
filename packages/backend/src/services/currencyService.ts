import { logger } from '../utils/logger';

export interface ConversionResult {
  amount: number;
  from: string;
  to: string;
  rate: number;
  fee: number;
  total: number;
  timestamp: Date;
}

interface RateCache {
  rates: Record<string, number>;
  timestamp: number;
}

export class CurrencyService {
  private static instance: CurrencyService;
  private cache: Map<string, RateCache> = new Map();
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private readonly feeRate = 0.005;
  private readonly apiBaseUrl = 'https://api.exchangerate-api.com/v4/latest';

  public static readonly SUPPORTED_CURRENCIES = [
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD',
    'NGN', 'KES', 'ZAR', 'BRL', 'INR', 'CNY',
  ] as const;

  public static readonly CURRENCY_CONFIG: Record<string, { symbol: string; name: string; locale: string; decimals: number }> = {
    USD: { symbol: '$', name: 'US Dollar', locale: 'en-US', decimals: 2 },
    EUR: { symbol: '€', name: 'Euro', locale: 'de-DE', decimals: 2 },
    GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB', decimals: 2 },
    JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', decimals: 0 },
    CAD: { symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA', decimals: 2 },
    AUD: { symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', decimals: 2 },
    NGN: { symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', decimals: 2 },
    KES: { symbol: 'KSh', name: 'Kenyan Shilling', locale: 'sw-KE', decimals: 2 },
    ZAR: { symbol: 'R', name: 'South African Rand', locale: 'en-ZA', decimals: 2 },
    BRL: { symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR', decimals: 2 },
    INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', decimals: 2 },
    CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', decimals: 2 },
  };

  private fallbackRates: Record<string, number> = {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, CAD: 1.36, AUD: 1.53,
    NGN: 1550, KES: 145, ZAR: 18.5, BRL: 5.05, INR: 83.5, CNY: 7.24,
  };

  private constructor() {}

  public static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  public getSupportedCurrencies(): readonly string[] {
    return CurrencyService.SUPPORTED_CURRENCIES;
  }

  public async getRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
    const base = baseCurrency.toUpperCase();
    const cached = this.cache.get(base);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.rates;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/${base}`);
      if (!response.ok) {
        throw new Error(`Exchange rate API returned ${response.status}`);
      }
      const data = await response.json() as { rates: Record<string, number> };
      const filtered: Record<string, number> = {};
      for (const currency of CurrencyService.SUPPORTED_CURRENCIES) {
        if (data.rates[currency] !== undefined) {
          filtered[currency] = data.rates[currency];
        }
      }
      this.cache.set(base, { rates: filtered, timestamp: Date.now() });
      return filtered;
    } catch (error) {
      logger.warn('Failed to fetch exchange rates, using fallback', { error, base });
      const fallback = this.computeFallbackRates(base);
      this.cache.set(base, { rates: fallback, timestamp: Date.now() });
      return fallback;
    }
  }

  private computeFallbackRates(baseCurrency: string): Record<string, number> {
    const base = baseCurrency.toUpperCase();
    const baseRate = this.fallbackRates[base];
    if (!baseRate) {
      return { ...this.fallbackRates };
    }
    const result: Record<string, number> = {};
    for (const currency of CurrencyService.SUPPORTED_CURRENCIES) {
      const rate = this.fallbackRates[currency];
      if (rate !== undefined) {
        result[currency] = rate / baseRate;
      }
    }
    return result;
  }

  public async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<ConversionResult> {
    const fromCurrency = from.toUpperCase();
    const toCurrency = to.toUpperCase();

    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(fromCurrency as any)) {
      throw new Error(`Unsupported currency: ${fromCurrency}`);
    }
    if (!CurrencyService.SUPPORTED_CURRENCIES.includes(toCurrency as any)) {
      throw new Error(`Unsupported currency: ${toCurrency}`);
    }

    if (fromCurrency === toCurrency) {
      const fee = this.calculateConversionFee(amount, fromCurrency, toCurrency);
      return {
        amount,
        from: fromCurrency,
        to: toCurrency,
        rate: 1,
        fee,
        total: this.roundAmount(amount + fee, toCurrency),
        timestamp: new Date(),
      };
    }

    const rates = await this.getRates(fromCurrency);
    const rate = rates[toCurrency];
    if (!rate) {
      throw new Error(`No exchange rate available for ${fromCurrency} to ${toCurrency}`);
    }

    const converted = amount * rate;
    const fee = this.calculateConversionFee(amount, fromCurrency, toCurrency);
    const total = this.roundAmount(converted - fee, toCurrency);

    return {
      amount: this.roundAmount(converted, toCurrency),
      from: fromCurrency,
      to: toCurrency,
      rate,
      fee: this.roundAmount(fee, toCurrency),
      total,
      timestamp: new Date(),
    };
  }

  public detectCurrency(locale: string): string {
    const localeMap: Record<string, string> = {
      'en-US': 'USD', 'en-GB': 'GBP', 'de-DE': 'EUR', 'fr-FR': 'EUR',
      'ja-JP': 'JPY', 'en-CA': 'CAD', 'en-AU': 'AUD', 'en-NG': 'NGN',
      'sw-KE': 'KES', 'en-KE': 'KES', 'en-ZA': 'ZAR', 'pt-BR': 'BRL',
      'en-IN': 'INR', 'hi-IN': 'INR', 'zh-CN': 'CNY', 'zh-Hans-CN': 'CNY',
    };
    return localeMap[locale] || 'USD';
  }

  public formatAmount(amount: number, currency: string, locale?: string): string {
    const curr = currency.toUpperCase();
    const config = CurrencyService.CURRENCY_CONFIG[curr];
    if (!config) {
      return amount.toFixed(2);
    }
    try {
      return new Intl.NumberFormat(locale || config.locale, {
        style: 'currency',
        currency: curr,
      }).format(amount);
    } catch {
      return `${config.symbol}${amount.toFixed(config.decimals)}`;
    }
  }

  public roundAmount(amount: number, currency: string): number {
    const curr = currency.toUpperCase();
    const config = CurrencyService.CURRENCY_CONFIG[curr];
    const decimals = config?.decimals ?? 2;
    const factor = Math.pow(10, decimals);
    return Math.round(amount * factor) / factor;
  }

  public calculateConversionFee(amount: number, from: string, to: string): number {
    const fromCurrency = from.toUpperCase();
    const toCurrency = to.toUpperCase();
    if (fromCurrency === toCurrency) {
      return 0;
    }
    return this.roundAmount(amount * this.feeRate, toCurrency);
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
