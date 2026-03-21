# Roadmap v2 — Status Tracker

Last updated: 2026-03-21

## Phase Summary

| Phase     | Goal                       | Status      | Notes                                                |
| --------- | -------------------------- | ----------- | ---------------------------------------------------- |
| Prelude 1 | AudioStateBuffer interface | Complete    | Extended with DSP/CPU registers, RAM, load metrics   |
| Prelude 2 | Batched WASM exports       | Not started | Before Phase D                                       |
| Prelude 3 | Bundle budget update       | Complete    | ADR-0018 bundle budget increase                      |
| Prelude 4 | LGPL compliance            | Not started | Before Phase D                                       |
| A         | Stabilization              | Complete    | Bug fixes, error handling, docs                      |
| B         | Layout Foundation          | Complete    | Layout foundation, transport bar, sidebar, drag-drop |
| C         | Seek & Performance         | Complete    | Custom seek bar, checkpoints, pre-compute worker     |
| D         | Audio Engine & Export      | Not started | SoundTouch, codecs, telemetry                        |
| E         | Visualizations             | Not started | Piano roll, spectrum, cover art                      |
| F         | Polish & Advanced          | Not started | Docs, onboarding, remaining                          |

## Phase A Tasks

| #   | Task                                   | Status   |
| --- | -------------------------------------- | -------- |
| A1  | Auto-advance hook                      | Complete |
| A2  | A-B loop units fix                     | Complete |
| A3  | A-B loop announcements                 | Complete |
| A4  | instrument.toggleKeyboard keymap       | Complete |
| A5  | Wire toggleInstrumentMode              | Complete |
| A6  | ShortcutManager instrument mode bypass | Complete |
| A7  | Voice muting during seek               | Complete |
| A8  | SW path fix                            | Complete |
| A9  | Error swallowing fix                   | Complete |
| A10 | console.error → reportError            | Complete |
| A11 | Extract formatTime utility             | Complete |
| A12 | Deduplicate platform detection         | Complete |
| A13 | Recovery counter reset                 | Complete |
| A14 | Function.prototype → arrow noop        | Complete |
| A15 | Architecture doc audit                 | Complete |
| A16 | WASM precache in SW                    | Complete |
| A17 | ADR-0016 SharedArrayBuffer             | Complete |
| A18 | Keyboard shortcuts docs alignment      | Complete |
| A19 | Roadmap status tracking table          | Complete |

## Prelude 3 Tasks

| #   | Task                            | Status   |
| --- | ------------------------------- | -------- |
| P3  | Bundle budget update (ADR-0018) | Complete |

## Phase B Tasks

| #   | Task                              | Status   | Notes                                                 |
| --- | --------------------------------- | -------- | ----------------------------------------------------- |
| B1  | Shell grid layout in \_\_root.tsx | Complete | CSS Grid with 4-breakpoint responsive design          |
| B2  | TransportBar component            | Complete | 3-zone layout, roving tabindex toolbar                |
| B3  | PlaylistSidebar component         | Complete | Collapsible sidebar with PlaylistTrackList            |
| B4  | NowPlayingInfo component          | Complete | Cross-fade states, shimmer loading, aria-hidden       |
| B5  | DragDropOverlay component         | Complete | State machine, enter-count tracking, error handling   |
| B6  | usePlaybackPosition hook          | Complete | rAF loop with ≤4 Hz Zustand throttle                  |
| B7  | Navigation restructure            | Complete | 3-item BottomNav (Player/Tools/Settings)              |
| B8  | ThemeToggle to Settings           | Complete | Resolved theme hint added                             |
| B9  | PlayerView simplification         | Complete | Transport controls removed, NowPlayingInfo integrated |
| B10 | Mobile responsive layout          | Complete | Breakpoint fix (640→768px), verified all viewports    |
| B11 | E2E test updates                  | Complete | All specs updated for new selectors                   |
| B12 | Shell CSS in main bundle          | Complete | Verified no FOUC                                      |

## Phase B — Deviations and Deferrals

### Deferred to Phase C or later

All Phase B deferrals have been resolved in Phase C:

- **New E2E tests for sidebar/drag-drop/transport**: ~~Deferred~~ → Complete (C-era). 14 E2E scenarios added in `layout-interactions.spec.ts`.
- **Type-ahead in PlaylistTrackList**: ~~Deferred~~ → Complete (C-era). WAI-ARIA APG type-ahead with 500ms debounce, case-insensitive `startsWith` matching.
- **Mobile Tools sub-tabs**: ~~Deferred~~ → Complete (C-era). `/tools` hub page with links to Instrument and Analysis views.
- **Code-splitting for VisualizationStage/ShortcutHelpDialog**: Remains deferred to Phase E (no change).

