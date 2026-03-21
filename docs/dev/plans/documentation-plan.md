# Documentation Improvement Plan

**Date:** 2026-03-21 (revised)  
**Author:** Technical Writer agent  
**Scope:** In-app user guide, developer docs, README, ADRs, accessibility docs, API docs

---

## Phase Map

Documentation deliverables are mapped to the unified 6-phase implementation sequence defined in the architect review. Each phase has specific documentation tasks that ship with the code changes in that phase.

| Phase | Focus                  | Documentation deliverables                                                                                                              |
| ----- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Stabilization (bugs)   | Architecture doc audit, keyboard-shortcuts.md alignment, ADR-0016 (SharedArrayBuffer), roadmap status table                             |
| B     | Layout foundation      | ADR-0017 (desktop layout strategy), ADR-0018 (bundle budget increase), accessibility patterns update (SeekBar, drop zone)               |
| C     | Seek bar + seeking     | A-B loop marker a11y patterns, loop marker tooltips                                                                                     |
| D     | Audio engine + exports | ADR-0019 (SoundTouchJS), TSDoc on AudioEngine, DSP exports JSDoc, export pipeline status notes                                          |
| E     | Visualizations         | ADR-0020 (visualization approach), ADR-0021 (cover art approach), canvas visualization a11y patterns, glossary content for Analysis tab |
| F     | Polish                 | Help dialog (lazy-loaded), first-run onboarding, CONTRIBUTING.md, README improvements, remaining tooltips                               |

---

## 1. In-App User Guide

### 1.1 Help Panel (Modal)

A `HelpDialog` component accessible from the navigation bar (help icon) and the `?` keyboard shortcut. Replaces the current `ShortcutHelpDialog` as the top-level help entry point.

**Content outline:**

| Section            | Content                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Getting Started    | 3-step quickstart (open app → load file → press Space). Link to SPC file archives. "What is an SPC file?" blurb.                                                                 |
| Playback Controls  | Transport bar controls, seek (Arrow ±5s, PageUp/PageDown ±15s, Home/End), speed, volume. Loop count and duration behavior for tracks with/without xid6 data.                     |
| Keyboard Shortcuts | Current `ShortcutHelpDialog` content, rendered live from `defaultKeymap`. Platform-aware (⌘ vs Ctrl).                                                                            |
| Playlist           | Adding files, reordering, multi-select, shuffle/repeat, drag-and-drop, context menu.                                                                                             |
| Mixer              | Voice mute/solo, VU meters, voice numbering. What the 8 voices represent on SNES hardware.                                                                                       |
| Export             | Format comparison (WAV lossless, FLAC lossless compressed, OGG lossy, MP3 lossy). Per-track and batch export.                                                                    |
| Instrument Mode    | Keyboard-as-piano layout diagram, octave/velocity controls, MIDI device connection.                                                                                              |
| Analysis           | What memory/registers/voices/echo tabs show. Brief explanation of each for non-technical users. Includes SNES audio glossary (SPC700, S-DSP, BRR, ADSR, echo buffer, FIR, etc.). |
| Settings           | Theme, audio quality presets, keyboard remapping, default timing.                                                                                                                |
| Troubleshooting    | See §1.4 below.                                                                                                                                                                  |
| About              | Version, license, third-party credits link, project GitHub link.                                                                                                                 |

**Design decisions:**

- **Lazy-loaded.** The `HelpDialog` must use `React.lazy()` and load in a separate chunk. The JS budget has been raised from 210 KB to 250 KB (ADR-0018), but help content is accessed infrequently and must not contribute to the initial bundle.
- **Not searchable.** The help content is short enough that section tabs with anchors are sufficient.
- **Tabbed layout.** Radix `Tabs` inside a `Dialog`. Keyboard-navigable (arrow keys between tabs).
- **Live shortcut reference.** The Keyboard Shortcuts tab reads from `defaultKeymap` at render time and reflects custom bindings.
- **No "What's New" section yet.** Defer to post-v1. When added, it should read from a structured JSON file injected at build time.

**Phase:** F (polish)  
**Files:**

- `src/components/HelpDialog/HelpDialog.tsx` — lazy-loaded via `React.lazy()`
- `src/components/HelpDialog/HelpDialog.module.css`
- `src/components/HelpDialog/help-content.ts` — structured content data
- Update `ShortcutHelpDialog` to become a section within `HelpDialog`.

### 1.2 First-Run Onboarding

A brief, dismissable overlay shown on first visit. Not a multi-step wizard — a single panel with 3–4 callouts.

**Content:**

