import { AttributionService, Conversion, Touchpoint } from '../../../src/services/analytics/attributionService';

function makeConversion(id: string, revenueCents: number, touchpoints: Touchpoint[]): Conversion {
  return { id, revenueCents, touchpoints, convertedAt: new Date() };
}

const tp = (source: string, campaign: string): Touchpoint => ({
  source,
  campaign,
  timestamp: new Date(),
});

describe('AttributionService', () => {
  let svc: AttributionService;

  beforeEach(() => {
    svc = new AttributionService();
  });

  describe('buildReport() — first-touch', () => {
    it('assigns 100% credit to the first touchpoint', () => {
      svc.recordConversion(makeConversion('c1', 1000, [tp('google', 'summer'), tp('email', 'newsletter')]));
      const report = svc.buildReport('first-touch');
      const google = report.results.find((r) => r.source === 'google');
      const email = report.results.find((r) => r.source === 'email');
      expect(google?.attributedRevenueCents).toBe(1000);
      expect(email?.attributedRevenueCents).toBe(0);
    });
  });

  describe('buildReport() — last-touch', () => {
    it('assigns 100% credit to the last touchpoint', () => {
      svc.recordConversion(makeConversion('c1', 1000, [tp('google', 'summer'), tp('email', 'newsletter')]));
      const report = svc.buildReport('last-touch');
      const google = report.results.find((r) => r.source === 'google');
      const email = report.results.find((r) => r.source === 'email');
      expect(email?.attributedRevenueCents).toBe(1000);
      expect(google?.attributedRevenueCents).toBe(0);
    });
  });

  describe('buildReport() — multi-touch', () => {
    it('splits credit evenly across all touchpoints', () => {
      svc.recordConversion(makeConversion('c1', 1000, [
        tp('google', 'cpc'),
        tp('facebook', 'retarget'),
        tp('email', 'nurture'),
      ]));
      const report = svc.buildReport('multi-touch');
      for (const result of report.results) {
        // each gets ~333 cents (rounding may cause 1-cent drift)
        expect(Math.abs(result.attributedRevenueCents - 333)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('buildReport() — custom', () => {
    it('applies caller-supplied weight function', () => {
      // Give first touch 70%, last touch 30%
      svc.recordConversion(makeConversion('c1', 1000, [tp('google', 'cpc'), tp('direct', 'direct')]));
      const report = svc.buildReport('custom', (i, total) => i === 0 ? 7 : total - 1 === i ? 3 : 1);
      const google = report.results.find((r) => r.source === 'google');
      expect(google?.attributedRevenueCents).toBe(700);
    });
  });

  describe('totalRevenueCents', () => {
    it('sums all conversion revenues', () => {
      svc.recordConversion(makeConversion('c1', 500, [tp('a', 'x')]));
      svc.recordConversion(makeConversion('c2', 300, [tp('b', 'y')]));
      expect(svc.buildReport('first-touch').totalRevenueCents).toBe(800);
    });
  });

  describe('ROI calculation', () => {
    it('calculates positive ROI when revenue > cost', () => {
      svc.recordConversion(makeConversion('c1', 1000, [tp('google', 'cpc')]));
      svc.recordCost({ source: 'google', campaign: 'cpc', costCents: 200 });
      const report = svc.buildReport('first-touch');
      const result = report.results.find((r) => r.source === 'google');
      expect(result?.roiPercent).toBe(400); // (1000 - 200) / 200 * 100
    });

    it('returns null roiPercent when no cost is recorded', () => {
      svc.recordConversion(makeConversion('c1', 1000, [tp('google', 'cpc')]));
      const report = svc.buildReport('first-touch');
      const result = report.results.find((r) => r.source === 'google');
      expect(result?.roiPercent).toBeNull();
    });

    it('calculates negative ROI when cost > revenue', () => {
      svc.recordConversion(makeConversion('c1', 100, [tp('paid', 'exp')]));
      svc.recordCost({ source: 'paid', campaign: 'exp', costCents: 500 });
      const report = svc.buildReport('first-touch');
      const result = report.results.find((r) => r.source === 'paid');
      expect(result?.roiPercent).toBeLessThan(0);
    });
  });

  describe('compareModels()', () => {
    it('returns two distinct reports for the same data', () => {
      svc.recordConversion(makeConversion('c1', 1000, [tp('a', 'x'), tp('b', 'y')]));
      const { a, b } = svc.compareModels('first-touch', 'last-touch');
      expect(a.model).toBe('first-touch');
      expect(b.model).toBe('last-touch');
      // first-touch credits source 'a', last-touch credits 'b'
      const aResult = a.results.find((r) => r.source === 'a');
      const bResult = b.results.find((r) => r.source === 'b');
      expect(aResult?.attributedRevenueCents).toBe(1000);
      expect(bResult?.attributedRevenueCents).toBe(1000);
    });
  });

  describe('edge cases', () => {
    it('handles conversion with no touchpoints', () => {
      svc.recordConversion(makeConversion('c1', 500, []));
      const report = svc.buildReport('first-touch');
      expect(report.totalRevenueCents).toBe(500);
      expect(report.results).toHaveLength(0);
    });

    it('returns empty results for no recorded conversions', () => {
      const report = svc.buildReport('first-touch');
      expect(report.results).toHaveLength(0);
      expect(report.totalRevenueCents).toBe(0);
    });
  });
});
