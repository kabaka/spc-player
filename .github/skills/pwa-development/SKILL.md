---
name: pwa-development
description: Progressive Web App development — manifest, service worker lifecycle, install prompts, and offline-first architecture.
---

# PWA Development

Use this skill when implementing service worker, manifest, install experience, or offline capabilities.

## Web App Manifest

```json
{
  "name": "SPC Player",
  "short_name": "SPC Player",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "file_handlers": [
    { "action": "/", "accept": { "audio/x-spc": [".spc"] } }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": { "files": [{ "name": "spc", "accept": [".spc", "audio/x-spc"] }] }
  }
}
```

- Include both regular and maskable icons.
- `file_handlers` enables "Open with SPC Player" on supported platforms.
- `share_target` enables receiving shared SPC files.

## Service Worker Lifecycle

1. **Install**: cache app shell (HTML, CSS, JS, WASM).
2. **Activate**: clean up old caches.
3. **Fetch**: serve from cache, fall back to network.

```typescript
// Use workbox or manual SW. Key events:
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('v1').then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== 'v1').map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
```

## Caching Strategy

- **App shell** (HTML, CSS, JS, WASM): cache-first. Update in background.
- **SPC files**: stored in IndexedDB, not service worker cache.
- **User data**: IndexedDB only.
- Use versioned cache names for cache busting on deploy.

## Install Prompt

```typescript
let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
}
```

- Don't prompt immediately. Wait for user engagement.
- Show install button only when the prompt is available.
- Track install outcome for analytics.

## Update Flow

- Check for SW updates on page load and periodically.
- When update is found, show an in-app notification: "Update available. Refresh to apply."
- Never force-reload the page. Let the user choose when to update.

## Offline Indicators

- Use `navigator.onLine` and `online`/`offline` events to detect connectivity.
- Show a subtle offline indicator in the UI.
- All core playback features must work offline.