1. "Drop SPC files here or click Open to load music."
2. "Use Space to play/pause, arrow keys to seek."
3. "Press ? for all keyboard shortcuts and help."
4. "SPC Player works offline — install it from your browser's menu."

**Behavior:**

- Shown once. Dismissal stored in `localStorage` (key: `spc-player-onboarding-dismissed`). Not tied to IndexedDB — must work before Zustand hydrates.
- Dismissed on any interaction (click dismiss, click outside, Escape, or load a file).
- No "show tour again" option. Users press `?` for help.

**Phase:** F (polish) — depends on help panel existing (onboarding points users to `?`).  
**Files:**

- `src/components/OnboardingOverlay/OnboardingOverlay.tsx`
- `src/components/OnboardingOverlay/OnboardingOverlay.module.css`

### 1.3 Contextual Tooltips

Radix `Tooltip` on icon-only buttons and complex controls. Partially implemented.

**Additions by phase:**

| Phase | Tooltips to add                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| C     | A-B loop markers: "Set loop start ([)" / "Set loop end (])". SeekBar time tooltip: show on **focus and drag**, not just hover. |
| D     | Export button: "Export (Ctrl+E)". Speed control: "Playback speed".                                                             |
| F     | Remaining transport buttons. Voice mute/solo: "Mute voice 3 (3)" / "Solo voice 3 (Shift+3)".                                   |

### 1.4 Troubleshooting Content

Lives inside the help panel (§1.1), not a separate file.

| Problem                       | Cause                                                                    | Solution                                                      |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| No sound after pressing play  | Browser autoplay policy blocks AudioContext                              | Click anywhere on the page first, then press play             |
| Seeking is slow               | SPC emulation replays from start to seek                                 | Known limitation; checkpoint-based seeking planned            |
| Export fails for FLAC/OGG/MP3 | Encoder adapter may not be fully wired, or format unavailable in browser | Verify encoder status in export pipeline; use WAV as fallback |
| MIDI keyboard doesn't work    | Browser doesn't support Web MIDI, or permission denied                   | Check browser support table; grant MIDI permission when asked |
| App doesn't work offline      | Service worker not yet installed                                         | Visit the app once online; subsequent visits work offline     |
| Speed change shifts pitch     | Current implementation links speed and pitch                             | Expected behavior; pitch-independent speed planned (ADR-0019) |

---

## 2. Developer Documentation

### 2.1 Architecture Doc Audit

`docs/architecture.md` contains stale information that causes implementation errors when agents build against it. This is the highest-priority documentation task.

**Known discrepancies to verify and fix:**

| Item                   | Architecture doc says                 | Actual implementation                                        | Action                          |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| Resampler              | "WASM resampling" in pipeline diagram | TypeScript linear interpolation in worklet                   | Update diagram and text         |
| WASM binary size       | 150 KB target                         | 258 KB actual, CI threshold at 300 KB                        | Update text, reference ADR-0007 |
| ADR table              | 14 entries (through ADR-0014)         | 15 ADRs exist (ADR-0015 missing)                             | Add ADR-0015 row, plus new ADRs |
| File organization      | Shows `src/wasm/` directory           | WASM sources are in `crates/`, built artifacts not in `src/` | Update directory listing        |
| Component map          | Shows "Inspector / Viewer"            | "Analysis" view with 4 sub-tabs                              | Update text                     |
| Audio pipeline diagram | Correct                               | Matches                                                      | None                            |
| State management       | Correct                               | Matches                                                      | None                            |

**The audit must also verify the full document against the actual source tree.** Read the codebase, diff against the doc, fix every discrepancy — not just the items listed above.

**Phase:** A (stabilization)  
**Scope:** Targeted edits to `docs/architecture.md`.

### 2.2 ADR Gap Analysis

**New ADRs required (identified by architect and security reviews):**

