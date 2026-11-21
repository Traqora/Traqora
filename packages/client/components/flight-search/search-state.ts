import type { Flight } from "./flight-card"

/**
 * Flight search UI state contract (issue #672)
 *
 * The search page renders exactly one of the following states at a time.
 * `getSearchUiState` is the single source of truth for which state applies;
 * ResultsList and the search page must derive their UI from it.
 */
export type SearchUiState = "idle" | "loading" | "success" | "empty" | "error"

export interface SearchStateInput {
  /** True once a search has been submitted at least once in this session (URL prefill counts). */
  hasSearched: boolean
  /** True while the search request is in flight. */
  isLoading: boolean
  /** Human-readable error message for the most recent attempt, or null. */
  error: string | null
  /** Number of results currently held for the active search (may include cached results). */
  resultCount: number
}

/**
 * Derive the current UI state from the raw search signals.
 *
 * Selection rules (in priority order):
 * 1. `error !== null`                     -> "error"   (an error always wins, even with stale results)
 * 2. `isLoading && resultCount === 0`     -> "loading" (first results are still arriving)
 * 3. `!isLoading && resultCount === 0`    -> "empty"  when `hasSearched`, else "idle"
 * 4. otherwise (resultCount > 0)          -> "success"
 *
 * Error cases:
 * - `hasSearched` isn't tracked by the caller: default it to false, which renders "idle"
 *   instead of a misleading "No flights found" empty state on first load.
 * - A stale response must never mutate state after a newer search started; callers should
 *   discard superseded responses (see useFlightSearch's request token).
 */
export function getSearchUiState({
  hasSearched = false,
  isLoading,
  error,
  resultCount,
}: SearchStateInput): SearchUiState {
  if (error !== null) return "error"
  if (isLoading && resultCount === 0) return "loading"
  if (resultCount === 0) return hasSearched ? "empty" : "idle"
  return "success"
}

/**
 * Helper for callers that only hold the result list; derives `resultCount` from flights.
 */
export function getSearchUiStateForFlights(
  input: Omit<SearchStateInput, "resultCount"> & { flights: Flight[] },
): SearchUiState {
  return getSearchUiState({ ...input, resultCount: input.flights.length })
}
