jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Force the in-memory fallback path so these tests don't need a live Redis instance.
jest.mock('../../src/config', () => ({
  config: { redisUrl: undefined },
}));

import { DeadLetterQueue } from '../../src/jobs/deadLetterQueue';

describe('DeadLetterQueue (issue #546)', () => {
  let dlq: DeadLetterQueue;

  beforeEach(() => {
    dlq = new DeadLetterQueue();
  });

  it('quarantines a failed job and makes it listable', async () => {
    const entry = await dlq.add({
      id: 'job-1',
      queue: 'loyalty-queue',
      type: 'award-points',
      data: { userId: 'u1' },
      attempts: 3,
      error: 'downstream unavailable',
    });

    expect(entry.failedAt).toEqual(expect.any(String));

    const listed = await dlq.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 'job-1',
      queue: 'loyalty-queue',
      type: 'award-points',
      data: { userId: 'u1' },
      attempts: 3,
      error: 'downstream unavailable',
    });
  });

  it('lists most-recently failed jobs first', async () => {
    await dlq.add({ id: 'job-1', queue: 'q', data: {}, attempts: 1, error: 'e1' });
    await dlq.add({ id: 'job-2', queue: 'q', data: {}, attempts: 1, error: 'e2' });

    const listed = await dlq.list();
    expect(listed.map((e) => e.id)).toEqual(['job-2', 'job-1']);
  });

  it('gets a single entry by job id', async () => {
    await dlq.add({ id: 'job-1', queue: 'q', data: {}, attempts: 1, error: 'e1' });

    expect(await dlq.get('job-1')).toMatchObject({ id: 'job-1' });
    expect(await dlq.get('missing')).toBeNull();
  });

  it('removes a quarantined entry', async () => {
    await dlq.add({ id: 'job-1', queue: 'q', data: {}, attempts: 1, error: 'e1' });

    expect(await dlq.remove('job-1')).toBe(true);
    expect(await dlq.list()).toHaveLength(0);
    expect(await dlq.remove('job-1')).toBe(false);
  });

  it('reports the number of quarantined jobs via size()', async () => {
    expect(await dlq.size()).toBe(0);

    await dlq.add({ id: 'job-1', queue: 'q', data: {}, attempts: 1, error: 'e1' });
    await dlq.add({ id: 'job-2', queue: 'q', data: {}, attempts: 1, error: 'e2' });

    expect(await dlq.size()).toBe(2);
  });

  it('preserves the original job payload for later inspection/requeue', async () => {
    const payload = { orderId: 'abc', nested: { retries: 3 } };
    await dlq.add({ id: 'job-1', queue: 'q', data: payload, attempts: 1, error: 'e1' });

    const [entry] = await dlq.list();
    expect(entry.data).toEqual(payload);
  });
});
