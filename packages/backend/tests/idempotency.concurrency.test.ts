import { DataSource } from 'typeorm';
import { IdempotencyKey } from '../src/db/entities/IdempotencyKey';
import {
  IdempotencyStore,
  getOrCreateIdempotencyKey,
  executeIdempotentOperation,
  hashObject,
} from '../src/services/idempotency';
import { ConflictError } from '../src/utils/errors';

describe('Idempotency Key Store Concurrency Tests', () => {
  let testDataSource: DataSource;
  let store: IdempotencyStore;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    testDataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      dropSchema: true,
      synchronize: true,
      entities: [IdempotencyKey],
      logging: false,
    });
    await testDataSource.initialize();
    store = new IdempotencyStore(testDataSource);
  });

  afterAll(async () => {
    if (testDataSource.isInitialized) {
      await testDataSource.destroy();
    }
  });

  beforeEach(async () => {
    await testDataSource.getRepository(IdempotencyKey).clear();
  });

  describe('Concurrent getOrCreateIdempotencyKey', () => {
    it('concurrent requests with the same key yield exactly one stored record and identical results', async () => {
      const key = 'test-concurrent-key-1';
      const payload = { flightId: 'FL-1001', amountCents: 50000, passengerEmail: 'user@example.com' };
      const requestHash = hashObject(payload);
      const concurrency = 25;

      // Fire 25 concurrent requests simultaneously
      const promises = Array.from({ length: concurrency }, (_, index) =>
        getOrCreateIdempotencyKey(
          {
            key,
            method: 'POST',
            path: '/api/v1/bookings',
            requestHash,
          },
          testDataSource,
        ),
      );

      const results = await Promise.all(promises);

      // Verify all 25 concurrent calls resolved without error
      expect(results).toHaveLength(concurrency);

      // Verify every caller received the exact same IdempotencyKey ID
      const firstId = results[0].id;
      expect(firstId).toBeDefined();
      results.forEach((record) => {
        expect(record.id).toBe(firstId);
        expect(record.key).toBe(key);
        expect(record.requestHash).toBe(requestHash);
      });

      // Verify the database contains EXACTLY ONE record
      const repo = testDataSource.getRepository(IdempotencyKey);
      const allRows = await repo.find({ where: { key } });
      expect(allRows).toHaveLength(1);
      expect(allRows[0].id).toBe(firstId);
    });

    it('handles race conditions when multiple workers attempt simultaneous insertion', async () => {
      const key = 'test-race-probe-key';
      const requestHash = hashObject({ test: 'race' });
      const repo = testDataSource.getRepository(IdempotencyKey);

      // Simulate race behavior where findOne returns null for multiple callers
      let insertAttempts = 0;
      const originalSave = repo.save.bind(repo);

      // Introduce slight artificial delay to maximize overlap
      const promises = Array.from({ length: 15 }, async () => {
        insertAttempts++;
        return getOrCreateIdempotencyKey(
          {
            key,
            method: 'POST',
            path: '/api/v1/bookings',
            requestHash,
          },
          testDataSource,
        );
      });

      const results = await Promise.all(promises);

      // All callers should have succeeded and got the same ID
      const uniqueIds = new Set(results.map((r) => r.id));
      expect(uniqueIds.size).toBe(1);

      // Only one record in DB
      const count = await repo.count({ where: { key } });
      expect(count).toBe(1);
    });

    it('creates distinct records for concurrent requests with different keys', async () => {
      const concurrency = 20;

      const promises = Array.from({ length: concurrency }, (_, index) => {
        const key = `distinct-key-${index}`;
        return getOrCreateIdempotencyKey(
          {
            key,
            method: 'POST',
            path: '/api/v1/bookings',
            requestHash: hashObject({ index }),
          },
          testDataSource,
        );
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(concurrency);

      const uniqueIds = new Set(results.map((r) => r.id));
      expect(uniqueIds.size).toBe(concurrency);

      const totalCount = await testDataSource.getRepository(IdempotencyKey).count();
      expect(totalCount).toBe(concurrency);
    });
  });

  describe('Concurrent executeIdempotentOperation', () => {
    it('executes operation exactly once when called concurrently and returns same result to all callers', async () => {
      const key = 'test-execute-once-key';
      const requestHash = hashObject({ booking: 'TQ-999' });
      const concurrency = 15;

      let executionCount = 0;
      const simulatedBookingId = 'booking-uuid-777';

      const operation = async () => {
        executionCount++;
        // Simulate asynchronous processing time
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          result: { bookingId: simulatedBookingId, status: 'confirmed' },
          resourceId: simulatedBookingId,
        };
      };

      // 15 concurrent calls with the same key
      const promises = Array.from({ length: concurrency }, () =>
        executeIdempotentOperation(
          {
            key,
            method: 'POST',
            path: '/api/v1/bookings',
            requestHash,
            execute: operation,
          },
          testDataSource,
        ),
      );

      const results = await Promise.all(promises);

      // Operation must be executed EXACTLY ONCE
      expect(executionCount).toBe(1);

      // All 15 callers receive the exact same result
      results.forEach((res) => {
        expect(res.result).toEqual({ bookingId: simulatedBookingId, status: 'confirmed' });
      });

      // Stored record has the resourceId attached
      const repo = testDataSource.getRepository(IdempotencyKey);
      const record = await repo.findOne({ where: { key } });
      expect(record).toBeDefined();
      expect(record?.resourceId).toBe(simulatedBookingId);

      // Total rows in DB is exactly 1
      const count = await repo.count({ where: { key } });
      expect(count).toBe(1);
    });

    it('returns cached result on subsequent sequential execution without re-executing operation', async () => {
      const key = 'test-sequential-cache-key';
      const requestHash = hashObject({ booking: 'TQ-SEQ' });
      let executionCount = 0;

      const firstCall = await executeIdempotentOperation(
        {
          key,
          method: 'POST',
          path: '/api/v1/bookings',
          requestHash,
          execute: async () => {
            executionCount++;
            return { result: { id: 'first-res' }, resourceId: 'resource-seq-1' };
          },
        },
        testDataSource,
      );

      expect(firstCall.isCached).toBe(false);
      expect(executionCount).toBe(1);

      // Second call after completion
      const secondCall = await executeIdempotentOperation(
        {
          key,
          method: 'POST',
          path: '/api/v1/bookings',
          requestHash,
          execute: async () => {
            executionCount++;
            return { result: { id: 'second-res' } };
          },
        },
        testDataSource,
      );

      expect(secondCall.isCached).toBe(true);
      expect(executionCount).toBe(1); // Did not execute again
    });

    it('rejects key reuse with different payload hash', async () => {
      const key = 'test-payload-conflict-key';
      const hash1 = hashObject({ amount: 100 });
      const hash2 = hashObject({ amount: 200 });

      // First request stores the key
      await getOrCreateIdempotencyKey(
        {
          key,
          method: 'POST',
          path: '/api/v1/bookings',
          requestHash: hash1,
        },
        testDataSource,
      );

      // Second request with DIFFERENT payload hash
      await expect(
        executeIdempotentOperation(
          {
            key,
            method: 'POST',
            path: '/api/v1/bookings',
            requestHash: hash2,
            execute: async () => ({ result: { ok: true } }),
          },
          testDataSource,
        ),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('Idempotency Store Resource ID and Utilities', () => {
    it('updates and persists resourceId for an existing idempotency key', async () => {
      const key = 'test-update-resource-key';
      const requestHash = hashObject({ flight: 'ABC' });

      const created = await store.getOrCreate({
        key,
        method: 'POST',
        path: '/api/v1/bookings',
        requestHash,
      });
      expect(created.resourceId).toBeNull();

      const updated = await store.updateResourceId(key, 'res-uuid-123');
      expect(updated?.resourceId).toBe('res-uuid-123');

      const fetched = await store.get(key);
      expect(fetched?.resourceId).toBe('res-uuid-123');
    });

    it('returns null when updating resourceId for non-existent key', async () => {
      const res = await store.updateResourceId('non-existent-key', 'res-123');
      expect(res).toBeNull();
    });

    it('hashes objects deterministically regardless of key ordering', () => {
      const obj1 = { a: 1, b: 2, c: { d: 'test' } };
      const obj2 = { a: 1, b: 2, c: { d: 'test' } };
      expect(hashObject(obj1)).toBe(hashObject(obj2));
      expect(hashObject(null)).toBe(hashObject(undefined));
    });
  });
});
