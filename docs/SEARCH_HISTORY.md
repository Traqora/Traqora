# Search History & Saved Searches

The platform persists a per-user search history and a bounded list of saved
searches so travellers can quickly re-book favourite routes.

## Backend

The behaviour is implemented in `packages/backend/src/services/searchMemoryService.ts`
and exposed via the `/api/v1/flights/*` routes in
`packages/backend/src/api/routes/flights.ts`.

| Method | Path                              | Description                                                |
| ------ | --------------------------------- | ---------------------------------------------------------- |
| GET    | `/search/history`                 | Returns the user's most recent history entries (max 10).   |
| POST   | `/search/history`                 | Records a new history entry, deduplicating identical ones. |
| DELETE | `/search/history/:id`             | Removes a single history entry owned by the user.          |
| DELETE | `/search/history`                 | Clears **all** history entries for the user (privacy).     |
| GET    | `/search/history/export`          | Downloads a JSON bundle of history + saved searches.       |
| GET    | `/saved-searches`                 | Lists saved searches (max 25 per user).                    |
| POST   | `/saved-searches`                 | Creates a new saved search.                                |
| PUT    | `/saved-searches/:id`             | Updates an existing saved search.                          |
| DELETE | `/saved-searches/:id`             | Removes a single saved search.                             |
| DELETE | `/saved-searches`                 | Clears **all** saved searches for the user (privacy).      |

### Limits

* `HISTORY_PRUNE_KEEP = 50` — per-user history rows are pruned down to this
  count when a new entry is recorded.
* `SAVED_SEARCH_LIMIT = 25` — users cannot store more than 25 saved searches.
* `HISTORY_LIMIT = 10` — the GET endpoint returns only the 10 most recent
  entries; older entries are still kept (up to the prune keep threshold).

## Frontend

* `packages/client/lib/api.ts` exposes typed wrappers for every endpoint above.
* `packages/client/lib/search-sharing.ts` provides `buildSearchShareLink`,
  `decodeSearchQueryFromUrl`, `decodeSearchQueryFromJson`, and
  `encodeSearchQueryToJson` for bookmarkable and shareable URLs.
* `packages/client/app/search/page.tsx` renders the **Recent Searches** and
  **Saved Searches** cards, surfaces a **Share** button for the current query,
  and exposes **Export** and **Clear all** controls for both lists.

## Tests

* `packages/backend/src/services/searchMemoryService.test.ts` — unit tests
  covering record, dedupe, prune, delete, clear, export, and the saved-search
  limit error. Coverage is 100% statements / 92% branches on the service.
* `packages/client/tests/search-sharing.test.ts` — encode / decode round-trip
  and validation cases.
* `packages/client/tests/search-memory-privacy.test.ts` — wire-format tests for
  the new clear / export endpoints.

## Privacy

The clear-all and export endpoints follow the principle of data minimisation:
every operation is scoped to the authenticated wallet (`req.user.walletAddress`),
and the export bundle contains only the calling user's data.