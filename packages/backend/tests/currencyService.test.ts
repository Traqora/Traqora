import { CurrencyService, ConversionResult } from '../src/services/currencyService';

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(() => {
    service = CurrencyService.getInstance();
    service.clearCache();
  });

  describe('getSupportedCurrencies', () => {
    it('should return all supported currencies', () => {
      const currencies = service.getSupportedCurrencies();
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
      expect(currencies).toContain('JPY');
      expect(currencies).toContain('NGN');
      expect(currencies).toContain('KES');
      expect(currencies).toContain('ZAR');
      expect(currencies).toContain('BRL');
      expect(currencies).toContain('INR');
      expect(currencies).toContain('CNY');
      expect(currencies).toContain('CAD');
      expect(currencies).toContain('AUD');
      expect(currencies.length).toBe(12);
    });
  });

  describe('convert', () => {
    it('should return same amount for same currency conversion', async () => {
      const result = await service.convert(100, 'USD', 'USD');
      expect(result.amount).toBe(100);
      expect(result.rate).toBe(1);
      expect(result.fee).toBe(0);
      expect(result.total).toBe(100);
      expect(result.from).toBe('USD');
      expect(result.to).toBe('USD');
    });

    it('should convert between different currencies', async () => {
      const result = await service.convert(100, 'USD', 'EUR');
      expect(result.from).toBe('USD');
      expect(result.to).toBe('EUR');
      expect(result.rate).toBeGreaterThan(0);
      expect(result.amount).toBeGreaterThan(0);
      expect(result.fee).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should apply conversion fee', async () => {
      const result = await service.convert(1000, 'USD', 'EUR');
      expect(result.fee).toBeGreaterThan(0);
      const expectedFee = Math.round(1000 * 0.005 * 100) / 100;
      expect(result.fee).toBe(expectedFee);
    });

    it('should throw for unsupported currency', async () => {
      await expect(service.convert(100, 'XYZ' as any, 'USD')).rejects.toThrow('Unsupported currency');
      await expect(service.convert(100, 'USD', 'XYZ' as any)).rejects.toThrow('Unsupported currency');
    });

    it('should round amounts correctly for JPY (0 decimals)', async () => {
      const result = await service.convert(100, 'USD', 'JPY');
      expect(Number.isInteger(result.amount)).toBe(true);
    });

    it('should round amounts correctly for USD (2 decimals)', async () => {
      const result = await service.convert(99.99, 'USD', 'EUR');
      const decimals = result.amount.toString().split('.')[1];
      expect(decimals?.length || 0).toBeLessThanOrEqual(2);
    });
  });

  describe('detectCurrency', () => {
    it('should detect USD for en-US', () => {
      expect(service.detectCurrency('en-US')).toBe('USD');
    });

    it('should detect EUR for de-DE', () => {
      expect(service.detectCurrency('de-DE')).toBe('EUR');
    });

    it('should detect JPY for ja-JP', () => {
      expect(service.detectCurrency('ja-JP')).toBe('JPY');
    });

    it('should detect NGN for en-NG', () => {
      expect(service.detectCurrency('en-NG')).toBe('NGN');
    });

    it('should return USD for unknown locale', () => {
      expect(service.detectCurrency('xx-XX')).toBe('USD');
    });
  });

  describe('formatAmount', () => {
    it('should format USD with $ symbol', () => {
      const formatted = service.formatAmount(1234.56, 'USD');
      expect(formatted).toContain('$');
      expect(formatted).toContain('1,234.56');
    });

    it('should format EUR with € symbol', () => {
      const formatted = service.formatAmount(99.99, 'EUR');
      expect(formatted).toContain('€');
    });

    it('should format JPY without decimals', () => {
      const formatted = service.formatAmount(1500, 'JPY');
      expect(formatted).not.toContain('.');
    });
  });

  describe('roundAmount', () => {
    it('should round USD to 2 decimal places', () => {
      expect(service.roundAmount(10.123, 'USD')).toBe(10.12);
      expect(service.roundAmount(10.125, 'USD')).toBe(10.13);
    });

    it('should round JPY to 0 decimal places', () => {
      expect(service.roundAmount(10.5, 'JPY')).toBe(11);
      expect(service.roundAmount(10.4, 'JPY')).toBe(10);
    });
  });

  describe('calculateConversionFee', () => {
    it('should return 0 for same currency', () => {
      expect(service.calculateConversionFee(100, 'USD', 'USD')).toBe(0);
    });

    it('should calculate 0.5% fee for different currencies', () => {
      const fee = service.calculateConversionFee(1000, 'USD', 'EUR');
      expect(fee).toBe(5);
    });

    it('should round fee to 2 decimal places', () => {
      const fee = service.calculateConversionFee(1, 'USD', 'EUR');
      expect(fee).toBe(0.01);
    });
  });

  describe('getRates', () => {
    it('should return rates for USD base', async () => {
      const rates = await service.getRates('USD');
      expect(rates.USD).toBe(1);
      expect(rates.EUR).toBeGreaterThan(0);
      expect(rates.JPY).toBeGreaterThan(0);
    });

    it('should return rates for EUR base', async () => {
      const rates = await service.getRates('EUR');
      expect(rates.EUR).toBe(1);
    });

    it('should cache rates', async () => {
      const rates1 = await service.getRates('USD');
      const rates2 = await service.getRates('USD');
      expect(rates1).toEqual(rates2);
    });
  });
});
