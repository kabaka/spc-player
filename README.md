# SPC Player

[![CI](https://github.com/kabaka/spc-player/actions/workflows/ci.yml/badge.svg)](https://github.com/kabaka/spc-player/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-2026.03.19-green)

A high-fidelity SNES SPC music player, instrument explorer, and audio workstation — built as a client-side PWA. No backend, no plugins. Everything runs in the browser via WebAssembly and Web Audio.

**[Launch SPC Player →](https://kabaka.github.io/spc-player/)**

> [Screenshot placeholder — to be added after Phase F visual polish]

## Features

- **Playback** — Play SPC files with cycle-accurate SPC700 + S-DSP emulation compiled to WebAssembly. Adjustable speed, A-B looping, and repeat modes.
- **Playlist** — Load multiple SPC files, reorder tracks, and navigate between them.
- **8-voice mixer** — Mute or solo individual DSP voices to isolate instruments. Per-voice volume and pan visualization.
- **Instrument mode** — Play SPC instruments live using your computer keyboard as a two-octave piano. Adjust octave and velocity in real time.
- **MIDI support** — Connect a MIDI keyboard to play SPC instruments with velocity sensitivity and pitch control.
- **Audio export** — Export tracks as WAV, FLAC, OGG Vorbis, or MP3.
- **Analysis view** — Inspect SPC700 memory, DSP registers, voice state, and echo buffer in real time.
- **Keyboard shortcuts** — Full keyboard control for playback, mixing, navigation, and instrument performance.
- **Offline PWA** — Install as a standalone app. Works without an internet connection after the first visit.
- **Dark and light themes** — Follows your system preference, or set manually.

## Getting Started

1. Open [SPC Player](https://kabaka.github.io/spc-player/) in a supported browser.
2. Click **Open** or press <kbd>Ctrl</kbd>+<kbd>O</kbd> (<kbd>⌘</kbd>+<kbd>O</kbd> on macOS) to load one or more `.spc` files.
3. Press <kbd>Space</kbd> to play.

SPC files contain SNES audio data. They are widely available from game music archives for personal, non-commercial use.

## Where to Find SPC Files

SPC files are snapshots of SNES audio hardware state — each one contains everything needed to play back a music track from an SNES game.

- **[Zophar's Domain SPC Archive](https://www.zophar.net/music/nintendo-snes-spc)** — the largest collection of SNES music rips, organized by game title.

## Keyboard Shortcuts

### Playback

| Action            | Shortcut                                                      |
| ----------------- | ------------------------------------------------------------- |
| Play / Pause      | <kbd>Space</kbd>                                              |
| Stop              | <kbd>Ctrl</kbd>+<kbd>Space</kbd>                              |
| Next track        | <kbd>Ctrl</kbd>+<kbd>→</kbd>                                  |
| Previous track    | <kbd>Ctrl</kbd>+<kbd>←</kbd>                                  |
| Seek forward 5s   | <kbd>→</kbd>                                                  |
| Seek backward 5s  | <kbd>←</kbd>                                                  |
| Seek forward 30s  | <kbd>Shift</kbd>+<kbd>→</kbd>                                 |
| Seek backward 30s | <kbd>Shift</kbd>+<kbd>←</kbd>                                 |
| Volume up / down  | <kbd>↑</kbd> / <kbd>↓</kbd>                                   |
| Mute              | <kbd>M</kbd>                                                  |
| Speed up / down   | <kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>Shift</kbd>+<kbd>↓</kbd> |
| Reset speed       | <kbd>Shift</kbd>+<kbd>Backspace</kbd>                         |
| Toggle repeat     | <kbd>R</kbd>                                                  |
| Toggle shuffle    | <kbd>S</kbd>                                                  |

### Mixer

| Action         | Shortcut                                   |
| -------------- | ------------------------------------------ |
| Mute voice 1–8 | <kbd>1</kbd>–<kbd>8</kbd>                  |
| Solo voice 1–8 | <kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>8</kbd> |
| Unmute all     | <kbd>0</kbd>                               |

### Navigation

| Action              | Shortcut                     |
| ------------------- | ---------------------------- |
| Player view         | <kbd>Alt</kbd>+<kbd>1</kbd>  |
| Playlist view       | <kbd>Alt</kbd>+<kbd>2</kbd>  |
| Instrument view     | <kbd>Alt</kbd>+<kbd>3</kbd>  |
| Analysis view       | <kbd>Alt</kbd>+<kbd>4</kbd>  |
| Settings            | <kbd>Alt</kbd>+<kbd>5</kbd>  |
| Open export dialog  | <kbd>Ctrl</kbd>+<kbd>E</kbd> |
| Show shortcuts help | <kbd>?</kbd>                 |

### Instrument Mode

| Action                 | Shortcut                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toggle instrument mode | <kbd>`</kbd> (backtick)                                                                                                                                                  |
| Lower octave notes     | <kbd>Z</kbd> <kbd>S</kbd> <kbd>X</kbd> <kbd>D</kbd> <kbd>C</kbd> <kbd>V</kbd> <kbd>G</kbd> <kbd>B</kbd> <kbd>H</kbd> <kbd>N</kbd> <kbd>J</kbd> <kbd>M</kbd>              |
| Upper octave notes     | <kbd>Q</kbd> <kbd>2</kbd> <kbd>W</kbd> <kbd>3</kbd> <kbd>E</kbd> <kbd>R</kbd> <kbd>5</kbd> <kbd>T</kbd> <kbd>6</kbd> <kbd>Y</kbd> <kbd>7</kbd> <kbd>U</kbd> <kbd>I</kbd> |
| Octave down / up       | <kbd>-</kbd> / <kbd>=</kbd>                                                                                                                                              |
| Velocity down / up     | <kbd>[</kbd> / <kbd>]</kbd>                                                                                                                                              |

On macOS, <kbd>Ctrl</kbd> maps to <kbd>⌘</kbd> (Command) for standard shortcuts.

## Browser Support

| Browser            | Support                                      |
| ------------------ | -------------------------------------------- |
| Chrome / Edge 119+ | Full support                                 |
| Firefox 113+       | Full support (MIDI requires user permission) |
| Safari 17+         | Playback and export. No Web MIDI API.        |

WebAssembly and AudioWorklet are required. All modern desktop browsers support these. Mobile browsers work for playback but may have limited AudioWorklet performance.

## Development

Requires Node.js ≥ 22 and a Rust toolchain with the `wasm32-unknown-unknown` target.

```sh
npm install              # Install dependencies
npm run build:wasm       # Compile WASM DSP module
npm run dev              # Start dev server
npm run build            # Production build
npm run validate         # Full CI: lint + typecheck + test + build + E2E
```

Individual checks:

```sh
npm run lint             # ESLint
npm run typecheck        # TypeScript type checking
npm test                 # Unit tests (Vitest)
npm run test:e2e         # E2E tests (Playwright)
npm run format           # Prettier formatting
```

> **WASM build note:** Always use `npm run build:wasm`, never bare `cargo build`. The npm script explicitly selects rustup's cargo to avoid conflicts with Homebrew-installed Rust toolchains.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and development workflow.

## Architecture

SPC Player is a client-side React application. The DSP emulation core ([snes-apu-spcp](vendor/snes-apu-spcp/)) is written in Rust and compiled to WebAssembly. Audio rendering runs in an AudioWorklet thread to avoid main-thread jank.

```
UI (React + Zustand) → Audio Engine → AudioWorklet → WASM DSP → PCM output
```

See [docs/architecture.md](docs/architecture.md) for the full component map, ADR index, and design rationale.

## License

[MIT](LICENSE) © 2026 Kyle Johnson

See [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) for attribution of all dependencies.
