---
name: browser-compatibility
description: Browser compatibility checking — Can I Use, polyfills, vendor prefixes, and compatibility tables.
---

# Browser Compatibility

Use this skill when evaluating API support across browsers, choosing polyfills, or handling vendor differences.

## Key APIs and Support

| API | Chrome | Firefox | Safari | Notes |
| --- | ------ | ------- | ------ | ----- |
| AudioWorklet | 66+ | 76+ | 14.5+ | Core requirement |
| WebAssembly | 57+ | 52+ | 11+ | Core requirement |
| SharedArrayBuffer | 68+ | 79+ | 15.2+ | Needs COOP/COEP |
| IndexedDB | 24+ | 16+ | 10+ | Universal support |
| Service Worker | 40+ | 44+ | 11.1+ | Universal support |
| Web MIDI | 43+ | Behind flag | No | Progressive enhancement |
| File System Access | 86+ | No | No | Progressive enhancement |
| File Handling | 102+ | No | No | Progressive enhancement |
| Media Session | 73+ | 82+ | 15+ | Progressive enhancement |
| WebCodecs | 94+ | 130+ | 16.4+ | For future audio encoding |

## Checking Compatibility

1. **Can I Use**: primary reference for browser support data.
2. **MDN**: detailed compatibility tables per API.
3. **Baseline**: check if the feature is in the "widely available" baseline.

## Polyfill Policy

- **Prefer feature detection over polyfills**.
- Only polyfill if the feature is critical and the polyfill is small and reliable.
- Never polyfill complex APIs (AudioWorklet, WASM) — use fallback paths instead.
- Document any polyfills in use and their removal criteria (when baseline support is sufficient).

## Minimum Browser Versions

Based on required APIs (AudioWorklet + WASM):

| Browser | Minimum Version |
| ------- | --------------- |
| Chrome | 66 |
| Firefox | 76 |
| Safari | 14.5 |
| Edge | 79 (Chromium-based) |

Display a clear message for unsupported browsers: "SPC Player requires a modern browser. Please update to the latest version of Chrome, Firefox, Safari, or Edge."

## Testing

- Test in all target browsers, not just Chrome.
- Use Playwright's multi-browser support (Chromium, Firefox, WebKit).
- Pay special attention to Safari — it often has unique audio behavior.
- Test on real mobile devices periodically (emulators miss some issues).

## Vendor Prefixes

- Avoid vendor-prefixed APIs. Use standard APIs.
- If a prefix is unavoidable, detect and use it:

```typescript
const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
```

- Remove prefix fallbacks once baseline support is achieved.
