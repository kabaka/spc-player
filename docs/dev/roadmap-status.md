# Roadmap v2 — Status Tracker

Last updated: 2026-03-22

## Phase Summary

| Phase     | Goal                       | Status      | Notes                                                |
| --------- | -------------------------- | ----------- | ---------------------------------------------------- |
| Prelude 1 | AudioStateBuffer interface | Complete    | Extended with DSP/CPU registers, RAM, load metrics   |
| Prelude 2 | Batched WASM exports       | Complete    | 3 new Rust exports + TypeScript types + validation   |
| Prelude 3 | Bundle budget update       | Complete    | ADR-0018 bundle budget increase                      |
| Prelude 4 | LGPL compliance            | Complete    | Audit complete, THIRD_PARTY_LICENSES updated         |
| A         | Stabilization              | Complete    | Bug fixes, error handling, docs                      |
| B         | Layout Foundation          | Complete    | Layout foundation, transport bar, sidebar, drag-drop |
| C         | Seek & Performance         | Complete    | Custom seek bar, checkpoints, pre-compute worker     |
| D         | Audio Engine & Export      | Complete    | SoundTouch, codecs, telemetry, audio chain feedback  |
| E         | Visualizations             | Complete    | Piano roll, spectrum, stereo field, cover art, a11y  |
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

| Item                               | Target Phase | Task # | Reason                                                                       |
| ---------------------------------- | ------------ | ------ | ---------------------------------------------------------------------------- |
| Windows High Contrast Mode         | F            | F3i    | Canvas ignores `forced-colors` media query. Needs fallback for all canvases. |
| Code-splitting for viz/help dialog | E            | E1     | `React.lazy()` for `VisualizationStage` and `HelpDialog`. Deferred from B.   |

C10 and C11 were completed in Phase D. F3i should wait until Phase E canvases exist so all canvases are addressed together.

## Prelude 2 Tasks

| #   | Task                        | Status   | Notes                                                           |
| --- | --------------------------- | -------- | --------------------------------------------------------------- |
| P2  | Batched WASM export methods | Complete | `dsp_get_registers`, `dsp_get_cpu_registers`, `dsp_get_ram_ptr` |

Added 3 new Rust WASM exports for DSP register batch read (128 bytes), CPU register batch read (8 bytes), and direct RAM pointer access (64KB). Updated `DspExports` TypeScript interface and `validate-wasm-exports.mjs`.

## Prelude 4 Tasks

| #   | Task       | Status   | Notes                                           |
| --- | ---------- | -------- | ----------------------------------------------- |
| P4  | LGPL audit | Complete | libflacjs corrected to MIT, SoundTouch LGPL-2.1 |

Corrected libflacjs license from LGPL-2.1 to MIT in THIRD_PARTY_LICENSES. Added @soundtouchjs/audio-worklet LGPL-2.1 attribution with dynamic import compliance notes.

## Phase D Tasks

| #   | Task                               | Status   | Notes                                                           |
| --- | ---------------------------------- | -------- | --------------------------------------------------------------- |
| D1  | SoundTouchJS validation page       | Complete | Standalone HTML test page with benchmarking and metrics         |
| D2  | SoundTouch engine integration      | Complete | Dynamic import, bypass at 1.0×, setTempo/setPitch methods       |
| D3  | ADR-0019 pitch-independent speed   | Complete | MADR 4.0.0, documents LGPL strategy and validation results      |
| D4  | Audio recovery for SoundTouch      | Complete | State preservation + graceful degradation                       |
| D5  | MP3 export integration             | Complete | Verified end-to-end, ID3v2.4 metadata, wasm-media-encoders      |
| D6  | FLAC export integration            | Complete | Verified end-to-end, Vorbis comments, libflac.js                |
| D7  | FLAC CSP validation                | Complete | No eval/Function usage found — CSP-safe                         |
| D8  | Opus export via WebCodecs          | Complete | AudioEncoder API + WebM/EBML muxer, feature detection           |
| D9  | DSP register telemetry             | Complete | 128-byte batch read at ~60Hz, attached to Telemetry message     |
| D10 | SPC RAM telemetry                  | Complete | 64KB copy at ~10Hz, ArrayBuffer transfer                        |
| D11 | Wire telemetry to AudioStateBuffer | Complete | dspRegisters, cpuRegisters, ramCopy, load metrics               |
| D12 | MemoryViewer live updates          | Complete | Reads from audioStateBuffer.ramCopy via rAF loop                |
| D13 | RegisterViewer live updates        | Complete | Reads from audioStateBuffer.dspRegisters, grouped by voice      |
| D14 | AudioChainPanel component          | Complete | Latency, load bar, underruns, color-coded warnings              |
| D15 | Worklet process load measurement   | Complete | performance.now() timing, EMA smoothing, underrun detection     |
| D16 | Audio stats message                | Complete | ~1Hz emission with processLoad, underruns, peakLoad             |
| D17 | Export progress phases             | Complete | 4-phase model verified: rendering/encoding/metadata/packaging   |
| D18 | SoundTouch idle prefetch           | Complete | requestIdleCallback with 5s timeout, Safari setTimeout fallback |

