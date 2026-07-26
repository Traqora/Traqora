export const SUPPORTED_CURRENCY_CODES = [
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD",
  "NGN", "KES", "ZAR", "BRL", "INR", "CNY",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimalPlaces: number;
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US", decimalPlaces: 2 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", locale: "de-DE", decimalPlaces: 2 },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB", decimalPlaces: 2 },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", locale: "ja-JP", decimalPlaces: 0 },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", locale: "en-CA", decimalPlaces: 2 },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", locale: "en-AU", decimalPlaces: 2 },
  NGN: { code: "NGN", symbol: "₦", name: "Nigerian Naira", locale: "en-NG", decimalPlaces: 2 },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan Shilling", locale: "sw-KE", decimalPlaces: 2 },
  ZAR: { code: "ZAR", symbol: "R", name: "South African Rand", locale: "en-ZA", decimalPlaces: 2 },
  BRL: { code: "BRL", symbol: "R$", name: "Brazilian Real", locale: "pt-BR", decimalPlaces: 2 },
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN", decimalPlaces: 2 },
  CNY: { code: "CNY", symbol: "¥", name: "Chinese Yuan", locale: "zh-CN", decimalPlaces: 2 },
};

export const currencySymbolMap: Record<string, string> = Object.fromEntries(
  Object.entries(SUPPORTED_CURRENCIES).map(([code, info]) => [code, info.symbol]),
);

export const CURRENCY_STORAGE_KEY = "traqora-currency";

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
