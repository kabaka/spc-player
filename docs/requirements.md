# SPC Player — Requirements

## Target Users

| Persona           | Needs                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| SNES enthusiasts  | Accurate playback, memory/register inspection, hardware-faithful emulation     |
| Musicians         | Instrument extraction, per-track isolation, MIDI performance, sound adjustment |
| Game developers   | Sample/instrument ripping, format analysis, integration reference              |
| Casual fans       | Simple playback, playlists, clean UI, offline use                              |
| Retro audiophiles | Bit-perfect output, lossless export, DAC-faithful rendering                    |

## Core Capabilities

### Playback

- Play SPC files with cycle-accurate S-DSP emulation (BRR decoding, Gaussian interpolation, echo, noise, pitch modulation).
- Per-track mute/solo (8 voices).
- Per-instrument mute/solo.
- Playback speed control (fractional).
- Playlist support with shuffle, repeat, queue management, drag-to-reorder.
- Gapless playback between tracks.
- Fade-out detection and configurable fade duration.
- Track looping: respect in-track loop structure from xid6 metadata (intro, loop, end, fade sections).
  - Configurable loop count: play once (no loop section), 1–N loop iterations, or infinite (no auto-stop).
  - Loop count priority: per-file user override → xid6 tag 0x35 → global default (2 loops).
  - When no xid6 timing exists, loop count control is unavailable; uses ID666 song length or configurable default duration (180 seconds).
  - Configurable default play duration, loop count, and fade duration in settings.
  - Per-file timing overrides persisted in IndexedDB.
- A-B loop: define a loop region within a track and repeat it continuously.
  - Set loop points via keyboard shortcut at current playback position, drag selection on waveform/progress bar, or manual timestamp entry.
  - Loop region displayed as a visual overlay with draggable handles.
  - Toggle looping on/off while preserving the defined region.

### Export

- Full mix export: WAV (PCM 16/24-bit), FLAC, OGG Vorbis, MP3.
- Per-track export (individual voices as separate files).
- Per-instrument sample export (raw BRR → WAV).
- Batch export for playlists or multi-file selections.
- Configurable sample rate (32 kHz native, 44.1 kHz, 48 kHz, 96 kHz).
- Configurable loop count for export (when xid6 timing available): controls how many loop iterations are rendered.
- Computed total duration shown in export dialog before rendering begins.

### Instrument Interaction

- Test/perform with SPC instruments via:
  - Computer keyboard (configurable mapping).
  - On-screen virtual keyboard.
  - MIDI device input (Web MIDI API).
- Instrument adjustment: ADSR envelope editing, pitch shift, gain, filter cutoff (within S-DSP constraints).
- Real-time preview of adjustments during playback.

### Analysis & Inspection

- Metadata viewer: ID666 tag fields (title, game, artist, dumper, comments, duration, fade).
- Extended ID666 (xid6) support.
- Memory viewer: 64 KB SPC RAM, 128-byte DSP registers, IPL ROM.
- Voice state visualization: ADSR phase, BRR block position, pitch, volume envelope.
- Echo buffer visualization.
- Channel activity / VU meters.

## Platform Requirements

### Target Platforms

| Platform    | Browser         | Priority |
| ----------- | --------------- | -------- |
| Windows 10+ | Chrome, Edge    | P0       |
| macOS 12+   | Chrome, Safari  | P0       |
| iOS 15+     | Safari, Chrome  | P0       |
| Android 10+ | Chrome          | P0       |
| Linux       | Chrome, Firefox | P1       |

### PWA Requirements

- Installable PWA with offline support via service worker.
- App manifest with icons, theme color, display mode.
- Background audio playback on mobile.
- File association for `.spc` files where supported.
- Share target for receiving SPC files.

### Cross-Platform Considerations

- Touch-friendly controls for mobile; keyboard shortcuts for desktop.
- Responsive layout adapting to phone, tablet, and desktop viewports.
- Respect platform conventions (safe areas, notches, system back gesture).
- Web Audio API for all audio output.
- WebAssembly for DSP emulation performance.

## UI/UX Requirements

### Visual Design

- Dark and light mode (follow `prefers-color-scheme` by default; user override persisted).
- Consistent design system with reusable components.
- Smooth animations and transitions (respect `prefers-reduced-motion`).
- High-contrast mode support.
- Iconography: clear, recognizable, consistent style.

### Navigation & Routing

- Deep linking for all views (player, playlist, settings, instrument, analysis).
- Browser history integration (back/forward).
- URL reflects current state (selected file, active view, playback position where sensible).

### Accessibility

- WCAG 2.2 AA compliance minimum.
- Keyboard navigation for all interactive elements.
- Screen reader support with ARIA labels.
- Focus management on route changes.
- Sufficient color contrast ratios.

### Responsiveness

- Mobile-first layout with progressive enhancement.
- Breakpoints: phone (< 640px), tablet (640–1024px), desktop (> 1024px).

## Technical Requirements

### Stack

- TypeScript (strict mode).
- React or vanilla TypeScript (decision deferred to architecture phase).
- WebAssembly for DSP emulation core.
- Web Audio API for audio output.
- Web MIDI API for MIDI input.
- IndexedDB for persistent storage (via wrapper library or raw).
- Service Worker for offline/caching.

### Code Quality

- Comprehensive test coverage:
  - Unit tests for all logic (DSP, format parsing, state management).
  - Integration tests for component interactions.
  - End-to-end tests for user workflows (Playwright).
- Pre-commit hooks: lint, type-check, unit tests.
- CI/CD via GitHub Actions: lint → type-check → unit → integration → E2E → deploy.
- No commit when CI is red.

### Build & Deploy

- GitHub Pages deployment.
- Date-based version numbering (continuous release).
- Automatic updates with cache busting.
- Service worker update flow: detect → notify → apply on next navigation.
- Source maps in development; stripped in production.
- Bundle splitting and lazy loading for performance.

### Data Persistence

- User settings (theme, audio preferences, keyboard mappings) → IndexedDB.
- Playlists → IndexedDB.
- Recently played → IndexedDB.
- Loaded SPC files (optional caching) → IndexedDB / Cache API.
- Export preferences → IndexedDB.

### Performance

- First Contentful Paint < 1.5s.
- Time to Interactive < 3s.
- Audio latency < 20ms from user action to sound.
- DSP emulation must sustain real-time (32 kHz output) on mid-range mobile.
- Smooth 60fps UI during playback.

### Security

- No server-side component; all processing client-side.
- Content Security Policy headers via meta tags.
- Subresource Integrity for CDN assets.
- Input validation on all file parsing (malformed SPC defense).
- No eval or dynamic code execution.

## Optional / Future Considerations

- Electron wrapper for WASAPI exclusive mode (Windows) and native file associations.
- SPC archive browsing (loading from known ROM sets / community archives).
- Waveform / spectrogram visualization.
- Multiple output resampling algorithms (sinc, linear, nearest-neighbor) for auditioning.
- NSF / other retro format support (long-term).
- Community sharing features (playlists, instrument patches).
- MIDI output (play SPC instruments via external synth).
- Recording of live performance sessions.

## Non-Functional Requirements

- Beautiful, tasteful UI. No generic/template aesthetics.
- No obvious AI tells in code style, comments, or documentation.
- Documentation stays organized and bounded (no unbounded growth of ephemeral docs).
- Library-first approach where mature options exist; custom implementation only when necessary.
- OpenTelemetry instrumentation for observability (client-side spans/metrics).
