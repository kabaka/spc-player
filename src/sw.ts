/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
declare const __APP_VERSION__: string;
declare const __BASE_URL__: string;
declare const __PRECACHE_URLS__: string[];

const BASE_URL: string =
  typeof __BASE_URL__ !== 'undefined' ? __BASE_URL__ : '/';
const PRECACHE_URLS: string[] =
  typeof __PRECACHE_URLS__ !== 'undefined' ? __PRECACHE_URLS__ : [];

const CACHE_PREFIX = 'spc-player';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${__APP_VERSION__}`;
const HTML_CACHE = `${CACHE_PREFIX}-html-${__APP_VERSION__}`;
const CURRENT_CACHES = [STATIC_CACHE, HTML_CACHE];

// ── Install ───────────────────────────────────────────────────────────
// Precache the HTML shell so the app works offline immediately.

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    Promise.all([
      caches.open(HTML_CACHE).then((cache) => cache.addAll([BASE_URL])),
      PRECACHE_URLS.length > 0
        ? caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
        : Promise.resolve(),
    ]).then(() => {
      // Don't call skipWaiting here — wait for user to opt in to update.
      // skipWaiting is triggered via postMessage from the main thread.
    }),
  );
});

// ── Activate ──────────────────────────────────────────────────────────
// Purge old versioned caches.

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────

/**
 * Returns true for content-hashed assets that are immutable once deployed.
 * Vite produces filenames like `assets/index-a1b2c3d4.js`.
 */
const isImmutableAsset = (url: URL): boolean => {
  const path = url.pathname;
  // Match Vite's content-hashed output: /assets/name-hash.ext
  if (path.includes('/assets/') && /\.[a-f0-9]{8,}\.\w+$/.test(path)) {
    return true;
  }
  // WASM files are content-hashed too
  if (path.endsWith('.wasm')) {
    return true;
  }
  // Icons and other static assets under the icons directory
  if (path.includes('/icons/')) {
    return true;
  }
  return false;
};

/**
 * Returns true for navigation requests (HTML pages).
 */
const isNavigationRequest = (request: Request): boolean =>
  request.mode === 'navigate';

/**
 * Cache-first strategy for immutable, content-hashed assets.
 * If cached, serve immediately. Otherwise fetch, cache, and serve.
 */
const cacheFirst = async (request: Request): Promise<Response> => {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
};

/**
 * Stale-while-revalidate for HTML navigation requests.
 * Serve cached version immediately, fetch update in background.
 */
const staleWhileRevalidate = async (request: Request): Promise<Response> => {
  const cache = await caches.open(HTML_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {
      // Network failed — cached version (if any) was already returned
      return undefined;
    });

  if (cached) {
    // Serve stale, revalidate in background
    void fetchPromise;
    return cached;
  }

  // No cache — must wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Last resort: return a basic offline page
  return new Response('Offline', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
};

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests (share target POST, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  // Navigation requests → SPA fallback with stale-while-revalidate
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      staleWhileRevalidate(
        new Request(BASE_URL, {
          headers: event.request.headers,
        }),
      ),
    );
    return;
  }

  // Immutable content-hashed assets → cache-first
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: network-only (service worker script, etc.)
});

// ── Update messaging ──────────────────────────────────────────────────
// The main thread sends SKIP_WAITING when the user accepts an update.

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

export {};
