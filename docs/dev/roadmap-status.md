# Roadmap v2 — Status Tracker

Last updated: 2026-03-21

## Phase Summary

| Phase     | Goal                       | Status      | Notes                                                |
| --------- | -------------------------- | ----------- | ---------------------------------------------------- |
| Prelude 1 | AudioStateBuffer interface | Not started | Before Phase C                                       |
| Prelude 2 | Batched WASM exports       | Not started | Before Phase D                                       |
| Prelude 3 | Bundle budget update       | Complete    | ADR-0018 bundle budget increase                      |
| Prelude 4 | LGPL compliance            | Not started | Before Phase D                                       |
| A         | Stabilization              | Complete    | Bug fixes, error handling, docs                      |
| B         | Layout Foundation          | Complete    | Layout foundation, transport bar, sidebar, drag-drop |
| C         | Seek & Performance         | Not started | Custom seek bar, checkpoints                         |
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

- **New E2E tests for sidebar/drag-drop/transport**: B11 updated existing tests but did not add new E2E scenarios for sidebar collapse, drag-drop file loading, or transport bar. Existing coverage is sufficient for regression; new scenarios can be added incrementally.
- **Type-ahead in PlaylistTrackList**: WAI-ARIA APG recommends type-ahead for listbox; deferred as enhancement.
- **Mobile Tools sub-tabs**: BottomNav "Tools" links to /instrument; full /tools hub page deferred to Phase C.
- **Code-splitting for VisualizationStage/ShortcutHelpDialog**: Mentioned in bundle budget analysis; not needed until Phase E.

### Deviations from plan

- **ADR-0017** was specified as a brief document; delivered as full MADR 4.0.0 format.
- **B7 navigation**: Plan specified "Player/Playlist/More" for mobile but implemented as "Player/Tools/Settings" to better match desktop navigation structure.
- **Radix UI Slider**: Plan specified temporary use for Phase B with canvas replacement in Phase C. Slider thumb increased to 24px for WCAG 2.5.8 AA; this CSS will be removed when Phase C replaces with canvas.
