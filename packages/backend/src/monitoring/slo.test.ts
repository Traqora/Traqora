import { sloEventsTotal, sloObservedLatency } from '../services/metrics';
import { sloMeasure } from './slo';

describe('sloMeasure', () => {
  beforeEach(() => {
    sloEventsTotal.reset();
    sloObservedLatency.reset();
  });

  it.each(['search', 'booking', 'refund'] as const)(
    'records a fulfilled %s operation once and returns its result',
    async (operation) => {
      const result = await sloMeasure(operation, async () => 'done');

      expect(result).toBe('done');
      const metric = await sloEventsTotal.get();
      expect(metric.values).toContainEqual({
        labels: { operation, result: 'good' },
        value: 1,
      });
    },
  );

  it.each(['search', 'booking', 'refund'] as const)(
    'records a fast %s rejection as bad and rethrows the original error',
    async (operation) => {
      const failure = new Error('operation failed');

      await expect(sloMeasure(operation, async () => { throw failure; })).rejects.toBe(failure);

      const metric = await sloEventsTotal.get();
      expect(metric.values).toContainEqual({
        labels: { operation, result: 'bad' },
        value: 1,
      });
    },
  );
});