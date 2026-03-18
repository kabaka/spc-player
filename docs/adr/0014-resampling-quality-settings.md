---
status: "accepted"
date: 2026-03-18
---

# User-Configurable Resampling Quality for Real-Time Playback

## Context and Problem Statement

ADR-0003 selected linear interpolation for real-time output resampling (32 kHz → 48 kHz) as a performance-safe default, reserving windowed sinc resampling for offline export. This was the correct initial decision — it guaranteed the AudioWorklet's 2.67ms quantum budget could be met on all target platforms, including constrained mobile hardware. ADR-0003 explicitly noted this as a future extension point: "A user-configurable quality setting could offer sinc resampling for real-time playback on desktop, at higher CPU cost. The pipeline architecture supports this — only the WASM render function's resampling mode changes."

The retro audiophile persona (requirements: "bit-perfect output, lossless export, DAC-faithful rendering") demands the highest achievable playback fidelity. Linear interpolation at a 3:2 ratio introduces low-level aliasing artifacts — attenuated high-frequency images folded back below Nyquist — that are inaudible to most listeners but detectable by trained ears on high-fidelity monitoring systems. Windowed sinc resampling (Lanczos-3 or Kaiser-windowed FIR) eliminates these artifacts at the cost of higher CPU usage per output sample. Modern desktop hardware (and recent mobile SoCs) can sustain sinc resampling well within the quantum budget.

Additionally, the requirements list "multiple output resampling algorithms (sinc, linear, nearest-neighbor) for auditioning" as a future consideration, and ADR-0001 notes that snes-apu-spcp supports multiple S-DSP source sample interpolation modes (Gaussian, linear, cubic, sinc) — a conceptually distinct processing stage from output resampling. Some audiophile users may want to experiment with non-standard DSP interpolation modes for their altered spectral character, even though only Gaussian is hardware-authentic.

There are therefore two independent interpolation/resampling stages the user could configure:

1. **S-DSP source sample interpolation** — how the DSP reads BRR-decoded samples to produce its 32 kHz output. Gaussian interpolation is the hardware-authentic behavior; linear, cubic, and sinc modes are enhancements that alter the spectral character of the DSP output in ways the original hardware never produced (ADR-0001).
2. **Output sample rate conversion** — converting the 32 kHz DSP output to the AudioContext sample rate for playback. Linear is fast but introduces aliasing; sinc is clean but CPU-intensive.

A third dimension exists: the output sample rate itself. ADR-0003 selected 48 kHz as the AudioContext rate because it matches consumer DAC hardware. However, some audiophile users have DACs supporting native 96 kHz or higher. While the S-DSP's 16 kHz Nyquist bandwidth means no additional signal content exists above 16 kHz, a higher output rate allows the reconstruction filter (in the DAC) to operate further from the signal band, potentially reducing filter-induced phase distortion in the audible range — a subtle benefit that some audiophiles value.

This ADR formalizes how these quality dimensions are exposed to the user.

## Decision Drivers

- **Audio fidelity for the retro audiophile persona** — this persona expects the best possible reproduction; linear resampling's aliasing artifacts, however subtle, are a known compromise
- **CPU budget variance across platforms** — sinc resampling (Lanczos-3, 6-tap polyphase FIR) costs roughly 6–10× more multiply-accumulate operations per output sample than linear interpolation; desktop hardware has ample margin, but low-end mobile does not
- **Simplicity of audio quality settings UI** — most users should not need to understand interpolation algorithms or sample rate theory; the settings must be approachable for casual users while offering full control for experts
- **Settings persistence** — user quality preferences must be saved to IndexedDB via Zustand's `persist` middleware (ADR-0005's `settings` slice) and restored on next launch
- **AudioContext sample rate is immutable after creation** — changing the output sample rate requires destroying and recreating the AudioContext, which interrupts playback (Web Audio API limitation)
- **iOS Safari locks AudioContext to 48 kHz** — any rate above 48 kHz will be silently ignored on iOS, meaning higher output rates are a desktop/Android-only feature
- **S-DSP Gaussian interpolation is the authentic behavior** — exposing non-standard DSP interpolation modes is an enhancement feature, not a fidelity improvement; the default must always be Gaussian
- **Pipeline architecture compatibility** — ADR-0003's architecture already supports resampler mode changes; the WASM `dsp_render()` function (ADR-0007) accepts the resampling parameters, and only the mode configuration changes
- **Higher output sample rates halve the render quantum time budget** — the AudioWorklet render quantum is always 128 frames regardless of sample rate (Web Audio API specification). At 48 kHz, 128 frames = 2.67ms; at 96 kHz, 128 frames = 1.33ms. The tighter time budget at 96 kHz is partially offset by fewer DSP samples needed per quantum (~43 at 3:1 ratio vs ~86 at 3:2), but leaves less margin for scheduling jitter and background processing
- **Manual control vs. automatic detection** — automatic hardware capability detection (e.g., probing supported AudioContext sample rates) is unreliable across browsers and does not capture user intent; a user with a 96 kHz-capable DAC may still prefer 48 kHz for battery life

