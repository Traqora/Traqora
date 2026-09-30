import {
  buildSearchDataExport,
  clearSavedSearches,
  clearSearchHistory,
  createSavedSearch,
  deleteSavedSearch,
  deleteSearchHistoryEntry,
  recordSearchHistory,
  SavedSearchLimitReachedError,
  updateSavedSearch,
  type SearchMemoryPayload,
  type SearchMemoryRepositories,
} from './searchMemoryService';
import type { SearchHistoryEntry } from '../db/entities/SearchHistoryEntry';
import type { SavedSearch } from '../db/entities/SavedSearch';

type DeleteResult = { affected?: number | null };

function createHistoryEntry(overrides: Partial<SearchHistoryEntry> = {}): SearchHistoryEntry {
  return {
    id: overrides.id ?? `hist-${Math.random().toString(36).slice(2)}`,
    userId: overrides.userId ?? 'user-1',
    fromAirport: overrides.fromAirport ?? 'JFK',
    toAirport: overrides.toAirport ?? 'LAX',
    departureDate: overrides.departureDate ?? '2026-09-01',
    passengers: overrides.passengers ?? 1,
    cabinClass: overrides.cabinClass ?? 'economy',
    createdAt: overrides.createdAt ?? new Date('2026-09-01T00:00:00Z'),
  };
}

function createSavedEntry(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: overrides.id ?? `saved-${Math.random().toString(36).slice(2)}`,
    userId: overrides.userId ?? 'user-1',
    name: overrides.name ?? null,
    fromAirport: overrides.fromAirport ?? 'JFK',
    toAirport: overrides.toAirport ?? 'LAX',
    departureDate: overrides.departureDate ?? '2026-09-01',
    passengers: overrides.passengers ?? 1,
    cabinClass: overrides.cabinClass ?? 'economy',
    createdAt: overrides.createdAt ?? new Date('2026-09-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-09-01T00:00:00Z'),
  };
}

