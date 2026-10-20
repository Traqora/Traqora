# Issue #668: Notification Center Preferences

## Overview

Fixed the notification preferences panel so it loads and saves against the
versioned, authenticated notifications API instead of unauthenticated relative
URLs, and made the preference matrix render even when the initial fetch fails.

## Features

- Preferences fetched from `GET /api/v1/notifications/preferences` with the
  stored auth token
- Toggles saved via `PUT /api/v1/notifications/preferences` with the correct
  `{ channel, category, frequency, enabled }` payload
- Preference matrix always renders (falls back to defaults on fetch error)
- Success clears any previously displayed error
- Notification list uses the API's `body` field and the unread indicator works

## Files

- `packages/client/hooks/use-notifications.ts` — `notifyFetch` helper, API calls
- `packages/client/components/notifications/notification-preferences.tsx` — panel
- `packages/client/app/notifications/page.tsx` — notification center page
- `packages/client/lib/api.ts` — exported `getAuthHeader()`

## Testing

- `packages/client/tests/notifications/notification-preferences.test.tsx`
