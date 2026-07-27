export const SUPPORTED_CURRENCY_CODES = [
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD",
  "NGN", "KES", "ZAR", "BRL", "INR", "CNY",
  "XLM", "USDC", "USDT",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimalPlaces: number;
  type: 'fiat' | 'crypto';
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", decimalPlaces: 2, type: 'fiat' },
  EUR: { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE", decimalPlaces: 2, type: 'fiat' },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB", decimalPlaces: 2, type: 'fiat' },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", locale: "ja-JP", decimalPlaces: 0, type: 'fiat' },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", locale: "en-CA", decimalPlaces: 2, type: 'fiat' },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", locale: "en-AU", decimalPlaces: 2, type: 'fiat' },
  NGN: { code: "NGN", symbol: "₦", name: "Nigerian Naira", locale: "en-NG", decimalPlaces: 2, type: 'fiat' },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan Shilling", locale: "sw-KE", decimalPlaces: 2, type: 'fiat' },
  ZAR: { code: "ZAR", symbol: "R", name: "South African Rand", locale: "en-ZA", decimalPlaces: 2, type: 'fiat' },
  BRL: { code: "BRL", symbol: "R$", name: "Brazilian Real", locale: "pt-BR", decimalPlaces: 2, type: 'fiat' },
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN", decimalPlaces: 2, type: 'fiat' },
  CNY: { code: "CNY", symbol: "¥", name: "Chinese Yuan", locale: "zh-CN", decimalPlaces: 2, type: 'fiat' },
  XLM: { code: "XLM", symbol: "XLM", name: "Stellar Lumens", locale: "en-US", decimalPlaces: 7, type: 'crypto' },
  USDC: { code: "USDC", symbol: "USDC", name: "USD Coin", locale: "en-US", decimalPlaces: 6, type: 'crypto' },
  USDT: { code: "USDT", symbol: "USDT", name: "Tether", locale: "en-US", decimalPlaces: 6, type: 'crypto' },
};

export const currencySymbolMap: Record<string, string> = Object.fromEntries(
  Object.entries(SUPPORTED_CURRENCIES).map(([code, info]) => [code, info.symbol]),
);

export const CURRENCY_STORAGE_KEY = "traqora-currency";

export interface ConversionQuote {
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  amount: number;
  convertedAmount: number;
  rate: number;
  fee: number;
  timestamp: Date;
}

export function formatCurrency(amount: number, currency: CurrencyCode, locale?: string): string {
  const info = SUPPORTED_CURRENCIES[currency];
  if (!info) {
    return `${amount.toFixed(2)}`;
  }
  try {
    return new Intl.NumberFormat(locale || info.locale, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${info.symbol}${amount.toFixed(info.decimalPlaces)}`;
  }
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: Record<string, number>,
): number {
  if (from === to) return amount;
  const fromRate = rates[from] ?? 1;
  const toRate = rates[to];
  if (toRate === undefined) {
    throw new Error(`No rate available for currency: ${to}`);
  }
  const inBase = amount / fromRate;
  const info = SUPPORTED_CURRENCIES[to];
  const decimals = info?.decimalPlaces ?? 2;
  const factor = Math.pow(10, decimals);
  return Math.round(inBase * toRate * factor) / factor;
}

export function detectCurrencyFromLocale(locale: string): CurrencyCode {
  const localeMap: Record<string, CurrencyCode> = {
    "en-US": "USD", "en-GB": "GBP", "de-DE": "EUR", "fr-FR": "EUR",
    "ja-JP": "JPY", "en-CA": "CAD", "en-AU": "AUD", "en-NG": "NGN",
    "sw-KE": "KES", "en-KE": "KES", "en-ZA": "ZAR", "pt-BR": "BRL",
    "en-IN": "INR", "hi-IN": "INR", "zh-CN": "CNY",
  };
  return localeMap[locale] || "USD";
}

export function getCurrencyFromStorage(): CurrencyCode {
  if (typeof window === "undefined") return "USD";
  const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
  if (stored && SUPPORTED_CURRENCY_CODES.includes(stored as CurrencyCode)) {
    return stored as CurrencyCode;
  }
  return "USD";
}

export function setCurrencyToStorage(currency: CurrencyCode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
}

/**
 * Fetch conversion quote from backend API
 */
export async function fetchConversionQuote(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): Promise<ConversionQuote> {
  const API_BASE_URL = typeof window !== 'undefined' && (window as any).__NEXT_PUBLIC_API_URL 
    ? (window as any).__NEXT_PUBLIC_API_URL 
    : "http://localhost:3001";
  const response = await fetch(`${API_BASE_URL}/api/v1/currencies/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, from, to }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch conversion quote');
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Check volatility for a flight price
 */
export async function checkVolatility(
  flightId: string,
  currentPrice: number
): Promise<{ isVolatile: boolean; volatilityScore: number; recommendedSlippage: number; shouldConvert: boolean; reason: string }> {
  const API_BASE_URL = typeof window !== 'undefined' && (window as any).__NEXT_PUBLIC_API_URL 
    ? (window as any).__NEXT_PUBLIC_API_URL 
    : "http://localhost:3001";
  const response = await fetch(`${API_BASE_URL}/api/v1/currencies/volatility-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flightId, currentPrice }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to check volatility');
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Get stablecoin currencies (USDC, USDT)
 */
export function getStablecoins(): CurrencyCode[] {
  return SUPPORTED_CURRENCY_CODES.filter(code => {
    const info = SUPPORTED_CURRENCIES[code];
    return info.type === 'crypto' && (code === 'USDC' || code === 'USDT');
  });
}

/**
 * Check if currency is a stablecoin
 */
export function isStablecoin(currency: CurrencyCode): boolean {
  return currency === 'USDC' || currency === 'USDT';
}
