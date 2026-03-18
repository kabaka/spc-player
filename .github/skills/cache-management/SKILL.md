---
name: cache-management
description: Cache busting strategies, versioned assets, and stale-while-revalidate patterns for PWA caching.
---

# Cache Management

Use this skill when implementing caching strategies for the service worker or managing asset versioning.

## Cache Strategy by Resource Type

| Resource | Strategy | Rationale |
| -------- | -------- | --------- |
| App shell (HTML) | Network-first, cache fallback | Ensures fresh content, works offline |
| JS/CSS bundles | Cache-first (content-hashed filenames) | Immutable once deployed |
| WASM modules | Cache-first (content-hashed) | Large, rarely changes |
| Icons/images | Cache-first | Static assets |
| Fonts | Cache-first, long expiry | Rarely change |

## Content-Hashed Filenames

Build tools (Vite, webpack) produce filenames like `app.a1b2c3d4.js`. These are safe to cache indefinitely because the filename changes when the content changes.

- `index.html` is the only file that should NOT be content-hashed (it's the entry point).
- The service worker file itself should not be cached aggressively.

## Stale-While-Revalidate

Serve from cache immediately, then fetch a fresh copy in the background for next time.

```typescript
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.open('dynamic').then(async (cache) => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request).then((response) => {
        cache.put(e.request, response.clone());
        return response;
      });
      return cached || fetchPromise;
    })
  );
});
```

Good for resources that change occasionally but stale data is acceptable.

## Cache Versioning

- Use a version string in cache names: `app-shell-v2`, `app-shell-v3`.
- On activate, delete all caches that don't match the current version.
- Increment version on each deploy.

## Storage Quotas

- Browsers limit storage per origin (varies: ~50MB to several GB).
- Use `navigator.storage.estimate()` to check usage and quota.
- Request persistent storage: `navigator.storage.persist()` — prevents eviction.
- Monitor storage and warn users if approaching limits.

## Precaching

Cache critical resources during install:

```typescript
const PRECACHE = [
  '/',
  '/index.html',
  '/app.js',     // use actual hashed names
  '/app.css',
  '/spc-engine.wasm',
];
```

Keep the precache list short. Only include resources needed for the app to function offline.

## Cache Invalidation Rules

- Never cache API responses or dynamic data in the service worker cache.
- SPC files go in IndexedDB, not the cache API.
- Clear old caches promptly in the activate handler.
- If a cached resource fails to load (corrupted), delete it and refetch.
