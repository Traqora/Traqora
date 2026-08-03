import { PricePredictionService } from '../src/services/PricePredictionService';
import { IPriceHistory } from '../src/models/PriceHistory';

describe('PricePredictionService', () => {
  const service = PricePredictionService.getInstance();

  const createHistory = (prices: number[]): IPriceHistory[] =>
    prices.map(
      (price, i) =>
        ({
          price,
          flightId: 'JFK-LHR-2026-09-01',
          currency: 'USD',
          timestamp: new Date(Date.now() - (prices.length - i) * 60 * 60 * 1000),
          source: 'test',
        }) as IPriceHistory,
    );

  describe('getInstance', () => {
    it('returns the same singleton instance', () => {
      expect(PricePredictionService.getInstance()).toBe(service);
    });
  });

  describe('computePrediction', () => {
    it('returns low confidence and no trend when history has fewer than 3 points', () => {
      const result = service.computePrediction(createHistory([100, 105]), 100, 'USD');
      expect(result.confidence).toBe(0.1);
      expect(result.confidenceLabel).toBe('low');
      expect(result.trendDirection).toBe('stable');
      expect(result.dataPointCount).toBe(2);
    });

    it('reports the current price back when there is no history at all', () => {
      const result = service.computePrediction([], 250, 'USD');
      expect(result.estimatedPrice).toBe(250);
      expect(result.dataPointCount).toBe(0);
    });

    it('detects a rising trend when the second half of history is meaningfully higher', () => {
      // first half avg 100, second half avg 130 — well above the 3% threshold
      const result = service.computePrediction(createHistory([100, 100, 100, 130, 130, 130]), 130, 'USD');
      expect(result.trendDirection).toBe('rising');
      expect(result.recommendation).toBe('buy_now');
    });

    it('detects a falling trend when the second half of history is meaningfully lower', () => {
      const result = service.computePrediction(createHistory([130, 130, 130, 100, 100, 100]), 100, 'USD');
      expect(result.trendDirection).toBe('falling');
    });

    it('treats a small fluctuation below the threshold as stable, not a trend', () => {
      // first half avg 100, second half avg 101 — a 1% change, below the 3% threshold
      const result = service.computePrediction(createHistory([100, 100, 100, 101, 101, 101]), 101, 'USD');
      expect(result.trendDirection).toBe('stable');
    });

    it('gives higher confidence to stable prices than to volatile ones with the same sample size', () => {
      const stable = service.computePrediction(createHistory([100, 101, 99, 100, 101]), 100, 'USD');
      const volatile = service.computePrediction(createHistory([50, 150, 40, 160, 60]), 100, 'USD');
      expect(stable.confidence).toBeGreaterThan(volatile.confidence);
    });

    it('recommends buy_now when the current price is at or below the historical average', () => {
      const result = service.computePrediction(createHistory([100, 100, 100, 100, 100]), 90, 'USD');
      expect(result.recommendation).toBe('buy_now');
    });

    it('recommends wait when the price is stable but currently above the historical average', () => {
      const result = service.computePrediction(createHistory([100, 100, 100, 100, 100]), 130, 'USD');
      expect(result.trendDirection).toBe('stable');
      expect(result.recommendation).toBe('wait');
    });

    it('confidence never exceeds 1', () => {
      const manyStablePoints = createHistory(Array.from({ length: 60 }, () => 100));
      const result = service.computePrediction(manyStablePoints, 100, 'USD');
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('summarizeHistory', () => {
    it('returns a zeroed summary with dataPointCount 0 for no history', () => {
      const { summary, dataPoints } = service.summarizeHistory([]);
      expect(summary).toEqual({ minPrice: 0, maxPrice: 0, avgPrice: 0, currentPrice: null, dataPointCount: 0 });
      expect(dataPoints).toEqual([]);
    });

    it('computes min/max/avg/current from real history', () => {
      const { summary } = service.summarizeHistory(createHistory([100, 200, 300]));
      expect(summary.minPrice).toBe(100);
      expect(summary.maxPrice).toBe(300);
      expect(summary.avgPrice).toBe(200);
      expect(summary.currentPrice).toBe(300); // last (most recent) point
      expect(summary.dataPointCount).toBe(3);
    });

    it('maps each history entry to a date/price/currency data point', () => {
      const { dataPoints } = service.summarizeHistory(createHistory([150]));
      expect(dataPoints).toHaveLength(1);
      expect(dataPoints[0]).toMatchObject({ price: 150, currency: 'USD' });
      expect(dataPoints[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
