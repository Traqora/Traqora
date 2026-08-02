const CACHE_NAME = "traqora-v3";
const RUNTIME_CACHE = "traqora-runtime-v3";
const API_CACHE = "traqora-api-v3";
const FLIGHT_SEARCH_CACHE = "traqora-flight-search-v3";

// Resources to cache on install
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/search",
  "/manifest.json",
  "/placeholder-logo.svg",
  "/placeholder.svg",
];

// API endpoints to cache for offline access
const CACHEABLE_API_PATTERNS = [
  '/api/v1/flights/search',
  '/api/v1/flights/',
  '/api/v1/bookings/',
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Failed to cache some assets:", err);
        return Promise.resolve();
      });
    }),
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            !cacheName.includes('traqora-v3')
          ) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

// Fetch event - implement caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip chrome extensions and non-HTTP(S) protocols
  if (url.protocol === "chrome-extension:" || url.protocol === "chrome:") {
    return;
  }

  // Flight search API - Cache first with network update
  if (url.pathname.includes('/flights/search')) {
    event.respondWith(
      caches.open(FLIGHT_SEARCH_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const networkFetch = fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => {
              // Return cached response if network fails
              return cachedResponse || new Response(
                JSON.stringify({
                  error: "Offline - flight search unavailable",
                  offline: true,
                  cached: !!cachedResponse,
                }),
                {
                  status: cachedResponse ? 200 : 503,
                  headers: { "Content-Type": "application/json" },
                },
              );
            });

          // Return cached response immediately if available, update in background
          return cachedResponse || networkFetch;
        });
      })
    );
    return;
  }

  // Other API requests - Network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    const isCacheable = CACHEABLE_API_PATTERNS.some(pattern => 
      url.pathname.includes(pattern)
    );

    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful cacheable API responses
          if (response.ok && response.status === 200 && isCacheable) {
            const cache = caches.open(API_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if network fails and it's cacheable
          if (isCacheable) {
            return caches.match(request).then((response) => {
              return (
                response ||
                new Response(
                  JSON.stringify({
                    error: "Offline - cached data may be unavailable",
                    offline: true,
                  }),
                  {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                  },
                )
              );
            });
          }
          // For non-cacheable APIs, return offline error
          return new Response(
            JSON.stringify({
              error: "Offline - this feature requires internet connection",
              offline: true,
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }),
    );
    return;
  }

  // Page and asset requests - Cache first, fallback to network
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (
            !response ||
            response.status !== 200 ||
            response.type === "error"
          ) {
            return response;
          }

          const cacheName = url.pathname.match(
            /\.(js|css|woff|woff2|png|jpg|svg|webp)$/i,
          )
            ? RUNTIME_CACHE
            : CACHE_NAME;

          const cache = caches.open(cacheName);
          cache.then((c) => {
            c.put(request, response.clone());
          });

          return response;
        })
        .catch(() => {
          // Return offline page or cached response
          return caches.match(request).then((cachedResponse) => {
            return (
              cachedResponse ||
              new Response("Offline - Page not available", { status: 503 })
            );
          });
        });
    }),
  );
});

// Handle messages from clients
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then((cacheNames) => {
      Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    });
  }

  if (event.data && event.data.type === "CACHE_FLIGHT_SEARCH") {
    const { url, data } = event.data;
    caches.open(FLIGHT_SEARCH_CACHE).then((cache) => {
      cache.put(url, new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      }));
    });
  }
});
