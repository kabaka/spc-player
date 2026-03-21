# SPC Player — General Improvements Evaluation

Independent code review of the SPC Player codebase. Findings are categorized by severity: **Critical** (correctness/security risk, should fix before next release), **Important** (quality/maintainability, should fix soon), and **Nice-to-have** (polish, can defer).

---

## Critical

### C-1. Hardcoded service worker path breaks portability

**File:** `src/pwa/sw-registration.ts:62-63`

The SW registration hardcodes `/spc-player/sw.js` and scope `/spc-player/`. If the `base` config in `vite.config.ts` changes, the app breaks silently — the SW simply fails to register, and there's no error surfaced to the user.

The Vite config already sets `base: '/spc-player/'`, so the correct approach is:

```ts
const base = import.meta.env.BASE_URL; // Vite resolves this at build time
const registration = await navigator.serviceWorker.register(`${base}sw.js`, {
  scope: base,
});
```

The same hardcoded `/spc-player/` path appears in `src/sw.ts:17` inside `cache.addAll(['/spc-player/'])` — this would also need to use a build-time define rather than a hardcoded string. The SW build in `vite.config.ts:22-24` already passes `define` values, so a `__BASE_URL__` define could be added.

### C-2. Silent error swallowing in store rehydration

**File:** `src/store/store.ts:126-128`

```ts
} catch {
  // Silently fail — user can manually select a track
}
```

`restoreTrackMetadata` catches _all_ errors — including programmer errors, type mismatches, or corruption — and discards them. This violates the project's own error handling conventions (`errors/report.ts` exists for exactly this purpose). If the SPC parser throws due to a corrupted stored file, the user sees nothing and has no idea why their last track didn't restore.

**Suggested fix:** Catch, log via `reportError`, and continue with the "no track" fallback.

### C-3. Empty catch blocks in audio engine visibility handler

**File:** `src/audio/engine.ts:555-556, 564-565`

```ts
this.audioContext.suspend().catch(() => {});
this.audioContext.resume().catch(() => {});
```

These suppress errors from `AudioContext.suspend()`/`.resume()`. While these operations rarely fail, when they do (e.g., context is closing during a race), the empty catch hides the root cause. The eslint-disable comments acknowledge this but don't resolve it.

**Suggested fix:** At minimum, log a debug warning. Or use the project's existing error infrastructure:

```ts
this.audioContext.suspend().catch((e) => {
  if (this.audioContext?.state !== 'closed') {
    reportError(
      audioPipelineError('AUDIO_CONTEXT_FAILED', {
        detail: `visibility suspend: ${e instanceof Error ? e.message : String(e)}`,
      }),
    );
  }
});
```

---

## Important

### I-1. `recently-played` is write-only dead code

**File:** `src/storage/recently-played.ts`

`recordRecentPlay` writes to IndexedDB but there is **no corresponding read function** anywhere in the codebase. The data is accumulated (with careful trimming logic) but never displayed or used.

This means:

- IndexedDB space is consumed for data nobody reads.
- The `by-played` index and trimming logic is tested but serves no purpose.
- `orchestration.ts:367` fires `recordRecentPlay` on every track play with a `Function.prototype` no-op catch — adding I/O for unused data.

**Suggestion:** Either implement a "Recently Played" view/feature that reads this data, or remove the write-only code to reduce I/O overhead and dead code surface.

### I-2. `console.error` in audio-sync instead of `reportError`

**File:** `src/audio/audio-sync.ts:50`

```ts
console.error(`[audio-sync] recreateAudioContext failed: ${detail}`);
```

The project has a comprehensive error reporting system (`errors/report.ts`) with ring buffer, toast display, and structured error codes. This `console.error` bypasses all of that. A user who triggers a sample rate change failure sees nothing in the UI.

**Suggested fix:**

```ts
import { reportError } from '@/errors/report';
import { audioPipelineError } from '@/errors/factories';
// ...
reportError(audioPipelineError('AUDIO_CONTEXT_FAILED', { detail }));
```