### Deviations from plan

- **ADR-0017** was specified as a brief document; delivered as full MADR 4.0.0 format.
- **B7 navigation**: Plan specified "Player/Playlist/More" for mobile but implemented as "Player/Tools/Settings" to better match desktop navigation structure.
- **Radix UI Slider**: Plan specified temporary use for Phase B with canvas replacement in Phase C. Slider thumb increased to 24px for WCAG 2.5.8 AA; this CSS was removed when Phase C replaced with canvas SeekBar.

## Prelude 1 Tasks

| #   | Task                            | Status   |
| --- | ------------------------------- | -------- |
| P1  | AudioStateBuffer interface ext. | Complete |

Extended `AudioStateBuffer` with `dspRegisters` (Uint8Array(128)), `cpuRegisters` ({ a, x, y, sp, pc, psw }), `ramCopy` (Uint8Array(65536)), `processLoadPercent`, and `totalUnderruns` for Phase D telemetry consumers.

## Phase C Tasks

| #   | Task                          | Status   | Notes                                                        |
| --- | ----------------------------- | -------- | ------------------------------------------------------------ |
| C1  | Canvas seek bar               | Complete | 60fps rAF canvas rendering, DPR-aware sizing                 |
| C2  | Keyboard interaction          | Complete | Arrow ±5s, Page ±15s, Home/End, WAI-ARIA slider pattern      |
| C3  | TransportBar integration      | Complete | Canvas SeekBar replaces Radix Slider, volume kept as-is      |
| C4  | Checkpoint capture in worklet | Complete | 5s default interval, 120 max, 8MB cap                        |
| C5  | Checkpoint integrity          | Complete | Magic bytes + size validation, binary search for nearest     |
| C6  | Pre-compute background worker | Complete | Dedicated worker with own WASM instance, Transferable output |
| C7  | Import checkpoints handler    | Complete | Array.isArray guard, per-checkpoint validation, re-sort      |
| C8  | Checkpoint config UI          | Complete | Standard/Fast presets, mobile detection, fieldset/legend     |
| C9  | A-B loop marker overlay       | Complete | Dual role=slider markers, keyboard-navigable, 44px touch     |

## Phase C — Deviations and Deferrals

### Deviations

- **Canvas rAF reduced motion**: Added `prefers-reduced-motion` detection (throttle to ~4fps), not explicitly in original task spec but required by design doc §16 and WCAG 2.3.3.
- **VoiceOver/TalkBack onChange**: The hidden range input's `onChange` was initially a no-op. Fixed during peer review to support screen reader `change` events (VoiceOver/TalkBack don't fire keyboard events).
- **Checkpoint preset in worker**: `spawnCheckpointWorker` initially hardcoded the standard preset. Fixed during peer review to read user's selected preset from engine config.
- **Seek-to-zero checkpoint preservation**: Initially cleared all checkpoints on seek to beginning. Fixed during peer review to preserve pre-computed checkpoints (only cleared on new track load).
- **Telemetry GC optimization**: Pre-allocated voice state objects and consolidated WASM calls (24→8 per telemetry cycle) to reduce GC pressure on the audio thread. Not in original spec; identified during peer review.
- **dsp_restore failure recovery**: Added `dsp_reset()` fallback when `dsp_restore` returns non-zero, falling back to reset-and-render-forward path.

### Deferrals

| Item                                 | Target Phase | Task # | Reason                                                                         |
| ------------------------------------ | ------------ | ------ | ------------------------------------------------------------------------------ |
| Forward seek checkpoint optimization | C (backlog)  | C10    | Forward seeks render from current position; checkpoints could skip ahead.      |
| Checkpoint worker progress reporting | C (backlog)  | C11    | Worker is fire-and-forget; progress/cancellation requires architecture change. |
| Windows High Contrast Mode           | F            | F3i    | Canvas ignores `forced-colors` media query. Needs fallback for all canvases.   |
| Code-splitting for viz/help dialog   | E            | E1     | `React.lazy()` for `VisualizationStage` and `HelpDialog`. Deferred from B.     |

C10 and C11 can be picked up any time as standalone optimizations. F3i should wait until Phase E canvases exist so all canvases are addressed together.
