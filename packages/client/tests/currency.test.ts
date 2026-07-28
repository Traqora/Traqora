import {
  formatCurrency,
  convertCurrency,
  detectCurrencyFromLocale,
  getCurrencyFromStorage,
  setCurrencyToStorage,
  CURRENCY_STORAGE_KEY,
  SUPPORTED_CURRENCIES,
  currencySymbolMap,
  SUPPORTED_CURRENCY_CODES,
} from '../lib/currency'

describe('currency utilities', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
  })

  describe('SUPPORTED_CURRENCIES', () => {
    it('should have all required currencies', () => {
      const codes = Object.keys(SUPPORTED_CURRENCIES)
      expect(codes).toContain('USD')
      expect(codes).toContain('EUR')
      expect(codes).toContain('GBP')
      expect(codes).toContain('JPY')
      expect(codes).toContain('NGN')
      expect(codes).toContain('KES')
      expect(codes).toContain('ZAR')
      expect(codes).toContain('BRL')
      expect(codes).toContain('INR')
      expect(codes).toContain('CNY')
      expect(codes).toContain('CAD')
      expect(codes).toContain('AUD')
      expect(codes.length).toBe(15)
    })

    it('should have valid config for each currency', () => {
      for (const [code, info] of Object.entries(SUPPORTED_CURRENCIES)) {
        expect(info.code).toBe(code)
        expect(info.symbol).toBeTruthy()
        expect(info.name).toBeTruthy()
        expect(info.locale).toBeTruthy()
        expect(typeof info.decimalPlaces).toBe('number')
      }
    })
  })

  describe('currencySymbolMap', () => {
    it('should map currency codes to symbols', () => {
      expect(currencySymbolMap['USD']).toBe('$')
      expect(currencySymbolMap['EUR']).toBe('€')
      expect(currencySymbolMap['GBP']).toBe('£')
    })
  })

  describe('formatCurrency', () => {
    it('should format USD with $ symbol', () => {
      const result = formatCurrency(1234.56, 'USD')
      expect(result).toContain('$')
      expect(result).toContain('1,234.56')
    })

    it('should format JPY without decimals', () => {
      const result = formatCurrency(1500, 'JPY')
      expect(result.includes('¥') || result.includes('￥')).toBe(true)
      expect(result).not.toContain('.')
    })

    it('should return fallback for unknown currency', () => {
      const result = formatCurrency(100, 'XYZ' as any)
      expect(result).toBe('100.00')
    })
  })

  describe('convertCurrency', () => {
    const rates: Record<string, number> = {
      USD: 1,
      EUR: 0.92,
      JPY: 149.5,
      NGN: 1550,
    }

    it('should return same amount for same currency', () => {
      const result = convertCurrency(100, 'USD', 'USD', rates)
      expect(result).toBe(100)
    })

    it('should convert USD to EUR', () => {
      const result = convertCurrency(100, 'USD', 'EUR', rates)
      expect(result).toBe(92)
    })

    it('should convert EUR to USD', () => {
      const result = convertCurrency(92, 'EUR', 'USD', rates)
      expect(result).toBe(100)
    })

    it('should convert USD to JPY', () => {
      const result = convertCurrency(100, 'USD', 'JPY', rates)
      expect(result).toBe(14950)
    })

    it('should throw for missing rate', () => {
      expect(() => convertCurrency(100, 'USD', 'XYZ' as any, rates)).toThrow()
    })
  })

  describe('detectCurrencyFromLocale', () => {
    it('should detect USD for en-US', () => {
      expect(detectCurrencyFromLocale('en-US')).toBe('USD')
    })

    it('should detect EUR for de-DE', () => {
      expect(detectCurrencyFromLocale('de-DE')).toBe('EUR')
    })

    it('should detect JPY for ja-JP', () => {
      expect(detectCurrencyFromLocale('ja-JP')).toBe('JPY')
    })

    it('should detect NGN for en-NG', () => {
      expect(detectCurrencyFromLocale('en-NG')).toBe('NGN')
    })

    it('should return USD for unknown locale', () => {
      expect(detectCurrencyFromLocale('xx-XX')).toBe('USD')
    })
  })

  describe('storage operations', () => {
    it('should return USD when nothing is stored', () => {
      const result = getCurrencyFromStorage()
      expect(result).toBe('USD')
    })

    it('should persist and retrieve currency', () => {
      setCurrencyToStorage('EUR')
      const retrieved = localStorage.getItem(CURRENCY_STORAGE_KEY)
      expect(retrieved).toBe('EUR')
    })

    it('should return stored currency', () => {
      setCurrencyToStorage('EUR')
      const result = getCurrencyFromStorage()
      expect(result).toBe('EUR')
    })

    it('should fallback to USD for invalid stored value', () => {
      localStorage.setItem(CURRENCY_STORAGE_KEY, 'INVALID')
      const result = getCurrencyFromStorage()
      expect(result).toBe('USD')
    })
  })

  describe('SUPPORTED_CURRENCY_CODES', () => {
    it('should match SUPPORTED_CURRENCIES keys', () => {
      expect(SUPPORTED_CURRENCY_CODES.length).toBe(Object.keys(SUPPORTED_CURRENCIES).length)
      for (const code of SUPPORTED_CURRENCY_CODES) {
        expect(SUPPORTED_CURRENCIES[code]).toBeDefined()
      }
    })
  })
})
