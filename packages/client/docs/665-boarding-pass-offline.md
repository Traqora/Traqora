# Issue #665: Boarding-Pass View Offline

## Overview

Made the check-in page usable offline: an issued boarding pass is cached locally
and served when the network is unavailable, and the boarding-pass actions that
need connectivity are disabled with a clear banner.

## Features

- `useCheckInOffline(bookingId)` — cache-first check-in state with write-through
  on successful check-in and offline short-circuiting
- Cached check-ins stored under `traqora_checkin_cache_<bookingId>`
- `BoardingPassView` shows an offline/cached banner (`role="status"`) and
  disables PDF and wallet actions while offline
- Check-in page now calls the authenticated `/api/v1/checkin` endpoints
- Cached check-ins are cleared by `clearAllOfflineData()`

## Files

- `packages/client/hooks/use-check-in-offline.ts` — offline hook
- `packages/client/lib/offline-storage.ts` — `cacheCheckIn` / `getCachedCheckIn`
- `packages/client/app/checkin/[bookingId]/page.tsx` — check-in page
- `packages/client/src/components/BoardingPassView.tsx` — boarding pass view
- `packages/client/OFFLINE_MODE.md` — offline mode docs

## Testing

- `packages/client/tests/checkin/offline-boarding-pass.test.ts`