## Considered Options

- **Option 1: Single quality preset** — a single dropdown (Standard / High / Audiophile / Maximum) that controls the output resampler algorithm and optionally the output sample rate
- **Option 2: Separate independent controls** — three separate settings: output resampler quality, output sample rate, and S-DSP interpolation mode
- **Option 3: Automatic quality selection** — detect device capability and select resampling quality automatically with no user setting
- **Option 4: Quality presets with an advanced custom mode** — named presets for common configurations plus a "Custom" mode that exposes individual controls for full user override

## Decision Outcome

Chosen option: **"Quality presets with an advanced custom mode" (Option 4)**, because it satisfies both ends of the user spectrum — casual users select a named preset without understanding the underlying parameters, while the retro audiophile persona gets full control over every quality dimension through the Custom mode. This avoids the complexity of exposing three separate controls to all users (Option 2) while providing more flexibility than a fixed preset list (Option 1) and more user agency than automatic detection (Option 3).

### Preset Definitions

| Preset | Output Resampler | Output Sample Rate | S-DSP Interpolation | Target User |
|--------|------------------|--------------------|---------------------|-------------|
| **Standard** (default) | Linear | 48 kHz | Gaussian | All users; matches ADR-0003 default |
| **High Quality** | Sinc (Lanczos-3) | 48 kHz | Gaussian | Desktop users wanting cleaner resampling |
| **Custom** | User-selected | User-selected | User-selected | Audiophiles and experimenters |

The **Standard** preset reproduces the exact pipeline defined by ADR-0003 — linear output resampling at 48 kHz with hardware-authentic Gaussian DSP interpolation. No existing behavior changes for users who do not interact with the quality settings.

The **High Quality** preset upgrades only the output resampler to sinc (Lanczos-3, 6-tap polyphase FIR), keeping the output rate at 48 kHz and DSP interpolation at Gaussian. This gives audiophiles the primary quality improvement they want — elimination of aliasing artifacts from the 32 kHz → 48 kHz conversion — without altering the authentic DSP character or requiring AudioContext recreation.

The **Custom** mode exposes three independent controls:

1. **Output resampler algorithm**: Linear (default) / Sinc (Lanczos-3)
2. **Output sample rate**: 48 kHz (default) / 96 kHz — limited to rates that produce clean integer or simple rational ratios with 32 kHz (3:2 and 3:1 respectively). 44.1 kHz is excluded per ADR-0003's analysis (441:320 ratio). 192 kHz and 384 kHz are excluded because browser `AudioContext` support above 96 kHz is unreliable, CPU cost scales linearly, and the DAC reconstruction filter benefit is negligible beyond 96 kHz (see "Why Not 192 kHz or 384 kHz" below). For users with high-end DACs, 96 kHz is meaningful — it pushes the reconstruction filter's transition band far from the audible signal band (16–64 kHz vs 16–32 kHz at 48 kHz), reducing filter-induced phase distortion. Users with external DACs receiving system audio output benefit from this even though the Web Audio API is the intermediate stage.
3. **S-DSP interpolation mode**: Gaussian (default, hardware-authentic) / Linear / Cubic / Sinc — these are the modes built into snes-apu-spcp (ADR-0001). A clear label must indicate that Gaussian is the only hardware-authentic mode and that other modes alter the original sound character.

