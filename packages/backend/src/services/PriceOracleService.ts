import { logger } from '../utils/logger';
import axios from 'axios';

// Supported currencies
export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'XLM' | 'USDC' | 'USDT';

export interface CurrencyRate {
  currency: SupportedCurrency;
  rate: number; // Rate relative to USD base
  timestamp: Date;
}

export interface FlightPrice {
  flightId: string;
  price: number;
  currency: string;
  timestamp: Date;
  source: string;
}

export interface ConversionQuote {
  fromCurrency: SupportedCurrency;
  toCurrency: SupportedCurrency;
  amount: number;
  convertedAmount: number;
  rate: number;
  fee: number;
  timestamp: Date;
}

export class PriceOracleService {
  private static instance: PriceOracleService;
  private rateCache: Map<SupportedCurrency, CurrencyRate> = new Map();
  private cacheExpiryMs = 60000; // 1 minute cache
  private readonly API_URL = process.env.ORACLE_API_URL || 'https://api.coincap.io/v2/rates';
  private readonly FALLBACK_RATES: Record<SupportedCurrency, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    XLM: 24.5,
    USDC: 1.0,
    USDT: 1.0,
  };

  private constructor() {
    this.initializeCache();
  }

  public static getInstance(): PriceOracleService {
    if (!PriceOracleService.instance) {
      PriceOracleService.instance = new PriceOracleService();
    }
    return PriceOracleService.instance;
  }

  private initializeCache() {
    // Initialize with fallback rates
    Object.entries(this.FALLBACK_RATES).forEach(([currency, rate]) => {
      this.rateCache.set(currency as SupportedCurrency, {
        currency: currency as SupportedCurrency,
        rate,
        timestamp: new Date(),
      });
    });
  }

  /**
   * Fetches current exchange rates for all supported currencies
   */
  public async fetchExchangeRates(): Promise<Map<SupportedCurrency, CurrencyRate>> {
    try {
      const response = await axios.get(this.API_URL, { timeout: 5000 });
      const data = response.data.data;
      
      // Update cache with real rates
      if (Array.isArray(data)) {
        data.forEach((rateData: any) => {
          const currency = this.mapCurrencyId(rateData.id);
          if (currency) {
            this.rateCache.set(currency, {
              currency,
              rate: parseFloat(rateData.rateUsd),
              timestamp: new Date(),
            });
          }
        });
      }
      
      logger.info('Exchange rates updated successfully');
      return this.rateCache;
    } catch (error) {
      logger.warn('Failed to fetch exchange rates, using cached/fallback rates', error);
      return this.rateCache;
    }
  }

  private mapCurrencyId(id: string): SupportedCurrency | null {
    const mapping: Record<string, SupportedCurrency> = {
      'usd': 'USD',
      'eur': 'EUR',
      'gbp': 'GBP',
      'stellar': 'XLM',
      'usd-coin': 'USDC',
      'tether': 'USDT',
    };
    return mapping[id.toLowerCase()] || null;
  }

  /**
   * Get current rate for a specific currency
   */
  public getRate(currency: SupportedCurrency): number {
    const cached = this.rateCache.get(currency);
    if (!cached) {
      logger.warn(`No rate found for ${currency}, using fallback`);
      return this.FALLBACK_RATES[currency] || 1.0;
    }
    
    // Check if cache is expired
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.cacheExpiryMs) {
      // Async refresh cache
      this.fetchExchangeRates().catch(err => 
        logger.error('Failed to refresh exchange rates', err)
      );
    }
    
    return cached.rate;
  }

  /**
   * Convert amount from one currency to another
   */
  public convertCurrency(
    amount: number,
    fromCurrency: SupportedCurrency,
    toCurrency: SupportedCurrency
  ): ConversionQuote {
    const fromRate = this.getRate(fromCurrency);
    const toRate = this.getRate(toCurrency);
    
    // Convert to USD base first, then to target
    const usdAmount = amount / fromRate;
    const convertedAmount = usdAmount * toRate;
    
    // Calculate conversion fee (0.5%)
    const fee = convertedAmount * 0.005;
    const finalAmount = convertedAmount - fee;
    
    return {
      fromCurrency,
      toCurrency,
      amount,
      convertedAmount: finalAmount,
      rate: toRate / fromRate,
      fee,
      timestamp: new Date(),
    };
  }

  /**
   * Fetches current price for a list of flights in specified currency
   */
  public async fetchPrices(
    flightIds: string[],
    targetCurrency: SupportedCurrency = 'USD'
  ): Promise<FlightPrice[]> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const response = await this.mockApiCall(flightIds, targetCurrency);
        return response;
      } catch (error) {
        retries++;
        const delay = Math.pow(2, retries) * 1000;
        logger.warn(`Failed to fetch prices. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
        if (retries === maxRetries) {
          logger.error('Max retries reached. Failed to fetch prices from Oracle.', error);
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return [];
  }

  // Simulate API call for demonstration
  private async mockApiCall(
    flightIds: string[],
    targetCurrency: SupportedCurrency = 'USD'
  ): Promise<FlightPrice[]> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const basePrice = 100 + Math.random() * 50;
    const conversion = this.convertCurrency(basePrice, 'USD', targetCurrency);
    
    return flightIds.map(id => ({
      flightId: id,
      price: conversion.convertedAmount,
      currency: targetCurrency,
      timestamp: new Date(),
      source: 'PriceOracle'
    }));
  }

  /**
   * Get historical price data for a flight (mock implementation)
   */
  public async getHistoricalPrices(
    _flightId: string,
    days: number = 30
  ): Promise<{ date: Date; price: number }[]> {
    const prices: { date: Date; price: number }[] = [];
    const now = new Date();
    
    for (let i = days; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const basePrice = 100 + Math.random() * 50;
      prices.push({ date, price: basePrice });
    }
    
    return prices;
  }
}
