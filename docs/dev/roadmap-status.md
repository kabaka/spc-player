# Roadmap v2 — Status Tracker

Last updated: 2026-03-21

## Phase Summary

| Phase     | Goal                       | Status      | Notes                           |
| --------- | -------------------------- | ----------- | ------------------------------- |
| Prelude 1 | AudioStateBuffer interface | Not started | Before Phase C                  |
| Prelude 2 | Batched WASM exports       | Not started | Before Phase D                  |
| Prelude 3 | Bundle budget update       | Not started | Before Phase B                  |
| Prelude 4 | LGPL compliance            | Not started | Before Phase D                  |
| A         | Stabilization              | Complete    | Bug fixes, error handling, docs |
| B         | Layout Foundation          | Not started | Shell grid, transport bar       |
| C         | Seek & Performance         | Not started | Custom seek bar, checkpoints    |
| D         | Audio Engine & Export      | Not started | SoundTouch, codecs, telemetry   |
| E         | Visualizations             | Not started | Piano roll, spectrum, cover art |
| F         | Polish & Advanced          | Not started | Docs, onboarding, remaining     |

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