### Implementation Architecture

**Settings storage:** A new `audioQuality` field in the `settings` slice (ADR-0005), persisted to IndexedDB:

```typescript
interface AudioQualitySettings {
  preset: 'standard' | 'high-quality' | 'custom';
  // Custom mode overrides — ignored when preset is not 'custom'
  outputResampler: 'linear' | 'sinc';
  outputSampleRate: 48000 | 96000;
  dspInterpolation: 'gaussian' | 'linear' | 'cubic' | 'sinc';
}
```

When a named preset is selected, the individual fields are updated to match the preset's values. When Custom is selected, the individual fields are independently editable. This ensures the persisted state always contains the full resolved configuration, so the WASM module does not need to know about presets — it receives concrete parameter values.

**WASM interface change:** The `dsp_render()` export (ADR-0007) already accepts parameters controlling the render. The output resampler mode is configured via a new export function:

```rust
#[no_mangle]
pub extern "C" fn dsp_set_resampler_mode(mode: u32);
// 0 = linear, 1 = sinc (Lanczos-3)

#[no_mangle]
pub extern "C" fn dsp_set_interpolation_mode(mode: u32);
// 0 = gaussian, 1 = linear, 2 = cubic, 3 = sinc
```

These are called once at initialization and whenever the user changes the setting. The resampler mode change takes effect on the next `dsp_render()` call with no pipeline disruption.

**Output sample rate change:** Because `AudioContext.sampleRate` is immutable, changing the output sample rate requires:

1. Fade out the current audio (50ms ramp to avoid click).
2. **Capture full emulation state** from the current WASM instance via `dsp_snapshot()` — this serializes the SPC700 CPU registers, program counter, all DSP registers, all 8 voice states (BRR decode position, envelope phase, pitch counter, ADSR state), echo buffer position, the full 64 KB SPC RAM, noise LFSR state, and the resampler's fractional sample position accumulator into a contiguous memory region.
3. Transfer the serialized state from the AudioWorklet to the main thread via `postMessage`.
4. Disconnect and close the current `AudioContext`.
5. Create a new `AudioContext` with the requested `sampleRate`.
6. Re-register the AudioWorklet processor.
7. Transfer the WASM module and serialized state to the new worklet.
8. Instantiate the WASM module and call `dsp_restore(pointer)` to reload the full emulation state.
9. Recalculate the resampler's fractional sample accumulator for the new output ratio (e.g., 3:2 → 3:1 or vice versa). The accumulator phase must be mapped proportionally to avoid a phase discontinuity.
10. Resume playback from the interrupted position.

The WASM `extern "C"` API (ADR-0007) must include snapshot/restore exports:

```rust
#[no_mangle]
pub extern "C" fn dsp_snapshot() -> *const u8;
// Returns pointer to serialized state in WASM linear memory.
// Caller reads `dsp_snapshot_size()` bytes from this pointer.

#[no_mangle]
pub extern "C" fn dsp_snapshot_size() -> u32;

#[no_mangle]
pub extern "C" fn dsp_restore(ptr: *const u8, len: u32);
// Restores full emulation state from the provided buffer.
```

The snapshot must be captured atomically within a single render quantum — no partial state is acceptable. The restore must set all internal state such that the next `dsp_render()` call produces output continuous with the pre-snapshot state (modulo the sample rate change).

This is an inherently disruptive operation. The UI must warn the user that changing the output sample rate will briefly interrupt playback. On iOS Safari, selecting 96 kHz will be prevented (the option is disabled with an explanatory tooltip: "iOS limits audio output to 48 kHz").

**CPU budget analysis for sinc resampling:**

