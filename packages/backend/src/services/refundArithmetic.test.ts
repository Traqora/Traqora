import {
  centsToWholePercentage,
  clampWholePercentage,
  percentageOfCents,
  percentageToBasisPoints,
  roundDiv,
} from './refundArithmetic';

describe('percentageToBasisPoints', () => {
  it.each([
    [100, 10_000],
    [80, 8_000],
    [33.33, 3_333],
    ['33.33', 3_333],
    [2.5, 250],
    [0, 0],
    [100.005, 10_001],
    [-25, -2_500],
  ])('converts %s to %s bp exactly', (percent, expected) => {
    expect(percentageToBasisPoints(percent)).toBe(expected);
  });

  it('rejects malformed percentages', () => {
    expect(() => percentageToBasisPoints('abc')).toThrow('Invalid percentage');
    expect(() => percentageToBasisPoints('')).toThrow('Invalid percentage');
    expect(() => percentageToBasisPoints(NaN)).toThrow('Invalid percentage');
  });
});

describe('roundDiv', () => {
  it.each([
    [1, 2, 1],
    [1, 3, 0],
    [2, 3, 1],
    [5, 10, 1],
    [4, 10, 0],
    [0, 10, 0],
  ])('rounds %s/%s half up to %s', (numerator, denominator, expected) => {
    expect(roundDiv(numerator, denominator)).toBe(expected);
  });

  it('returns 0 for a non-positive denominator', () => {
    expect(roundDiv(10, 0)).toBe(0);
    expect(roundDiv(10, -1)).toBe(0);
  });
});

describe('percentageOfCents', () => {
  it('applies whole percentages exactly', () => {
    expect(percentageOfCents(10_000, 100)).toBe(10_000);
    expect(percentageOfCents(10_000, 80)).toBe(8_000);
    expect(percentageOfCents(10_000, 25)).toBe(2_500);
    expect(percentageOfCents(10_000, 0)).toBe(0);
  });

  it('rounds fractional results half up instead of truncating', () => {
    // 33.33% of 100 cents is 33.33 cents, which rounds to 33 cents.
    expect(percentageOfCents(100, 33.33)).toBe(33);
    // 66.67% of 100 cents is 66.67 cents, which rounds to 67 cents.
    expect(percentageOfCents(100, 66.67)).toBe(67);
    // A single cent at 50% rounds up rather than disappearing to zero.
    expect(percentageOfCents(1, 50)).toBe(1);
  });

  it('avoids float drift on values that are exact in decimal arithmetic', () => {
    // 0.1 and 0.2 in binary floats would produce 0.30000000000000004.
    expect(percentageOfCents(1_000, 10)).toBe(100);
    expect(percentageOfCents(3 * 100, 33.33)).toBe(100);
  });

  it('is symmetric for negative amounts', () => {
    expect(percentageOfCents(-100, 25)).toBe(-25);
  });

  it('rejects non-integer cent amounts', () => {
    expect(() => percentageOfCents(10.5, 50)).toThrow('integer number of cents');
  });
});

describe('centsToWholePercentage', () => {
  it.each([
    [100, 100, 100],
    [50, 100, 50],
    [1, 3, 33],
    [2, 3, 67],
  ])('converts %s of %s cents to %s%%', (part, total, expected) => {
    expect(centsToWholePercentage(part, total)).toBe(expected);
  });

  it('returns 0 for a missing or non-positive total', () => {
    expect(centsToWholePercentage(100, 0)).toBe(0);
    expect(centsToWholePercentage(100, -1)).toBe(0);
  });

  it('never reports more than 100 percent', () => {
    expect(centsToWholePercentage(200, 100)).toBe(100);
  });
});

describe('clampWholePercentage', () => {
  it('clamps out-of-range rule values', () => {
    expect(clampWholePercentage(-5)).toBe(0);
    expect(clampWholePercentage(150)).toBe(100);
    expect(clampWholePercentage(66.6)).toBe(67);
    expect(clampWholePercentage(NaN)).toBe(0);
  });
});