| ADR  | Topic                                  | Rationale                                                                                                                                                                                                                                                        | Phase     |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0016 | SharedArrayBuffer unavailability       | GitHub Pages cannot set COOP/COEP headers. `<meta>` tags do not substitute. Memory viewer must use `postMessage` with transfer as the primary path. Future agents must not attempt SAB on production.                                                            | A         |
| 0017 | Desktop layout strategy                | Shell grid, responsive breakpoints, sidebar behavior, and transport bar positioning. References UX layout redesign plan.                                                                                                                                         | B         |
| 0018 | Bundle budget increase                 | Current 210 KB JS budget has 9.1 KB headroom. Raise to 250 KB, require code-splitting for new subsystems, lazy-load infrequent features.                                                                                                                         | Prelude 3 |
| 0019 | Pitch-independent speed / SoundTouchJS | WSOLA time stretching via `@soundtouchjs/audio-worklet` v1.0.8 (`SoundTouchNode` API — not the old `PitchShifter` API). LGPL-2.1 — must be dynamically imported as a separate chunk. Validate in standalone test before adoption. Fallback: pitch-coupled speed. | D         |
| 0020 | Visualization rendering approach       | Canvas 2D for all visualizations. FFT via `AnalyserNode` (browser-native SIMD), never worklet-side.                                                                                                                                                              | E         |
| 0021 | Cover art approach                     | IGDB removed (requires backend proxy with OAuth). RetroArch thumbnails are the viable source (requires game title mapping). Opt-in for privacy. Needs CSP changes for external fetch.                                                                            | E/F       |

**SoundTouchJS API note:** `@soundtouchjs/audio-worklet` v1.0.8 ships a completely new AudioWorklet-native `SoundTouchNode` API. ADR-0019 must document this current API, not the deprecated `PitchShifter` class from earlier versions.

**Lower priority (design docs provide adequate coverage):**

- Keyboard shortcut system — P3 (existing design doc is sufficient)

### 2.3 Implementation Roadmap Status Table

Create `docs/dev/roadmap-status.md` with a phase-level status summary.

**Phase:** A  
**Scope:** ~20-line table.

### 2.4 Contributing Guide

No `CONTRIBUTING.md` exists.

**Content outline:**

1. Prerequisites (Node.js ≥ 22, Rust toolchain with `wasm32-unknown-unknown` target)
2. Setup (`npm install`, `npm run build:wasm`, `npm run dev`)
3. Project structure (link to `docs/architecture.md`)
4. Development workflow: branch → implement → test → commit → PR
5. Code style (link to AGENTS.md § Code Style)
6. Commit conventions (Conventional Commits; link to AGENTS.md § Commit Conventions)
7. Testing (`npm test`, `npx playwright test`, `npm run validate`)
8. WASM build note: always use `npm run build:wasm`, never bare `cargo` (Homebrew vs. rustup conflict)
9. Documentation (link to `docs/`)
10. License (MIT)

**Phase:** F (deferred from Phase A — master roadmap places this in sub-phase F1d)  
**File:** `CONTRIBUTING.md` (repo root)  
**Scope:** ~80 lines.

### 2.5 TSDoc on Audio Engine

`src/audio/engine.ts` public API has minimal inline documentation. Add TSDoc to each public method — parameters, side effects, error behavior.

**Phase:** D  
**Scope:** ~40 lines.

### 2.6 DSP Exports JSDoc

Mark unimplemented exports in `src/audio/dsp-exports.ts` with JSDoc noting their planned phase.

**Phase:** F (task F1h in master roadmap)  
**Scope:** ~15 lines.

### 2.7 Export Pipeline Status

Add status annotations to `docs/design/export-pipeline.md` noting format implementation status. MP3 and FLAC encoder adapters may already be implemented — verify existing code before documenting. Task is "verify and document existing implementation" rather than "document new implementation."

**Licensing note:** `wasm-media-encoders` (MP3, OGG Vorbis) is MIT-licensed. `libflac.js` (FLAC) is MIT-licensed. Only `@soundtouchjs/audio-worklet` is LGPL-2.1 and requires dynamic import isolation.

**Phase:** D  
**Scope:** ~10 lines.

---

## 3. Accessibility Documentation Updates

### 3.1 Keyboard Shortcuts Alignment

`docs/design/keyboard-shortcuts.md` has inconsistent seek step sizes across planning documents:

- UX layout plan: Arrow ±5s, Shift+Arrow ±15s
- Feature-fixes plan: Arrow ±5s, Shift+Arrow ±30s
- Accessibility patterns doc: Arrow ±5s, Page Up/Down ±15s

**Canonical step sizes (align all documents to these):**

| Key              | Step                   | Notes                                                                               |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Arrow Left/Right | ±5 seconds             | Native `<input type="range">` `step="5"`                                            |
| Page Up/Down     | ±15 seconds            | Intercepted in `keydown`; native input doesn't support configurable Page increments |
| Home/End         | Beginning/end of track | Standard range input behavior                                                       |

Shift+Arrow is not used for seeking. Page Up/Down is the standard OS-level large-step for range inputs per ARIA APG.

**Phase:** A  
**Files to update:** `docs/design/keyboard-shortcuts.md`, planning docs that reference step sizes.

### 3.2 Custom SeekBar Accessibility