The AudioWorklet render quantum is always 128 frames regardless of sample rate (Web Audio API specification). At higher sample rates, the time budget per quantum shrinks: 128/48000 = 2.67ms at 48 kHz, but 128/96000 = 1.33ms at 96 kHz. However, the number of DSP samples (at 32 kHz) needed to fill each quantum also changes with the ratio: ~86 samples at 3:2 (48 kHz) but only ~43 samples at 3:1 (96 kHz), so DSP emulation cost per quantum is approximately halved at 96 kHz.

| Configuration | Output frames/quantum | Time budget | DSP samples needed | Resampling ops/quantum | Est. resampling (desktop) | Est. resampling (mobile) |
| --- | --- | --- | --- | --- | --- | --- |
| Linear, 48 kHz | 128 | 2.67ms | ~86 (3:2) | ~256 | <0.01ms | <0.01ms |
| Sinc (Lanczos-3), 48 kHz | 128 | 2.67ms | ~86 (3:2) | ~1,536 | ~0.02ms | ~0.05ms |
| Linear, 96 kHz | 128 | 1.33ms | ~43 (3:1) | ~256 | <0.01ms | <0.01ms |
| Sinc (Lanczos-3), 96 kHz | 128 | 1.33ms | ~43 (3:1) | ~1,536 | ~0.02ms | ~0.05ms |

At 48 kHz, both configurations are well within the 2.67ms quantum budget. The DSP emulation itself (SPC700 CPU + S-DSP for ~86 samples) dominates at ~0.5–1.5ms on desktop; resampling overhead is marginal.

At 96 kHz, the halved DSP sample count (~43 samples, ~0.25–0.75ms emulation cost) partially compensates for the halved time budget (1.33ms). However, the margin for scheduling jitter, garbage collection pauses, and OS-level audio thread interrupts is significantly tighter. On desktop hardware, 96 kHz sinc should remain feasible (~0.75ms emulation + ~0.02ms resampling = ~0.77ms of the 1.33ms budget, ~58% utilization). On constrained mobile hardware, the 1.33ms budget may not leave sufficient headroom — this must be profiled empirically. The Standard preset's linear resampling at 48 kHz remains the safe default for all platforms.

### Consequences

- Good, because the retro audiophile persona can achieve the highest playback fidelity (sinc resampling + optional 96 kHz output) without any compromise to the default experience for other users.
- Good, because the Standard preset preserves ADR-0003's exact pipeline behavior — no existing functionality changes for users who do not interact with quality settings.
- Good, because the High Quality preset provides the most-requested improvement (sinc resampling) with a single click, requiring no understanding of sample rates or interpolation theory.
- Good, because Custom mode satisfies the requirements' "multiple output resampling algorithms for auditioning" future consideration and enables experimentation with S-DSP interpolation modes.
- Good, because settings are persisted to IndexedDB (ADR-0005), so the user's quality preference is remembered across sessions.
- Good, because the WASM render function's resampling mode changes at runtime without pipeline reconstruction (ADR-0003's architecture supports this directly), except for output sample rate changes which require AudioContext recreation.
- Bad, because the sinc resampler (Lanczos-3 polyphase FIR) must be implemented in Rust within the `spc-apu-wasm` crate (ADR-0008), adding ~150–300 lines of implementation to the WASM module.
- Bad, because output sample rate changes require destroying and recreating the AudioContext, which is disruptive to the user and adds complexity to the audio lifecycle management code. The WASM state snapshot/restore mechanism (`dsp_snapshot()`/`dsp_restore()`) adds API surface to the WASM module (ADR-0007) and must atomically capture the full emulation state (SPC700 CPU, DSP registers, 64 KB RAM, echo buffer, all 8 voice states, noise LFSR) to avoid playback regression.
- Bad, because sinc (Lanczos-3) output resampling introduces subtle pre-ringing artifacts on sharp transients (Gibbs phenomenon), which is an inherent tradeoff of linear-phase FIR filters. SNES music contains frequent sharp transients from BRR samples. While the Lanczos-3 kernel's short length limits the artifact's audibility, the ADR should not imply sinc is strictly superior to linear — it trades aliasing for pre-ringing.
- Bad, because the 96 kHz output option is unavailable on iOS Safari, creating a platform inconsistency that must be communicated clearly in the UI.
- Bad, because exposing S-DSP interpolation modes other than Gaussian may confuse users who expect "higher quality" from sinc DSP interpolation without understanding that it produces non-authentic output that the original hardware never generated.
- Bad, because the Custom mode adds UI surface area (three controls with explanatory text) that must be designed, implemented, and tested.

