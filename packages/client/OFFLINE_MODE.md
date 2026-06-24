# Offline Mode Support

This document describes the offline mode implementation for the Traqora client, allowing users to access booking information and perform actions even when offline.

## Architecture Overview

The offline mode consists of four main components:

1. **Service Worker (`public/sw.js`)** - Handles caching and offline request interception
2. **Offline Storage (`lib/offline-storage.ts`)** - Manages local storage of bookings and itineraries
3. **Offline Provider (`components/offline-provider.tsx`)** - Registers service worker and provides offline context
4. **Sync Hook (`lib/use-offline-sync.ts`)** - Handles syncing pending data when reconnected

## Features

### Service Worker Caching

The service worker implements a hybrid caching strategy:

- **Static Assets**: Cached on install (logo, SVG files)
- **API Requests**: Network-first strategy with cache fallback
- **Pages & Assets**: Cache-first strategy with network fallback
- **Auto-cleanup**: Removes old caches on activation

#### Caching Strategy Details

```
API Requests (/api/*)
├─ Try network first
├─ On success: Cache response for future offline use
└─ On failure: Return cached response or error

Pages & Assets
├─ Try cache first
├─ On miss: Fetch from network
├─ On success: Cache for offline access
└─ On failure: Return offline page or cached version
```

### Local Storage Management

Bookings and itineraries are cached locally with the following features:

- **Automatic expiry**: Data expires after 7 days
- **Size management**: Automatically removes oldest data when storage quota is exceeded
- **Pending syncs**: Tracks changes made while offline for later sync

### Offline Status Monitoring

The `useOfflineStatus()` hook provides:

- Current online/offline status
- Pending sync count
- Automatic sync on reconnection
- Custom events for global sync handling

## Usage Guide

### 1. Displaying Offline Status

Use the `OfflineIndicator` component to show users their connection status:

```tsx
import { OfflineIndicator } from "@/components/offline-indicator";

export function MyComponent() {
  return (
    <>
      <OfflineIndicator />
      {/* Your content */}
    </>
  );
}
```

### 2. Caching Bookings

Cache booking data when fetched from the API:

```tsx
import { cacheBooking, cacheBookings } from "@/lib/offline-storage";

// Cache a single booking
cacheBooking({
  id: "BOOKING-123",
  flightNumber: "BA123",
  departureTime: "2024-01-15T10:00:00Z",
  arrivalTime: "2024-01-15T14:00:00Z",
  airline: "British Airways",
  from: "LHR",
  to: "JFK",
  passengers: 2,
  totalPrice: 450.0,
  bookingDate: "2024-01-10",
  status: "confirmed",
});

// Cache multiple bookings
cacheBookings(bookingsArray);
```

### 3. Accessing Cached Data

Retrieve cached bookings for offline viewing:

```tsx
import { getCachedBookings, useCachedBookings } from "@/lib/offline-storage";

// Direct function call
const bookings = getCachedBookings();

// Or use the hook
export function MyComponent() {
  const { bookings, isLoading } = useCachedBookings();

  return (
    <div>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {bookings.map((booking) => (
            <li key={booking.id}>{booking.flightNumber}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### 4. Caching Itineraries

For detailed trip information:

```tsx
import { cacheItinerary, getCachedItinerary } from "@/lib/offline-storage";

// Cache an itinerary
cacheItinerary("BOOKING-123", bookingData);

// Retrieve cached itinerary
const itinerary = getCachedItinerary("BOOKING-123");
if (itinerary) {
  console.log("Trip:", itinerary.booking);
  console.log("Cached at:", new Date(itinerary.cachedAt));
}
```

### 5. Handling Offline Actions

Track changes made while offline for sync on reconnection:

```tsx
import { useAddOfflineSync, useOfflineSync } from "@/lib/use-offline-sync";

export function MyComponent() {
  const addOfflineSync = useAddOfflineSync();
  const { isSyncing, syncError, syncPendingData } = useOfflineSync({
    onSuccess: () => console.log("Synced!"),
    onError: (error) => console.error("Sync failed:", error),
  });

  async function handleBookingAction() {
    try {
      // Try to perform action
      const response = await fetch("/api/bookings/update", {
        method: "POST",
        body: JSON.stringify({
          /* booking data */
        }),
      });

      if (!response.ok && !navigator.onLine) {
        // Queue for sync if offline
        addOfflineSync("booking", {
          /* data */
        });
      }
    } catch (error) {
      if (!navigator.onLine) {
        addOfflineSync("booking", {
          /* data */
        });
      }
    }
  }

  return (
    <div>
      <button onClick={handleBookingAction} disabled={isSyncing}>
        {isSyncing ? "Syncing..." : "Book Flight"}
      </button>
      {syncError && <p className="text-red-600">{syncError.message}</p>}
    </div>
  );
}
```

### 6. Checking Offline Status

Use the `useOffline()` hook to access offline context:

```tsx
import { useOffline } from "@/components/offline-provider";

