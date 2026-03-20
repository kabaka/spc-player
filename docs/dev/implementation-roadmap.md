# SPC Player — Implementation Roadmap

**Status:** Final  
**Date:** 2026-03-19  
**Audience:** Implementing agent teams (orchestrator + subagents)

---

## Overview

This roadmap decomposes SPC Player into 8 phases. Each phase produces a working (if incomplete) application, is ordered by dependency, and is sized for a focused agent sprint. Phases are cumulative — each builds on the previous.

**Critical path to first sound:** Phases 1–4 must stay tight and focused. They bring the application from empty repo to audible SPC playback.

**Feature phases:** Phases 5–7 add features onto a working foundation. They can be larger and more independently scoped.

**Polish phase:** Phase 8 is hardening, PWA, performance, and production readiness.

---

## Guiding Principles

1. **CI green at every phase boundary.** Every phase ends with a fully passing pipeline. No phase introduces work that breaks CI without also fixing it within the same phase.
2. **Infrastructure before features.** Build tooling, linting, type-checking, and test runners must exist before the code they validate. Each phase sets up the infra needed for that phase's features.
3. **Accessibility is not a phase.** Every phase includes WCAG 2.2 AA verification criteria. Compliance is a per-phase gate, not a bolt-on.
4. **User experience arc.** The phases follow the journey a user takes: open the app → load a file → hear audio → manage a playlist → adjust the mix → export → inspect → perform.
5. **Incremental CI pipeline expansion.** The CI workflow starts minimal (lint + typecheck + unit tests) and grows as new capabilities (WASM build, E2E tests, deployment) are introduced.
6. **Fast feedback loops.** Pre-commit hooks catch issues locally. CI catches everything else. The pipeline is ordered fastest-to-slowest.
7. **Tests alongside implementation.** Tests are written alongside implementation, not after. Every deliverable includes its tests.

---

## Dependency Graph

```text
Phase 1: Scaffolding, Toolchain & Design System
    ↓
Phase 2: WASM Pipeline & SPC Parser
    ↓
Phase 3: State, Routing & Application Shell
    ↓
Phase 4: Audio Engine & Basic Playback  ←── Phase 2 (WASM), Phase 3 (store)
    ↓
Phase 5: Playlist, Mixer, Metadata & Keyboard Shortcuts  ←── Phase 4
    ↓
Phase 5a: Pre-Phase-6 Remediation  ←── Audit-driven gap closure for Phases 1–5
    ↓
Phase 6: Export Pipeline  ←── Phase 4 (DSP), Phase 5 (playlist for batch)
    ↓
Phase 7: Advanced Features (Instrument, Analysis, MIDI)  ←── Phase 5, Phase 4
    ↓
Phase 8: PWA, Polish & Production Hardening  ←── All prior phases
```

Phases are strictly sequential on the critical path. Within each phase, independent work items can be parallelized by agent teams.

---

## CI Pipeline Evolution

