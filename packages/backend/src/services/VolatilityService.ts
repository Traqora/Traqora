import { IPriceHistory } from '../models/PriceHistory';

export class VolatilityService {
  /**
   * Detects if the current price is significantly lower than the moving average
   * @param currentPrice The latest price
   * @param history Historical price data
   * @returns boolean True if price drop is significant
   */
  public static isSignificantDrop(currentPrice: number, history: IPriceHistory[]): boolean {
    if (history.length < 5) return false; // Need some history

    const prices = history.map(h => h.price);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // Calculate Standard Deviation
    const squareDiffs = prices.map(price => Math.pow(price - average, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    // If current price is more than 2 standard deviations below the mean, it's significant
    // Or if it's simply 10% lower than average (simple rule)
    const isAnomaly = currentPrice < (average - 2 * stdDev);
    const isCheap = currentPrice < (average * 0.9);

    return isAnomaly || isCheap;
  }
}
