const CACHE_NAME = "traqora-v1";
const RUNTIME_CACHE = "traqora-runtime-v1";
const API_CACHE = "traqora-api-v1";

// Resources to cache on install
const STATIC_ASSETS = ["/", "/placeholder-logo.svg", "/placeholder.svg"];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Failed to cache some assets:", err);
        // Continue even if some assets fail to cache
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
            cacheName !== CACHE_NAME &&
            cacheName !== RUNTIME_CACHE &&
            cacheName !== API_CACHE
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

  // Skip chrome extensions
  if (url.protocol === "chrome-extension:") {
    return;
  }

  // API requests - Network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful API responses
          if (response.ok && response.status === 200) {
            const cache = caches.open(API_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if network fails
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
            /\.(js|css|woff|woff2|png|jpg|svg)$/i,
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
});