function buildRepos(): SearchMemoryRepositories & {
  historyRows: SearchHistoryEntry[];
  savedRows: SavedSearch[];
} {
  const historyRows: SearchHistoryEntry[] = [];
  const savedRows: SavedSearch[] = [];

  const history = {
    find: jest.fn(async (options: any = {}) => {
      const where = options.where ?? {};
      const filtered = historyRows.filter((row) => {
        if (where.userId && row.userId !== where.userId) return false;
        return true;
      });
      const orderDesc = (options.order?.createdAt === 'DESC');
      const sorted = [...filtered].sort((a, b) => {
        const diff = a.createdAt.getTime() - b.createdAt.getTime();
        return orderDesc ? -diff : diff;
      });
      const sliced = typeof options.take === 'number' ? sorted.slice(0, options.take) : sorted;
      if (options.select?.id) {
        return sliced.map((row) => ({ id: row.id }));
      }
      return sliced;
    }),
    findOne: jest.fn(async (options: any = {}) => {
      const where = options.where ?? {};
      return (
        historyRows.find((row) => {
          if (where.id && where.userId) return row.id === where.id && row.userId === where.userId;
          if (where.userId) {
            return (
              row.userId === where.userId &&
              row.fromAirport === where.fromAirport &&
              row.toAirport === where.toAirport &&
              row.departureDate === where.departureDate &&
              row.passengers === where.passengers &&
              row.cabinClass === where.cabinClass
            );
          }
          return false;
        }) ?? null
      );
    }),
    create: jest.fn((data: Partial<SearchHistoryEntry>) => ({
      ...createHistoryEntry(),
      ...data,
    })) as any,
    save: jest.fn(async (entity: SearchHistoryEntry) => {
      if (!historyRows.find((row) => row.id === entity.id)) {
        historyRows.push(entity);
      }
      return entity;
    }),
    remove: jest.fn(async (entity: SearchHistoryEntry) => {
      const idx = historyRows.findIndex((row) => row.id === entity.id);
      if (idx >= 0) historyRows.splice(idx, 1);
    }),
    delete: jest.fn(async (criteria: any) => {
      const ids: string[] | undefined = Array.isArray(criteria) ? criteria : undefined;
      const userId = !Array.isArray(criteria) ? criteria?.userId : undefined;
      const before = historyRows.length;
      const kept = historyRows.filter((row) => {
        if (ids) return !ids.includes(row.id);
        if (userId) return row.userId !== userId;
        return true;
      });
      historyRows.splice(0, historyRows.length, ...kept);
      const result: DeleteResult = { affected: before - historyRows.length };
      return result;
    }),
  };

  const savedSearches = {
    find: jest.fn(async (options: any = {}) => {
      const where = options.where ?? {};
      const filtered = savedRows.filter((row) => row.userId === where.userId);
      const orderDesc = (options.order?.updatedAt === 'DESC');
      const sorted = [...filtered].sort((a, b) => {
        const diff = a.updatedAt.getTime() - b.updatedAt.getTime();
        return orderDesc ? -diff : diff;
      });
      return sorted;
    }),
    findOne: jest.fn(async (options: any = {}) => {
      const where = options.where ?? {};
      return (
        savedRows.find((row) => {
          if (where.id && where.userId) return row.id === where.id && row.userId === where.userId;
          return false;
        }) ?? null
      );
    }),
    count: jest.fn(async (options: any = {}) => {
      const where = options.where ?? {};
      return savedRows.filter((row) => row.userId === where.userId).length;
    }),
    create: jest.fn((data: Partial<SavedSearch>) => ({
      ...createSavedEntry(),
      ...data,
    })) as any,
    save: jest.fn(async (entity: SavedSearch) => {
      const existing = savedRows.findIndex((row) => row.id === entity.id);
      if (existing >= 0) {
        savedRows[existing] = entity;
      } else {
        savedRows.push(entity);
      }
      return entity;
    }),
    remove: jest.fn(async (entity: SavedSearch) => {
      const idx = savedRows.findIndex((row) => row.id === entity.id);
      if (idx >= 0) savedRows.splice(idx, 1);
    }),
    delete: jest.fn(async (criteria: any) => {
      const userId = criteria?.userId;
      const before = savedRows.length;
      const kept = savedRows.filter((row) => row.userId !== userId);
      savedRows.splice(0, savedRows.length, ...kept);
      const result: DeleteResult = { affected: before - savedRows.length };
      return result;
    }),
  };

  return { history: history as any, savedSearches: savedSearches as any, historyRows, savedRows };
}

const basePayload: SearchMemoryPayload = {
  from: 'JFK',
  to: 'LAX',
  date: '2026-09-01',
  passengers: 2,
  class: 'economy',
};

