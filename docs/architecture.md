# SPC Player — Architecture Overview

This document captures high-level architectural decisions and technical direction. Detailed architecture will be developed via ADRs as the project progresses.

## System Boundary

SPC Player is a **client-side-only** web application. There is no backend server. All computation — SPC parsing, DSP emulation, audio rendering, file export — runs in the browser.

## High-Level Component Map

```
┌─────────────────────────────────────────────────────────┐
│                      UI Layer                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Player   │ │ Playlist │ │ Inspector│ │ Instrument│  │
│  │  Controls │ │ Manager  │ │ / Viewer │ │ Performer │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       └─────────────┴────────────┴─────────────┘        │
│                         │                               │
│              ┌──────────▼──────────┐                    │
│              │   State Management  │                    │
│              └──────────┬──────────┘                    │
├─────────────────────────┼───────────────────────────────┤
│                 Core Services                           │
│  ┌──────────┐ ┌────────▼────────┐ ┌──────────────────┐  │
│  │ SPC      │ │ Audio Engine    │ │ Export Engine     │  │
│  │ Parser   │ │ (Web Audio +   │ │ (WAV/FLAC/OGG/   │  │
│  │          │ │  AudioWorklet)  │ │  MP3 encoding)   │  │
│  └────┬─────┘ └────────┬────────┘ └────────┬─────────┘  │
│       └────────────────┬┘                  │            │
│              ┌─────────▼──────────┐        │            │
│              │ S-DSP Emulator     │◄───────┘            │
│              │ (WASM)             │                     │
│              └─────────┬──────────┘                     │
│                        │                                │
│              ┌─────────▼──────────┐                     │
│              │ S-SMP / SPC700     │                     │
│              │ (WASM)             │                     │
│              └────────────────────┘                     │
├─────────────────────────────────────────────────────────┤
│                 Platform Services                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Storage  │ │ Service  │ │ MIDI     │ │ OTel      │  │
│  │ (IDB)    │ │ Worker   │ │ Input    │ │ Client    │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

| Decision                 | Outcome                                                     | ADR                                                   |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| SPC emulation library    | snes-apu-spcp (Rust, BSD-2-Clause)                          | [ADR-0001](adr/0001-snes-audio-emulation-library.md)  |
| UI framework             | React 19 + TypeScript + Vite                                | [ADR-0002](adr/0002-ui-framework.md)                  |
| Audio pipeline           | 48 kHz AudioContext, WASM resampling, dual-path             | [ADR-0003](adr/0003-audio-pipeline-architecture.md)   |
| CSS approach             | CSS Modules + CSS custom properties                         | [ADR-0004](adr/0004-css-methodology.md)               |
| State management         | Zustand (domain slices) + ref-based audio channel           | [ADR-0005](adr/0005-state-management-architecture.md) |
| Audio encoding libraries | WAV custom, FLAC/OGG/MP3 via WASM reference encoders        | [ADR-0006](adr/0006-audio-codec-libraries.md)         |
| WASM build pipeline      | cargo + wasm-opt, raw exports (no wasm-bindgen)             | [ADR-0007](adr/0007-wasm-build-pipeline.md)           |
| WASM source language     | Rust for all custom WASM modules                            | [ADR-0008](adr/0008-wasm-source-language.md)          |
| Bundler configuration    | Minimal Vite config, `?url` for WASM, route-based splitting | [ADR-0009](adr/0009-bundler-configuration.md)         |
| Test framework           | Vitest + React Testing Library + Playwright                 | [ADR-0010](adr/0010-test-framework.md)                |
| IndexedDB wrapper        | idb (~1.2 KB) for Promise-based IndexedDB access            | [ADR-0011](adr/0011-indexeddb-wrapper.md)             |
| Component library scope  | Maximalist Radix UI adoption + custom domain components     | [ADR-0012](adr/0012-component-library-scope.md)       |
| Router configuration     | TanStack Router, file-based routes, hash history            | [ADR-0013](adr/0013-router-configuration.md)          |
| Resampling quality       | User-configurable presets (Standard/High Quality/Custom)    | [ADR-0014](adr/0014-resampling-quality-settings.md)   |

## Emulation Strategy

The SPC file contains a snapshot of the SNES audio subsystem state:

- 64 KB of SPC700 RAM
- 128 bytes of DSP registers
- SPC700 CPU registers (PC, A, X, Y, SP, PSW)
- IPL ROM (64 bytes, usually the boot ROM)
- Timer registers

Playback requires emulating both the **SPC700 CPU** (to execute the sound driver) and the **S-DSP** (to produce audio samples). The DSP runs at ~32 kHz and produces stereo 16-bit PCM.

Key emulation concerns:

- Cycle accuracy vs. performance tradeoff (per-sample DSP is minimum; per-cycle CPU may be optional).
- BRR sample decoding fidelity.
- Gaussian interpolation table accuracy.
- Echo buffer behavior (FIR filter, feedback, delay).
- Noise generator LFSR.
- Envelope (ADSR/GAIN) timing accuracy.

## Audio Pipeline

```
SPC700 CPU → DSP Registers → S-DSP Emulator → PCM samples
    → AudioWorklet (real-time) → Web Audio output
    → Export encoder (offline) → File download
```

The AudioWorklet runs on the audio thread, pulling samples from the WASM DSP emulator. The main thread manages UI, state, and sends control messages (mute/solo, speed, etc.) via MessagePort.

## File Organization (Planned)

```
src/
  app/              # Application shell, routing, layout
  components/       # Shared UI components
  features/         # Feature modules (player, playlist, inspector, etc.)
  core/             # SPC parsing, DSP emulation bridge
  audio/            # Web Audio integration, AudioWorklet
  storage/          # IndexedDB, persistence layer
  midi/             # Web MIDI integration
  export/           # Audio encoding and file export
  wasm/             # WASM module sources and build config
  workers/          # Web Workers
  utils/            # Shared utilities
  types/            # Shared TypeScript types
public/
  icons/            # PWA icons
  manifest.json     # PWA manifest
docs/               # Project documentation
  adr/              # Architecture Decision Records
.github/
  agents/           # Copilot agent definitions
  skills/           # Copilot skill definitions
  workflows/        # CI/CD workflows
```
