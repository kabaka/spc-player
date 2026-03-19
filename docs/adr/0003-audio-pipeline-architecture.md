---
status: 'accepted'
date: 2026-03-18
---

# Audio Pipeline Architecture: Sample Rate, Resampling, and Real-Time/Export Paths

## Context and Problem Statement

The S-DSP in the SNES audio subsystem natively outputs stereo 16-bit PCM at a nominal rate of 32,000 Hz (derived from the APU's 24.576 MHz ceramic resonator: 24,576,000 ÷ 768 = 32,000). Ceramic resonators have ±0.3–0.5% tolerance, so real hardware varies slightly; emulators target the nominal 32,000 Hz. SPC Player must deliver this audio to the user through the Web Audio API's AudioWorklet system for real-time playback, and also support offline export to WAV, FLAC, OGG Vorbis, and MP3 at configurable sample rates (32k, 44.1k, 48k, 96k).

This requires answering three interrelated questions that together define the audio pipeline:

1. **What sample rate should the AudioContext use?** The DSP's 32 kHz output almost certainly needs conversion to a rate the browser and audio hardware support natively.
2. **Where and how should sample rate conversion happen?** Resampling can occur in WASM, in AudioWorklet JavaScript, or be delegated to the browser — each with different quality, performance, and complexity tradeoffs.
3. **What is the overall pipeline architecture?** How do the WASM emulator, AudioWorklet, Web Audio graph, and export codecs connect, and how are buffers managed to meet a <20ms latency target without allocations on the audio thread?

These three sub-decisions are tightly coupled — the sample rate choice constrains the resampling strategy, which constrains the pipeline architecture — so they are documented here as a single coherent decision.

## Decision Drivers

- **Audio fidelity** — minimize artifacts from sample rate conversion; preserve the character of the original S-DSP output
- **Real-time performance** — sustain 32 kHz DSP emulation and resampling within a 128-frame AudioWorklet quantum on mobile hardware
- **Latency** — <20ms from user action (play, mute, key press) to audible result
- **Cross-browser compatibility** — consistent behavior across Chrome, Safari, Firefox, and critically iOS Safari, which has historically restricted AudioContext sample rates
- **Export quality** — highest-fidelity offline conversion to configurable target sample rates (32k, 44.1k, 48k, 96k)
- **CPU and battery efficiency** — avoid unnecessary computation, especially on mobile where battery life matters
- **Clean WASM-AudioWorklet integration** — zero allocations on the audio thread, minimal JS in `process()`, minimal-copy buffer sharing
- **Resampling ratio simplicity** — integer or simple rational ratios enable efficient polyphase implementations and reduce accumulator drift

## Considered Options

### AudioContext Sample Rate

- **Option A** — 48,000 Hz (3:2 ratio with 32 kHz)
- **Option B** — 32,000 Hz (native DSP rate, no application-level resampling)
- **Option C** — 44,100 Hz (CD-quality rate, 441:320 ratio)
- **Option D** — 96,000 Hz (3:1 integer ratio)

### Resampling Strategy

- **Option R1** — Resample in WASM with linear interpolation (real-time) and windowed sinc (export)
- **Option R2** — Resample in AudioWorklet JavaScript
- **Option R3** — Delegate resampling to the browser (request 32 kHz AudioContext)

### Pipeline Architecture

- **Option P1** — Dual-path pipeline: WASM renders and resamples for both real-time (AudioWorklet) and export (offline buffer), with compiled WASM module transferred to the worklet
- **Option P2** — Single-path pipeline: all audio flows through Web Audio graph, export uses OfflineAudioContext

## Decision Outcome

Chosen configuration: **48 kHz AudioContext (Option A) with WASM-side resampling (Option R1) in a dual-path pipeline (Option P1)**, because this combination satisfies all decision drivers — the 3:2 ratio enables clean polyphase resampling with minimal artifacts, 48 kHz matches hardware DACs on virtually all target platforms (eliminating hidden browser resampling), iOS Safari compatibility is guaranteed, WASM-side resampling keeps the AudioWorklet `process()` method trivial, and the dual-path design allows the export pipeline to use highest-quality sinc resampling independently of real-time constraints.

### Real-Time Path

```
SPC700 CPU (WASM) → DSP registers → S-DSP emulator (32 kHz stereo, WASM)
  → Linear resampler (32 kHz → 48 kHz, WASM) → float32 output buffer (WASM linear memory)
  → AudioWorklet process() copies buffer → GainNode → AnalyserNode → destination
```

### Export Path

```
SPC700 CPU + S-DSP (WASM, maximum speed) → 32 kHz stereo PCM
  → Windowed sinc resampler (to target rate, WASM) → float32 buffer
  → TPDF dithering (float32 → int16) → Encoder (WAV/FLAC/OGG/MP3) → File download
```

### WASM-AudioWorklet Integration

1. Main thread fetches and compiles the `.wasm` binary into a `WebAssembly.Module`.
2. Compiled module is transferred to the AudioWorklet via `postMessage`.
3. Worklet instantiates the WASM module in its own execution context.
4. `process()` calls the WASM render function, which runs the SPC700 CPU and DSP for the required number of cycles, resamples to 48 kHz, and writes to a pre-allocated output buffer in WASM linear memory.
5. `process()` copies the output buffer (via typed array view) to the AudioWorklet output arrays.
6. Control messages (play, pause, mute, solo, speed) are sent to the worklet via `MessagePort`.
7. State data (voice state, DSP registers, VU levels) is reported back to the main thread via `MessagePort` at ~60 Hz (or per quantum at ~375 messages/sec for VU data). `MessagePort` messaging at this rate is sustainable for v1; `SharedArrayBuffer` is a future optimization path if profiling reveals pressure (requires COOP/COEP headers, which are compatible with GitHub Pages).

### Buffer Management

- All buffers are pre-allocated in WASM linear memory at initialization. No allocations occur during `process()`.
- Audio output buffer: 2 × 128 float32 samples (left + right channels at 48 kHz, one AudioWorklet quantum).
- DSP internal buffer: 2 × 86 int16 samples (left + right at 32 kHz — maximum samples needed per quantum).
- Typed array views over WASM memory avoid deserialization overhead; a single `Float32Array.set()` copy per channel to the AudioWorklet output buffer is the only data transfer.
- WASM linear memory is allocated at a sufficient initial size and must never be grown at runtime. Memory growth invalidates all typed array views, which would break the worklet's buffer access.

### Sample Rate Adaptation

The WASM resampler ratio must not be hardcoded to 3:2. At initialization, the pipeline detects `AudioContext.sampleRate` and configures the WASM resampler accordingly. While 48 kHz is the expected hardware rate on virtually all target platforms, some older Android devices may report 44.1 kHz. The resampler architecture must accept an arbitrary output rate and compute the correct interpolation ratio at startup.

### Output Clipping

The S-DSP performs hard clipping (saturation to ±32767) at the final mix stage after summing all voices and applying echo. The emulation must replicate this clipping at the correct point in the DSP pipeline — it is an audible characteristic of the hardware, not an error. Float32 conversion occurs after clipping, not before; applying a float32 clamp post-conversion would not replicate the same behavior.

### Consequences

- Good, because the 3:2 ratio enables a repeating 3-output / 2-input polyphase pattern with minimal interpolation error.
- Good, because 48 kHz matches the hardware DAC rate on virtually all target platforms, eliminating hidden browser resampling and its associated latency and quality loss.
- Good, because iOS Safari natively operates at 48 kHz, avoiding the sample rate rejection or silent override that occurs with non-standard rates.
- Good, because WASM-side resampling keeps the AudioWorklet `process()` method as a simple buffer copy — no computation, no allocation, no GC risk on the audio thread.
- Good, because the export pipeline is fully independent of Web Audio and can use the highest-quality sinc resampling without real-time constraints.
- Good, because the total latency budget (one 128-frame quantum at 48 kHz = 2.67ms, plus platform scheduling overhead) yields <20ms end-to-end on desktop platforms, within the latency target. Mobile latency is platform-dependent and largely outside application control: iOS Safari adds 12–26ms from the platform audio subsystem, and Android varies widely due to audio HAL differences (50–200ms on some devices). The pipeline design itself adds minimal latency; the platform audio subsystem is the bottleneck on mobile.
- Good, because pre-allocated buffers with typed array views eliminate allocation on the audio thread entirely.
- Bad, because the resampler must be implemented in the WASM module (Rust), adding to the DSP emulation codebase.
- Bad, because linear interpolation for real-time playback is not the highest-quality algorithm — though it is perceptually adequate given the 3:2 ratio and the S-DSP's existing Gaussian interpolation which already band-limits the signal.
- Bad, because a fractional sample position accumulator must track state across AudioWorklet quanta (the 3:2 pattern produces 85 or 86 DSP samples per 128-frame quantum in a repeating 86-85-85 cycle), adding minor bookkeeping complexity.

### Confirmation

- Measure actual end-to-end latency (user action to audible output) on Chrome desktop, Safari desktop, and iOS Safari — confirm <20ms.
- A/B listening test comparing linear interpolation vs. windowed sinc resampling at the 3:2 ratio to verify linear is perceptually adequate for real-time playback.
- Profile AudioWorklet `process()` execution time on representative mobile hardware (mid-range Android, iPhone SE-class) to confirm the 128-frame quantum budget is met with margin.
- Compare exported audio (WAV at 48 kHz with sinc resampling) against reference bsnes/higan renders to validate fidelity.
- Test AudioContext creation at 48 kHz across all P0 target browsers (Chrome, Edge, Safari, iOS Safari, Android Chrome) to confirm no rejection or silent rate change.

## Pros and Cons of the Options

### Option A: 48,000 Hz AudioContext

48 kHz is the standard sample rate for professional and consumer digital audio hardware (DVD, Blu-ray, HDMI, USB audio). The ratio to 32 kHz is 3:2 — a clean rational number with small integer terms.

- Good, because 3:2 is the simplest non-trivial rational ratio, enabling efficient polyphase resampling with a repeating 3-output / 2-input pattern.
- Good, because it matches the native hardware DAC rate on the vast majority of consumer devices, avoiding a hidden browser resampling stage between AudioContext output and the DAC.
- Good, because iOS Safari locks to the hardware rate (48 kHz) regardless of the requested rate — using 48 kHz means no conflict.
- Good, because 128 frames at 48 kHz yields a 2.67ms quantum — well within the latency budget.
- Good, because it is universally supported by all target browsers without risk of rejection.
- Neutral, because the 3:2 ratio requires a fractional sample position accumulator, producing a repeating pattern of 85–86 DSP samples per quantum.
- Bad, because it requires implementing a resampler (unlike the hypothetical simplicity of 32 kHz).

### Option B: 32,000 Hz AudioContext (Native DSP Rate)

Use the DSP's native output rate directly, eliminating application-level resampling entirely.

- Good, because no resampling code is needed — the DSP output feeds directly into the AudioWorklet.
- Good, because the pipeline is conceptually simpler.
- Bad, because 32 kHz is not a standard audio hardware rate — virtually no consumer DAC operates at 32 kHz, so the browser or OS will silently resample to the hardware rate (typically 48 kHz), adding latency and using a resampling algorithm of unknown and browser-dependent quality.
- Bad, because iOS Safari may reject a 32 kHz AudioContext or silently override it to 48 kHz, causing unpredictable behavior.
- Bad, because some browsers may round 32 kHz to the nearest supported rate, producing incorrect playback speed.
- Bad, because the "zero resampling" advantage is illusory — resampling still happens, just invisibly and without quality control.

### Option C: 44,100 Hz AudioContext (CD Quality)

44.1 kHz is the CD-DA standard sample rate, common in music production contexts.

- Good, because it is universally supported by all browsers.
- Good, because it is a familiar rate in music contexts.
- Bad, because the ratio to 32 kHz is 441:320 (1.378125:1) — an awkward rational number with large integer terms that prevents efficient polyphase implementation and requires an arbitrary-ratio resampler.
- Bad, because most modern audio hardware defaults to 48 kHz, meaning the browser would add a second resampling stage (44.1 kHz → 48 kHz) on most devices.
- Bad, because iOS Safari ignores 44.1 kHz requests and uses 48 kHz, creating an inconsistency between the requested and actual rate that must be detected and handled.

### Option D: 96,000 Hz AudioContext

96 kHz provides a 3:1 integer ratio with 32 kHz — the simplest possible upsampling.

- Good, because the 3:1 integer ratio allows trivial sample-insertion upsampling (insert 2 zeros between samples, apply lowpass filter).
- Bad, because most consumer DACs run at 48 kHz, so the browser would downsample 96 kHz → 48 kHz — adding an uncontrolled resampling stage and negating the integer-ratio advantage.
- Bad, because processing 3× the samples through the Web Audio graph wastes CPU and battery, especially on mobile.
- Bad, because S-DSP output has a 16 kHz Nyquist bandwidth — 96 kHz provides zero additional fidelity; the extra bandwidth contains no signal.
- Bad, because not all browsers reliably support 96 kHz AudioContext creation.
- Bad, because 3× larger buffers waste memory for no benefit.

### Option R1: Resample in WASM (Linear Real-Time, Sinc Export)

The WASM module performs all resampling. For real-time playback, it uses linear interpolation (one multiply-add per output sample). For offline export, it uses windowed sinc resampling (Lanczos-3 or Kaiser-windowed, with a polyphase FIR kernel of 6–16 taps per phase).

- Good, because WASM executes at near-native speed — resampling adds negligible overhead to the DSP emulation.
- Good, because it keeps all audio computation off the JavaScript audio thread, eliminating GC and JIT deoptimization risks.
- Good, because linear interpolation at a 3:2 ratio introduces minimal aliasing — the S-DSP's own Gaussian interpolation already band-limits the signal below the 16 kHz Nyquist frequency.
- Good, because the export path can use the highest-quality algorithm without real-time constraints.
- Good, because the same WASM module serves both paths, reducing code duplication.
- Good, because typed array views over WASM linear memory minimize data transfer overhead — only a single `Float32Array.set()` copy per channel is required.
- Bad, because the resampler must be written in Rust and compiled to WASM, adding implementation effort.
- Neutral, because linear interpolation is not the highest quality for real-time — but the quality ceiling is set by the original hardware (1990s consumer DAC with analog reconstruction filter), not studio audio standards.

### Option R2: Resample in AudioWorklet JavaScript

Resampling is implemented in JavaScript within the AudioWorklet's `process()` method.

- Good, because JavaScript is easier to prototype and iterate on than Rust/WASM.
- Good, because resampling parameters could be changed dynamically without recompiling WASM.
- Bad, because JavaScript on the audio thread risks GC pauses, JIT deoptimization, and unpredictable execution time — all of which cause audio glitches.
- Bad, because any array allocation in `process()` (even temporary) can trigger garbage collection.
- Bad, because JavaScript arithmetic is slower than WASM for tight numerical loops.
- Bad, because it splits audio computation between WASM (DSP) and JS (resampling), complicating debugging and profiling.

### Option R3: Delegate Resampling to the Browser

Request a 32 kHz AudioContext and let the browser handle conversion to the hardware rate.

- Good, because it requires zero resampling code — simplest possible implementation.
- Bad, because browser resampling quality varies across implementations and is not configurable.
- Bad, because it adds latency from the browser's internal resampling pipeline.
- Bad, because 32 kHz may be rejected by some browsers (see Option B above).
- Bad, because quality differences between browsers would make SPC Player sound different on different platforms.

### Option P1: Dual-Path Pipeline (WASM Real-Time + WASM Offline Export)

Separate real-time and export paths. Real-time flows through AudioWorklet; export bypasses Web Audio entirely and renders directly into memory buffers.

- Good, because the export path can run at maximum speed (faster than real-time) without AudioWorklet quantum constraints.
- Good, because export can use a different (higher-quality) resampling algorithm without affecting real-time performance.
- Good, because the export path can target any sample rate (32k, 44.1k, 48k, 96k) independently of the AudioContext rate.
- Good, because export does not require an active AudioContext, avoiding platform-specific audio session quirks.
- Bad, because two codepaths must be maintained (though they share the core DSP emulation).

### Option P2: Single-Path Pipeline (All Audio Through Web Audio Graph)

Both real-time playback and export use the Web Audio API. Export uses `OfflineAudioContext` to render at the target sample rate.

- Good, because a single codepath serves both use cases.
- Good, because `OfflineAudioContext` is a standard API designed for offline rendering.
- Bad, because `OfflineAudioContext` still operates in AudioWorklet quantum increments, limiting rendering speed.
- Bad, because export sample rate is constrained by `OfflineAudioContext` support for the target rate.
- Bad, because an `OfflineAudioContext` may inherit platform audio session restrictions (especially on iOS).
- Bad, because the resampling algorithm cannot differ between real-time and export — either both use linear (export quality suffers) or both use sinc (real-time performance risk on mobile).

## More Information

### Per-Quantum Sample Count Pattern

At a 3:2 ratio, each 128-frame AudioWorklet quantum at 48 kHz requires 128 × (2/3) ≈ 85.33 DSP samples at 32 kHz. The fractional accumulator produces a repeating pattern:

| Quantum | DSP Samples | Fractional Remainder |
| ------- | ----------- | -------------------- |
| 1       | 86          | 0.67                 |
| 2       | 85          | 0.33                 |
| 3       | 85          | 0.00                 |
| 4       | 86          | 0.67                 |

This 86-85-85 pattern repeats every 3 quanta (256 DSP samples produce exactly 384 output samples: 256 × 3/2 = 384 = 3 × 128).

### Rationale for Linear Interpolation in Real-Time

The S-DSP applies its own Gaussian interpolation kernel when reading BRR-decoded samples, which attenuates energy near the 16 kHz Nyquist boundary. Linear interpolation at the 3:2 upsample ratio therefore operates on pre-filtered material. The aliased spectral images fold into the 16–24 kHz region of the output. Their energy is very low because (a) the S-DSP's Gaussian interpolation kernel provides roughly −8 dB attenuation near the input Nyquist frequency, and (b) the sinc² response of linear interpolation provides an additional ~8 dB of image rejection. Combined with the 16–24 kHz region being at the extreme high end of human hearing (where sensitivity is lowest), the residual imaging artifacts are expected to be inaudible for typical SPC content.

### Future Considerations

- A user-configurable quality setting could offer sinc resampling for real-time playback on desktop, at higher CPU cost. The pipeline architecture supports this — only the WASM render function's resampling mode changes.
- ~~Detect `AudioContext.sampleRate` at initialization~~ — promoted to a documented requirement; see "Sample Rate Adaptation" under Decision Outcome above.

### Related Decisions

- Choice of WASM source language and emulation library — see ADR-0001. Prerequisite for implementing the resampler.
- UI framework selection — see ADR-0002. Independent; the pipeline is framework-agnostic.
- Audio codec selection for export — downstream of this pipeline (operates on the resampled PCM output).
