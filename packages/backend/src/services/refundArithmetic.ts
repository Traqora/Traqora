/**
 * Decimal-safe refund arithmetic (issue #1153).
 *
 * Money is stored in integer minor units (cents). Percentages in fare rules and
 * policies are frequently fractional (for example 33.33% or 2.5%), so doing
 * `amount * percent / 100` in JavaScript floats can lose a cent. This module
 * converts percentages to integer basis points (1 bp = 0.01%) and performs
 * every intermediate operation with integers, rounding half up to the nearest
 * cent only once at the end.
 */

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;
const BASIS_POINTS_PER_PERCENT = 100;
const BASIS_POINTS_DIVISOR = 10_000;

/**
 * Convert a percentage to integer basis points without floating-point math.
 * Accepts a number or a string so values such as `33.33` remain exact through
 * parsing. Precision is limited to two decimal places, which is the precision
 * of a basis point; a third decimal is rounded half up.
 */
export function percentageToBasisPoints(percent: number | string): number {
  const text = (typeof percent === 'string' ? percent.trim() : String(percent)).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    throw new Error(`Invalid percentage: ${text}`);
  }

  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ''] = unsigned.split('.');
  const wholeBp = Number(whole) * BASIS_POINTS_PER_PERCENT;

  // First two decimals are basis points; round the third decimal half up.
  const firstTwo = (fraction + '00').slice(0, 2);
  const third = Number(fraction.charAt(2) || '0');
  const carry = third >= 5 ? 1 : 0;
  const magnitude = wholeBp + Number(firstTwo) + carry;
  if (!Number.isSafeInteger(magnitude)) {
    throw new Error('Percentage is too large for safe integer arithmetic');
  }
  return negative ? -magnitude : magnitude;
}

/**
 * Divide two non-negative integers, rounding half up. Returns 0 for a
 * non-positive denominator so callers never divide by zero.
 */
export function roundDiv(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const halfUp = Math.floor((2 * numerator + denominator) / (2 * denominator));
  return Number.isSafeInteger(halfUp) ? halfUp : 0;
}

/**
 * Apply a percentage to an amount in cents, rounding half up to the nearest
 * cent. Negative amounts are handled by applying the magnitude and restoring
 * the sign, so the result is symmetric.
 */
export function percentageOfCents(amountCents: number, percent: number | string): number {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error('Amount must be an integer number of cents');
  }
  const bp = percentageToBasisPoints(percent);
  const scaled = amountCents * bp;
  if (!Number.isSafeInteger(scaled) || Math.abs(scaled) > MAX_SAFE_CENTS) {
    throw new Error('Amount times percentage exceeds safe integer range');
  }
  return scaled >= 0
    ? roundDiv(scaled, BASIS_POINTS_DIVISOR)
    : -roundDiv(-scaled, BASIS_POINTS_DIVISOR);
}

/**
 * Express `partCents` as a percentage of `totalCents`, rounded to the nearest
 * whole percentage (half up). Returns 0 for a missing or non-positive total.
 * Used when a traveler asks for a specific partial amount instead of a
 * percentage.
 */
export function centsToWholePercentage(partCents: number, totalCents: number): number {
  if (!Number.isSafeInteger(partCents) || !Number.isSafeInteger(totalCents)) {
    throw new Error('Amounts must be integer numbers of cents');
  }
  if (totalCents <= 0) return 0;
  if (partCents <= 0) return 0;
  return Math.min(100, roundDiv(partCents * 100, totalCents));
}

/**
 * Clamp a percentage into the inclusive 0 to 100 range, rounding to the
 * nearest whole percent. Fare rules from providers can be out of range.
 */
export function clampWholePercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
