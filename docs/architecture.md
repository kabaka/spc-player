# SPC Player — Architecture Overview

This document captures high-level architectural decisions and technical direction. Detailed architecture will be developed via ADRs as the project progresses.

## System Boundary

SPC Player is a **client-side-only** web application. There is no backend server. All computation — SPC parsing, DSP emulation, audio rendering, file export — runs in the browser.

## High-Level Component Map

```text
┌─────────────────────────────────────────────────────────┐
│                      UI Layer                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Player   │ │ Playlist │ │ Analysis │ │ Instrument│  │
│  │  Controls │ │ Manager  │ │          │ │ Performer │  │
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

| Decision                 | Outcome                                                     | ADR                                                      |
| ------------------------ | ----------------------------------------------------------- | -------------------------------------------------------- |
| SPC emulation library    | snes-apu-spcp (Rust, BSD-2-Clause)                          | [ADR-0001](adr/0001-snes-audio-emulation-library.md)     |
| UI framework             | React 19 + TypeScript + Vite                                | [ADR-0002](adr/0002-ui-framework.md)                     |
| Audio pipeline           | 48 kHz AudioContext, dual-path resampling, AudioWorklet     | [ADR-0003](adr/0003-audio-pipeline-architecture.md)      |
| CSS approach             | CSS Modules + CSS custom properties                         | [ADR-0004](adr/0004-css-methodology.md)                  |
| State management         | Zustand (domain slices) + ref-based audio channel           | [ADR-0005](adr/0005-state-management-architecture.md)    |
| Audio encoding libraries | WAV custom, FLAC/OGG/MP3 via WASM reference encoders        | [ADR-0006](adr/0006-audio-codec-libraries.md)            |
| WASM build pipeline      | cargo + wasm-opt, raw exports (no wasm-bindgen)             | [ADR-0007](adr/0007-wasm-build-pipeline.md)              |
| WASM source language     | Rust for all custom WASM modules                            | [ADR-0008](adr/0008-wasm-source-language.md)             |
| Bundler configuration    | Minimal Vite config, `?url` for WASM, route-based splitting | [ADR-0009](adr/0009-bundler-configuration.md)            |
| Test framework           | Vitest + React Testing Library + Playwright                 | [ADR-0010](adr/0010-test-framework.md)                   |
| IndexedDB wrapper        | idb (~1.2 KB) for Promise-based IndexedDB access            | [ADR-0011](adr/0011-indexeddb-wrapper.md)                |
| Component library scope  | Maximalist Radix UI adoption + custom domain components     | [ADR-0012](adr/0012-component-library-scope.md)          |
| Router configuration     | TanStack Router, file-based routes, hash history            | [ADR-0013](adr/0013-router-configuration.md)             |
| Resampling quality       | User-configurable presets (Standard/High Quality/Custom)    | [ADR-0014](adr/0014-resampling-quality-settings.md)      |
| Error handling           | Hybrid Result types + exceptions, centralized reporting     | [ADR-0015](adr/0015-error-handling.md)                   |
| SharedArrayBuffer        | Unavailable on GitHub Pages; postMessage + transfer instead | [ADR-0016](adr/0016-sharedarraybuffer-unavailability.md) |

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

```text
SPC700 CPU → DSP Registers → S-DSP Emulator → PCM samples
    → AudioWorklet (real-time) → Web Audio output
    → Export encoder (offline) → File download
```

The AudioWorklet runs on the audio thread, pulling samples from the WASM DSP emulator. Resampling from the DSP's native 32 kHz to the AudioContext's 48 kHz output rate uses one of two paths: TypeScript linear interpolation (default, "Standard" quality) or a WASM Lanczos-3 sinc filter ("High Quality" mode, per ADR-0014). The main thread manages UI, state, and sends control messages (mute/solo, speed, etc.) via MessagePort. All cross-thread data uses `postMessage` with `ArrayBuffer` transfer — `SharedArrayBuffer` is unavailable on GitHub Pages (ADR-0016).

## File Organization

```text
crates/
  spc-apu-wasm/       # Rust WASM wrapper crate (exports C-ABI functions)
vendor/
  snes-apu-spcp/      # Vendored S-DSP/SPC700 emulation library (BSD-2-Clause)
  spc-spcp/           # Vendored SPC file parser
src/
  app/                # Application shell, routing, layout
  audio/              # Web Audio integration, AudioWorklet, resampling
  components/         # Shared UI components (Radix-based)
  core/               # SPC parsing, track duration, track IDs
  errors/             # Error factories and centralized reporting (ADR-0015)
  export/             # Audio encoding, export queue, file download
  features/           # Feature modules by view:
    analysis/         #   DSP state inspection (Memory, Registers, Voices, Echo)
    export/           #   Export dialog and progress
    instrument/       #   Virtual keyboard, note mapping, ADSR display
    metadata/         #   SPC metadata panel
    mixer/            #   Per-voice mute/solo, VU meters
    player/           #   Transport controls, waveform, loop markers
    playlist/         #   Playlist management
    settings/         #   Audio quality, theme, keyboard shortcuts, about
  hooks/              # Shared React hooks (auto-advance, MIDI, theme)
  midi/               # Web MIDI input, pitch utilities
  otel/               # OpenTelemetry client instrumentation
  pwa/                # Install prompt, offline indicator, SW registration
  shortcuts/          # ShortcutManager, default keymap, useShortcut hook
  storage/            # IndexedDB persistence, quota handling
  store/              # Zustand store with domain slices (ADR-0005)
  styles/             # Global CSS, design tokens
  types/              # Shared TypeScript types (Result, errors, timing)
  utils/              # Platform detection, canvas rendering
  wasm/               # Built WASM artifact (dsp.wasm)
  workers/            # Web Workers (export worker)
scripts/              # CI/build scripts (bundle size check, changelog, WASM validation)
public/
  icons/              # PWA icons
  manifest.json       # PWA manifest
docs/                 # Project documentation
  adr/                # Architecture Decision Records
  design/             # Design documents
  dev/                # Developer documentation, roadmaps
.github/
  agents/             # Copilot agent definitions
  skills/             # Copilot skill definitions
  workflows/          # CI/CD workflows
```

WASM sources live in `crates/spc-apu-wasm/`, which depends on the vendored `snes-apu-spcp` library in `vendor/`. The build produces `src/wasm/dsp.wasm` (~261 KB raw, CI budget 300 KB; see ADR-0007). Vite imports the WASM file via `?url` for cache-busted loading.
