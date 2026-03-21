---
status: 'accepted'
date: 2026-03-21
---

# Pitch-Independent Speed Change via SoundTouchJS

## Context and Problem Statement

SPC Player's current speed control multiplies into the resampling ratio in the AudioWorklet's `process()` method:

```typescript
const ratio = (DSP_SAMPLE_RATE / this.outputSampleRate) * this.speedFactor;
```

At 2× speed, each output sample consumes twice as many DSP samples — the waveform is compressed in time, and pitch rises proportionally. Speed and pitch are inseparable in this design. This is a known limitation: changing playback speed always changes pitch, and there is no way to change pitch without changing speed.

Pitch-independent speed change (time-stretching) is a standard feature in music player applications. It enables users to slow down complex passages for analysis without lowering pitch, or speed up playback for browsing without the "chipmunk" effect. The SPC Player requirements identify this as a desired capability.

## Decision Drivers

- **Audio quality** — the time-stretching algorithm must not introduce audible artifacts (clicks, warbling, metallic sound) on typical SPC audio content (synthesized waveforms, 32 kHz, 8 voices)
- **Audio thread budget** — the AudioWorklet's `process()` must complete within the 2.667 ms quantum budget (128 frames at 48 kHz). Additional processing from time-stretching must not cause audio underruns
- **Bundle size** — SPC Player enforces a 250 KB gzipped JS budget. Any library must be lazy-loaded and excluded from the main bundle
- **License compatibility** — the library must be distributable with a static-site PWA. LGPL-2.1 is acceptable if loaded as a separate, replaceable module (functionally equivalent to dynamic linking)
- **Zero overhead at default settings** — when speed and pitch are both at 1.0× (the common case), the time-stretching node must be completely removed from the audio graph, adding zero latency and zero CPU cost
- **API availability** — the library must provide AudioWorklet-based processing with AudioParam controls for seamless Web Audio API integration

## Considered Options

- **Option 1: SoundTouchJS (`@soundtouchjs/audio-worklet`)** — a JavaScript port of the SoundTouch audio processing library, providing WSOLA-based time-stretching and pitch-shifting as an AudioWorkletNode
- **Option 2: Custom WSOLA implementation** — implement the WSOLA (Waveform Similarity Overlap-Add) algorithm directly in the existing SPC AudioWorklet processor
- **Option 3: Keep pitch-coupled speed as a known limitation** — document the limitation and defer pitch-independent speed to a future release

## Decision Outcome

Chosen option: **"SoundTouchJS (`@soundtouchjs/audio-worklet`)"** (Option 1), because it provides a ready-made AudioWorkletNode with AudioParam-based controls, uses the well-established WSOLA algorithm, and integrates cleanly into the existing Web Audio graph with zero overhead at default settings.

### Validation Results

The `@soundtouchjs/audio-worklet` v1.0.8 package was validated using a standalone test page (`tests/prototypes/soundtouch-validation.html`). The validation confirmed:

- **API matches documentation**: `SoundTouchNode.register(audioCtx, processorUrl)` followed by `new SoundTouchNode(audioCtx)`. AudioParams available: `pitch`, `tempo`, `rate`, `pitchSemitones`, `playbackRate`.
- **Processor file**: ~25 KB standalone JavaScript, loaded via `addModule()`.
- **No build issues**: Package is ESM-native with TypeScript declarations.

### Integration Architecture

Audio graph with SoundTouch active:

```
SpcWorkletNode → SoundTouchNode → GainNode → destination
```

Audio graph at default (1.0× tempo, 1.0× pitch) — SoundTouch bypassed:

```
SpcWorkletNode → GainNode → destination
```

Key design invariants:

1. **SPC worklet always runs at `speedFactor = 1.0`** when SoundTouch is active. The worklet produces audio at its natural 32 kHz → 48 kHz rate; SoundTouch handles time-stretching.
2. **Bypass at 1.0×** — SoundTouchNode is physically disconnected from the graph (not just set to tempo=1.0). Even idle WSOLA has non-zero cost.
3. **LGPL-2.1 compliance** — loaded via `import()` as a separate Vite chunk. The library is never statically bundled into the main application.
4. **Idle prefetch** — after first playback, the SoundTouch module is prefetched via `requestIdleCallback` to eliminate latency when the user first changes tempo/pitch.