describe('searchMemoryService', () => {
  describe('recordSearchHistory', () => {
    it('inserts a new history entry when no duplicate exists', async () => {
      const repos = buildRepos();
      const result = await recordSearchHistory(repos, 'user-1', basePayload);
      expect(result.entry.fromAirport).toBe('JFK');
      expect(result.prunedCount).toBe(0);
      expect(repos.historyRows).toHaveLength(1);
    });

    it('deduplicates identical entries so the most recent one stays on top', async () => {
      const repos = buildRepos();
      await recordSearchHistory(repos, 'user-1', basePayload);
      await recordSearchHistory(repos, 'user-1', basePayload);
      expect(repos.historyRows).toHaveLength(1);
    });

    it('prunes entries beyond the configured keep threshold', async () => {
      const repos = buildRepos();
      // seed 5 entries
      for (let i = 0; i < 5; i += 1) {
        repos.historyRows.push(
          createHistoryEntry({
            id: `pre-${i}`,
            userId: 'user-1',
            createdAt: new Date(2026, 0, i + 1),
          }),
        );
      }
      const result = await recordSearchHistory(repos, 'user-1', { ...basePayload, date: '2026-09-02' }, { pruneKeep: 3 });
      expect(repos.historyRows).toHaveLength(3);
      expect(result.prunedCount).toBe(3);
    });

    it('does not prune when the count is at or below the threshold', async () => {
      const repos = buildRepos();
      repos.historyRows.push(createHistoryEntry({ id: 'pre-1', userId: 'user-1' }));
      const result = await recordSearchHistory(repos, 'user-1', basePayload, { pruneKeep: 5 });
      expect(result.prunedCount).toBe(0);
    });

    it('handles a missing affected value when computing prune count', async () => {
      const repos = buildRepos();
      const original = repos.history.delete;
      repos.history.delete = jest.fn(async (ids: string[]) => {
        await original(ids);
        return {} as DeleteResult;
      }) as any;
      for (let i = 0; i < 4; i += 1) {
        repos.historyRows.push(createHistoryEntry({ id: `pre-${i}`, userId: 'user-1' }));
      }
      const result = await recordSearchHistory(repos, 'user-1', basePayload, { pruneKeep: 2 });
      // 4 pre-existing + 1 new = 5 total; pruneKeep = 2 -> 3 stale entries
      expect(result.prunedCount).toBe(3);
    });
  });

  describe('deleteSearchHistoryEntry', () => {
    it('returns true when the entry is owned by the user and removed', async () => {
      const repos = buildRepos();
      const target = createHistoryEntry({ id: 'h1', userId: 'user-1' });
      repos.historyRows.push(target);
      const removed = await deleteSearchHistoryEntry(repos, 'user-1', 'h1');
      expect(removed).toBe(true);
      expect(repos.historyRows).toHaveLength(0);
    });

    it('returns false when no entry matches the user', async () => {
      const repos = buildRepos();
      repos.historyRows.push(createHistoryEntry({ id: 'h1', userId: 'someone-else' }));
      const removed = await deleteSearchHistoryEntry(repos, 'user-1', 'h1');
      expect(removed).toBe(false);
      expect(repos.historyRows).toHaveLength(1);
    });

    it('returns false when the entry id does not exist', async () => {
      const repos = buildRepos();
      const removed = await deleteSearchHistoryEntry(repos, 'user-1', 'missing');
      expect(removed).toBe(false);
    });
  });

  describe('clearSearchHistory', () => {
    it('removes every entry owned by the user and reports the count', async () => {
      const repos = buildRepos();
      repos.historyRows.push(createHistoryEntry({ id: 'a', userId: 'user-1' }));
      repos.historyRows.push(createHistoryEntry({ id: 'b', userId: 'user-1' }));
      repos.historyRows.push(createHistoryEntry({ id: 'c', userId: 'other-user' }));
      const removed = await clearSearchHistory(repos, 'user-1');
      expect(removed).toBe(2);
      expect(repos.historyRows.map((r) => r.id)).toEqual(['c']);
    });

    it('returns 0 when affected count is unavailable', async () => {
      const repos = buildRepos();
      const original = repos.history.delete;
      repos.history.delete = jest.fn(async () => {
        await original({ userId: 'user-1' });
        return {} as DeleteResult;
      }) as any;
      const removed = await clearSearchHistory(repos, 'user-1');
      expect(removed).toBe(0);
    });
  });

  describe('clearSavedSearches', () => {
    it('removes every saved search owned by the user', async () => {
      const repos = buildRepos();
      repos.savedRows.push(createSavedEntry({ id: 's1', userId: 'user-1' }));
      repos.savedRows.push(createSavedEntry({ id: 's2', userId: 'user-1' }));
      repos.savedRows.push(createSavedEntry({ id: 's3', userId: 'other' }));
      const removed = await clearSavedSearches(repos, 'user-1');
      expect(removed).toBe(2);
      expect(repos.savedRows.map((r) => r.id)).toEqual(['s3']);
    });

    it('returns 0 when no rows match', async () => {
      const repos = buildRepos();
      const removed = await clearSavedSearches(repos, 'user-1');
      expect(removed).toBe(0);
    });

    it('returns 0 when affected count is unavailable', async () => {
      const repos = buildRepos();
      const original = repos.savedSearches.delete;
      repos.savedSearches.delete = jest.fn(async () => {
        await original({ userId: 'user-1' });
        return {} as DeleteResult;
      }) as any;
      const removed = await clearSavedSearches(repos, 'user-1');
      expect(removed).toBe(0);
    });
  });

  describe('createSavedSearch', () => {
    it('persists a new saved search', async () => {
      const repos = buildRepos();
      const saved = await createSavedSearch(repos, 'user-1', { ...basePayload, name: '  Hawaii trip  ' });
      expect(saved.name).toBe('Hawaii trip');
      expect(saved.fromAirport).toBe('JFK');
    });

    it('trims whitespace and treats empty names as null', async () => {
      const repos = buildRepos();
      const saved = await createSavedSearch(repos, 'user-1', { ...basePayload, name: '   ' });
      expect(saved.name).toBeNull();
    });

    it('throws SavedSearchLimitReachedError when the limit is hit', async () => {
      const repos = buildRepos();
      for (let i = 0; i < 2; i += 1) {
        repos.savedRows.push(createSavedEntry({ id: `pre-${i}`, userId: 'user-1' }));
      }
      await expect(
        createSavedSearch(repos, 'user-1', basePayload, { savedSearchLimit: 2 }),
      ).rejects.toBeInstanceOf(SavedSearchLimitReachedError);
    });

    it('allows creation when under the limit', async () => {
      const repos = buildRepos();
      const saved = await createSavedSearch(repos, 'user-1', basePayload, { savedSearchLimit: 1 });
      expect(saved.id).toBeDefined();
    });
  });

  describe('updateSavedSearch', () => {
    it('updates fields on an existing saved search', async () => {
      const repos = buildRepos();
      repos.savedRows.push(createSavedEntry({ id: 's1', userId: 'user-1', name: 'old' }));
      const updated = await updateSavedSearch(repos, 'user-1', 's1', {
        ...basePayload,
        name: 'new name',
        to: 'SFO',
      });
      expect(updated?.name).toBe('new name');
      expect(updated?.toAirport).toBe('SFO');
    });

    it('returns null when the saved search does not exist', async () => {
      const repos = buildRepos();
      const updated = await updateSavedSearch(repos, 'user-1', 'missing', basePayload);
      expect(updated).toBeNull();
    });
  });

  describe('deleteSavedSearch', () => {
    it('removes a saved search the user owns', async () => {
      const repos = buildRepos();
      repos.savedRows.push(createSavedEntry({ id: 's1', userId: 'user-1' }));
      const removed = await deleteSavedSearch(repos, 'user-1', 's1');
      expect(removed).toBe(true);
    });

    it('returns false when the saved search belongs to another user', async () => {
      const repos = buildRepos();
      repos.savedRows.push(createSavedEntry({ id: 's1', userId: 'other' }));
      const removed = await deleteSavedSearch(repos, 'user-1', 's1');
      expect(removed).toBe(false);
    });
  });

  describe('buildSearchDataExport', () => {
    it('produces a JSON-serializable payload with both collections', async () => {
      const repos = buildRepos();
      repos.historyRows.push(createHistoryEntry({ id: 'h1', userId: 'user-1' }));
      repos.savedRows.push(createSavedEntry({ id: 's1', userId: 'user-1', name: 'Trip' }));
      const exported = await buildSearchDataExport(repos, 'user-1', new Date('2026-09-01T00:00:00Z'));
      expect(exported.userId).toBe('user-1');
      expect(exported.exportedAt).toBe('2026-09-01T00:00:00.000Z');
      expect(exported.history).toHaveLength(1);
      expect(exported.savedSearches).toHaveLength(1);
      // JSON-serializable
      expect(() => JSON.stringify(exported)).not.toThrow();
    });
  });
});