### I-3. Duplicated `formatTime` / `formatSpokenTime` utilities

**Files:** `src/features/player/PlayerView.tsx:22-36`, `src/features/playlist/PlaylistView.tsx:16-30`

Two nearly identical `formatTime` implementations exist:

- `PlayerView.tsx` takes seconds as input
- `PlaylistView.tsx` takes milliseconds as input

Both produce the same `M:SS` output. Similarly, `formatSpokenTime` (PlayerView) and `formatSpokenDuration` (PlaylistView) are near-clones.

**Suggestion:** Extract to `src/utils/format-time.ts` with a single canonical implementation, accepting seconds (the more fundamental unit) and converting at call sites.

### I-4. Duplicated platform detection logic across 3 files

**Files:**

- `src/shortcuts/ShortcutManager.ts:69` — `const nav = navigator as any;`
- `src/utils/platform.ts:13` — `const nav = navigator as any;`
- `src/components/ShortcutHelpDialog/ShortcutHelpDialog.tsx:11` — `const nav = typeof navigator !== 'undefined' ? (navigator as any) : undefined;`

All three access `navigator.userAgentData?.platform` or fall back to `navigator.platform`. The `platform.ts` utility file already centralizes this — `ShortcutManager.ts` and `ShortcutHelpDialog.tsx` should import from it.

### I-5. Missing accessibility linting

**File:** `eslint.config.js`

The project has thorough WCAG compliance patterns (ARIA listbox in playlist, keyboard navigation, `formatSpokenTime` for screen readers), but the ESLint config has **no `eslint-plugin-jsx-a11y`**. This means accessibility regressions (missing `alt` text, bad `role` usage, non-interactive elements with handlers) won't be caught automatically.

**Suggestion:** Add `eslint-plugin-jsx-a11y` to enforce WCAG at lint time.

### I-6. Missing import order linting

**File:** `eslint.config.js`

The code style skill specifies import grouping (external → internal → types), but no ESLint plugin enforces it. Without `eslint-plugin-import` or `eslint-plugin-simple-import-sort`, import order is convention-only and will drift.

### I-7. `Function.prototype as () => void` pattern

**File:** `src/store/slices/orchestration.ts:367`

```ts
void recordRecentPlay(trackId).catch(
  /* suppress */ Function.prototype as () => void,
);
```

This is an unusual idiom that will confuse future contributors. `Function.prototype` happens to be a no-op function, but using it this way requires an unsafe cast and is non-obvious.

**Suggested replacement:**

```ts
void recordRecentPlay(trackId).catch(() => {
  /* fire-and-forget */
});
```

Or, if the lint rule objects to empty catch bodies, define a shared `noop` utility.

### I-8. Audio engine singleton impedes testability

**File:** `src/audio/engine.ts:603`

```ts
export const audioEngine = new AudioEngine();
```

Module-level instantiation means every test that imports `audioEngine` (directly or transitively) gets the same real instance. The class constructor sets up document event listeners and browser API dependencies. This makes unit testing audio-dependent features harder than necessary.

**Suggestion:** Export the class and a lazy getter, or use a factory pattern:

```ts
export { AudioEngine };
export const getAudioEngine = (() => {
  let instance: AudioEngine | null = null;
  return () => (instance ??= new AudioEngine());
})();
```

### I-9. Massive test coverage gaps in critical paths

**Coverage data from `coverage/coverage-summary.json`:**

| File                                     | Line Coverage |
| ---------------------------------------- | ------------- |
| `src/audio/engine.ts`                    | **14.3%**     |
| `src/audio/audio-sync.ts`                | **0%**        |
| `src/audio/wasm-loader.ts`               | **10%**       |
| `src/store/slices/orchestration.ts`      | **34.1%**     |
| `src/store/slices/export.ts`             | **39.4%**     |
| `src/workers/export-worker.ts`           | **0%**        |
| `src/features/playlist/PlaylistView.tsx` | **0%**        |
| `src/features/analysis/*` (4 files)      | **0%** each   |
| `src/pwa/sw-registration.ts`             | **25%**       |
| `src/pwa/media-session.ts`               | **30.4%**     |