### LGPL-2.1 Compliance

`@soundtouchjs/audio-worklet` is licensed under LGPL-2.1. Compliance is achieved by:

- Loading the library via dynamic `import()`, which produces a separate Vite chunk
- The worklet processor is loaded via `addModule()`, which is a separate file
- Users can replace the SoundTouch chunk with a modified version without rebuilding the application
- Attribution is included in `THIRD_PARTY_LICENSES`

This is the same pattern used for other LGPL dependencies (per ADR-0006).

### Consequences

- Good, because pitch and speed can be controlled independently, enabling "slow-mo without chipmunk" and pitch-shifted playback.
- Good, because zero overhead at default settings — the common case path is identical to the pre-SoundTouch architecture.
- Good, because the WSOLA algorithm is well-understood, battle-tested, and handles synthesized audio (typical SPC content) well.
- Good, because AudioParam-based controls enable smooth, glitch-free parameter changes.
- Good, because the library is loaded only when needed — users who never change tempo/pitch never download it.
- Bad, because WSOLA introduces ~20 ms of latency when active. This is acceptable for music playback but adds perceptible delay for interactive scenarios (MIDI input).
- Bad, because at extreme tempos (2× or higher), total audio thread work (DSP + WSOLA) approaches the 2.667 ms quantum budget. Mobile devices with slower CPUs may experience audio glitches at extreme settings.
- Bad, because the LGPL-2.1 license requires maintaining the library as a separate, independently replaceable module — it cannot be tree-shaken or bundled with application code.
- Neutral, because the library has low npm adoption (~467 weekly downloads), but the WSOLA algorithm itself is well-established and the AudioWorklet API surface is small and verifiable.
- Neutral, because seeking with active pitch/tempo shift may produce a brief (~20 ms) crossfade artifact. The `SoundTouchNode` has no public API to flush its internal WSOLA buffers, and Web Audio `disconnect()`/`connect()` does not reset `AudioWorkletProcessor` state. The artifact is inaudible in practice due to the short WSOLA overlap window relative to the seek discontinuity.

## Pros and Cons of the Options

### SoundTouchJS (`@soundtouchjs/audio-worklet`)

- Good, because it provides a ready-made `AudioWorkletNode` with `AudioParam` controls.
- Good, because the WSOLA algorithm handles synthesized waveforms (typical SPC content) without metallic artifacts.
- Good, because the ~25 KB processor file is small and loaded separately from the JS bundle.
- Good, because the API is simple: register, construct, set params.
- Bad, because LGPL-2.1 requires dynamic loading and separate chunking.
- Bad, because low npm adoption means fewer battle-tested edge cases in production.
- Bad, because WSOLA adds ~20 ms latency when active.

### Custom WSOLA Implementation

- Good, because no external dependency — full control over implementation and licensing (MIT).
- Good, because processing could be integrated directly into the existing SPC worklet, avoiding an extra AudioWorkletNode hop.
- Bad, because implementing WSOLA correctly is non-trivial (overlap detection, cross-fade windows, pitch estimation).
- Bad, because the implementation would need extensive testing to match the quality of established libraries.
- Bad, because the development effort is disproportionate to the feature's importance when a working library exists.

### Keep Pitch-Coupled Speed

- Good, because no additional complexity, bundle size, or dependencies.
- Good, because no risk of audio quality degradation from a time-stretching algorithm.
- Bad, because the "chipmunk effect" at high speeds is a poor user experience for music analysis.
- Bad, because pitch-independent speed is a standard feature expected in music player applications.

## More Information

- Audio engine plan: `docs/dev/plans/audio-engine-plan.md` §2
- Validation test page: `tests/prototypes/soundtouch-validation.html`
- SoundTouchJS repository: `cutterbl/SoundTouchJS` (GitHub)
- WSOLA algorithm: Verhelst & Roelands, "An overlap-add technique based on waveform similarity" (1993)
- Related ADRs: ADR-0003 (audio pipeline architecture), ADR-0006 (audio codec libraries), ADR-0014 (resampling quality)