### Confirmation

- Implement the Standard and High Quality presets. A/B listening test on reference tracks, comparing linear vs. sinc output resampling at 48 kHz on studio monitors or high-quality headphones. Verify that sinc eliminates the aliasing artifacts present in linear resampling (spectral analysis showing clean rolloff above 16 kHz vs. aliased images).
- Profile the sinc resampler (Lanczos-3, 6-tap) in the AudioWorklet on mid-range mobile hardware (iPhone SE 3, Pixel 6a). At 48 kHz, verify that the combined DSP emulation + sinc resampling completes within 80% of the 2.67ms quantum budget. At 96 kHz, verify completion within 80% of the 1.33ms budget — the tighter constraint. If 96 kHz sinc fails the budget on a target device, the 96 kHz option must display a warning or be restricted to desktop platforms.
- Verify that changing between Standard and High Quality presets takes effect on the next `dsp_render()` call without audible discontinuity (no click, pop, or gap). The fractional sample position accumulator must carry over correctly when switching resampler algorithms mid-stream.
- Verify that the 96 kHz output option correctly captures emulation state via `dsp_snapshot()`, creates a new AudioContext, restores state via `dsp_restore()`, reconfigures the WASM resampler ratio to 3:1, and resumes playback at the correct position with no audible discontinuity beyond the brief interruption. Measure the interruption duration; target under 500ms.
- Verify that 96 kHz is disabled on iOS Safari with an appropriate explanatory message.
- Verify that the `audioQuality` settings are persisted to IndexedDB and correctly restored on page reload, including Custom mode with non-default values.
- Verify that switching S-DSP interpolation modes in Custom mode produces audible spectral character differences (e.g., Gaussian has its characteristic high-frequency rolloff; sinc DSP interpolation produces a brighter, more extended frequency response). This confirms the setting is wired through to the emulation core.

## Pros and Cons of the Options

### Option 1: Single Quality Preset

A single "Audio Quality" dropdown with fixed presets (e.g., Standard / High / Audiophile / Maximum). Each preset maps to a predetermined combination of output resampler algorithm, output sample rate, and S-DSP interpolation mode. No individual control is exposed.

Example preset mapping:
- Standard: linear resampling, 48 kHz, Gaussian DSP
- High: sinc resampling, 48 kHz, Gaussian DSP
- Audiophile: sinc resampling, 96 kHz, Gaussian DSP
- Maximum: sinc resampling, 96 kHz, sinc DSP interpolation

- Good, because the UI is maximally simple — a single dropdown with clearly named options. No technical knowledge required. Casual users can select "High" without understanding why.
- Good, because presets can be curated to represent tested, validated combinations. Each preset has known CPU cost and audio characteristics.
- Good, because it reduces the settings persistence surface to a single enum value.
- Bad, because it conflates three independent concerns (output resampler, output rate, DSP interpolation) into a single axis. Users who want sinc output resampling with Gaussian DSP interpolation at 48 kHz (the most common audiophile preference) get it only if a preset happens to match that combination.
- Bad, because the "Audiophile" and "Maximum" presets imply 96 kHz output, which is unavailable on iOS Safari — these presets either silently downgrade (confusing) or must be hidden on incompatible platforms (inconsistent UI).
- Bad, because it does not satisfy the requirements' "multiple output resampling algorithms for auditioning" feature — users cannot independently select a resampler to compare without changing other parameters simultaneously.
- Bad, because the "Maximum" preset couples non-authentic DSP interpolation (sinc) with the highest output quality, implying that sinc DSP interpolation is "better" when it is actually a different sound character, not a fidelity improvement.

### Option 2: Separate Independent Controls

