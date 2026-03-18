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

## Key Architectural Decisions (Pending ADRs)

| Decision | Options | Status |
|----------|---------|--------|
| UI framework | React, Preact, Solid, Vanilla TS | Not decided |
| UI component library | Radix, shadcn/ui, custom, headless | Not decided |
| State management | Zustand (domain slices) | Decided ([ADR-0005](adr/0005-state-management-architecture.md)) |
| WASM language for DSP core | Rust (via cargo + wasm-opt) | Decided ([ADR-0007](adr/0007-wasm-build-pipeline.md)/[ADR-0008](adr/0008-wasm-source-language.md)) |
| Existing SPC emulation lib | snes-apu-wasm, libopenspc, SNESjs, custom | Not decided |
| Audio encoding libraries | WAV custom, FLAC/OGG/MP3 via WASM libs | Decided ([ADR-0006](adr/0006-audio-codec-libraries.md)) |
| Bundler | Vite, esbuild, Turbopack | Not decided |
| Test framework | Vitest, Jest, Playwright (E2E) | Not decided |
| CSS approach | CSS Modules + CSS custom properties | Decided ([ADR-0004](adr/0004-css-methodology.md)) |
| Router | React Router, TanStack Router, custom hash router | Not decided |

Each of these will be resolved via ADR during the architecture phase, with input from multiple agent perspectives.

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
