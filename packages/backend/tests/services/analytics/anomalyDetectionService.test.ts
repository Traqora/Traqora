import { AnomalyDetectionService } from '../../../src/services/analytics/anomalyDetectionService';

describe('AnomalyDetectionService', () => {
  let svc: AnomalyDetectionService;

  beforeEach(() => {
    svc = new AnomalyDetectionService();
  });

  describe('detect()', () => {
    it('returns empty anomalies for uniform data', () => {
      const values = [100, 100, 100, 100, 100];
      const report = svc.detect(values);
      expect(report.anomalies).toHaveLength(0);
      expect(report.stdDev).toBe(0);
    });

    it('detects revenue spike with default threshold', () => {
      // 9 normal points around 100, one spike at 500
      const values = [100, 102, 98, 101, 99, 100, 103, 97, 500, 100];
      const report = svc.detect(values);
      expect(report.anomalies.length).toBeGreaterThan(0);
      const spikeAnomaly = report.anomalies.find((a) => a.index === 8);
      expect(spikeAnomaly).toBeDefined();
      expect(spikeAnomaly!.zScore).toBeGreaterThan(2);
    });

    it('detects revenue drop (negative outlier)', () => {
      const values = [100, 102, 98, 101, 99, 100, 103, 97, 2, 100];
      const report = svc.detect(values);
      const drop = report.anomalies.find((a) => a.index === 8);
      expect(drop).toBeDefined();
      expect(drop!.zScore).toBeLessThan(-2);
    });

    it('respects configurable threshold — higher threshold flags fewer points', () => {
      const values = [100, 102, 98, 101, 99, 100, 103, 97, 500, 100];
      const reportDefault = svc.detect(values, 2.0);
      const reportStrict = svc.detect(values, 10.0);
      expect(reportStrict.anomalies.length).toBeLessThanOrEqual(reportDefault.anomalies.length);
    });

    it('assigns severity correctly', () => {
      const values = Array(50).fill(100);
      values.push(10000); // extreme outlier → should be high
      const report = svc.detect(values, 2.0);
      const extreme = report.anomalies.find((a) => a.index === 50);
      expect(extreme?.severity).toBe('high');
    });

    it('returns correct mean and totalPoints', () => {
      const values = [10, 20, 30];
      const report = svc.detect(values);
      expect(report.mean).toBeCloseTo(20, 2);
      expect(report.totalPoints).toBe(3);
    });

    it('handles empty array without throwing', () => {
      const report = svc.detect([]);
      expect(report.anomalies).toHaveLength(0);
      expect(report.totalPoints).toBe(0);
    });

    it('handles single value without throwing', () => {
      const report = svc.detect([42]);
      expect(report.anomalies).toHaveLength(0);
      expect(report.stdDev).toBe(0);
    });
  });

  describe('false-positive feedback', () => {
    it('marks and detects false positives', () => {
      svc.markFalsePositive('revenue', 3);
      expect(svc.isFalsePositive('revenue', 3)).toBe(true);
      expect(svc.isFalsePositive('revenue', 4)).toBe(false);
    });

    it('different series keys do not collide', () => {
      svc.markFalsePositive('revenue', 1);
      expect(svc.isFalsePositive('distributions', 1)).toBe(false);
    });
  });
});