The overall line coverage is **53%** against a 50% threshold. The audio engine — arguably the most critical code path — is at 14%. The orchestration slice that coordinates file loading, track switching, and playback is at 34%.

The threshold of 50% lines / 60% functions / 70% branches / 50% statements is low enough that significant regressions can be introduced without CI catching them.

### I-10. WASM file not precached for offline use

**File:** `src/sw.ts:14-23`

The service worker only precaches the HTML shell (`/spc-player/`). Content-hashed assets (JS, CSS, WASM) are cached lazily on first request via `stale-while-revalidate` or `cache-first`. This means **a fresh install that immediately goes offline cannot play any SPC files** — the WASM binary hasn't been cached yet.

For a PWA that promises offline support, the WASM binary is essential to core functionality and should be in the precache list.

### I-11. No cache size limits on static cache

**File:** `src/sw.ts` (throughout)

The `STATIC_CACHE` stores all content-hashed assets with no eviction policy. Over many app versions, old cached assets accumulate (old caches _are_ cleaned on activate, but within a single version, the cache can grow unbounded with repeated fetches of different assets).

This is a minor concern given the versioned cache naming, but worth noting for long-lived sessions.

### I-12. Recovery counter never resets on new track load

**File:** `src/audio/audio-recovery.ts:19-20`

The module-level `recoveryAttempts` counter only resets on successful recovery (`resetRecovery()`). If a user loads a new, different track after hitting recovery failures on a previous track, the stale counter persists. After 3 accumulated failures across different tracks (not necessarily 3 on the same track), recovery stops being attempted.

**Suggestion:** Reset `recoveryAttempts` when a new track is loaded, not just on recovery success.

### I-13. COOP/COEP headers only configured for dev server

**File:** `vite.config.ts:96-99`

```ts
server: {
  headers: {
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
  },
},
```

These headers enable `SharedArrayBuffer` access, which may be needed for high-performance audio. They're set for the dev server but **not** for the production deployment on GitHub Pages. If any feature requires `SharedArrayBuffer` (now or in the future), it will silently fail in production.

**Note:** GitHub Pages doesn't support custom headers directly, so this would need a meta-tag approach or a Cloudflare/Netlify deployment for production parity.

---

## Nice-to-Have

### N-1. Empty `#player-controls` placeholder in root layout

**File:** `src/app/routes/__root.tsx:119`

```tsx
<div id="player-controls">{/* Player transport controls placeholder */}</div>
```

This empty div renders in production, adding a non-functional DOM element. Either implement the feature or remove the placeholder.

### N-2. TODO comments without real issue references

**Files:**

- `src/shortcuts/GlobalShortcuts.tsx:316,320,326,369` — `TODO(#issue)` with literal `#issue` placeholder
- `src/features/instrument/InstrumentView.tsx:160,163,166` — bare `TODO: wire to audio engine`
- `src/export/encoders/ogg-encoder.ts:36` — bare `TODO`

Per the code-style skill, TODOs should reference a real issue number. The `#issue` placeholder suggests these were meant to be updated but weren't. Either file real issues and update the references, or remove the TODOs if the features aren't planned.

### N-3. `useTheme` hook adds minimal value

**File:** `src/hooks/useTheme.ts`

This hook returns `{ theme, setTheme }` where both come directly from the Zustand store, plus a `useEffect` for a media query listener that sets `data-theme` on `documentElement`. The theme application effect is useful but consumers could get `theme` and `setTheme` from `useAppStore` directly.

Consider whether this hook should either do more (e.g., own the media query subscription entirely) or be removed in favor of direct store access + a root-level effect.

### N-4. Chunk splitting could be improved

**File:** `vite.config.ts:74-81`

Only `react` and `react-dom` are split into `react-vendor`. Large dependencies like `@radix-ui/*`, `zustand`, `@tanstack/react-router`, `idb`, and `fflate` are all bundled into the main chunk. Splitting these would improve cache efficiency across deployments.

