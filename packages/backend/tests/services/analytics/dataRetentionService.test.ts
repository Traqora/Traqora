import { DataRetentionService, RetentionPolicy } from '../../../src/services/analytics/dataRetentionService';

const MS_DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * MS_DAY);
}

const policies: RetentionPolicy[] = [
  { dataType: 'events', archiveAfterDays: 90, purgeAfterDays: 365 },
];

describe('DataRetentionService', () => {
  let svc: DataRetentionService;

  beforeEach(() => {
    svc = new DataRetentionService({ policies });
  });

  describe('processDataType()', () => {
    it('leaves recent records untouched', () => {
      const records = [
        { id: '1', createdAt: daysAgo(10) },
        { id: '2', createdAt: daysAgo(30) },
      ];
      const result = svc.processDataType('events', records);
      expect(result.archived).toBe(0);
      expect(result.purged).toBe(0);
      expect(result.remaining).toBe(2);
      expect(records).toHaveLength(2);
    });

    it('archives records older than archiveAfterDays', () => {
      const records = [
        { id: '1', createdAt: daysAgo(100) },
        { id: '2', createdAt: daysAgo(10) },
      ];
      const result = svc.processDataType('events', records);
      expect(result.archived).toBe(1);
      expect(result.remaining).toBe(1);
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('2');
    });

    it('purges records older than purgeAfterDays', () => {
      const records = [{ id: '1', createdAt: daysAgo(400) }];
      const result = svc.processDataType('events', records);
      expect(result.purged).toBe(1);
      expect(result.archived).toBe(0);
      expect(records).toHaveLength(0);
    });

    it('handles a mix of fresh, archivable, and purgeable records', () => {
      const records = [
        { id: 'fresh', createdAt: daysAgo(5) },
        { id: 'archive', createdAt: daysAgo(95) },
        { id: 'purge', createdAt: daysAgo(400) },
      ];
      const result = svc.processDataType('events', records);
      expect(result.remaining).toBe(1);
      expect(result.archived).toBe(1);
      expect(result.purged).toBe(1);
      expect(records[0].id).toBe('fresh');
    });

    it('returns zero counts for unknown data type', () => {
      const records = [{ id: '1', createdAt: daysAgo(200) }];
      const result = svc.processDataType('unknown_type', records);
      expect(result.archived).toBe(0);
      expect(result.purged).toBe(0);
    });
  });

  describe('restoreFromArchive()', () => {
    it('returns the archived record by id', () => {
      const records = [{ id: 'a1', createdAt: daysAgo(100), payload: 'data' }];
      svc.processDataType('events', records);
      const restored = svc.restoreFromArchive('a1');
      expect(restored).not.toBeNull();
      expect(restored?.id).toBe('a1');
      expect(restored?.compressed).toBe(true);
    });

    it('returns null for an id that was not archived', () => {
      expect(svc.restoreFromArchive('nonexistent')).toBeNull();
    });

    it('returns null for a purged record (never archived)', () => {
      const records = [{ id: 'p1', createdAt: daysAgo(400) }];
      svc.processDataType('events', records);
      expect(svc.restoreFromArchive('p1')).toBeNull();
    });
  });

  describe('queryArchive()', () => {
    it('returns archived records for the given data type', () => {
      const records = [
        { id: 'e1', createdAt: daysAgo(100) },
        { id: 'e2', createdAt: daysAgo(110) },
      ];
      svc.processDataType('events', records);
      const archived = svc.queryArchive('events');
      expect(archived).toHaveLength(2);
    });

    it('filters by date range', () => {
      const records = [
        { id: 'e1', createdAt: daysAgo(100) },
        { id: 'e2', createdAt: daysAgo(200) },
      ];
      svc.processDataType('events', records);
      const cutoff = daysAgo(150);
      const archived = svc.queryArchive('events', { to: cutoff });
      expect(archived).toHaveLength(1);
      expect(archived[0].id).toBe('e2');
    });

    it('returns empty array for data type with no archives', () => {
      expect(svc.queryArchive('events')).toHaveLength(0);
    });
  });

  describe('getPolicies()', () => {
    it('lists all configured policies', () => {
      const policies2 = svc.getPolicies();
      expect(policies2.find((p) => p.dataType === 'events')).toBeDefined();
    });
  });
});