Update `docs/design/accessibility-patterns.md` to reflect the custom canvas-based SeekBar. Current §3 references a Radix `Slider` — the implementation uses a canvas with a hidden `<input type="range">` overlay.

**Patterns to document:**

- Hidden `<input type="range">` sits above canvas in z-order. `opacity: 0` but **not** `pointer-events: none`. It is the keyboard focus target.
- No `role="slider"` on the wrapper `<div>`. The native input provides slider semantics. Wrapper uses `role="group"` with `aria-label="Seek"`.
- Canvas element: `aria-hidden="true"`, non-focusable.
- `aria-valuetext` updates throttled to ≤4 Hz during playback: `"1 minute 23 seconds of 3 minutes 45 seconds"`.
- Time tooltip displays on focus and drag, not only on hover.

**Phase:** B  
**File:** `docs/design/accessibility-patterns.md`

### 3.3 A-B Loop Marker Accessibility

Add a section to `docs/design/accessibility-patterns.md`:

- Each marker is a focusable handle with Arrow Left/Right keyboard adjustment.
- `aria-label="Loop start marker"`, `aria-valuetext="Loop starts at 1 minute 5 seconds"`.
- Loop activation announced via `aria-live="polite"`: "A-B loop active: 1:05 to 2:30".
- Loop clear announced: "A-B loop cleared".
- Loop region uses visual pattern (hatching or dashed border) in addition to color fill.
- `[` and `]` shortcuts set markers at current playback position (keyboard alternative to drag).

**Phase:** C  
**File:** `docs/design/accessibility-patterns.md`

### 3.4 Canvas Visualization Accessibility

Update `docs/design/accessibility-patterns.md` for all canvas-based visualizations:

- Outer container: `role="img"`, `aria-label` describing the visualization type.
- Inner `<canvas>`: `aria-hidden="true"`.
- `prefers-reduced-motion: reduce` freezes the `requestAnimationFrame` loop. Piano roll shows static snapshot. Spectrum analyzer holds last frame. Glow/blur effects disabled.
- VU strip retains `role="meter"` per voice — provides accessible alternative to visual piano roll.
- Cover art `<img>` uses `alt` (not `aria-label`). Placeholder SVGs: `<div role="img" aria-label="...">` with inner SVG `aria-hidden="true"`.

**Phase:** E  
**File:** `docs/design/accessibility-patterns.md`

### 3.5 Drop Zone Accessibility

Update `docs/design/accessibility-patterns.md`:

- The drag overlay is transient and non-interactive. Do **not** use `role="dialog"` (implies focus trapping).
- Use `aria-hidden="true"` on the overlay. Announce drag event via `aria-live="polite"` region.
- The "Add Files" button must exist on all breakpoints, including mobile.
- File drop success toast includes track count: "Added 5 tracks to playlist".

**Phase:** B  
**File:** `docs/design/accessibility-patterns.md`

---

## 4. README Improvements

1. Add a screenshot or GIF below the description.
2. Add "Where to find SPC files" note — link to Zophar's Domain.
3. Add "Contributing" section linking to `CONTRIBUTING.md`.
4. Add explicit WASM build note: `npm run build:wasm` uses rustup, not Homebrew.
5. Keep keyboard shortcuts table manually maintained (curated subset; full reference in help dialog).

**Phase:** F  
**Scope:** ~15 lines changed.

---

## 5. Changelog

Auto-generated via `scripts/generate-changelog.mjs` → GitHub Releases. Working correctly. No changes needed.

---

## 6. API Documentation

### 6.1 Worker Message Protocol

Fully documented in `docs/design/worker-protocol.md` and `src/audio/worker-protocol.ts`. No changes needed.

### 6.2 Other Well-Documented Systems

Zustand coordination, SPC parsing, keyboard shortcuts — all have current design docs. No changes except keyboard shortcuts step size alignment (§3.1).

---

## Phase-by-Phase Documentation Checklist

### Phase A — Stabilization

- [ ] Audit `docs/architecture.md` against actual source tree; fix all discrepancies
- [ ] Write ADR-0016 (SharedArrayBuffer unavailability)
- [ ] Align `docs/design/keyboard-shortcuts.md` seek step sizes to canonical values (Arrow ±5s, PageUp/PageDown ±15s)
- [ ] Create `docs/dev/roadmap-status.md` with phase-level status summary

### Phase B — Layout Foundation

> **Note:** ADR-0018 (bundle budget increase to 250 KB) is written in Prelude 3, before Phase B begins.