Three separate settings, each independently configurable:
1. Output resampler: Linear / Sinc (Lanczos-3)
2. Output sample rate: 48 kHz / 96 kHz
3. S-DSP interpolation: Gaussian / Linear / Cubic / Sinc

- Good, because it provides maximum flexibility — every combination is expressible. The user can independently tune each dimension for their specific hardware and preferences.
- Good, because it directly implements the "multiple output resampling algorithms for auditioning" requirement.
- Good, because the separation between "output resampler" (quality/performance tradeoff) and "DSP interpolation" (authenticity vs. enhancement) is explicit, helping users understand the conceptual distinction.
- Good, because platform restrictions (96 kHz unavailable on iOS) can be applied to a single control without affecting the others.
- Bad, because three separate audio controls in the settings panel is overwhelming for non-technical users who just want "make it sound better." The UI must explain what each control does, why there are two different "interpolation" settings, and what Gaussian vs. sinc means — a significant documentation and UX burden.
- Bad, because the combinatorial space includes nonsensical or misleading configurations (e.g., nearest-neighbor output resampling at 96 kHz — the worst algorithm at the highest rate).
- Bad, because it lacks the "recommended configuration for your use case" guidance that presets provide. A casual user seeing three dropdowns has no idea which combination to choose.
- Bad, because three persisted settings increase the migration surface if the option set changes in the future.

### Option 3: Automatic Quality Selection

Detect the device's CPU capability (via a brief benchmark at startup or by inspecting `navigator.hardwareConcurrency`, device memory, or user agent heuristics) and automatically select the highest-quality resampling that the device can sustain. No user-facing setting.

- Good, because it requires zero user interaction — the application always uses the best quality the device can handle.
- Good, because it eliminates the Settings UI surface entirely for this feature.
- Good, because it avoids the risk of users selecting a quality level their device cannot sustain (audio glitches from quantum budget overruns).
- Bad, because device capability detection in the browser is unreliable. `navigator.hardwareConcurrency` reports logical cores, not per-core performance. Device memory APIs have limited browser support. User agent sniffing is fragile and maintenance-heavy.
- Bad, because it removes user agency — an audiophile with a powerful desktop may want to verify that sinc resampling is active, or a power-conscious laptop user may want to force linear resampling despite having a capable CPU. Automatic detection cannot capture user intent.
- Bad, because a startup benchmark adds latency to the first-load experience and may produce different results depending on background system load, leading to inconsistent quality selection across sessions.
- Bad, because it does not address the S-DSP interpolation mode or output sample rate dimensions at all — automatic detection can estimate CPU headroom but cannot determine whether the user has a 96 kHz-capable DAC or prefers authentic Gaussian interpolation over enhanced sinc.
- Bad, because it does not satisfy the "multiple output resampling algorithms for auditioning" requirement — the user cannot compare algorithms if the system chooses for them.
- Bad, because debugging reports become harder — "what quality is my playback using?" has no visible answer.

### Option 4: Quality Presets with an Advanced Custom Mode

Named presets (Standard, High Quality) cover common configurations with a single selection. A "Custom" option unlocks individual controls for output resampler, output sample rate, and S-DSP interpolation mode.

- Good, because casual users interact with a single dropdown showing approachable labels ("Standard", "High Quality"). No technical knowledge required for the primary use case.
- Good, because the Custom mode provides full control for the retro audiophile persona without cluttering the default settings experience.
- Good, because presets can be validated and documented as tested configurations with known CPU cost and audio characteristics, while Custom mode shifts responsibility for valid combinations to the expert user.
- Good, because it satisfies both ends of the user spectrum identified in the requirements: casual fans ("simple playback, clean UI") and retro audiophiles ("bit-perfect output, DAC-faithful rendering").
- Good, because the preset dropdown maps cleanly to a single persisted value for the majority of users, with the full custom configuration persisted only when Custom is selected.
- Good, because it directly enables the "multiple output resampling algorithms for auditioning" future consideration from the requirements via Custom mode.
- Neutral, because the Custom mode adds UI complexity (three additional controls with explanatory text appear when Custom is selected), but this complexity is opt-in and hidden behind the preset dropdown — it does not affect the default settings panel appearance.
- Bad, because the two-tier UI (preset dropdown that conditionally reveals detailed controls) requires careful design to avoid a confusing "progressive disclosure" interaction. The transition from preset selection to custom controls must be visually clear.
- Bad, because users in Custom mode may select combinations with platform incompatibilities (e.g., 96 kHz on iOS), requiring per-control validation and inline warnings rather than a simple global preset validation.
- Bad, because future additions to the quality dimensions (e.g., dithering options, filter kernel size) must be integrated into both the preset definitions and the Custom mode UI, increasing maintenance surface.

