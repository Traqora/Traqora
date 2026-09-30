import {
  buildFunnelReport,
  DEFAULT_FUNNEL_WINDOW_DAYS,
  FunnelWindowError,
  MAX_FUNNEL_WINDOW_DAYS,
  PAID_BOOKING_STATUSES,
  resolveFunnelWindow,
} from '../../../src/services/analytics/bookingFunnelService';

const DAY_MS = 24 * 60 * 60 * 1000;
const window = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-08T00:00:00Z') };

describe('buildFunnelReport', () => {
  it('computes stage conversion, drop-off and overall conversion', () => {
    const report = buildFunnelReport({ searches: 1000, bookings: 200, payments: 150 }, window);

    expect(report.window).toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' });
    expect(report.stages).toEqual([
      { key: 'search', count: 1000, conversionFromPrevious: 100, dropOffFromPrevious: 0 },
      { key: 'book', count: 200, conversionFromPrevious: 20, dropOffFromPrevious: 80 },
      { key: 'pay', count: 150, conversionFromPrevious: 75, dropOffFromPrevious: 25 },
    ]);
    expect(report.overallConversionRate).toBe(15);
  });

  it('rounds rates to one decimal place', () => {
    const report = buildFunnelReport({ searches: 3, bookings: 1, payments: 1 }, window);
    expect(report.stages[1].conversionFromPrevious).toBe(33.3);
    expect(report.stages[1].dropOffFromPrevious).toBe(66.7);
    expect(report.overallConversionRate).toBe(33.3);
  });

  it('returns null rates instead of dividing by zero for an empty window', () => {
    const report = buildFunnelReport({ searches: 0, bookings: 0, payments: 0 }, window);
    expect(report.stages[1]).toEqual({ key: 'book', count: 0, conversionFromPrevious: null, dropOffFromPrevious: null });
    expect(report.stages[2].conversionFromPrevious).toBeNull();
    expect(report.overallConversionRate).toBeNull();
  });

  it('rejects negative or non-integer counts', () => {
    expect(() => buildFunnelReport({ searches: -1, bookings: 0, payments: 0 }, window)).toThrow(
      'Funnel count "searches" must be a non-negative integer',
    );
    expect(() => buildFunnelReport({ searches: 1, bookings: 0.5, payments: 0 }, window)).toThrow(/bookings/);
  });
});

describe('resolveFunnelWindow', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('defaults to the trailing 30 days ending now', () => {
    const resolved = resolveFunnelWindow(undefined, undefined, now);
    expect(resolved.to).toEqual(now);
    expect(now.getTime() - resolved.from.getTime()).toBe(DEFAULT_FUNNEL_WINDOW_DAYS * DAY_MS);
  });

  it('accepts an explicit window', () => {
    expect(resolveFunnelWindow(window.from, window.to, now)).toEqual(window);
  });

  it('rejects from >= to', () => {
    expect(() => resolveFunnelWindow(window.to, window.from, now)).toThrow(FunnelWindowError);
    expect(() => resolveFunnelWindow(window.from, window.from, now)).toThrow('from must be before to');
  });

  it('rejects invalid dates', () => {
    expect(() => resolveFunnelWindow(new Date('nope'), window.to, now)).toThrow('from and to must be valid dates');
  });

  it('rejects windows longer than the maximum', () => {
    const from = new Date(window.to.getTime() - (MAX_FUNNEL_WINDOW_DAYS + 1) * DAY_MS);
    expect(() => resolveFunnelWindow(from, window.to, now)).toThrow(/may not exceed/);
  });
});

describe('PAID_BOOKING_STATUSES', () => {
  it('excludes statuses reached before or without successful payment', () => {
    for (const status of ['created', 'awaiting_payment', 'payment_processing', 'failed']) {
      expect(PAID_BOOKING_STATUSES).not.toContain(status);
    }
  });
});