export function MyComponent() {
  const { isOnline, hasPendingSyncs, isServiceWorkerReady } = useOffline();

  return (
    <div>
      <p>Online: {isOnline ? "Yes" : "No"}</p>
      <p>Pending Syncs: {hasPendingSyncs ? "Yes" : "No"}</p>
      <p>Service Worker: {isServiceWorkerReady ? "Ready" : "Not ready"}</p>
    </div>
  );
}
```

## Implementation Details

### Storage Structure

```typescript
{
  bookings: {
    'BOOKING-ID': CachedBooking,
    // ...
  },
  itineraries: {
    'BOOKING-ID': CachedItinerary,
    // ...
  },
  lastSyncTime: number,
  pendingSyncs: [
    {
      type: 'booking' | 'itinerary',
      data: any,
      timestamp: number,
    },
    // ...
  ]
}
```

### Cache Expiry

- **Bookings & Itineraries**: 7 days
- **Pending Syncs**: 24 hours
- **Static Assets**: Indefinite (until cache version changes)

### Storage Quota Handling

When localStorage quota is exceeded:

1. Automatically removes oldest 50% of bookings
2. Automatically removes oldest 50% of itineraries
3. Retries the storage operation
4. Logs error if still fails

## Service Worker Update Strategy

- Checks for updates every hour
- Auto-skips waiting when new version available
- Notifies app via `controllerchange` event
- Dispatches custom event `offline:sw-updated`

## Testing Offline Mode

### In Chrome DevTools

1. Open DevTools (F12)
2. Go to **Application** tab
3. Select **Service Workers**
4. Check "Offline" checkbox
5. Reload page to test offline behavior

### Programmatically

```tsx
// Simulate going offline
window.dispatchEvent(new Event("offline"));

// Simulate coming back online
window.dispatchEvent(new Event("online"));
```

## Performance Considerations

- **Initial Load**: First visit may take slightly longer to cache assets
- **Storage Size**: ~5-10MB typical usage for 50+ bookings
- **Sync Overhead**: Minimal impact on online experience
- **Network Detection**: Uses browser's native online/offline API

## Browser Support

| Browser | Service Worker | LocalStorage | Offline API |
| ------- | -------------- | ------------ | ----------- |
| Chrome  | ✓ 40+          | ✓            | ✓           |
| Firefox | ✓ 44+          | ✓            | ✓           |
| Safari  | ✓ 11.1+        | ✓            | ✓           |
| Edge    | ✓ 17+          | ✓            | ✓           |

## Troubleshooting

### Service Worker Not Registering

```tsx
// Check if service workers are supported
if ("serviceWorker" in navigator) {
  // Try to register manually
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}
```

### Cached Data Not Updating

```tsx
// Clear all offline data
import { clearAllOfflineData } from "@/lib/offline-storage";
clearAllOfflineData();
```

### LocalStorage Quota Exceeded

- Clear browser cache/cookies
- Use `clearAllOfflineData()` to manually clear Traqora offline storage
- Implement aggressive cleanup in `lib/offline-storage.ts`

## Future Enhancements

1. **Incremental Sync**: Sync changes in background without blocking UI
2. **Conflict Resolution**: Handle conflicts when same booking updated offline and online
3. **Data Compression**: Reduce storage size using compression
4. **Sync Statistics**: Track sync success rate and performance
5. **Offline-first API**: Build UI interactions optimistically offline
6. **Background Sync**: Use Background Sync API for reliable syncing

## API Integration Points

When integrating with your API, implement sync endpoints:

```tsx
// Example sync endpoints to implement
POST /api/bookings/sync - Sync pending booking changes
POST /api/itineraries/sync - Sync pending itinerary changes
GET /api/bookings?cached=true - Fetch only cached booking IDs
```

## Security Considerations

- Offline data stored in user's browser - no additional encryption
- Service Worker runs in isolated context
- Only cache non-sensitive booking information
- Consider clearing sensitive data on logout
- Use HTTPS to ensure service worker installation security

## Performance Monitoring

```tsx
// Monitor sync performance
const { isSyncing } = useOfflineSync({
  onSuccess: () => {
    console.log("Sync completed successfully");
    // Send analytics
  },
  onError: (error) => {
    console.error("Sync failed:", error);
    // Send error to monitoring service
  },
});
```