## More Information

### Relationship to ADR-0003

This ADR extends ADR-0003 without superseding it. ADR-0003's core architecture — 48 kHz AudioContext, WASM-side resampling, dual-path pipeline — remains fully intact. The changes are:

1. The WASM resampler now supports two algorithms (linear and sinc) selectable at runtime, rather than linear-only for real-time and sinc-only for export.
2. The output sample rate can optionally be set to 96 kHz (requiring AudioContext recreation).
3. The S-DSP interpolation mode is configurable (this was already supported by snes-apu-spcp but not previously exposed as a user setting).

ADR-0003's default behavior is preserved exactly as the Standard preset.

### Why Not 192 kHz or 384 kHz Output?

The S-DSP's 32 kHz output has a Nyquist frequency of 16 kHz. At 48 kHz output (3:2 ratio), the reconstruction filter must attenuate the 16–32 kHz image band — a transition band of 16 kHz. At 96 kHz output (3:1 ratio), the image band is at 16–64 kHz — a much wider transition band that allows a gentler filter rolloff, which is the theoretical benefit.

At 192 kHz (6:1 ratio) or 384 kHz (12:1 ratio), the additional transition band width provides negligible further benefit — the filter is already operating far from the signal band at 96 kHz. Meanwhile, CPU cost scales linearly (4× at 192 kHz, 8× at 384 kHz), most browser `AudioContext` implementations do not reliably support rates above 96 kHz, and the additional bandwidth contains no signal energy. The marginal benefit does not justify the CPU cost, implementation complexity, or cross-browser compatibility risk.

Some audiophile users with high-end DACs may desire rates above 96 kHz as part of a "bit-perfect signal chain" philosophy. This could be revisited if browser support for higher `AudioContext` sample rates matures and stabilizes. The current exclusion is driven by practical engineering constraints (unreliable browser support, disproportionate CPU cost), not a rejection of the theoretical value. Users with external DACs receiving system audio output can still benefit meaningfully from 96 kHz, since the browser's output feeds the system mixer and then the external DAC's own reconstruction filter.

### S-DSP Interpolation Mode as a Separate Concern

The distinction between S-DSP interpolation and output resampling is crucial and must be communicated clearly in the UI:

- **S-DSP interpolation** determines how the DSP reads BRR-decoded samples — it affects the spectral content of the 32 kHz output *before* any output resampling occurs. Gaussian is what the SNES hardware does. Linear, cubic, and sinc modes produce a different-sounding output that could be described as "cleaner" or "brighter" but is not authentic. This is an artistic choice, not a quality improvement. Each mode has a distinct frequency response:
  - **Gaussian**: The S-DSP's 512-entry lookup table implements a roughly Gaussian-shaped kernel that acts as a low-pass filter with a -3 dB point around 14 kHz and significant attenuation above 12 kHz. This rolloff is a fundamental part of the "SNES sound" — every game's audio was shaped by this filter.
  - **Linear**: Triangular interpolation with a sinc² frequency response. Better high-frequency extension than Gaussian (less rolloff above 12 kHz), producing a "brighter" sound, but introduces more aliasing from spectral images that are not fully attenuated.
  - **Cubic**: Hermite or B-spline interpolation with fuller mid-range response and better high-frequency preservation than linear. A middle ground that sounds smoother than linear but less authentic than Gaussian.
  - **Sinc**: Approaches ideal band-limited interpolation with a near-flat response to the Nyquist frequency (16 kHz). The "cleanest" sounding option but removes the tonal character that the original hardware imposed on every piece of SPC music.
