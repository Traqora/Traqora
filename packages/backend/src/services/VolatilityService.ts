import { logger } from '../utils/logger';

export interface IPriceHistorySimple {
  price: number;
  date?: Date;
  timestamp?: Date;
}

export interface VolatilityCheck {
  isVolatile: boolean;
  volatilityScore: number;
  recommendedSlippage: number;
  shouldConvert: boolean;
  reason: string;
}

export class VolatilityService {
  private static readonly MAX_SLIPPAGE = 0.02; // 2% max slippage protection
  private static readonly VOLATILITY_THRESHOLD = 0.05; // 5% volatility threshold

  /**
   * Detects if the current price is significantly lower than the moving average
   * @param currentPrice The latest price
   * @param history Historical price data
   * @returns boolean True if price drop is significant
   */
  public static isSignificantDrop(currentPrice: number, history: IPriceHistorySimple[]): boolean {
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

  /**
   * Check volatility and recommend slippage tolerance
   * @param _currentPrice Current price (unused in current implementation, kept for API compatibility)
   * @param history Historical price data
   * @returns Volatility check result with recommendations
   */
  public static checkVolatility(_currentPrice: number, history: IPriceHistorySimple[]): VolatilityCheck {
    if (history.length < 3) {
      return {
        isVolatile: false,
        volatilityScore: 0,
        recommendedSlippage: 0.005, // 0.5% default
        shouldConvert: true,
        reason: 'Insufficient history, using default slippage',
      };
    }

    const prices = history.map(h => h.price);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // Calculate volatility as coefficient of variation
    const squareDiffs = prices.map(price => Math.pow(price - average, 2));
    const variance = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / average;

    const isVolatile = coefficientOfVariation > this.VOLATILITY_THRESHOLD;
    const recommendedSlippage = Math.min(
      coefficientOfVariation * 2,
      this.MAX_SLIPPAGE
    );

    // Recommend conversion to stablecoin if volatile
    const shouldConvert = isVolatile;

    return {
      isVolatile,
      volatilityScore: coefficientOfVariation,
      recommendedSlippage,
      shouldConvert,
      reason: isVolatile 
        ? `High volatility detected (${(coefficientOfVariation * 100).toFixed(2)}%), consider stablecoin`
        : 'Low volatility, safe to proceed',
    };
  }

  /**
   * Check if price deviation exceeds slippage protection
   * @param expectedPrice Expected price
   * @param actualPrice Actual price received
   * @param maxSlippage Maximum allowed slippage (default 2%)
   * @returns boolean True if slippage is acceptable
   */
  public static isSlippageAcceptable(
    expectedPrice: number,
    actualPrice: number,
    maxSlippage: number = this.MAX_SLIPPAGE
  ): boolean {
    const deviation = Math.abs(expectedPrice - actualPrice) / expectedPrice;
    const acceptable = deviation <= maxSlippage;
    
    if (!acceptable) {
      logger.warn(`Slippage protection triggered: ${(deviation * 100).toFixed(2)}% deviation exceeds ${(maxSlippage * 100).toFixed(2)}% limit`);
    }
    
    return acceptable;
  }

  /**
   * Get price trend direction
   * @param history Historical price data
   * @returns 'up' | 'down' | 'stable'
   */
  public static getPriceTrend(history: IPriceHistorySimple[]): 'up' | 'down' | 'stable' {
    if (history.length < 2) return 'stable';

    const recent = history.slice(-5);
    const firstPrice = recent[0].price;
    const lastPrice = recent[recent.length - 1].price;
    const change = (lastPrice - firstPrice) / firstPrice;

    if (change > 0.02) return 'up';
    if (change < -0.02) return 'down';
    return 'stable';
  }
}