- [ ] Write ADR-0017 (desktop layout strategy)
- [ ] Update `docs/design/accessibility-patterns.md` §3: SeekBar pattern (hidden input overlay, no wrapper role="slider", canvas aria-hidden)
- [ ] Update `docs/design/accessibility-patterns.md`: drop zone accessibility (no role="dialog", aria-live announcement, mobile "Add Files" button)
- [ ] Update ADR table in `docs/architecture.md` with ADRs 0015–0018

### Phase C — Seek Bar + Seeking

- [ ] Update `docs/design/accessibility-patterns.md`: A-B loop marker accessibility (keyboard-operable handles, aria-live announcements, visual pattern beyond color)
- [ ] Add tooltip specs for loop markers

### Phase D — Audio Engine + Exports

- [ ] Write ADR-0019 (pitch-independent speed / SoundTouchJS — document v1.0.8 `SoundTouchNode` API)
- [ ] Add TSDoc to `src/audio/engine.ts` public methods
- [ ] Verify and document MP3/FLAC encoder adapter status in `docs/design/export-pipeline.md`

### Phase E — Visualizations

- [ ] Write ADR-0020 (visualization rendering approach)
- [ ] Write ADR-0021 (cover art approach)
- [ ] Update `docs/design/accessibility-patterns.md`: canvas visualization patterns (role="img", reduced motion freeze, VU strip meters, cover art alt text)
- [ ] Write glossary content for Analysis section of help panel

### Phase F — Polish

- [ ] Write `CONTRIBUTING.md` (deferred from Phase A; master roadmap task F1d)
- [ ] Add JSDoc to `src/audio/dsp-exports.ts` for unimplemented exports (master roadmap task F1h)
- [ ] Build `HelpDialog` component (lazy-loaded via `React.lazy()`, separate chunk)
- [ ] Build `OnboardingOverlay` component
- [ ] Update `README.md` (screenshot, SPC archives link, Contributing section, WASM build note)
- [ ] Add remaining contextual tooltips

---

## Priority Summary

| #   | Item                              | Priority | Phase     | New/Update |
| --- | --------------------------------- | -------- | --------- | ---------- |
| 1   | Architecture doc audit            | P1       | A         | Update     |
| 2   | ADR-0016 (SharedArrayBuffer)      | P1       | A         | New        |
| 3   | Keyboard shortcuts alignment      | P1       | A         | Update     |
| 4   | Roadmap status table              | P2       | A         | Update     |
| 5   | ADR-0017 (desktop layout)         | P1       | B         | New        |
| 6   | ADR-0018 (bundle budget)          | P1       | Prelude 3 | New        |
| 7   | SeekBar a11y patterns             | P1       | B         | Update     |
| 8   | Drop zone a11y patterns           | P1       | B         | Update     |
| 9   | A-B loop marker a11y              | P1       | C         | Update     |
| 10  | ADR-0019 (SoundTouchJS)           | P1       | D         | New        |
| 11  | TSDoc on AudioEngine              | P2       | D         | Update     |
| 12  | DSP exports JSDoc                 | P3       | F         | Update     |
| 13  | Export pipeline status            | P3       | D         | Update     |
| 14  | ADR-0020 (visualization approach) | P1       | E         | New        |
| 15  | ADR-0021 (cover art approach)     | P1       | E/F       | New        |
| 16  | Canvas viz a11y patterns          | P1       | E         | Update     |
| 17  | Glossary content                  | P3       | E         | New        |
| 18  | CONTRIBUTING.md                   | P1       | F         | New        |
| 19  | Help dialog (lazy-loaded)         | P1       | F         | New        |
| 20  | First-run onboarding              | P2       | F         | New        |
| 21  | README improvements               | P2       | F         | Update     |
| 22  | Contextual tooltips               | P2       | C/D/F     | Update     |

**Not changing:** Changelog system, worker protocol docs, Zustand coordination docs, SPC parsing docs.

---

## Ephemeral Promotion

This document lives in `.ephemeral/plans/` and will be removed during ephemeral cleanup. Before cleanup, promote finalized content to permanent locations under `docs/design/`. The canonical documentation plan at `docs/documentation-plan.md` should be updated with any structural changes from this working draft.

---

## Constraints

- Per `docs/documentation-plan.md`: no ephemeral docs in `docs/`, changelogs auto-generated, user guides updated in same PR as feature changes, dev docs updated in-place.
- Per AGENTS.md: documentation commits use conventional commits (`docs(scope): description`).
- In-app help must be lazy-loaded (`React.lazy`) — separate chunk, not in initial bundle.
- Help content should be structured data (not raw JSX) for potential reuse.
- All accessibility documentation updates must land in the same phase as the feature they document.
