jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// No Redis configured -> LoyaltyQueue falls back to synchronous processing,
// which lets us exercise processJob() deterministically without a live queue.
jest.mock('../../src/config', () => ({
  config: { redisUrl: undefined },
}));

import { LoyaltyQueue } from '../../src/jobs/loyaltyQueue';
import { DeadLetterQueue } from '../../src/jobs/deadLetterQueue';

describe('LoyaltyQueue dead-letter handling (issue #546)', () => {
  let deadLetterQueue: jest.Mocked<DeadLetterQueue>;
  let queue: LoyaltyQueue;

  beforeEach(() => {
    deadLetterQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(),
      get: jest.fn(),
      remove: jest.fn(),
      size: jest.fn(),
      shutdown: jest.fn(),
    } as unknown as jest.Mocked<DeadLetterQueue>;

    queue = new LoyaltyQueue(deadLetterQueue);
  });

  it('does not dead-letter a job that succeeds', async () => {
    queue.registerHandler('award-points', jest.fn().mockResolvedValue(undefined));

    await queue.enqueue('award-points', { userId: 'u1' });

    expect(deadLetterQueue.add).not.toHaveBeenCalled();
  });

  it('quarantines a job to the dead-letter queue once it fails outright (no redis to retry against)', async () => {
    const error = new Error('downstream unavailable');
    queue.registerHandler('award-points', jest.fn().mockRejectedValue(error));

    await queue.enqueue('award-points', { userId: 'u1' });

    expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'loyalty-queue',
        type: 'award-points',
        data: { userId: 'u1' },
        attempts: 1,
        error: 'downstream unavailable',
      }),
    );
  });

  it('preserves the original job data in the dead-letter entry for later inspection', async () => {
    const payload = { userId: 'u1', points: 42, meta: { source: 'booking' } };
    queue.registerHandler('award-points', jest.fn().mockRejectedValue(new Error('boom')));

    await queue.enqueue('award-points', payload);

    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({ data: payload }),
    );
  });

  it('does not throw when no handler is registered, and does not dead-letter (nothing ran)', async () => {
    await expect(queue.enqueue('unregistered-type', {})).resolves.toEqual(expect.any(String));
    expect(deadLetterQueue.add).not.toHaveBeenCalled();
  });
});