| Phase | CI Jobs                                                                     | What's New                                                                                                                               |
| ----- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `check` → `build` → `deploy`                                                | lint → typecheck → unit tests → **npm audit** → vite build → deploy-pages                                                                |
| 2     | `check` → `build` → `deploy`                                                | **Rust toolchain** + `rust-cache` + `build:wasm` in `build` job only (typecheck doesn't need `.wasm` binary); **WASM binary size check** |
| 3     | No structural change                                                        | More tests; integration test project added to Vitest                                                                                     |
| 4     | No structural change                                                        | **WASM export surface validation**; SPC test fixtures added                                                                              |
| 5     | `check` → `build` → **`e2e`** → `deploy`                                    | **Playwright E2E job** gates deployment                                                                                                  |
| 6     | No structural change                                                        | Export E2E test added to existing suite                                                                                                  |
| 7     | `check` → `build` → **`e2e` (matrix)** → `deploy`                           | **Cross-browser E2E matrix** (Chromium + WebKit + Firefox)                                                                               |
| 8     | **`audit`** → `check` → `build` → `e2e` (matrix) → `deploy` + **`release`** | **Coverage gates**, **bundle budgets**, **npm audit**, **auto GitHub Release**                                                           |

---

## Phase 1 — Project Scaffolding, Toolchain & Design System

**Goal:** A buildable, lintable, testable, deployable empty application with all tooling configured, design tokens applied, and shared Radix primitives styled. Zero features, but CI is green and deploys to GitHub Pages. A user can navigate between skeleton views and toggle dark/light theme.

### Required Reading

| Document                                    | Why                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `AGENTS.md`                                 | Commands, commit conventions, project boundaries                    |
| `docs/adr/0002-ui-framework.md`             | React 19 + TypeScript + Vite sub-stack                              |
| `docs/adr/0004-css-methodology.md`          | CSS Modules + CSS custom properties                                 |
| `docs/adr/0009-bundler-configuration.md`    | Vite config (plugins, build target, base path, CSS Modules)         |
| `docs/adr/0010-test-framework.md`           | Vitest + RTL + Playwright setup                                     |
| `docs/adr/0012-component-library-scope.md`  | Radix UI primitives list, Tier 1 vs Tier 2 components               |
| `docs/adr/0013-router-configuration.md`     | TanStack Router plugin in Vite config                               |
| `docs/design/design-tokens.md`              | CSS custom properties, color palette, spacing, typography           |
| `docs/design/accessibility-patterns.md` §12 | Cross-cutting patterns (skip links, focus management, live regions) |

### Deliverables

#### Build & Config

- [ ] `package.json` with all dependencies from ADR-0002 sub-stack (React 19, ReactDOM, Zustand, TanStack Router, Radix UI core primitives, idb). Set `"type": "module"`, `"private": true`, pin `engines.node` to `>=22`.
- [ ] `vite.config.ts` — exact config from ADR-0009 (react plugin, TanStack Router plugin, `base: '/spc-player/'`, CSS Modules `camelCaseOnly`, `esnext` target, `worker.format: 'es'`, `manualChunks` for react-vendor).
- [ ] `tsconfig.json` — strict mode, path aliases (`@/` → `src/`), JSX react-jsx.
- [ ] ESLint flat config (`eslint.config.js`) — TypeScript-ESLint, React hooks plugin, import order.
- [ ] `.prettierrc` — project formatting rules. `.editorconfig` for indent style/size, trailing whitespace.
- [ ] `vitest.config.ts` — extends vite config, jsdom environment, coverage provider (V8).
- [ ] `playwright.config.ts` — minimal placeholder (Chromium only, test directory `tests/e2e/`). Expanded in Phase 5.
- [ ] `npm` scripts: `dev`, `build`, `preview`, `lint`, `lint:fix`, `test`, `test:watch`, `format`, `format:check`, `typecheck`.

#### Pre-commit Hooks

- [ ] Husky + lint-staged: `*.{ts,tsx}` → `eslint --fix`, `prettier --write`; `*.{json,md,css}` → `prettier --write`. Must stay under 10 seconds.

#### CI/CD

- [ ] `.github/workflows/ci.yml` — GitHub Actions pipeline with 3 jobs:
  - `check`: checkout → setup-node@v4 (node 22, cache npm) → `npm ci` → lint → typecheck → test → `npm audit --audit-level=high`
  - `build`: needs check → `npm ci` → `npm run build` → upload-pages-artifact (`dist/`)
  - `deploy`: needs build → deploy-pages@v4 (main branch only, permissions: pages write, id-token write)
- [ ] `concurrency` group in `ci.yml`: `group: ci-${{ github.ref }}`, `cancel-in-progress: true` — prevents overlapping deployments and saves runner time on superseded pushes.

#### Directory Structure

Create the full directory skeleton from `docs/architecture.md` § File Organization:

```
src/
  app/           # routing, layout
    routes/      # TanStack Router file-based routes
  components/    # shared UI components
  features/      # feature modules (empty for now)
  core/          # SPC parsing, DSP bridge (empty)
  audio/         # Web Audio integration (empty)
  storage/       # IndexedDB layer (empty)
  midi/          # Web MIDI (empty)
  export/        # export pipeline (empty)
  workers/       # Web Workers (empty)
  utils/         # shared utilities
  types/         # shared TypeScript types
  styles/        # global styles, tokens, reset
public/
  icons/         # PWA icons (placeholder)
tests/
  e2e/           # Playwright tests (empty)
  integration/   # Integration tests (empty)
  fixtures/      # Test fixture files (empty)
```

#### Design Token System

- [ ] `src/styles/tokens.css` — all CSS custom properties from `docs/design/design-tokens.md`:
  - Color tokens (backgrounds, text, borders, accent, status, interactive states, selection, skeleton).
  - Audio visualization tokens (VU meter green/yellow/red, 8 voice channel colors + subtle variants via `color-mix()`).
  - Waveform tokens.
  - Spacing scale (0–16) and semantic aliases (xs–2xl).
  - Typography: font stacks (`--spc-font-sans`, `--spc-font-mono`), type scale (xs–3xl), font weights, line heights.
  - Border radius, shadow, z-index, duration, and easing tokens.
- [ ] `src/styles/global.css` — reset/normalize, `:root` dark theme defaults, `.light` class overrides:
  - `::selection` rule using `--spc-color-selection-*` tokens.
  - Firefox scrollbar styling (`scrollbar-color`, `scrollbar-width`).
  - `prefers-reduced-motion` respect for transitions.
  - `prefers-contrast: more` overrides (increased focus ring).
- [ ] CSS Modules convention established (ADR-0004): 1:1 `.module.css` per component, `[data-state]` selectors for Radix, `--spc-` prefix enforced.

#### Theme Switching

- [ ] Blocking `<script>` in `index.html` `<head>` that reads `localStorage.getItem('spc-player-theme')` and sets `.dark`/`.light` on `<html>` before first paint (FOWT prevention per design-tokens.md §8).
- [ ] `src/components/ThemeToggle.tsx` — toggle button (Radix `Toggle`) cycling light/dark/system.
- [ ] CSS transition on `:root` for smooth theme switch (respects `prefers-reduced-motion`).
- [ ] `localStorage` mirror for instant theme on load; full persistence deferred to Zustand/IndexedDB in Phase 3.

#### Shared Radix Primitives (Styled)

Style the initial set of Radix primitives with CSS Modules (ADR-0004, ADR-0012):

- [ ] `Button` — primary, secondary, ghost, icon variants.
- [ ] `Dialog` and `AlertDialog` — modal pattern, focus trap, portal.
- [ ] `Tooltip` — shortcut hints pattern.
- [ ] `Separator`, `VisuallyHidden`, `Label`.
- [ ] Each primitive gets a CSS Module file following the design token color, spacing, and radius conventions.

#### Minimal App Shell

- [ ] `index.html` — Vite entry HTML with theme blocking script.
- [ ] `src/main.tsx` — React entry point rendering `<App />`.
- [ ] `src/app/App.tsx` — renders `<RouterProvider>` with the TanStack Router instance.
- [ ] `src/app/routes/__root.tsx` — root layout `<AppShell>` with:
  - Top navigation bar with view links (Player, Playlist, Instrument, Analysis, Settings) — TanStack Router `<Link>` components.
  - Placeholder player bar at bottom (static, non-functional).
  - `<Outlet />` for routed views.
  - Focus management on route change (per `docs/design/accessibility-patterns.md` §12).
- [ ] `src/app/routes/index.tsx` — Player view (placeholder: "SPC Player").
- [ ] `src/app/routes/playlist.tsx`, `instrument.tsx`, `analysis.tsx`, `settings.tsx` — placeholder views.
- [ ] `ViewSkeleton` and `ViewError` shared components for pending/error states.
- [ ] Mobile-first responsive layout: bottom nav on mobile, top nav on desktop (breakpoints at 640px, 1024px per requirements).
- [ ] Active route highlighting via TanStack Router's active link detection.
- [ ] A minimal smoke test (`src/app/App.test.tsx`) that renders the app without crashing.

### Verification Criteria

- [ ] `npm run dev` serves the app at `localhost:5173` with dark theme applied.
- [ ] `npm run build` produces output in `dist/` with hashed assets.
- [ ] `npm test` passes the smoke test.
- [ ] `npm run lint` and `npm run typecheck` exit with 0.
- [ ] CI workflow runs all 3 jobs and deploys to GitHub Pages (a page with "SPC Player" text).
- [ ] Pre-commit hooks enforce lint + format on every commit.
- [ ] Theme toggle cycles correctly and persists across page reload (via localStorage).
- [ ] All navigation links are keyboard-focusable. Tab order follows visual order.
- [ ] Focus moves to the `<Outlet />` content region on route change.
- [ ] Theme toggle has `aria-label` and `aria-pressed`.
- [ ] Skeleton views have `aria-busy="true"` during loading.
- [ ] Color contrast passes WCAG 2.2 AA for all token pairings.
- [ ] `prefers-reduced-motion: reduce` disables all CSS transitions/animations.
- [ ] axe-core automated scan passes on every route.

---

## Phase 2 — WASM Build Pipeline & SPC File Parser

**Goal:** The Rust/WASM build produces a working DSP binary integrated into CI. The SPC file parser can read, validate, and extract metadata from SPC files. The error handling foundation is in place. No audio output yet.

### Required Reading

| Document                                        | Why                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/adr/0001-snes-audio-emulation-library.md` | snes-apu-spcp library selection, vendoring approach, 150 KB target              |
| `docs/adr/0007-wasm-build-pipeline.md`          | Raw exports, cargo + wasm-opt, crate structure, TypeScript DspExports interface |
| `docs/adr/0008-wasm-source-language.md`         | Rust for all custom WASM, `#![no_std]`, single crate                            |
| `docs/adr/0015-error-handling.md`               | Result type pattern, AppError taxonomy, error codes, `reportError()`            |
| `docs/design/spc-parsing.md`                    | Full SPC parsing spec (validation, ID666, xid6, encoding)                       |

### Deliverables

#### WASM Build Pipeline

- [ ] `Cargo.toml` — workspace root, `members = ["crates/spc-apu-wasm"]`.
- [ ] `rust-toolchain.toml` — pin Rust version and `wasm32-unknown-unknown` target.
- [ ] `crates/spc-apu-wasm/Cargo.toml` — cdylib crate, `panic = "abort"`, `opt-level = "z"`, depends on snes-apu-spcp.
- [ ] `vendor/snes-apu-spcp/` — vendored Rust library with BSD-2-Clause license preserved.
- [ ] `crates/spc-apu-wasm/src/lib.rs` — `#![no_std]`, `#[no_mangle] extern "C"` exports as specified in ADR-0007:
  - `dsp_init`, `dsp_render`, `dsp_set_voice_mask`, `dsp_get_register`, `dsp_get_voice_state`
  - `wasm_alloc`, `wasm_dealloc` for SPC data transfer
  - `dsp_load_spc` for loading new SPC files into existing instance
  - `brr_decode_sample` for instrument sample extraction
  - `dsp_set_speed` for variable playback speed
  - Linear resampler in Rust (32 kHz → configurable output rate)
- [ ] `npm run build:wasm` script: `cargo build --target wasm32-unknown-unknown --release -p spc-apu-wasm && wasm-opt -Oz ...` (install binaryen via npm for `wasm-opt`).
- [ ] `npm run build:wasm:dev` script: debug build without optimization.
- [ ] Update `npm run build` to chain `build:wasm && vite build`.
- [ ] `src/audio/dsp-exports.ts` — TypeScript `DspExports` interface mirroring all WASM exports (from ADR-0007).
- [ ] `src/audio/wasm-loader.ts` — `loadDspModule()` function using `fetch()` + `arrayBuffer()` with `?url` import for the .wasm file.
- [ ] Rust unit tests (`cargo test`) for DSP init, render produces non-zero samples, voice mask changes output.
- [ ] Binary size verification: optimized `.wasm` < 150 KB.

#### CI Integration for WASM

- [ ] Add Rust toolchain to CI `build` job only (not `check` — TypeScript typecheck doesn't need the `.wasm` binary; `dsp-exports.ts` is hand-written types, `?url` import resolves to `string`):
  - `dtolnay/rust-toolchain@stable` with `targets: wasm32-unknown-unknown`.
  - `Swatinem/rust-cache@v2` with `workspaces: "crates/spc-apu-wasm -> target"` — TypeScript-only changes skip Rust recompilation.
  - `npm run build:wasm` step before `vite build`.
- [ ] WASM binary size CI check: script that fails if `.wasm` exceeds 150 KB.
- [ ] `.gitignore` entry for `src/wasm/dsp.wasm` (build artifact).
- [ ] Ensure unit tests that import from `src/audio/wasm-loader.ts` mock the `?url` WASM import — the `.wasm` binary doesn't exist during the `check` CI job.
- [ ] `.gitattributes` for binary file handling (`*.spc binary`).
- [ ] Commit `Cargo.lock` to repository for reproducible builds. The Rust cache action uses it as part of its default cache key.

#### Error Handling Foundation

- [ ] `src/types/result.ts` — `Result<T, E>` discriminated union type (following ADR-0015).
- [ ] `src/types/errors.ts` — full `AppError` union type with all domain error variants from ADR-0015:
  - `SpcParseError`, `AudioPipelineError`, `StorageError`, `ExportError`, `MidiError`, `NetworkError`, `UiError`.
  - All error codes enumerated.
- [ ] `src/errors/report.ts` — `reportError()` function (console log, in-memory store, optional toast trigger per ADR-0015).
- [ ] `src/errors/factories.ts` — error factory functions per ADR-0015 Rule 5.

#### SPC File Parser

- [ ] `src/core/spc-parser.ts` — full implementation per `docs/design/spc-parsing.md`:
  - File size validation (`SPC_MIN_PLAYABLE_SIZE`, `SPC_MIN_FULL_SIZE`, `SPC_MAX_ACCEPTED_SIZE`).
  - Magic number validation (33-byte header check).
  - CPU register extraction.
  - Text vs. binary ID666 format detection (multi-heuristic algorithm from §2.2).
  - ID666 tag parsing (string fields, numeric fields, date parsing).
  - Character encoding cascade (UTF-8 → Shift-JIS → Latin-1 via `TextDecoder`).
  - String sanitization (`sanitizeForDisplay()` — BiDi stripping, tab/newline removal).
  - xid6 extended tag parsing (sub-chunk iteration).
  - Truncated file handling (zero-fill missing regions).
  - Returns `Result<SpcFile, SpcParseError>`.
- [ ] `src/core/spc-types.ts` — `SpcFile`, `SpcMetadata`, `SpcCpuRegisters`, `SpcMemory` types.
- [ ] `src/core/spc-parser.test.ts` — comprehensive unit tests:
  - Valid file parsing (text and binary ID666 formats).
  - Magic number rejection.
  - Size validation (too small, too large, truncated-but-playable).
  - Character encoding tests (ASCII, Shift-JIS, Latin-1).
  - xid6 tag parsing.
  - Malformed input resilience (garbage data after null terminators, corrupt date fields).
- [ ] `tests/fixtures/` — curated SPC test fixtures (prefer synthetic minimal SPC binaries to avoid copyright concerns):

  | Fixture              | ID666 Format | Encoding  | xid6 | Duration | Purpose                 |
  | -------------------- | ------------ | --------- | ---- | -------- | ----------------------- |
  | `minimal-valid.spc`  | text, ASCII  | —         | no   | ≤3s      | Smoke tests, fast CI    |
  | `binary-id666.spc`   | binary       | Shift-JIS | no   | ≤3s      | Format detection        |
  | `xid6-tags.spc`      | text         | UTF-8     | yes  | ≤3s      | Extended metadata       |
  | `truncated.spc`      | text         | ASCII     | no   | —        | Truncated file handling |
  | `multi-voice.spc`    | text         | ASCII     | no   | ≤5s      | Mixer, per-track export |
  | `corrupt-header.spc` | —            | —         | —    | —        | Rejection test          |

  Agent discretion on fixture generation approach — a script producing minimal valid SPC binaries is acceptable.

### Verification Criteria

- [ ] `npm run build:wasm` produces `.wasm` under 150 KB.
- [ ] `cargo test` passes all Rust tests.
- [ ] SPC parser correctly parses at least 3 real SPC files with different metadata formats.
- [ ] Error types are exhaustively narrowable in switch statements (TypeScript compiler error on missing case).
- [ ] `npm run build` succeeds with the WASM file integrated.
- [ ] CI caches Rust compilation; TypeScript-only PRs skip Rust rebuild.
- [ ] WASM binary size CI check passes.
- [ ] axe-core scan still passes (no regressions from Phase 1).

---

## Phase 3 — State Management, Routing & Application Shell

**Goal:** The Zustand store is structured with all slices, TanStack Router has all 5 view routes with deep linking, IndexedDB persistence works for settings, and the app shell renders with persistent layout, navigation, and theme switching backed by Zustand.

### Required Reading

| Document                                         | Why                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `docs/adr/0005-state-management-architecture.md` | Zustand single store, domain slices, ref-based audio channel, persistence |
| `docs/adr/0011-indexeddb-wrapper.md`             | `idb` library, Zustand persist adapter, DB schema                         |
| `docs/adr/0013-router-configuration.md`          | File-based routes, hash history, Zod search params, root layout           |
| `docs/adr/0012-component-library-scope.md`       | Radix UI primitives list, Tier 1 vs Tier 2 components                     |
| `docs/design/zustand-coordination.md`            | Store type foundation, slice interfaces, orchestration patterns           |
| `docs/design/design-tokens.md`                   | Theme token values for theme switching UI                                 |
| `docs/design/accessibility-patterns.md` §12      | Focus management on route change                                          |

### Deliverables

#### Zustand Store

- [ ] `src/store/types.ts` — full `AppStore` type, all slice interfaces, `SliceCreator` helper, `AppMiddleware` type — exactly as defined in `docs/design/zustand-coordination.md` §1.
- [ ] `src/store/store.ts` — `create()` composing all slices with `devtools` + `persist` middleware.
- [ ] `src/store/slices/playback.ts` — `PlaybackSlice` (status, position, speed, volume, loop region, `loopCount`, `trackDuration`):
  - `loopCount: number | 'infinite'` — current loop iteration count; only meaningful when track has xid6 loop data.
  - `trackDuration: TrackDuration | null` — resolved duration computed via `calculateTrackDuration()` on track load.
  - Actions: `setLoopCount()`, `setTrackDuration()`.
  - See `loop-playback-design.md` §7.1 for full interface.
- [ ] `src/store/slices/playlist.ts` — `PlaylistSlice` (tracks, activeIndex, shuffle, repeat).
- [ ] `src/store/slices/mixer.ts` — `MixerSlice` (voiceMuted[8], voiceSolo[8]).
- [ ] `src/store/slices/metadata.ts` — `MetadataSlice` (SpcMetadata).
- [ ] `src/store/slices/settings.ts` — `SettingsSlice` (theme, audioSampleRate, resamplingQuality, keyboardMappings, exportDefaults, timing defaults):
  - `defaultLoopCount: number` — default loop iterations when xid6 present but tag 0x35 absent (default: 2, range: 0–99).
  - `defaultPlayDuration: number` — fallback play duration when no timing metadata exists (default: 180s, range: 10–3600).
  - `defaultFadeDuration: number` — default fade-out duration (default: 10s, range: 0–60).
  - Actions: `setDefaultLoopCount()`, `setDefaultPlayDuration()`, `setDefaultFadeDuration()`.
  - See `loop-playback-design.md` §6.1.
- [ ] `src/store/slices/instrument.ts` — `InstrumentSlice` (activeInstrumentIndex, isMidiConnected).
- [ ] `src/store/slices/ui.ts` — `UISlice` (isLoadingTrack, loadingError).
- [ ] `src/store/slices/export.ts` — `ExportSlice` (jobs, isExporting, queueSize, batchProgress).
- [ ] `src/store/slices/orchestration.ts` — `OrchestrationSlice` (loadFile, nextTrack, previousTrack, playTrackAtIndex, stopAndClear, removeTrackSafe) — implementation stubs that will be filled in Phase 4/5.
- [ ] Unit tests for each slice (state transitions, initial state, action correctness).
- [ ] Re-render verification test: mutating playback state does not re-render a playlist-subscribed component.

#### IndexedDB Persistence

- [ ] `src/storage/idb-storage.ts` — Zustand `StateStorage` adapter using `idb` (code from ADR-0011).
- [ ] `src/storage/db.ts` — `openDB` call with versioned schema: `zustand-state` store, `spc-files` store (with indexes on hash, game, artist), `recently-played` store (populated when tracks are played, starting Phase 5).
- [ ] `src/storage/spc-storage.ts` — `saveSpcToStorage()`, `loadSpcFromStorage()`, `deleteSpcFromStorage()` using `idb`.
- [ ] Persistence round-trip test: set settings → close tab simulation → verify restored.
- [ ] Persistence partitioning: persisted (settings full, playlist full, playback partial: volume, recently played IDs) vs. not persisted (metadata, mixer, instrument, export, ui).
- [ ] `onRehydrateStorage` callback to coordinate post-hydration UI.

#### Deep Linking

- [ ] Zod search param schemas per route (from ADR-0013: track, speed, voices, tab, instrument).
- [ ] `/#/?track=<id>` → navigates to player view. If the track is not in IndexedDB, shows a graceful 'track not found' state. Full track-loading deep link tested in Phase 5.
- [ ] `/#/playlist?track=<id>` → scrolls to and highlights the track.
- [ ] Not-found route (`src/app/routes/$catch.tsx`) with recovery link to player.
- [ ] Route error boundary component.

#### Theme Persistence Upgrade

- [ ] Upgrade theme toggle: Zustand `settings.theme` persisted to IndexedDB, mirrored to `localStorage` for FOWT prevention (per ADR-0004). Replaces Phase 1 localStorage-only approach.
- [ ] `useTheme()` hook that applies `.dark`/`.light` class to `<html>` and listens to `prefers-color-scheme` for system mode.

#### Navigation UI

- [ ] Active route highlighting via TanStack Router's active link detection.
- [ ] Styled with CSS Modules using design tokens.
- [ ] Verify `autoCodeSplitting: true` produces separate chunks per route.

#### CI Notes

No CI structural changes. Existing lint → typecheck → test → build → deploy pipeline handles new source files. Integration test project added to `vitest.config.ts` (per ADR-0010). Add `--coverage` flag to Vitest CI run. Start collecting coverage baselines without enforcing thresholds.

### Verification Criteria

- [ ] All 5 routes navigable via URL hash (e.g., `/#/playlist`, `/#/settings`).
- [ ] Theme toggle cycles correctly and persists across page reload (now via Zustand/IndexedDB).
- [ ] Zustand DevTools show full state tree in browser extension.
- [ ] Settings persist to IndexedDB and survive hard refresh.
- [ ] Back/forward browser navigation works.
- [ ] Deep-linked navigation moves focus to the main content area, not the nav.
- [ ] Nav bar highlights active route.
- [ ] Route error boundary catches render errors gracefully.
- [ ] Code splitting produces separate chunks per route in production build.
- [ ] Settings controls have proper `<Label>` association.
- [ ] axe-core automated scan passes on every route.

---

## Phase 4 — Audio Engine & Basic Playback

**Goal:** Load an SPC file, start playback through the AudioWorklet, and hear sound. Transport controls (play/pause/stop/seek) work. This is the first phase where audio comes out of the speakers.

### Required Reading

| Document                                       | Why                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `docs/adr/0003-audio-pipeline-architecture.md` | Full audio pipeline: 48 kHz AudioContext, WASM resampling, buffer management, bytes-transfer pattern      |
| `docs/adr/0007-wasm-build-pipeline.md`         | WASM export interface, typed array views, instantiation in worklet                                        |
| `docs/design/worker-protocol.md`               | All MessagePort message types (MainToWorklet, WorkletToMain), init handshake, telemetry                   |
| `docs/design/loop-playback-design.md`          | `TrackDuration` interface, `calculateTrackDuration()`, `SetPlaybackConfig` message, worklet fade/counting |
| `docs/design/zustand-coordination.md`          | `loadFile` orchestration action, audio engine integration                                                 |
| `docs/design/accessibility-patterns.md` §2-3   | Transport controls ARIA, seek bar accessibility                                                           |

### Deliverables

#### Worker Protocol Types

- [ ] `src/audio/worker-protocol.ts` — full TypeScript types for `MainToWorklet` and `WorkletToMain` discriminated unions from `docs/design/worker-protocol.md` §2.2–2.3:
  - `MainToWorklet.LoadSpc` includes `durationSamples: number | null` and `fadeOutSamples: number` for initial timing.
  - `MainToWorklet.SetPlaybackConfig` — new message for dynamically updating `durationSamples`, `fadeOutSamples`, `loopCount`, and optional `structure` (intro/loop/end in samples) during playback. Enables mid-playback loop count changes.
  - `WorkletToMain.PlaybackEnded` — emitted when the worklet has rendered `durationSamples + fadeOutSamples` samples and filled output with silence.
  - `WorkletToMain.Telemetry` extended with optional `segment: PlaybackSegment | null` (phase, currentLoop, totalLoops) for loop-aware progress reporting.
  - See `loop-playback-design.md` §4.1 and §4.4.
- [ ] `PROTOCOL_VERSION` constant.

#### AudioWorklet

- [ ] `src/audio/spc-worklet.ts` — `SpcProcessor` class (extends `AudioWorkletProcessor`):
  - Receives raw WASM bytes (`ArrayBuffer`) + SPC data via `Init` message.
  - Instantiates WASM with empty `importObject`.
  - `process()` calls WASM `dsp_render()`, copies output from WASM linear memory to AudioWorklet output buffers.
  - Handles all `MainToWorklet` message types from the worker protocol.
  - **Sample counting:** Increments a rendered-sample counter each `process()` call. Resets on new SPC load or seek.
  - **Fade gain ramp:** When `renderedSamples >= durationSamples`, applies a linear gain ramp (1.0 → 0.0) over `fadeOutSamples`. Applied per-sample to both L/R channels after DSP output, before writing to AudioWorklet output array.
  - **Playback ended:** When `renderedSamples >= durationSamples + fadeOutSamples`, emits `WorkletToMain.PlaybackEnded` and fills output with silence.
  - **Infinite mode:** When `durationSamples === null`, skips all duration checks; renders until `Stop` or `Pause`.
  - **Dynamic config updates:** Handles `SetPlaybackConfig` — cancels current fade if new `durationSamples` extends beyond rendered position; begins fade immediately if already past new duration. See `loop-playback-design.md` §4.3.
  - Telemetry emission (VU levels, voice state, position, `PlaybackSegment`) at configurable rate (~60 Hz).
  - Error handling: sends `WorkletToMain.Error` on WASM trap, does not crash the processor.
  - Self-contained: no imports from main application bundle (ADR-0007, ADR-0009 constraint).
- [ ] `src/audio/spc-worklet.test.ts` — unit tests using mocked WASM module and MessagePort:
  - Fade ramp accuracy (linear from 1.0 → 0.0 over configured samples).
  - `PlaybackEnded` emitted at correct sample count.
  - `SetPlaybackConfig` mid-playback updates duration and cancels/starts fade correctly.
  - Infinite mode renders without auto-stop.

#### Audio Engine Service

- [ ] `src/audio/engine.ts` — singleton `AudioEngine` class:
  - Creates `AudioContext` at 48 kHz.
  - Loads worklet script via `audioWorklet.addModule()`.
  - Creates `AudioWorkletNode` connected to `GainNode` → `destination`.
  - Fetches WASM binary as raw bytes via `fetch()` + `arrayBuffer()`, sends bytes to worklet (bytes-transfer pattern per ADR-0003, ADR-0007).
  - Exposes methods: `loadSpc(buffer)`, `play()`, `pause()`, `stop()`, `seek(position)`, `setVoiceMask(mask)`, `setSpeed(factor)`, `setVolume(volume)`.
  - Receives telemetry via `node.port.onmessage`, writes to `audioStateBuffer`.
  - Handles AudioContext state management (user gesture requirement, resume on play).
  - Audio engine forwards `WorkletToMain.PlaybackEnded` to a callback (initially no-op, wired to `nextTrack()` in Phase 5).
- [ ] `src/audio/audio-state-buffer.ts` — module-scoped mutable object for ref-based real-time channel (per ADR-0005):
  - `positionSamples`, `vuLeft[8]`, `vuRight[8]`, `masterVuLeft`, `masterVuRight`, `voices[8]`, `generation`.
  - Not reactive — read by rAF loops, never by React hooks.

#### CI: WASM Export Surface Validation

- [ ] CI step that parses the `.wasm` binary's export section and compares against the TypeScript `DspExports` interface. Any drift (new export missing from TS, TS export missing from WASM) fails CI. Can use `WebAssembly.compile` + `WebAssembly.Module.exports()` in a Node.js script.

#### Orchestration Integration

- [ ] Complete `loadFile` orchestration action in `src/store/slices/orchestration.ts`:
  - Reads file as ArrayBuffer.
  - Parses via `parseSpcFile()` → updates metadata slice.
  - Computes track ID via SHA-256.
  - Saves to IndexedDB.
  - Loads per-file timing override from IndexedDB (if any).
  - Computes `TrackDuration` via `calculateTrackDuration()` using parsed xid6/ID666 metadata, per-file override, and global defaults from `SettingsSlice`.
  - Updates `PlaybackSlice.trackDuration` and `PlaybackSlice.loopCount`.
  - Sends SPC data to audio engine, followed by `SetPlaybackConfig` with `durationSamples` and `fadeOutSamples`.
  - Updates playlist slice.
- [ ] `src/core/track-id.ts` — `computeTrackId()` using `crypto.subtle.digest('SHA-256', ...)`.

#### Track Duration Calculation

- [ ] `src/core/track-duration.ts` — pure function `calculateTrackDuration()` resolving timing metadata into a `TrackDuration` result:
  - Priority cascade: user per-file override → xid6 structured timing → ID666 flat song length → global defaults.
  - Returns `TrackDuration` with `playSeconds`, `fadeSeconds`, `totalSeconds`, `hasLoopData`, `timingSource`, and optional `LoopStructure`.
  - Helpers: `secondsToSamples()` / `samplesToSeconds()` using 32 kHz DSP sample rate.
  - See `loop-playback-design.md` §3 for full interface and implementation.
- [ ] `src/core/track-duration.test.ts` — unit tests for all cascade paths:
  - xid6 with explicit loop count → correct play + fade duration.
  - xid6 with loop count 0 (play intro only) → correct truncation.
  - ID666 flat duration → correct fallback.
  - No metadata → global defaults applied.
  - User per-file override → overrides all other sources.
  - Edge case: `loopLengthTicks = 0` treated as non-looping.

#### Player UI

- [ ] `src/features/player/PlayerView.tsx` — the player route component:
  - File input: drop zone + `<input type="file" accept=".spc">` for loading SPC files. Drag-and-drop support.
  - Now Playing display: track title, game title, artist from metadata store slice.
  - Transport controls toolbar with ARIA `role="toolbar"` per `docs/design/accessibility-patterns.md` §2:
    - Play/Pause toggle (dynamic `aria-label`).
    - Stop, Previous Track, Next Track buttons.
    - Toolbar keyboard navigation (Left/Right arrow, Home, End, Enter/Space).
  - Seek bar using Radix `Slider` with `aria-valuetext` formatting per `docs/design/accessibility-patterns.md` §3.
  - Current time / total duration display (`aria-live="off"`).
  - Volume slider.
  - Speed control.
  - Playback state announcement live region (`aria-live="polite"`) per `docs/design/accessibility-patterns.md` §2.
- [ ] `src/features/player/PlayerView.module.css` — styled with design tokens.
- [ ] `src/components/FileDropZone.tsx` — drag-and-drop zone for SPC files on the player view.

#### COOP/COEP Headers

- [ ] COOP/COEP `<meta>` tags in `index.html` — `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin`. Test that `SharedArrayBuffer` is available on deployed GitHub Pages. Document fallback if not.

#### Minimal E2E Smoke Test

- [ ] `tests/e2e/smoke.spec.ts` — app loads, no console errors, basic navigation works.
- [ ] `tests/e2e/spc-load.spec.ts` — upload SPC fixture, verify metadata displayed, verify AudioContext state is `"running"`.
- [ ] Playwright runs against `npm run preview` using the Chromium project only.
- [ ] These tests run manually (`npm run test:e2e`) — not yet in CI (CI E2E job added in Phase 5).

### Verification Criteria

- [ ] Drop an SPC file onto the app → audio plays through speakers.
- [ ] Play/Pause/Stop buttons work, seek bar tracks position.
- [ ] Volume slider controls output level.
- [ ] Speed slider changes playback speed.
- [ ] AudioContext suspends on page hide, resumes on page show.
- [ ] No audio glitches during normal playback on desktop Chrome.
- [ ] Telemetry data flows to `audioStateBuffer` (verify via console inspection).
- [ ] WASM trap in emulator shows user-friendly error toast, not a crash.
- [ ] WASM export surface CI validation passes.
- [ ] Track with xid6 timing plays for the correct computed duration (intro + loops × count + end) then fades and stops.
- [ ] Track without timing metadata plays for the default duration (180s) then fades.
- [ ] Transport controls follow WAI-ARIA toolbar pattern: Tab enters/exits, arrows navigate between buttons, Enter/Space activates.
- [ ] Play/Pause button `aria-label` updates dynamically ("Play" ↔ "Pause").
- [ ] Seek bar `aria-valuetext` reads spoken time. Keyboard: Left/Right ±5s, PgUp/PgDn ±15s, Home/End to start/end.
- [ ] File drop zone has `role="button"` or is an accessible `<label>`.
- [ ] `aria-live="polite"` region announces playback changes from keyboard shortcuts.
- [ ] All controls meet 44×44px minimum touch target on mobile.
- [ ] axe-core scan passes.
- [ ] Manual verification: audio plays in Safari/WebKit (user gesture → AudioContext resume → audio output). Document any Safari-specific constraints encountered.

---

## Phase 5 — Playlist, Mixer, Metadata & Keyboard Shortcuts

**Goal:** Users can build playlists, mute/solo individual voices, view track metadata, see VU meters, and use keyboard shortcuts for common actions. The app becomes genuinely usable for casual listening.

### Required Reading

| Document                                           | Why                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `docs/design/accessibility-patterns.md` §4, §6, §9 | Playlist listbox, VU meter ARIA, channel mixer                                    |
| `docs/design/keyboard-shortcuts.md`                | Full shortcut system: scope hierarchy, default keymap, registration API           |
| `docs/design/zustand-coordination.md`              | `nextTrack`, `previousTrack`, `playTrackAtIndex`, `removeTrackSafe` orchestration |
| `docs/adr/0012-component-library-scope.md`         | Radix primitives for playlist (ScrollArea, ContextMenu), mixer (Toggle, Tooltip)  |
| `docs/design/design-tokens.md`                     | VU meter and voice channel color tokens                                           |
| `docs/design/worker-protocol.md`                   | SetVoiceMask message semantics                                                    |
| `docs/adr/0003-audio-pipeline-architecture.md`     | Resampling architecture (deferred from Phase 2/4)                                 |
| `docs/adr/0007-wasm-build-pipeline.md`             | WASM export interface for resampler                                               |

### Deferred from Prior Phases

The following items were scoped for Phases 2–4 but deferred during implementation. They must be completed in this phase before new Phase 5 deliverables.

#### WASM Resampler (Phase 2 carry-over)

- [ ] Linear resampler in Rust (32 kHz → 48 kHz output rate) — listed as a Phase 2 WASM export but not implemented. Currently the worklet outputs 32 kHz samples into a 48 kHz AudioContext, causing incorrect pitch and playback speed. This is the highest-priority deferred item.
- [ ] Fix sample counting domain mismatch — the worklet counts rendered samples at the DSP rate (32 kHz) but the AudioContext consumes at 48 kHz. Seek positions, duration tracking, and telemetry must account for the resampling ratio.
- [ ] Wire `dsp_set_speed` to varispeed playback through the resampler — the speed control in the player UI sends `SetSpeed` messages to the worklet, but actual variable-speed playback requires the resampler to adjust its output rate.

#### Player UI Polish (Phase 4 carry-over)

- [ ] Replace hardcoded element IDs in `PlayerView.tsx` with React `useId()` for proper accessibility — avoids ID collisions if multiple instances ever mount.
- [ ] Optimize `computeTrackId()` in `src/core/track-id.ts` to avoid reading the file twice — currently the file is read once for SPC parsing and a second time for SHA-256 hashing. Accept an `ArrayBuffer` parameter instead of `File` to reuse the already-read buffer.

#### Testing & CI Gaps (Phase 2–4 carry-over)

- [ ] CI WASM export surface validation — a CI step that parses the `.wasm` binary's export section and compares against the TypeScript `DspExports` interface, failing on drift. Specified in Phases 2 and 4 but never implemented.
- [ ] AudioWorklet unit tests (`src/audio/spc-worklet.test.ts`) — specified in Phase 4 but not created. Must test fade ramp accuracy, `PlaybackEnded` timing, `SetPlaybackConfig` mid-playback updates, and infinite mode.
- [ ] Persistence round-trip integration test — specified in Phase 3 but not implemented. Verify settings persist to IndexedDB and restore correctly after simulated tab close.
- [ ] Extract `FileDropZone.tsx` component — Phase 4 specified a standalone `src/components/FileDropZone.tsx`, but drag-and-drop is currently inline in `PlayerView.tsx`. Extract for reuse in playlist view.

#### Known Deviations

- **WASM binary size**: ADR-0007 targets < 150 KB; actual optimized binary is ~258 KB. CI was relaxed to 300 KB. Adding the resampler will increase this further. Revisit size budget in Phase 8 performance optimization.
- **`dsp_load_spc` renamed to `dsp_reset`**: Functionally equivalent — reinitializes APU from stored SPC data. No action needed.

### Deliverables

#### Keyboard Shortcut System

- [ ] `src/shortcuts/ShortcutManager.ts` — singleton managing shortcut registration, scope hierarchy from `docs/design/keyboard-shortcuts.md` §1:
  - 7-level priority stack (text input → Radix overlay → focused interactive → custom widget → instrument → contextual → global).
  - Key normalization (Ctrl → Meta on macOS).
  - `register(actionId, handler, options)` / `unregister(actionId, handler)`.
  - `registerWidget(element)` for Tier 2 custom widgets.
  - Platform detection (`navigator.userAgentData?.platform` with fallback).
- [ ] `src/shortcuts/useShortcut.ts` — React hook wrapping `ShortcutManager.register` with mount/unmount lifecycle.
- [ ] `src/shortcuts/default-keymap.ts` — complete default keymap from `docs/design/keyboard-shortcuts.md` §2 (all tables).
- [ ] `src/shortcuts/types.ts` — `ShortcutActionId` union type, `ShortcutOptions`.
- [ ] Wire up global shortcuts: Space (play/pause), arrow keys (seek/volume), M (mute), Digit1–8 (voice mute), Shift+Digit1–8 (solo), R (repeat), S (shuffle).
- [ ] Wire up contextual shortcuts: Delete (remove track in playlist), Enter (play selected), Alt+Digit1–5 (view navigation).
- [ ] `src/components/ShortcutHelpDialog.tsx` — Radix `Dialog` showing all shortcuts (Shift+Slash to open).
- [ ] Reserved keys table enforced (Escape, Tab, clipboard, F5/F11/F12).
- [ ] Text input focus suppression (scope priority 1).
- [ ] `src/shortcuts/ShortcutManager.test.ts` — priority stack ordering, key normalization across platforms, register/unregister lifecycle, text input suppression.
- [ ] `src/shortcuts/useShortcut.test.ts` — mount/unmount cleanup, scope binding.

**Deferred:** Undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z` from `keyboard-shortcuts.md` §2.9) is deferred from v1. The shortcut bindings in `default-keymap.ts` should map to a no-op handler with a `// TODO: Implement undo/redo system` comment. This avoids dead keybindings while acknowledging the feature is not yet built.

#### Playlist

- [ ] `src/features/playlist/PlaylistView.tsx` — playlist view:
  - `role="listbox"` with `aria-multiselectable` per `docs/design/accessibility-patterns.md` §4.
  - Track items with `role="option"`, `aria-current="true"` on playing track.
  - `aria-label` per track: `"Track N: Title, Game, Duration"` with `". Now playing."` suffix for active track.
  - Keyboard navigation (Up/Down arrow, Home/End, Enter to play, Space to toggle select, Ctrl+A/Ctrl+Shift+A for select/deselect all).
  - Multi-select for batch operations.
  - Add files button. `Ctrl+O` opens multi-file `<input>` for batch add.
  - Remove selected tracks (Delete key, with contextual scope).
  - Drag-to-reorder (agent discretion on drag library — consider `@dnd-kit/core` or native HTML drag).
  - Keyboard reorder alternative (Alt+Up/Down) with `aria-live="polite"` announcements: `"Moved {title} to position {n} of {total}"`.
  - Radix `ScrollArea` for scrollable list.
  - Radix `ContextMenu` on right-click (Play, Remove, Export).
  - Empty state with guidance: `"No tracks in playlist. Drop SPC files here or use the file picker to add tracks."`.
  - Focus restored to sensible element after track removal (next track, or empty-state message).
- [ ] `src/features/playlist/PlaylistView.module.css`.
- [ ] Complete `nextTrack`, `previousTrack`, `playTrackAtIndex`, `removeTrackSafe` in orchestration slice.
- [ ] Wire `PlaybackEnded` callback → `nextTrack()` orchestration action, respecting repeat mode. `PlaybackEnded` fires when the worklet finishes rendering `durationSamples + fadeOutSamples` (computed from `calculateTrackDuration()` including the resolved loop count). When repeat mode is `'one'`, the emulator re-initializes from the SPC snapshot and replays the full loop cycle.
- [ ] Shuffle and repeat mode toggles (Radix `Toggle` with `aria-pressed`).
- [ ] Gapless playback: define and implement a minimal-gap track transition (target < 50ms gap). Pre-parse next track's SPC data, tear down current worklet, reinitialize with new data. Agent discretion on optimization approach. If a new worker protocol message is needed (e.g., `PreloadNextSpc`), extend `worker-protocol.md` with the new message type and document the rationale.
- [ ] Populate `recently-played` IndexedDB store on track playback with timestamp.

#### 8-Voice Mixer

- [ ] `src/features/mixer/MixerPanel.tsx` — mixer component (can appear in player view or as floating panel):
  - 8 voice channel strips.
  - Mute toggle per voice (Radix `Toggle`, keyboard Digit1–Digit8).
  - Solo toggle per voice (Shift+Digit1–Digit8).
  - Unmute all (Digit0).
  - Voice color coding using `--spc-color-voice-N` tokens.
  - Voice channel colors have number labels (#0–#7) so color is never the sole differentiator.
  - ARIA: each toggle labelled with voice number per `docs/design/accessibility-patterns.md` §9.
  - Channel mixer keyboard pattern: arrow keys navigate between voice strips, M toggles mute, S toggles solo.
- [ ] `src/features/mixer/MixerPanel.module.css`.
- [ ] Wire mute/solo to audio engine `setVoiceMask()` via orchestration.
- [ ] **Doc reconciliation:** Update `docs/design/accessibility-patterns.md` §9 to match the mute/solo-only mixer that this phase builds. The current §9 describes volume/pan sliders that are not in scope — align the ARIA patterns with the actual controls.

#### VU Meters

- [ ] `src/features/mixer/VuMeter.tsx` — Tier 2 custom component:
  - Direct DOM via refs + `requestAnimationFrame` (NOT React state).
  - Reads from `audioStateBuffer` each frame.
  - CSS gradient (green/yellow/red) per `docs/design/design-tokens.md` VU colors.
  - ARIA per `docs/design/accessibility-patterns.md` §6:
    - `role="meter"` with `aria-roledescription="level meter"`.
    - `aria-valuenow` / `aria-valuetext` throttled at ≤ 4 Hz via `createThrottledUpdater`.
    - `aria-valuetext`: `"silent"` at 0, `"clipping"` at 100, `"{N} percent"` otherwise.
    - Numeric readout panel (`role="status"`) as fallback for screen readers.
  - `prefers-reduced-motion: reduce` → disable smooth animation, show static bars.
- [ ] `src/features/mixer/VuMeter.module.css`.

#### Metadata Viewer

- [ ] `src/features/metadata/MetadataPanel.tsx` — displays active track's ID666/xid6 metadata:
  - Title, game, artist, dumper, comments, date, duration, fade length, emulator used, channel disables.
  - Now-playing display in player bar area.
- [ ] `src/features/metadata/MetadataPanel.module.css`.

#### E2E Testing Infrastructure

This phase adds the Playwright E2E layer since the app is now feature-rich enough to warrant it.

- [ ] `playwright.config.ts` — per ADR-0010: `fullyParallel: true`, `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 2 : 0`, `workers: process.env.CI ? 1 : undefined`. `webServer`: `npm run preview` on port 4173. Reporter: JUnit XML + HTML in CI. `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`.
- [ ] Expand `tests/e2e/smoke.spec.ts` (created in Phase 4) with route navigation coverage.
- [ ] Expand `tests/e2e/spc-load.spec.ts` (created in Phase 4) to verify playback starts and transport controls respond.
- [ ] Add `npm run test:e2e` and `npm run test:e2e:ui` scripts.
- [ ] CI: new `e2e` job after `build`. `build` job uploads TWO artifacts: `upload-pages-artifact` for deploy AND `actions/upload-artifact@v4` of raw `dist/` for E2E. `e2e` job downloads the raw `dist/` artifact, serves via `npx vite preview` (port 4173, matching `playwright.config.ts` webServer), `npx playwright install --with-deps`, runs tests, uploads Playwright report on failure. Deploy job updated: `needs: [build, e2e]`. Start with **Chromium-only** in CI for speed.
- [ ] Cache Playwright browser binaries (`~/.cache/ms-playwright`) keyed on `package-lock.json` hash to avoid ~400 MB download per CI run.
- [ ] Gate CI on coverage not decreasing from Phase 3 baseline.

### Verification Criteria

#### Deferred Item Verification

- [ ] Audio plays at correct pitch — resampler converts 32 kHz DSP output to 48 kHz AudioContext rate without pitch shift.
- [ ] Seek bar position and duration display are accurate (sample counting accounts for resampling ratio).
- [ ] Speed control produces audible speed changes via resampler varispeed.
- [ ] `PlayerView.tsx` uses `useId()` — no hardcoded element IDs.
- [ ] `computeTrackId()` accepts `ArrayBuffer` — no redundant file reads.

#### Phase 5 Verification

- [ ] Can add multiple SPC files, see them in playlist, double-click to play.
- [ ] Next/previous track works (buttons and Ctrl+Arrow keys).
- [ ] Muting voice 3 silences that voice immediately; solo isolates it.
- [ ] VU meters animate smoothly at 60fps during playback without React re-renders.
- [ ] Metadata panel shows correct title/game/artist for loaded files.
- [ ] All keyboard shortcuts from `docs/design/keyboard-shortcuts.md` §2.2 (player controls), §2.5 (playlist), and §2.6 (mixer) work.
- [ ] Shortcut help dialog opens with `?`.
- [ ] Playlist persists to IndexedDB and survives page reload.
- [ ] Shuffle and repeat modes function correctly for track advancement.
- [ ] Track transitions during continuous playlist playback have < 50ms gap (manual verification).
- [ ] E2E smoke and SPC upload tests pass in CI. Deployment gates on E2E success.
- [ ] Playlist navigable by keyboard, VU meters have `role="meter"`.
- [ ] Playlist follows WAI-ARIA listbox pattern. axe-core finds no violations.
- [ ] Keyboard reorder announces the new position via live region.
- [ ] Context menu is keyboard-accessible (Shift+F10 or dedicated menu key).
- [ ] Empty playlist state is announced as `role="status"`.
- [ ] VU meter ARIA attributes update at ≤ 4 Hz, not 60fps.
- [ ] Global shortcuts do not fire when a text input has focus.

---

## Phase 5a — Pre-Phase-6 Remediation

**Goal:** Close all Phase 1–5 gaps identified during the 2026-03-20 audit before proceeding to Phase 6. Prior phases left components unrendered, callbacks unwired, and several deferred items incomplete. This phase exists to prevent gap accumulation.

**Date added:** 2026-03-20
**Audit method:** Multi-agent codebase analysis (5 domain experts + 1 verification pass) cross-referenced against every Phase 1–5 deliverable and verification criterion.

### Context

Multiple Phase 5 components were fully implemented but never integrated into the UI. Several runtime bugs prevent core playlist functionality from working despite correct-looking code. Phase 2–4 deferred items accumulated without being addressed. This remediation brings the application to the state Phase 5 was supposed to deliver before Phase 6 work begins.

### Critical Fixes (P0)

These items represent broken core functionality or fully-built components that are invisible to users.

- [ ] **Render MixerPanel in the UI.** `MixerPanel` (with `VuMeter`) at `src/features/mixer/` is fully implemented but never imported or rendered. Integrate into the player view or a dedicated panel. Users currently cannot see voice strips, VU meters, or mute/solo state — keyboard shortcuts (Digit1–8) work invisibly.

- [ ] **Render MetadataPanel in the UI.** `MetadataPanel` at `src/features/metadata/MetadataPanel.tsx` is fully implemented but never imported. Integrate so users can see full ID666/xid6 metadata beyond the "now playing" line.

- [ ] **Wire PlaybackEnded → nextTrack().** `audioEngine.setOnPlaybackEnded()` exists and the worklet correctly emits `playback-ended`, but no code ever calls `setOnPlaybackEnded(nextTrack)`. Automatic track advancement and continuous playback are broken.

- [ ] **Debug and fix next/prev track runtime failure.** Transport buttons call `handleNext()`/`handlePrevious()` and shortcuts call `nextTrack()`/`previousTrack()` — code is wired correctly. User reports they do nothing. Root cause undiagnosed; investigate orchestration action runtime behavior (audio engine state, IndexedDB load, race conditions).

- [ ] **Debug and fix double-click-to-play runtime failure.** `onDoubleClick={() => playTrackAtIndex(index)}` exists on playlist items. User reports it doesn't work. Same suspected root cause as next/prev — investigate `playTrackAtIndex()` orchestration action end-to-end.

- [ ] **Debug and fix post-reload track loading.** Playlist persists to IndexedDB correctly. After reload, user sees "no track loaded" and must manually select a track — which then also fails to play (see above). Investigate hydration → track selection → audio engine initialization flow.

### High Priority (P1)

These items are required Phase 5 deliverables that were never implemented.

- [ ] **Implement Radix ContextMenu on playlist items.** Right-click context menu with Play, Remove, Export options. Specified in Phase 5 deliverables but not built.

- [ ] **Populate recently-played IndexedDB store.** The `recently-played` store is defined in `db.ts` but nothing writes to it. Write a `{ fileHash, playedAt }` record on each track playback.

- [ ] **Implement channel mixer keyboard grid pattern.** Currently only global Digit shortcuts work. Add roving tabindex and arrow-key navigation within the mixer panel per accessibility-patterns.md §9.

- [ ] **Reconcile accessibility-patterns.md §9 with actual implementation.** §9 still describes volume/pan sliders that were never built. Update to match the mute/solo-only mixer.

- [ ] **Register playlist contextual shortcuts via useShortcut.** Playlist shortcuts (Delete, Enter, Alt+Up/Down, Ctrl+A, Ctrl+Shift+A) work via inline keyboard handlers but bypass the ShortcutManager scope priority system. Refactor to use `useShortcut()` with `scope: 'contextual'`.

### Deferred Items (P1 — Phase 2–4 carry-over)

These items were specified in their original phases, explicitly listed in Phase 5's "Deferred from Prior Phases" section, and still remain unfinished.

- [ ] **CI WASM export surface validation.** Specified in Phases 2 and 4. A CI step that parses the `.wasm` binary's export section and compares against `DspExports`. Never implemented.

- [ ] **AudioWorklet unit tests.** Specified in Phase 4. `src/audio/spc-worklet.test.ts` does not exist. Tests needed for fade ramp accuracy, PlaybackEnded timing, SetPlaybackConfig mid-playback, infinite mode.

- [ ] **Persistence round-trip integration test.** Specified in Phase 3. Settings → IndexedDB → restore verification test never written.

### Medium Priority (P2)

These items are spec deviations or polish issues that don't block functionality.

- [ ] **Replace native `<input type="range">` with Radix Slider.** Seek bar, volume slider, and speed control all use native HTML range inputs instead of Radix `Slider` as specified in Phase 4. Functionally equivalent but inconsistent with the Radix design system.

- [ ] **Enforce coverage baseline in CI.** Phase 5 specifies "Gate CI on coverage not decreasing from Phase 3 baseline." Coverage provider is configured but no CI threshold check exists.

- [ ] **Wire fullscreen shortcut.** `F` key defined in `default-keymap.ts` but no handler registered in `GlobalShortcuts.tsx`.

### Acknowledged Deviations (No action required)

These items deviate from the original spec but are acceptable as-is.

- **WASM resampler in TypeScript, not Rust.** Phase 2 specified a Rust resampler; actual implementation is TypeScript linear interpolation in the worklet. Works correctly at 1× speed. Varispeed quality is adequate for v1. Revisit in Phase 8 performance optimization if needed.

- **Voice numbering 1–8 vs. spec's 0–7.** Implementation shows user-friendly 1–8 labels. This is arguably better UX than the spec's #0–#7. Accept as-is.

- **WASM binary size 258 KB vs. 150 KB target.** CI threshold relaxed to 300 KB. Adding features will increase further. Revisit in Phase 8.

- **`dsp_set_speed` and `brr_decode_sample` not exported from WASM.** Speed control works through TypeScript resampler ratio. `brr_decode_sample` needed for Phase 6 (per-instrument export) and Phase 7 (instrument view) — implement when those phases begin, not now.

- **Export shortcuts (Ctrl+E, Ctrl+Shift+E) are stubs.** Phase 6 feature; expected to be completed then.

- **Analysis shortcuts (Alt+M/R/V/E) not wired.** Phase 7 feature; analysis view is a placeholder.

### Verification Criteria

- [ ] MixerPanel visible in UI with 8 voice strips and VU meters animating during playback.
- [ ] MetadataPanel visible in UI showing full track metadata.
- [ ] After a track finishes playing (fade-out complete), the next track in the playlist auto-starts.
- [ ] Double-clicking a playlist item starts playback of that track.
- [ ] Next/Previous transport buttons advance through the playlist.
- [ ] Ctrl+ArrowRight / Ctrl+ArrowLeft advance through the playlist.
- [ ] After page reload, selecting a track from the persisted playlist starts playback.
- [ ] Right-click on a playlist item opens a context menu.
- [ ] Mixer panel navigable via arrow keys (keyboard grid pattern).
- [ ] All prior phase verification criteria still pass.
- [ ] `npm run validate` passes.

---

## Phase 6 — Export Pipeline

**Goal:** Users can export SPC playback to WAV, FLAC, OGG Vorbis, and MP3 files. Full mix, per-track, per-instrument sample, and batch export all work. Progress reporting and cancellation are functional.

### Required Reading

| Document                                       | Why                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `docs/design/export-pipeline.md`               | Complete export architecture, queue management, worker protocol, per-format details  |
| `docs/adr/0006-audio-codec-libraries.md`       | Library selections (libflac.js, ogg-vorbis-encoder-wasm, lame-wasm), WAV custom impl |
| `docs/adr/0003-audio-pipeline-architecture.md` | Export path: sinc resampler, TPDF dithering, offline rendering                       |
| `docs/design/worker-protocol.md` §2.4–2.5      | `MainToExportWorker` and `ExportWorkerToMain` message types                          |
| `docs/design/accessibility-patterns.md` §5     | Export progress ARIA                                                                 |
| `docs/design/zustand-coordination.md`          | ExportSlice interface                                                                |

### Deliverables

#### Export Worker

- [ ] `src/workers/export-worker.ts` — module worker:
  - Instantiates separate WASM DSP instance.
  - Renders SPC at maximum speed (tight loop calling `dsp_render()`).
  - Sinc resampler (Lanczos-3, WASM) for output sample rate conversion.
  - TPDF dithering (float32 → int16).
  - Fade-out gain ramp.
  - Voice mask configuration for per-track export.
  - Progress reporting (throttled to ≤ 20 messages/sec).
  - Cooperative cancellation (checks cancel flag between render chunks).
  - Handles `MainToExportWorker` message types from worker protocol.

#### Encoders

- [ ] `src/export/encoders/wav-encoder.ts` — custom TypeScript WAV encoder:
  - RIFF/WAVE container (fmt + data chunks), PCM 16-bit, configurable sample rate/channels.
  - LIST/INFO chunk for metadata (INAM, IART). ~50 lines, no dependencies.
- [ ] `src/export/encoders/flac-encoder.ts` — adapter for libflac.js WASM (lazy-load via dynamic `import()`).
- [ ] `src/export/encoders/ogg-encoder.ts` — adapter for ogg-vorbis-encoder-wasm (lazy-load, quality-based VBR).
- [ ] `src/export/encoders/mp3-encoder.ts` — adapter for lame-wasm (lazy-load, VBR V2, ID3v2 metadata).
- [ ] `src/export/encoders/encoder-types.ts` — unified encoder interface (`init`, `encode`, `finalize`, `setMetadata`).

#### Unit Tests

- [ ] `src/export/encoders/wav-encoder.test.ts` — round-trip bit-exact test (encode → decode → compare).
- [ ] `src/export/encoders/flac-encoder.test.ts` — verify output has valid FLAC signature.
- [ ] `src/export/encoders/ogg-encoder.test.ts` — verify output has valid OGG page structure.
- [ ] `src/export/encoders/mp3-encoder.test.ts` — verify output has valid MP3 frame sync.
- [ ] `src/export/brr-decoder.test.ts` — compare output against reference BRR decoding.
- [ ] `src/export/ExportQueueManager.test.ts` — queue ordering, cancellation, completion callbacks.

#### Build Integration for Codecs

- [ ] Verify dynamic `import()` produces separate chunks for each codec per ADR-0009's code splitting strategy.
- [ ] Verify codec WASM modules load correctly from hashed chunk URLs after Vite build.
- [ ] LGPL-2.1 compliance for LAME: verify lame-wasm is in its own independently replaceable chunk (inspect `dist/assets/`). Document license attribution in `THIRD_PARTY_LICENSES` file.
- [ ] Vite config: add `optimizeDeps.exclude` entries if codec WASM loading conflicts with Vite's pre-bundling.

#### BRR Sample Extraction

- [ ] `src/export/brr-decoder.ts` — reads BRR samples from SPC RAM via source directory table:
  - Uses WASM `brr_decode_sample()` export.
  - Produces mono PCM at native rate.
  - Preserves loop point metadata.

#### Export Queue Manager

- [ ] `src/export/ExportQueueManager.ts` — main thread orchestration per `docs/design/export-pipeline.md` §3:
  - FIFO queue with sequential processing.
  - Worker lifecycle management (create/terminate).
  - SPC data loaded from IndexedDB on demand (not held in memory).
  - Progress forwarding to Zustand export slice.
  - AbortController for cancellation.
  - Blob creation and download trigger (`URL.createObjectURL()` → `<a download>` → `URL.revokeObjectURL()` after 10s).
  - Batch export with ZIP packaging (agent discretion on ZIP library — consider `fflate`).
  - Filename generation per `docs/design/export-pipeline.md` §7.

#### Export UI

- [ ] `src/features/export/ExportDialog.tsx` — Radix `Dialog`:
  - Format selection (WAV/FLAC/OGG/MP3) via Radix `ToggleGroup` or `Tabs`.
  - Sample rate selection (32k/44.1k/48k/96k) via Radix `Select`.
  - Export type selection (full mix / per-track / per-instrument / batch).
  - Voice selection for per-track export (checkboxes).
  - **Loop-aware duration controls** (see `loop-playback-design.md` §5.2):
    - When xid6 timing available (`hasLoopData`): show intro/loop/end breakdown (read-only), editable loop count spinner (0–99), editable fade duration, live-computed total.
    - When xid6 timing absent: show editable flat duration + fade; loop count control disabled with tooltip "Loop count requires xid6 timing metadata."
    - Export always produces finite output — infinite loop option not offered. If user is in infinite playback mode, dialog pre-fills with last finite loop count.
  - Duration computed via `calculateTrackDuration()` — main thread resolves `durationSamples` and `fadeOutSamples` before passing to export worker.
  - Export and Cancel buttons.
- [ ] `src/features/export/ExportProgress.tsx` — progress display per `docs/design/accessibility-patterns.md` §5:
  - Radix `Progress` for single-file and batch progress bars.
  - `aria-valuetext` with phase and percentage: `"Encoding: 45 percent"`.
  - Batch progress: `"Exporting file 3 of 10: Terra's Theme"`.
  - Milestone announcements at 25%, 50%, 75% via `aria-live="polite"`.
  - Completion/error/cancellation announcements.
  - Cancel button accessible via Tab, Escape cancels active export.
- [ ] `src/features/export/ExportDialog.module.css`.
- [ ] Keyboard shortcuts: `Ctrl+E` (open export), `Ctrl+Shift+E` (quick export last format).

#### E2E: Export Test

- [ ] `tests/e2e/export.spec.ts` — load SPC, trigger WAV export, verify non-empty file download.

### Verification Criteria

- [ ] Export a 30-second SPC to WAV → file plays correctly in VLC/Audacity.
- [ ] Export to FLAC → lossless verification (decode and compare against WAV).
- [ ] Export to OGG and MP3 → files play, metadata present (title/artist).
- [ ] Per-track export → 8 separate files, each containing only that voice's audio.
- [ ] Per-instrument export → BRR samples decoded to WAV.
- [ ] Batch export of 5 files → ZIP download.
- [ ] Cancel during export → stops immediately, partial file not downloaded.
- [ ] Progress bar animates during export, phase labels update.
- [ ] Export does not interrupt live playback.
- [ ] Export E2E test passes in CI.
- [ ] Production build produces separate chunks for each codec.
- [ ] LGPL-2.1 compliance verified: LAME is independently replaceable.
- [ ] Export dialog traps focus when open. All controls keyboard-navigable.
- [ ] Progress `aria-valuenow` throttled to ≤ 4 Hz. Milestone announcements at 25/50/75%.
- [ ] Completion announces `"Export complete: {filename}"` via polite live region.
- [ ] Errors announce via `aria-live="assertive"`.

---

## Phase 7 — Advanced Features (Instrument, Analysis, MIDI)

**Goal:** Instrument performer with virtual keyboard and MIDI input, analysis/inspector views, A-B loop, and resampling quality settings. The full feature set from `docs/requirements.md` is present.

### Required Reading

| Document                                             | Why                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `docs/design/keyboard-shortcuts.md` §3               | Instrument keyboard mode, note mapping, octave/velocity controls      |
| `docs/design/accessibility-patterns.md` §7, §10, §11 | Virtual keyboard ARIA, DSP register inspector, echo buffer/BRR viewer |
| `docs/adr/0014-resampling-quality-settings.md`       | Quality presets, AudioContext recreation for sample rate changes      |
| `docs/adr/0001-snes-audio-emulation-library.md`      | snes-apu-spcp introspection API, BRR access, interpolation modes      |
| `docs/design/worker-protocol.md`                     | Snapshot, interpolation, resampler messages                           |
| `docs/design/zustand-coordination.md`                | InstrumentSlice, PlaybackSlice.loopRegion                             |

### Deliverables

#### Instrument Performer

- [ ] `src/features/instrument/InstrumentView.tsx` — instrument view:
  - Instrument selector (list instruments from SPC's source directory).
  - `?instrument=<index>` in URL search params.
  - ADSR envelope display/edit (Radix Sliders for parameters, canvas for envelope curve — `aria-hidden="true"` on canvas, sliders provide accessible interface).
- [ ] `src/features/instrument/VirtualKeyboard.tsx` — Tier 2 custom component:
  - Piano-style layout (2 octaves visible). Click/touch-to-play notes.
  - Per `docs/design/accessibility-patterns.md` §7: `role="group"` with `aria-label="Virtual keyboard"`, individual keys as `<button>` with `aria-label` (e.g., `"C4"`), roving tabindex for arrow key navigation.
  - Visual feedback on key press (`[data-state="pressed"]`).
- [ ] Instrument keyboard mode per `docs/design/keyboard-shortcuts.md` §3:
  - Toggle via Backquote key.
  - Lower octave: Z-M keys mapped to C-B. Upper octave: Q-I keys mapped to C-C.
  - Octave shift, velocity control.
  - Scope priority 5 — captures note keys but passes through Space (play/pause).
  - Auto-deactivate on view change, suspend during Radix overlays.
  - Visual indicator showing instrument mode is active.
- [ ] Instrument adjustment controls: pitch shift, gain, filter cutoff using Radix `Slider`.

#### MIDI Input Integration

- [ ] `src/midi/midi-input.ts` — Web MIDI API wrapper:
  - Device discovery and connection.
  - Note on/off mapping to SPC instrument.
  - `InstrumentSlice.isMidiConnected` state.
  - Graceful degradation when Web MIDI unavailable (`MIDI_NOT_SUPPORTED` error per ADR-0015).
  - Device disconnection handling.

#### Analysis / Inspector Views

- [ ] `src/features/analysis/AnalysisView.tsx` — route at `/#/analysis`:
  - Sub-tab navigation using Radix `Tabs` (not router — internal view tabs per ADR-0013).
  - Tabs: Memory, Registers, Voices, Echo. `Alt+M/R/V/E` contextual shortcuts.
  - `?tab=memory|registers|voices|echo` in URL search params.
  - Tab keyboard pattern per WAI-ARIA APG (automatic activation, arrow keys).
- [ ] `src/features/analysis/MemoryViewer.tsx` — hex dump of 64 KB SPC RAM:
  - Virtualized scrolling. `role="grid"` or `role="table"` with column headers per `docs/design/accessibility-patterns.md` §10.
  - Hex/decimal toggle (`H` shortcut). Monospace font (`--spc-font-mono`).
- [ ] `src/features/analysis/RegisterViewer.tsx` — 128-byte DSP register display:
  - Per `docs/design/accessibility-patterns.md` §10: `role="grid"`, labeled register names, real-time value updates throttled for ARIA (≤ 4 Hz). `aria-live="off"`.
  - Register names annotated (e.g., `$00 VOLL0`).
- [ ] `src/features/analysis/VoiceStatePanel.tsx` — per-voice ADSR phase, BRR position, pitch, volume envelope:
  - Reads from `audioStateBuffer.voices[]` via rAF. `VisuallyHidden` text equivalents.
- [ ] `src/features/analysis/EchoBufferView.tsx` — echo FIR filter visualization:
  - Canvas-based at display rate. `role="img"` with descriptive `aria-label` per `docs/design/accessibility-patterns.md` §11.

#### A-B Loop

- [ ] A-B loop UI on seek bar:
  - Set loop start (`[`), set loop end (`]`), toggle loop (`L`), clear (`Shift+L`).
  - Visual overlay on seek bar showing loop region with draggable handles.
  - Loop region uses `--spc-color-accent-subtle` background.
- [ ] Audio engine: when loop active and position reaches loop end, seek to loop start.
- [ ] Store integration: `loopRegion` in playback slice.
- [ ] **A-B loop is orthogonal to track loop count.** A-B loop operates on the playback timeline and suspends the auto-fade timer. When deactivated, normal track-loop duration tracking resumes. If the current position exceeds `durationSamples`, fade begins immediately. See `loop-playback-design.md` §4.5.

#### Per-File Timing Override Persistence

- [ ] `src/storage/timing-overrides.ts` — IndexedDB CRUD for `PerFileTimingOverride` records, keyed by `trackId` (SHA-256):
  - `getTimingOverride(trackId)`, `setTimingOverride(trackId, override)`, `deleteTimingOverride(trackId)`.
  - Loaded by `loadFile` / `playTrackAtIndex` orchestration actions to feed `calculateTrackDuration()`.
  - Updated when user changes loop count in the player transport controls.
  - See `loop-playback-design.md` §6.2.
- [ ] IndexedDB schema update: add `timing-overrides` object store (key: `trackId`, value: `PerFileTimingOverride`).

#### Resampling Quality Settings

- [ ] `src/features/settings/AudioQualitySettings.tsx`:
  - Preset selector (Standard / High Quality / Custom) via Radix `Select`.
  - Custom mode: output resampler, output sample rate, DSP interpolation.
  - Label indicating Gaussian is hardware-authentic.
  - Warning when selecting 96 kHz on iOS (not supported).
- [ ] AudioContext recreation flow: request snapshot from worklet → destroy old context → create new → reinitialize with snapshot restore.
- [ ] Wire resampler/interpolation mode changes to worklet via messages.
- [ ] Settings persisted in settings slice.

#### Settings View (Complete)

- [ ] Complete `src/features/settings/SettingsView.tsx`:
  - Theme selection (Dark / Light / System).
  - Audio quality presets.
  - Keyboard shortcut customization (display and reassign — agent discretion on remapping UI).
  - Export defaults (format, sample rate).
  - About section (version, licenses).

#### Cross-Browser E2E

- [ ] Expand CI E2E job to **parallel** cross-browser matrix: Chromium + WebKit + Firefox run as separate CI jobs. Each job installs only its needed browser (`playwright install --with-deps chromium`). Consider making Firefox `continue-on-error: true` initially.

### Verification Criteria

- [ ] Instrument mode: press keyboard keys → notes play through SPC instrument.
- [ ] MIDI device connected → MIDI notes trigger instrument playback.
- [ ] MIDI connection status announced: `"MIDI device connected: {name}"` / `"MIDI device disconnected"`.
- [ ] Memory viewer shows SPC RAM hex dump, updates during playback for register view.
- [ ] Voice state display shows real-time envelope/pitch/volume per voice.
- [ ] A-B loop: set markers, audio loops between them, visual overlay visible on seek bar.
- [ ] Quality preset change to "High Quality" → audible difference.
- [ ] Sample rate change to 96 kHz → AudioContext recreates, playback continues from same position.
- [ ] All settings persist across page reload.
- [ ] Cross-browser E2E matrix passes in CI.
- [ ] Virtual keyboard keys are `<button>` elements with `aria-label` for note names.
- [ ] Instrument mode activation/deactivation announced via live region.
- [ ] Note keys do not trigger global shortcuts while instrument mode active; Space still triggers play/pause.
- [ ] Analysis sub-tabs follow WAI-ARIA tabs pattern. Hex/decimal toggle has `aria-pressed`.
- [ ] Real-time value ARIA updates throttled at ≤ 4 Hz.
- [ ] axe-core automated scan passes on every route.

### Deferred Items

The following Phase 7 deliverables have partial implementations but require additional work to satisfy their verification criteria. They are carried forward to Phase 8.

#### A-B Loop Enforcement and Visual Overlay

**Completed:** Store state (`loopRegion`, `setLoopStart`, `setLoopEnd`, `toggleLoop`, `clearLoop`) and keyboard shortcut definitions (`[`, `]`, `L`, `Shift+L`).

**Remaining:**

- `src/features/player/LoopMarkers.tsx` — visual overlay on seek bar with draggable start/end handles, reactive to `loopRegion` store state.
- Loop enforcement logic — monitor playback position and seek to `loopRegion.startTime` when position reaches `loopRegion.endTime`.
- Integration with `PlayerView.tsx` seek bar component.

**Blocked by:** UI component not yet created; enforcement logic not yet wired to the audio position sync loop.

#### Echo Buffer Telemetry

**Completed:** `audioStateBuffer` fields (`echoBuffer: Int16Array | null`, `firCoefficients: Uint8Array`), `EchoBufferView.tsx` component with graceful "not available" fallback.

**Remaining:**

- WASM exports to expose echo buffer pointer and FIR coefficient data (e.g., `dsp_get_echo_buffer_ptr`, `dsp_get_fir_coefficients`).
- Extend `WorkletToMain.Telemetry` protocol to include echo/FIR data.
- Worklet telemetry handler to serialize and send echo data on each emission cycle.

**Blocked by:** WASM library (`snes-apu-spcp`) does not currently expose echo buffer or FIR coefficient read access in a way suitable for real-time telemetry.

#### Instrument Note-On/Note-Off Playback

**Completed:** Full UI infrastructure — `VirtualKeyboard.tsx`, `useInstrumentKeyboard.ts`, `useMidi.ts` hook, `InstrumentView.tsx` composition. Callbacks fire correctly from keyboard input, mouse/touch interaction, and MIDI devices.

**Remaining:**

- WASM export for per-voice key-on/key-off (e.g., `dsp_voice_note_on(voice, pitch, velocity)`, `dsp_voice_note_off(voice)`), or direct DSP register writes to simulate key-on via `dsp_set_register`.
- Wire `handleNoteOn` / `handleNoteOff` in `InstrumentView.tsx` to the audio engine.
- Worker protocol messages for note-on/note-off commands.

**Blocked by:** The WASM library (`snes-apu-spcp`) does not expose per-voice key-on/key-off exports. Implementing this requires either patching the vendor library or using the existing `dsp_set_register` export to write directly to S-DSP key-on registers (KON at address `$4C`).

---

## Phase 8 — PWA, Polish & Production Hardening

**Goal:** The application is a fully functional offline PWA, passes accessibility audit, meets performance targets, and is ready for public use. CI is hardened with coverage, budgets, and automated releases.

### Required Reading

| Document                                           | Why                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `docs/requirements.md`                             | PWA requirements, performance targets, non-functional requirements                  |
| `docs/design/accessibility-patterns.md` §8, §12-13 | Waveform/spectrum ARIA, cross-cutting a11y patterns, screen reader testing strategy |
| `docs/design/keyboard-shortcuts.md` §6-8           | Customization persistence, Help UI, browser tab unfocus                             |

### Deliverables

#### Phase 7 Carry-Forward

- [ ] **A-B Loop:** `LoopMarkers.tsx` visual overlay on seek bar with draggable handles. Loop enforcement logic in `PlayerView.tsx` position sync loop (seek to loop start when position reaches loop end).
- [ ] **Echo Buffer Telemetry:** WASM exports for echo buffer and FIR coefficient access. Extend `WorkletToMain.Telemetry` to carry echo data. Wire worklet to populate `audioStateBuffer.echoBuffer` and `firCoefficients`.
- [ ] **Instrument Note Playback:** WASM export or register-write approach for per-voice key-on/key-off. Wire `InstrumentView.tsx` callbacks to audio engine via worker protocol.

#### Service Worker & PWA

- [ ] `public/manifest.json` — PWA manifest:
  - App name, short name, description, theme color (from design tokens accent), display: `standalone`.
  - Icons at required sizes (192×192, 512×512, maskable).
  - File handlers for `.spc` files (where browser supports `file_handlers`).
  - Share target for receiving SPC files.
- [ ] `src/sw.ts` — Service Worker:
  - Cache-first for static assets (JS, CSS, WASM, icons — content-hashed = immutable).
  - Stale-while-revalidate for HTML.
  - Versioned cache names using date-based version string (`spc-player-shell-YYYY.MM.DD`).
  - Precache critical resources during install.
  - Delete old caches on activate.
  - Update detection + user notification ("New version available, reload to update").
  - Background audio: service worker does not interfere with AudioContext.
- [ ] Version injection at build time: `vite.config.ts` `define` injects `__APP_VERSION__` (date-based format `YYYY.MM.DD[.N]`).
- [ ] Install prompt with deferred `beforeinstallprompt` handling.
- [ ] Offline indicator in UI when network is unavailable.
- [ ] Verify COOP/COEP headers (added in Phase 4) don't break codec lazy-loading. Switch from `credentialless` to `require-corp` only if all subresources comply.
- [ ] SPA 404 fallback: `public/404.html` redirect (safety net for GitHub Pages, though hash routing makes it mostly unnecessary).
- [ ] Media Session API for lock screen controls (title, artist, artwork).

#### PWA Icons & Branding

- [ ] App icons at standard PWA sizes. Apple touch icon, favicon.
- [ ] Splash screen configuration for iOS.

#### Error Recovery UI

- [ ] Error boundaries at root and per-view level per ADR-0015.
- [ ] Toast/banner notifications for user-facing errors (Radix `Dialog` or custom toast).
- [ ] Audio pipeline recovery: WASM trap → tear down AudioWorklet → rebuild → restore from snapshot.
- [ ] `AudioContext` suspension recovery (autoplay policy).
- [ ] Storage quota exceeded handling.

#### Responsive Refinements

- [ ] Polish mobile layout: bottom nav, collapsible panels, swipe gestures.
- [ ] Tablet layout: side-by-side player + playlist.
- [ ] Desktop layout: full-featured with all panels visible.
- [ ] Safe area insets for notched devices (`env(safe-area-inset-*)`).

#### Performance Optimization

- [ ] Bundle size audit: verify route-based code splitting, codec lazy-loading, react-vendor chunk. Document total and per-route chunk sizes.
- [ ] Bundle size budgets enforced in CI:
  - Total JS (gzipped): < 200 KB (excluding codec chunks).
  - React vendor chunk: < 50 KB gzipped.
  - WASM DSP binary: < 150 KB (already enforced).
  - Largest route chunk: < 50 KB gzipped.
- [ ] Lighthouse audit targeting: FCP < 1.5s, TTI < 3s, Performance > 90, Accessibility > 95, Best Practices > 95, PWA checks pass.
- [ ] Loading states: skeleton UI using `--spc-color-skeleton` token, loading indicator during SPC parse, Suspense boundaries on lazy routes.
- [ ] 60fps verification for VU meters and visualizations during playback.
- [ ] `React.memo` / selector optimization for hot render paths.
- [ ] `prefers-reduced-motion` verification: all animations respect the setting.

#### CI Hardening

- [ ] Upgrade coverage ratchet to minimum thresholds: Statements 70%, Branches 60%, Functions 70%, Lines 70%. CI fails below threshold.
- [ ] `npm audit` enforcement (added in Phase 1) — verify still passing with all Phase 6 codec dependencies.
- [ ] WASM export surface validation (formalized from Phase 4).
- [ ] CI pipeline target: < 10 minutes total. Cache Playwright browsers (`~/.cache/ms-playwright`). Consider splitting `check` into parallel sub-jobs.
- [ ] Automated changelog generation from conventional commits.
- [ ] GitHub Release created automatically on deploy, tagged with date-based version.

#### Comprehensive E2E Tests

- [ ] `tests/e2e/playback.spec.ts` — load, play, pause, stop, seek, verify audio state.
- [ ] `tests/e2e/playlist.spec.ts` — add, reorder, remove, play from playlist.
- [ ] `tests/e2e/keyboard.spec.ts` — global shortcuts.
- [ ] `tests/e2e/theme.spec.ts` — toggle theme, verify persistence.
- [ ] `tests/e2e/routing.spec.ts` — deep links, back/forward.
- [ ] `tests/e2e/pwa.spec.ts` — offline mode, cache behavior, service worker registration.
- [ ] Cross-browser: all E2E tests run on Chromium, WebKit, Firefox.

#### Accessibility Audit

- [ ] Verify all ARIA patterns from `docs/design/accessibility-patterns.md`.
- [ ] Focus management audit: route changes, dialog traps, no unexpected traps.
- [ ] Keyboard-only navigation test: complete all user workflows without mouse.
- [ ] `prefers-contrast: more` → focus ring increases to 3px.
- [ ] Color contrast spot-check against `docs/design/design-tokens.md` §2.4 table.

#### Waveform/Spectrum Visualizations (Stretch)

- [ ] `src/features/player/WaveformDisplay.tsx` — playback position waveform using `--spc-color-waveform-*` tokens.
- [ ] `src/features/analysis/SpectrumAnalyzer.tsx` — FFT visualization (Tier 2, canvas + rAF).
- [ ] `role="img"` with `aria-label` — decorative for screen readers.
- [ ] `prefers-reduced-motion: reduce` → static display or disable.

#### OpenTelemetry (Stretch)

- [ ] `src/otel/instrumentation.ts` — basic client-side OTel: document load span, SPC file load, playback session, export operation. Agent discretion on SDK and exporter (consider console exporter for v1).

#### Final Polish

- [ ] Content Security Policy meta tag in `index.html`.
- [ ] `robots.txt` and `sitemap.xml` for GitHub Pages.
- [ ] Title and meta description tags.
- [ ] Update `README.md` with user-facing documentation (features, usage).
- [ ] `THIRD_PARTY_LICENSES` file updated with all attributions.

### Verification Criteria

- [ ] Lighthouse PWA audit passes all checks.
- [ ] Lighthouse Performance > 90 on mobile simulation.
- [ ] Lighthouse Accessibility > 95.
- [ ] App installs on Chrome desktop, iOS Safari, Android Chrome.
- [ ] Offline mode: loaded app works without network (playback, playlist, settings).
- [ ] Service Worker update flow: deploy → user sees notification → reload applies update.
- [ ] All E2E tests pass on Chromium, WebKit, and Firefox.
- [ ] Keyboard-only user can: load file, play, mute voices, navigate views, export, change settings.
- [ ] Screen reader (VoiceOver/NVDA) can navigate transport controls, playlist, and settings.
- [ ] No console errors or warnings in production build.
- [ ] CI: coverage gates, bundle budgets, npm audit, and auto-release all active and passing.
- [ ] CI pipeline completes in < 10 minutes.
- [ ] Install prompt is keyboard-accessible.
- [ ] Service worker update notification announced via `aria-live="polite"`.
- [ ] Error recovery toasts announced via `aria-live="assertive"`.
- [ ] Mobile touch targets ≥ 44×44px across all views.
- [ ] Media Session API metadata populated for lock screen display.

---

## Cross-Phase Concerns

These apply to **every phase** and are the implementing agents' responsibility throughout.

### Testing

- Unit tests colocated with source files (`*.test.ts`) — written alongside implementation, not after.
- Integration tests in `tests/integration/` when testing component interactions or service wiring.
- E2E tests added incrementally from Phase 5 onward.
- axe-core approach: Phases 1–4 use `vitest-axe` in component unit tests (`expect(container).toHaveNoViolations()`). Phases 5+ additionally run `@axe-core/playwright` in E2E tests for full-page accessibility. Both approaches coexist from Phase 5 onward.
- CI must be green before any commit.

### Code Style

- TypeScript strict mode, no `any` unless commented with justification.
- Named exports, no default exports.
- `const` over `let`. Never `var`.
- Conventional commits for every commit (`type(scope): description`).
- CSS Modules co-located with components (`.module.css`).
- Design tokens for all visual values — never raw hex/px in component CSS.
- `--spc-` prefix enforced for all CSS custom properties.

### Accessibility

- Accessibility is not a bolt-on. Every phase includes WCAG 2.2 AA verification criteria.
- axe-core automated scan passes after every phase.
- Screen reader manual spot-checks per `docs/design/accessibility-patterns.md` §13.
- `prefers-reduced-motion` and `prefers-contrast: more` respected in all new UI.
- All interactive elements meet 44×44px minimum touch target on mobile.
- Real-time ARIA attribute updates throttled to ≤ 4 Hz.
- Radix primitives preferred over custom implementations: if a Radix primitive exists, use it (ADR-0012).

### Security

- SPC file input validation: all binary reads bounds-checked, per `docs/design/spc-parsing.md`.
- CSP meta tag in `index.html` (Phase 8).
- No `eval()`, no `Function()`, no dynamic code execution.
- `npm audit` runs in CI (Phase 8).

### Error Handling

- All errors follow ADR-0015 patterns. No bare `catch {}`.
- Every error reported via `reportError()` or handled with explicit recovery.

### Documentation

- No new ADRs or design docs needed (all decisions are made).
- If an implementing agent discovers a gap in design documents, note it as a comment in the code and proceed with best judgment — do not block on missing documentation.
- Update `README.md` in Phase 8 with user-facing content.

---

## Implementation Notes for Agents

This section explains how implementing agents should use this roadmap.

1. **Reference the listed design docs and ADRs during implementation — do not invent new designs.** The "Required Reading" table for each phase lists every document that governs the deliverables. These documents contain the types, interfaces, ARIA patterns, message formats, and architectural decisions. Implementing agents must read and follow them.

2. **Design docs and ADRs are the source of truth for behavior and types.** This roadmap sequences the work and defines verification criteria, but does not redefine the technical contracts. If there is a conflict between this roadmap and a design doc, the design doc wins.

3. **Where a deliverable says "agent discretion," the implementing agent may choose the approach** but must document their decision in a code comment explaining the choice and rationale. These are intentionally under-specified to allow flexibility.

4. **Tests are written alongside implementation, not after.** Every deliverable includes its tests. Test files are colocated with source (`*.test.ts`). Do not defer testing to a later phase or a separate task.

5. **CI must be green before committing at the end of every phase.** This means lint, typecheck, and all tests pass. If Phase N breaks something from Phase N-1, fix it within Phase N.

6. **Pre-commit hooks catch issues locally.** Hooks stay under 10 seconds: ESLint fix + Prettier formatting only. Heavy validation (WASM build, E2E, full test suite) must also pass locally before committing. Since we commit directly to `main` without PRs, all tests — including E2E and the full test suite — must be locally verified to ensure CI stays green.

7. **Incremental CI pipeline expansion.** When the roadmap says "CI: new `e2e` job" in a phase, that phase is responsible for configuring the CI change alongside the feature work. Infrastructure before features.

8. **File paths in this document are relative to the project root.** All `docs/` references use project-root-relative paths (e.g., `docs/adr/0001-snes-audio-emulation-library.md`). Do not resolve them relative to this file's location.

9. **Do not add dependencies beyond what is specified** in the design docs and ADRs without noting them. The dependency list in ADR-0002 and ADR-0006 is the approved set.

10. **Phases 1–4 are the critical path.** Keep them tight and focused. Get to "first sound" as quickly as possible. Phases 5–7 build features on that foundation and can be larger. Phase 8 is polish — it assumes everything works.
