import { VolatilityService } from '../VolatilityService';
import { IPriceHistory } from '../../models/PriceHistory';

describe('VolatilityService', () => {
  const createHistory = (prices: number[]): IPriceHistory[] => {
    return prices.map(price => ({
      price,
      flightId: 'test-flight',
      currency: 'USD',
      timestamp: new Date(),
      source: 'test'
    } as IPriceHistory));
  };

  it('should not detect anomaly if history is insufficient', () => {
    const history = createHistory([100, 100]);
    const result = VolatilityService.isSignificantDrop(50, history);
    expect(result).toBe(false);
  });

  it('should detect significant drop based on standard deviation', () => {
    // Mean = 100, SD = 0
    const history = createHistory([100, 100, 100, 100, 100]);
    
    // 90 is > 2 SD away (if SD was small but not zero, or logic handles 0)
    // Actually our logic: currentPrice < (average - 2 * stdDev)
    // average=100, stdDev=0.
    // 90 < 100 - 0 = true.
    
    const result = VolatilityService.isSignificantDrop(90, history);
    expect(result).toBe(true);
  });

  it('should detect significant drop if price is 10% lower than average', () => {
    const history = createHistory([200, 200, 200, 200, 200]);
    // Average = 200. 10% lower = 180.
    // Price 170 should be significant.
    const result = VolatilityService.isSignificantDrop(170, history);
    expect(result).toBe(true);
  });

  it('should not detect drop for normal fluctuation', () => {
    const history = createHistory([100, 105, 95, 102, 98]);
    // Average approx 100. SD approx 3-4.
    // Threshold = 100 - 2*4 = 92.
    // Price 95 should be false.
    const result = VolatilityService.isSignificantDrop(95, history);
    expect(result).toBe(false);
  });
});
