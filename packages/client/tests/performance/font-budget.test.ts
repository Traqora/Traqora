import { describe, it, expect } from '@jest/globals';
import { checkFontBudget } from '../../lib/api/font-budget';

describe('checkFontBudget', () => {
  it('should return isWithinBudget: true when font size is within default max allowed', () => {
    const result = checkFontBudget({
      fontName: 'Inter-Regular.woff2',
      fileSizeKb: 45,
    });

    expect(result.isWithinBudget).toBe(true);
    expect(result.excessKb).toBe(0);
    expect(result.maxAllowedKb).toBe(100);
  });

  it('should return isWithinBudget: true when font size is equal to custom max allowed', () => {
    const result = checkFontBudget({
      fontName: 'CustomFont.woff2',
      fileSizeKb: 80,
      maxAllowedKb: 80,
    });

    expect(result.isWithinBudget).toBe(true);
    expect(result.excessKb).toBe(0);
  });

  it('should return isWithinBudget: false and calculate excess KB when font size exceeds max allowed', () => {
    const result = checkFontBudget({
      fontName: 'HeavyFont.ttf',
      fileSizeKb: 145.5,
      maxAllowedKb: 100,
    });

    expect(result.isWithinBudget).toBe(false);
    expect(result.excessKb).toBe(45.5);
    expect(result.fontName).toBe('HeavyFont.ttf');
  });

  it('should throw ZodError when invalid inputs are provided (failure mode)', () => {
    expect(() => {
      checkFontBudget({
        fontName: '',
        fileSizeKb: -10,
      });
    }).toThrow();
  });
});