- **Output resampling** converts the finalized 32 kHz DSP output to the AudioContext sample rate. This is purely a signal processing quality question — sinc resampling is objectively more accurate than linear for preserving the frequency content of the 32 kHz signal. This is a fidelity improvement with a CPU cost tradeoff. However, sinc (Lanczos) output resampling is not without its own tradeoff — see "Sinc Resampling Pre-Ringing Tradeoff" below.

The Custom mode UI must label these accordingly. Suggested label for S-DSP interpolation: "DSP Sample Interpolation (Gaussian = authentic SNES hardware)". Suggested label for output resampling: "Output Resampling Quality".

### Sinc Resampling Pre-Ringing Tradeoff

Windowed sinc resamplers (including Lanczos-3) are linear-phase FIR filters. Linear-phase filters have a symmetric impulse response, which means they produce **pre-ringing** (Gibbs phenomenon) on transient signals — a subtle oscillation *before* a sharp attack. SNES music frequently contains sharp transients from BRR-decoded percussion, staccato instruments, and key-on events, making this artifact relevant to the audiophile persona.

For the 3:2 ratio with a 6-tap Lanczos-3 kernel, pre-ringing duration is very short (~3 samples before the transient) and amplitude is low. It is unlikely to be audible in normal listening conditions but may be detectable on isolated transients through high-quality monitoring equipment.

The tradeoff is:

- **Linear resampling**: introduces aliasing artifacts (folded spectral images) but preserves transient shape perfectly (no pre-ringing).
- **Sinc (Lanczos-3) resampling**: eliminates aliasing but introduces subtle pre-ringing on transients.

A future enhancement could offer a **minimum-phase sinc** variant. Minimum-phase FIR filters concentrate the impulse response energy at the start, eliminating pre-ringing entirely at the cost of introducing phase distortion (group delay varies with frequency). Some audiophile DAC manufacturers offer minimum-phase reconstruction filters as an alternative to linear-phase for this reason. This is not included in the initial implementation — the Lanczos-3 linear-phase kernel is the standard choice — but is noted as a potential Custom mode addition if user feedback indicates demand.

### Resampler Algorithm Switching Mid-Stream

When the user changes between Standard and High Quality presets (or changes the output resampler in Custom mode), the switch must be seamless:

1. The new resampler mode is sent to the AudioWorklet via `MessagePort`.
2. The worklet calls `dsp_set_resampler_mode()` on the WASM instance.
3. The next `dsp_render()` call uses the new algorithm.
4. The fractional sample position accumulator state must be preserved across the switch — both linear and sinc resamplers operate on the same fractional position tracking the sub-sample offset between 32 kHz input and output rate. Resetting the accumulator would cause a phase discontinuity (audible click).

The sinc resampler's FIR kernel is pre-computed at initialization (or on first use) and cached in WASM linear memory. The kernel computation is a one-time cost (~1,000 multiply-adds for a Lanczos-3 kernel with 64 phases × 6 taps = 384 coefficients) that is negligible compared to WASM instantiation time.

### Related Decisions

- [ADR-0001](../../docs/adr/0001-snes-audio-emulation-library.md) — snes-apu-spcp provides the S-DSP interpolation modes (Gaussian, linear, cubic, sinc) exposed in Custom mode.
- [ADR-0003](../../docs/adr/0003-audio-pipeline-architecture.md) — defines the audio pipeline architecture that this ADR extends. The Standard preset reproduces ADR-0003's default configuration exactly.
- [ADR-0005](../../docs/adr/0005-state-management-architecture.md) — the `settings` slice with IndexedDB persistence stores the audio quality settings.
- [ADR-0007](../../docs/adr/0007-wasm-build-pipeline.md) — defines the `dsp_render()` export interface and the `spc-apu-wasm` crate structure where the sinc resampler will be added.
- [ADR-0008](../../docs/adr/0008-wasm-source-language.md) — confirms Rust as the language for the sinc resampler implementation within the `spc-apu-wasm` crate.