## Phase C Deferred Tasks (Resolved in Phase D)

| #   | Task                                 | Status   | Notes                                                            |
| --- | ------------------------------------ | -------- | ---------------------------------------------------------------- |
| C10 | Forward seek checkpoint optimization | Complete | Uses nearest checkpoint for forward jumps > 1s savings           |
| C11 | Checkpoint worker progress           | Complete | ~1Hz progress reporting, 60s timeout, cancelCheckpointPrecompute |

## Phase D — Deviations and Deferrals

### Deviations

- **OGG Vorbis export**: Documented in roadmap as a possible D-phase task but was already resolved as deferred to post-Phase F per prior decisions. Opus (WebM container) implemented instead as D8.
- **reconnectSoundTouch() WSOLA buffers**: `disconnect()`/`connect()` does not reset AudioWorkletProcessor internal state. SoundTouchNode has no public flush/reset API. ~10-20ms crossfade artifact after seek is accepted as inaudible. Documented in ADR-0019.
- **Opus finalize() return type**: `Encoder.finalize()` return type changed from `Uint8Array` to `Uint8Array | Promise<Uint8Array>` to support WebCodecs async flush. All existing encoders return synchronously and are compatible.
- **isOpusEncoderAvailable()**: Made async to use `AudioEncoder.isConfigSupported()` for robust codec probing, beyond simple `typeof` check.
- **WebM SamplingFrequency**: Hardcoded to 48000 regardless of input sample rate, per Opus spec (Opus always internally resamples to 48kHz).

### Deferrals

None. All Phase D tasks completed.

## Phase E Tasks

| #   | Task                         | Status   | Notes                                                                  |
| --- | ---------------------------- | -------- | ---------------------------------------------------------------------- |
| E1  | VisualizationStage shell     | Complete | Tab bar, shared rAF loop, React.lazy + Suspense                        |
| E2  | PianoRollRenderer            | Complete | Voice pitch tracking, note bars, scrolling, canvas shift, auto-range   |
| E3  | SpectrumRenderer             | Complete | AnalyserNode FFT, bars/line/filled modes, logarithmic bins, peak hold  |
| E4  | AnalyserNode integration     | Complete | Non-destructive tap on audio graph                                     |
| E5  | CoverArt placeholder         | Complete | SNES cartridge shape, title-hash colors, wired into VisualizationStage |
| E6  | Voice color palette          | Complete | 8 WCAG 3:1 compliant colors                                            |
| E7  | Canvas resolution management | Complete | DPR-aware sizing, mobile 2× cap                                        |
| E8  | Mobile adaptations           | Complete | 30fps frame skip, shorter time window, no glow/peak hold               |
| E9  | prefers-reduced-motion       | Complete | ~4fps static snapshots                                                 |
| E10 | Accessibility                | Complete | ARIA tablist/tab/tabpanel, keyboard navigation, skip link              |
| E11 | Visualization Zustand slice  | Complete | Mode, per-mode settings, localStorage persistence                      |
| E12 | Remove old SpectrumAnalyzer  | Complete | Removed from AnalysisView                                              |
| E13 | StereoFieldRenderer          | Complete | Lissajous and correlation modes, trail decay                           |

## Phase B/C Deferred Tasks (Resolved in Phase E)

| #   | Task                                  | Status   | Notes              |
| --- | ------------------------------------- | -------- | ------------------ |
| —   | Code-splitting for VisualizationStage | Complete | React.lazy() in E1 |
| —   | Code-splitting for ShortcutHelpDialog | Complete | React.lazy()       |

## Phase E Documentation Deliverables

- ADR-0020: Visualization Rendering Approach (Canvas 2D for all viz, AnalyserNode for FFT)
- ADR-0021: Cover Art Approach (procedural placeholder, no IGDB, RetroArch deferred to Phase F)

## Phase E — Deviations and Deferrals

### Deviations

- **E5 rendering approach**: Roadmap task title said "SVG-based" but the visualization plan and ADR-0021 specify Canvas 2D. Implementation follows the plan/ADR (canvas-drawn cartridge), not the roadmap task title.

### Deferrals

| Item                                       | Target Phase | Task # | Reason                                                                 |
| ------------------------------------------ | ------------ | ------ | ---------------------------------------------------------------------- |
| Voice Timeline mode (`voice-timeline`)     | F            | F2a    | Intentionally deferred per roadmap Phase F definition                  |
| `performance.now()` frame timing telemetry | F            | —      | P2 improvement; frame budget enforcement works without instrumentation |
| Correlation dot batching optimization      | F            | —      | P2 performance optimization; current performance within budget         |
| Cached isMobile from ResizeObserver        | F            | —      | P2 performance optimization; `matchMedia` check is sufficient          |

### Test Coverage

- 107+ new unit tests across 8 test files
- All 1160 unit tests pass
- All 255 E2E tests pass
- Zero type errors
- All bundle sizes within budget