### N-5. `voiceMuted` / `voiceSolo` type casting

**File:** `src/store/slices/mixer.ts`

These arrays are typed as `readonly boolean[]` in the store types but initialized with `Array(8).fill(false) as readonly boolean[]`. This isn't unsafe but the cast is unnecessary if the type uses `ReadonlyArray<boolean>` and the initializer is `Object.freeze([...])` or a plain array (since Zustand immutability is enforced by convention, not runtime).

### N-6. `hasWorkletReceivedInit` redundancy

**File:** `src/audio/engine.ts`

The class has both a `hasWorkletReceivedInit` boolean field and a `hasWorkletReceived()` method that just returns it. The method doesn't add validation or logging — it's a pure getter with no advantage over direct property access.

### N-7. `removeTrack` vs `removeTrackSafe` naming confusion

**Files:** `src/store/slices/playlist.ts`, `src/store/slices/orchestration.ts`

`playlist.removeTrack()` does the raw array removal. `orchestration.removeTrackSafe()` wraps it with side effects (stopping playback if the removed track was active, advancing to next track, etc.). The "Safe" suffix is unconventional — typically "safe" implies crash-prevention, not "with side effects." Consider renaming to `removeTrackWithCleanup` or `removeTrackOrchestrated`.

### N-8. Position sync via rAF drives high-frequency Zustand updates

**File:** `src/features/player/PlayerView.tsx` (rAF loop)

During playback, `setPosition()` is called on every animation frame (~60Hz). While Zustand handles this, each call triggers subscriber notifications. Any component subscribed to `position` re-renders at 60fps. Currently this seems to work fine, but it's the kind of pattern that scales poorly if more subscribers are added.

Consider using `audioStateBuffer` (the existing bypass for high-frequency state) for position too, and only syncing to Zustand at lower frequency (e.g., every 250ms for seek bar dragging / MediaSession position sync).

### N-9. No bundle size monitoring in CI

**File:** `scripts/check-bundle-sizes.mjs`

The script exists but it's unclear if it runs in CI. If it doesn't, bundle size regressions won't be caught until someone runs it manually.

### N-10. Entire analysis feature at 0% coverage

**Coverage report files:**

- `AnalysisView.tsx`: 0%
- `EchoBufferView.tsx`: 0%
- `MemoryViewer.tsx`: 0%
- `RegisterViewer.tsx`: 0%
- `VoiceStatePanel.tsx`: 0%
- `useHexDecimalToggle.ts`: 0%

The entire analysis feature has zero test coverage. While these are primarily display components, they render hex data, parse binary register state, and format memory views — all areas where off-by-one and formatting bugs are common.

---

## Positive Observations

These areas of the codebase are notably well-done:

1. **SPC parser** (`src/core/spc-parser.ts`): Comprehensive bounds checking, BiDi stripping, defensive binary parsing with structured error returns. 85% line coverage.
2. **Error taxonomy** (`src/types/errors.ts`, `src/errors/`): Discriminated union error types with user-facing messages — a clean pattern.
3. **Result type** (`src/types/result.ts`): Lightweight Ok/Err pattern avoids exception-based control flow in parsers.
4. **Keyboard shortcuts** (`src/shortcuts/ShortcutManager.ts`): Overlay depth, widget key claiming, text input detection, HMR preservation — thoughtfully designed at 97% coverage.
5. **Playlist ARIA** (`src/features/playlist/PlaylistView.tsx`): Full ARIA listbox implementation with keyboard navigation, multi-select, drag-and-drop reorder.
6. **Store test helpers** (`src/store/test-helpers.ts`): `createTestStore()` factory for isolated Zustand testing with proper cleanup.
7. **OTel tracing** (`src/otel/`): Dev-only with production no-ops that tree-shake to zero bytes. Clean implementation.
8. **BRR decoder** (`src/export/brr-decoder.ts`): Bit-accurate SNES sample decoding with 97% coverage.
