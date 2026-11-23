import { Repository } from 'typeorm';
import { SearchHistoryEntry, SearchCabinClass } from '../db/entities/SearchHistoryEntry';
import { SavedSearch } from '../db/entities/SavedSearch';

export const HISTORY_LIMIT = 10;
export const HISTORY_PRUNE_KEEP = 50;
export const SAVED_SEARCH_LIMIT = 25;

export interface SearchMemoryPayload {
  from: string;
  to: string;
  date: string;
  passengers: number;
  class: SearchCabinClass;
}

export interface SavedSearchPayload extends SearchMemoryPayload {
  name?: string;
}

export interface SearchMemoryRepositories {
  history: Repository<SearchHistoryEntry>;
  savedSearches: Repository<SavedSearch>;
}

export interface RecordHistoryResult {
  entry: SearchHistoryEntry;
  prunedCount: number;
}

export class SavedSearchLimitReachedError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Saved search limit reached (${limit})`);
    this.name = 'SavedSearchLimitReachedError';
    this.limit = limit;
  }
}

function sameEntry(a: SearchHistoryEntry, payload: SearchMemoryPayload): boolean {
  return (
    a.fromAirport === payload.from &&
    a.toAirport === payload.to &&
    a.departureDate === payload.date &&
    a.passengers === payload.passengers &&
    a.cabinClass === payload.class
  );
}

/**
 * Record a search history entry for a user, deduplicating identical entries and
 * pruning the table once the per-user count exceeds HISTORY_PRUNE_KEEP.
 */
export async function recordSearchHistory(
  repos: SearchMemoryRepositories,
  userId: string,
  payload: SearchMemoryPayload,
  limits: { pruneKeep: number } = { pruneKeep: HISTORY_PRUNE_KEEP },
): Promise<RecordHistoryResult> {
  const existing = await repos.history.find({ where: { userId } });
  const matching = existing.find((entry) => sameEntry(entry, payload));
  if (matching) {
    await repos.history.remove(matching);
  }

  const created = repos.history.create({
    userId,
    fromAirport: payload.from,
    toAirport: payload.to,
    departureDate: payload.date,
    passengers: payload.passengers,
    cabinClass: payload.class,
  });
  const saved = await repos.history.save(created);

  let prunedCount = 0;
  const allIds = await repos.history.find({
    where: { userId },
    select: { id: true },
    order: { createdAt: 'DESC' },
  });
  if (allIds.length > limits.pruneKeep) {
    const staleIds = allIds.slice(limits.pruneKeep).map((entry) => entry.id);
    if (staleIds.length > 0) {
      const result = await repos.history.delete(staleIds);
      prunedCount = typeof result.affected === 'number' ? result.affected : staleIds.length;
    }
  }

  return { entry: saved, prunedCount };
}

/**
 * Delete a single search history entry owned by the given user.
 * Returns true when an entry was removed, false when nothing matched.
 */
export async function deleteSearchHistoryEntry(
  repos: SearchMemoryRepositories,
  userId: string,
  id: string,
): Promise<boolean> {
  const entry = await repos.history.findOne({ where: { id, userId } });
  if (!entry) return false;
  await repos.history.remove(entry);
  return true;
}

/**
 * Delete every search history entry owned by the given user.
 * Returns the number of rows removed.
 */
export async function clearSearchHistory(
  repos: SearchMemoryRepositories,
  userId: string,
): Promise<number> {
  const result = await repos.history.delete({ userId });
  return typeof result.affected === 'number' ? result.affected : 0;
}

/**
 * Delete every saved search owned by the given user.
 * Returns the number of rows removed.
 */
export async function clearSavedSearches(
  repos: SearchMemoryRepositories,
  userId: string,
): Promise<number> {
  const result = await repos.savedSearches.delete({ userId });
  return typeof result.affected === 'number' ? result.affected : 0;
}

/**
 * Create a saved search, enforcing the per-user SAVED_SEARCH_LIMIT.
 */
export async function createSavedSearch(
  repos: SearchMemoryRepositories,
  userId: string,
  payload: SavedSearchPayload,
  limits: { savedSearchLimit: number } = { savedSearchLimit: SAVED_SEARCH_LIMIT },
): Promise<SavedSearch> {
  const existingCount = await repos.savedSearches.count({ where: { userId } });
  if (existingCount >= limits.savedSearchLimit) {
    throw new SavedSearchLimitReachedError(limits.savedSearchLimit);
  }

  const created = repos.savedSearches.create({
    userId,
    name: payload.name?.trim() || null,
    fromAirport: payload.from,
    toAirport: payload.to,
    departureDate: payload.date,
    passengers: payload.passengers,
    cabinClass: payload.class,
  });
  return repos.savedSearches.save(created);
}

/**
 * Update an existing saved search owned by the given user.
 * Returns the updated entity or null when no row was found.
 */
export async function updateSavedSearch(
  repos: SearchMemoryRepositories,
  userId: string,
  id: string,
  payload: SavedSearchPayload,
): Promise<SavedSearch | null> {
  const existing = await repos.savedSearches.findOne({ where: { id, userId } });
  if (!existing) return null;

  existing.name = payload.name?.trim() || null;
  existing.fromAirport = payload.from;
  existing.toAirport = payload.to;
  existing.departureDate = payload.date;
  existing.passengers = payload.passengers;
  existing.cabinClass = payload.class;
  return repos.savedSearches.save(existing);
}

/**
 * Delete a single saved search owned by the given user.
 * Returns true when an entry was removed, false when nothing matched.
 */
export async function deleteSavedSearch(
  repos: SearchMemoryRepositories,
  userId: string,
  id: string,
): Promise<boolean> {
  const entry = await repos.savedSearches.findOne({ where: { id, userId } });
  if (!entry) return false;
  await repos.savedSearches.remove(entry);
  return true;
}

export interface SearchDataExport {
  exportedAt: string;
  userId: string;
  history: SearchHistoryEntry[];
  savedSearches: SavedSearch[];
}

/**
 * Build a JSON-serializable export bundle for GDPR-style data portability.
 */
export async function buildSearchDataExport(
  repos: SearchMemoryRepositories,
  userId: string,
  exportedAt: Date = new Date(),
): Promise<SearchDataExport> {
  const [history, savedSearches] = await Promise.all([
    repos.history.find({ where: { userId }, order: { createdAt: 'DESC' } }),
    repos.savedSearches.find({ where: { userId }, order: { updatedAt: 'DESC' } }),
  ]);
  return {
    exportedAt: exportedAt.toISOString(),
    userId,
    history,
    savedSearches,
  };
}