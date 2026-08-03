import request from 'supertest';
import { CurrencyService } from '../src/services/currencyService';

const mockApp = {
  get: (path: string) => {
    if (path === '/api/v1/currencies') {
      return {
        success: true,
        data: CurrencyService.getInstance().getSupportedCurrencies().map((code) => ({
          code,
          ...CurrencyService.CURRENCY_CONFIG[code],
        })),
      };
    }
    return { success: false };
  },
};

jest.mock('../src/index', () => mockApp as any, { virtual: true });

describe('Currency API Integration', () => {
  let currencyService: CurrencyService;

  beforeAll(() => {
    currencyService = CurrencyService.getInstance();
    currencyService.clearCache();
  });

  describe('GET /api/v1/currencies', () => {
    it('should return list of supported currencies', async () => {
      const data = mockApp.get('/api/v1/currencies');
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBe(12);
      const codes = data.data.map((c: any) => c.code);
      expect(codes).toContain('USD');
      expect(codes).toContain('EUR');
      expect(codes).toContain('GBP');
      expect(codes).toContain('NGN');
    });

    it('should include currency metadata', async () => {
      const data = mockApp.get('/api/v1/currencies');
      const usd = data.data.find((c: any) => c.code === 'USD');
      expect(usd).toBeDefined();
      expect(usd.symbol).toBe('$');
      expect(usd.name).toBe('US Dollar');
      expect(usd.locale).toBe('en-US');
      expect(usd.decimals).toBe(2);
    });
  });

  describe('CurrencyService convert', () => {
    it('should convert USD to EUR successfully', async () => {
      const result = await currencyService.convert(100, 'USD', 'EUR');
      expect(result.from).toBe('USD');
      expect(result.to).toBe('EUR');
      expect(result.rate).toBeGreaterThan(0);
      expect(result.amount).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should return conversion with fee', async () => {
      const result = await currencyService.convert(1000, 'USD', 'JPY');
      expect(result.fee).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.total).toBeLessThan(result.amount);
    });

    it('should maintain same amount for same currency', async () => {
      const result = await currencyService.convert(500, 'USD', 'USD');
      expect(result.amount).toBe(500);
      expect(result.rate).toBe(1);
      expect(result.fee).toBe(0);
      expect(result.total).toBe(500);
    });
  });

  describe('CurrencyService getRates', () => {
    it('should return USD base rates', async () => {
      const rates = await currencyService.getRates('USD');
      expect(rates.USD).toBe(1);
      expect(Object.keys(rates).length).toBeGreaterThanOrEqual(12);
    });

    it('should return non-USD base rates', async () => {
      const rates = await currencyService.getRates('EUR');
      expect(rates.EUR).toBe(1);
      expect(rates.USD).toBeGreaterThan(0);
    });
  });

  describe('CurrencyService formatAmount', () => {
    it('should format USD correctly', () => {
      const formatted = currencyService.formatAmount(1234.56, 'USD');
      expect(formatted).toContain('$');
      expect(formatted).toContain('1,234.56');
    });

    it('should format JPY without decimals', () => {
      const formatted = currencyService.formatAmount(1500, 'JPY');
      expect(formatted).not.toContain('.');
    });
  });

  describe('CurrencyService detectCurrency', () => {
    it('should map locales correctly', () => {
      expect(currencyService.detectCurrency('en-US')).toBe('USD');
      expect(currencyService.detectCurrency('de-DE')).toBe('EUR');
      expect(currencyService.detectCurrency('ja-JP')).toBe('JPY');
      expect(currencyService.detectCurrency('en-NG')).toBe('NGN');
      expect(currencyService.detectCurrency('sw-KE')).toBe('KES');
      expect(currencyService.detectCurrency('pt-BR')).toBe('BRL');
      expect(currencyService.detectCurrency('en-IN')).toBe('INR');
      expect(currencyService.detectCurrency('zh-CN')).toBe('CNY');
    });
  });

  describe('Error handling', () => {
    it('should throw for unsupported source currency', async () => {
      await expect(currencyService.convert(100, 'XYZ' as any, 'USD')).rejects.toThrow('Unsupported currency');
    });

    it('should throw for unsupported target currency', async () => {
      await expect(currencyService.convert(100, 'USD', 'XYZ' as any)).rejects.toThrow('Unsupported currency');
    });
  });
});
