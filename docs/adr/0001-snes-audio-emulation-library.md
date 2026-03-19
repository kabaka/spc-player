---
status: 'accepted'
date: 2026-03-18
---

# Use snes-apu-spcp (Rust) for Sample-Accurate SNES Audio Emulation

## Context and Problem Statement

SPC Player requires an SNES S-DSP emulation core to play SPC music files in the browser. The emulation core must run inside an AudioWorklet as a WebAssembly module, producing real-time 32 kHz PCM audio. Beyond basic playback, the project's target personas (retro audiophiles, musicians, game developers) demand features that go well beyond what a typical SPC player provides: per-voice mute/solo, DSP state introspection for visualization, BRR sample extraction, and real-time ADSR editing.

Should we use an existing library for SNES audio emulation, and if so, which one?

## Decision Drivers

- **High-accuracy S-DSP emulation** — the "retro audiophile" persona requires hardware-faithful rendering, not approximations. Sample-accurate emulation (correct DSP state at each sample boundary) is sufficient for >99% of SPC files; full cycle-accurate accuracy (intra-period DSP scheduling as in bsnes/higan) is not required.
- **Per-voice mute/solo** — 8-voice independent control is a core playback feature.
- **DSP state introspection** — visualization features (envelopes, BRR block position, echo buffer, pitch) require structured access to internal DSP state on every render cycle.
- **BRR sample extraction** — instrument isolation and per-instrument export require decoding raw BRR data from SPC RAM.
- **Real-time ADSR editing** — musicians need to modify envelope parameters during playback and hear the result immediately.
- **WASM compatibility** — the emulation core must compile to WebAssembly (wasm32-unknown-unknown) and run inside an AudioWorklet with no system dependencies.
- **Permissive license** — the project is not GPL-licensed; the emulation library must use a permissive license (MIT, BSD, Apache 2.0, or similar). GPL and LGPL are excluded.
- **Maintainability** — if upstream development ceases, we must be able to fork and maintain the codebase with reasonable effort.
- **Performance** — real-time 32 kHz rendering in an AudioWorklet on mid-range mobile hardware (iOS Safari, Android Chrome).
- **Bundle size** — a small `.wasm` binary is preferred to minimize download size and cache footprint for the PWA.

## Considered Options

- **Option 1: snes-apu-spcp** — Rust S-DSP/SPC700 library from spc-presenter-rs (BSD-2-Clause)
- **Option 2: game-music-emu / snes_spc** — Blargg's C++ SPC library via Emscripten (LGPL-2.1)
- **Option 3: Custom implementation** — purpose-built emulation core in Rust or C++
- **Option 4: bsnes/higan DSP extraction** — byuu's reference DSP code (GPLv3)

## Decision Outcome

Chosen option: **"snes-apu-spcp"**, because it is the only existing library that satisfies all decision drivers out of the box. It provides sample-accurate emulation with per-sample SPC700-DSP synchronization, structured per-voice state introspection (via `ApuStateReceiver` / `ApuChannelState`), built-in voice muting, BRR stream decoding, and multiple interpolation modes — all under a permissive BSD-2-Clause license. Its pure Rust implementation compiles cleanly to WebAssembly via wasm-pack with no system dependencies, and the ~140 KB source codebase is well-structured enough to fork and maintain independently.

Option 2 (game-music-emu) was the runner-up but fails two critical drivers: it lacks DSP state introspection entirely, and its LGPL-2.1 license introduces compliance complexity in a statically-linked WASM context. Option 3 (custom) would satisfy all drivers but at a cost of months of development effort for an already well-solved problem. Option 4 (bsnes DSP) is rejected on license grounds (GPLv3).

### Consequences

- Good, because most advanced features (per-voice mute/solo, visualization, BRR extraction) are supported natively without patching the emulation core.
- Good, because Rust-to-WASM compilation via wasm-pack is a well-supported, first-class toolchain path with zero-copy audio buffer transfer.
- Good, because BSD-2-Clause imposes no copyleft restrictions on the project.
- Good, because the ~140 KB source is well-structured and comprehensible, making fork maintenance feasible.
- Good, because multiple interpolation modes (Gaussian, linear, cubic, sinc) enable the optional "resampling algorithm auditioning" feature from the requirements. Note: only Gaussian interpolation is hardware-authentic; other modes alter the spectral character in ways the original hardware never produced.
- Bad, because the library must be vendored from a monorepo (nununoisy/spc-presenter-rs) rather than consumed as a published crate, adding build pipeline complexity.
- Bad, because the upstream project has a single maintainer and was last committed to in June 2024, creating a dependency risk if bugs are found in upstream code.
- Bad, because the Rust toolchain (rustc, wasm-pack, wasm-bindgen) becomes a build-time dependency, increasing contributor onboarding friction.
- Bad, because real-time ADSR parameter editing requires patching the vendored library to add write access to DSP registers; the `ApuStateReceiver` API provides read-only state introspection, not writeable control.
- Bad, because variable-speed playback (fractional speed control from the requirements) is not exposed in the current API and may require patching the vendored library to adjust the SPC700 CPU clock rate or output sample ratio.

### Confirmation

1. **Build verification** — Vendor the snes-apu-spcp crate and build it with `wasm-pack build --target web` targeting `wasm32-unknown-unknown`. The build must succeed with no system-level dependencies.
2. **Feature verification** — Write an integration test that loads a known SPC file, renders audio, and reads per-voice state via the `ApuChannelState` API. Verify mute/solo toggles silence/isolate individual voices.
3. **Accuracy verification** — Render a suite of reference SPC files and compare output sample-by-sample against known-good reference renders (bsnes output). Rendered output should be audibly indistinguishable from reference and within ±4 LSB in typical passages, with any deviations systematically analyzed and documented.
4. **Performance verification** — Benchmark render performance in an AudioWorklet on mobile Safari (iOS) and Chrome (Android). The emulation must sustain real-time 32 kHz output without audio underruns.
5. **Binary size verification** — Measure the optimized `.wasm` binary size after `wasm-opt -Oz`. Target: under 150 KB.

## Pros and Cons of the Options

### snes-apu-spcp (Rust, via wasm-pack)

A Rust S-DSP and SPC700 emulation library extracted from nununoisy/spc-presenter-rs, itself a fork of emu-rs/snes-apu. Licensed under BSD-2-Clause.

- Good, because it provides sample-accurate SPC700 CPU and S-DSP emulation with per-sample synchronization, faithful to SNES hardware behavior for >99% of SPC files. Full cycle-accurate accuracy (intra-period DSP scheduling as in bsnes/higan) is not verified.
- Good, because the `ApuStateReceiver` trait and `ApuChannelState` struct expose per-voice DSP state (envelope phase, BRR position, pitch, volume) on every render cycle, enabling visualization features with no additional instrumentation.
- Good, because built-in per-voice muting is supported at the DSP level, enabling clean mute/solo without post-processing hacks.
- Good, because it includes a BRR stream decoder, enabling direct extraction of instrument samples from SPC RAM.
- Good, because it supports multiple interpolation modes (Gaussian, linear, cubic, sinc), giving users control over output character. Only Gaussian interpolation is hardware-authentic; other modes are non-standard enhancements.
- Good, because pure Rust with no system dependencies compiles to WASM via wasm-pack with zero platform-specific shims.
- Good, because BSD-2-Clause allows unrestricted use, modification, and distribution.
- Good, because the ~140 KB source codebase is small enough for a single developer to understand and maintain.
- Neutral, because the estimated WASM binary size (~50–100 KB) is comparable to alternatives.
- Bad, because the library is embedded in a monorepo (spc-presenter-rs) and must be vendored rather than consumed from crates.io.
- Bad, because the upstream project has a single maintainer with moderate activity (last commit June 2024).
- Bad, because adopting this library adds the Rust toolchain as a build-time dependency.

### game-music-emu / snes_spc (C++, via Emscripten)

Blargg's widely-used C++ library for playing game music formats, including SPC. The SPC emulation module (snes_spc) can be built standalone. Licensed under LGPL-2.1.

- Good, because it is the most widely deployed and battle-tested SPC playback library, used by chip-player-js, VGMPlay, and many others.
- Good, because it has a proven Emscripten-to-WASM compilation path (chip-player-js demonstrates this).
- Good, because it supports per-voice muting via `gme_mute_voice()`.
- Good, because it has active community maintenance (155+ stars, multiple contributors).
- Neutral, because the estimated WASM binary size (~80–150 KB for SPC-only build) is acceptable but larger than the Rust option.
- Bad, because its SPC700-DSP synchronization is less precise than snes-apu-spcp (batch-based rather than per-sample), which may produce audible differences on edge-case SPC files that depend on tight CPU-DSP timing.
- Bad, because it provides no DSP state introspection: ADSR envelope phase, BRR position, pitch, echo state, and volume envelope are not accessible through any public API.
- Bad, because adding introspection would require significant C++ patching of the internal DSP implementation, creating a hard-to-maintain fork.
- Bad, because LGPL-2.1 imposes dynamic-linking compliance requirements that are ambiguous and burdensome in a statically-linked WASM context.
- Bad, because there is no BRR sample extraction API; implementing one requires understanding internal memory layout.

### Custom implementation (Rust or C++ to WASM)

Build a purpose-written S-DSP and SPC700 emulator designed from the ground up for SPC Player's requirements.

- Good, because the API surface can be designed exactly for our use cases: introspection, mutability, and streaming output.
- Good, because there are no license restrictions — the code is fully owned.
- Good, because there are no upstream dependency risks.
- Good, because well-documented reference implementations (bsnes, snes-apu-spcp) can guide development.
- Bad, because implementing a high-fidelity S-DSP emulator is a significant development effort, estimated at several months of focused work.
- Bad, because the S-DSP has intricate behavior (BRR decoding edge cases, Gaussian interpolation table, echo buffer wrap, envelope counter quirks) where subtle bugs can produce inaudible-until-they're-not accuracy failures.
- Bad, because extensive test infrastructure (per-instruction CPU tests, per-feature DSP tests, full-file output comparison) must be built from scratch.
- Bad, because it delays all downstream features (playback, visualization, export) until the emulation core reaches acceptable fidelity.

### bsnes/higan DSP extraction (C++)

Extract the S-DSP emulation code from byuu's bsnes/higan, widely regarded as the gold standard of SNES emulation accuracy.

- Good, because byuu's DSP code is the most thoroughly verified cycle-accurate implementation in existence.
- Good, because it has been validated against hardware across thousands of test cases.
- Bad, because it is licensed under GPLv3, which is **incompatible** with this project's licensing requirements. This alone disqualifies the option.
- Bad, because the bsnes repository is archived (Near/byuu passed away in 2021) with no active maintainer.
- Bad, because the DSP code is tightly coupled to the broader bsnes architecture, requiring significant refactoring to extract as a standalone library.

## More Information

**Fallback strategy:** If the snes-apu-spcp Rust/wasm-pack integration proves unexpectedly problematic (e.g., wasm-bindgen limitations, AudioWorklet threading issues), Option 2 (game-music-emu via Emscripten) serves as a viable fallback for basic playback. The advanced introspection features would then require either patching game-music-emu's C++ internals or building a supplementary analysis module that reads DSP registers directly from the SPC RAM snapshot.

**Vendoring approach:** The snes-apu-spcp source will be vendored into the project repository under a dedicated directory (e.g., `vendor/snes-apu-spcp/`), preserving the original BSD-2-Clause license and attribution. Any modifications will be tracked as commits in this repository rather than maintained as a separate fork.

**Key upstream references:**

- nununoisy/spc-presenter-rs: source repository containing snes-apu-spcp
- emu-rs/snes-apu: original Rust SPC emulator that snes-apu-spcp is forked from
- blargg's snes_spc: <http://www.slack.net/~ant/libs/audio.html>
- chip-player-js: prior art for game-music-emu compiled to WASM via Emscripten

**Known edge cases for accuracy verification:** The following S-DSP behaviors are known to be timing-sensitive or under-specified in some emulators and should be explicitly verified during confirmation:

- Echo buffer / SPC RAM overlap conflicts (timing-dependent BRR corruption when echo writes collide with BRR reads)
- Key-on sequence (first 5 samples of a voice are muted by hardware; emulator must replicate this)
- Global envelope counter initialization from SPC state snapshot
- BRR filter clamping vs. wrapping behavior at 16-bit boundaries
- Noise LFSR state initialization from the SPC file's DSP register snapshot
- PMON bit 0 (voice 0 pitch modulation has no source voice; the bit is ignored by hardware)
- Output clipping/saturation behavior (hard clip at ±32767, not wrap)

These edge cases are rare in the SPC library but can produce audible artifacts when triggered. Failures in these areas should be documented and tracked for patching.

**Build tooling update**: While this ADR references wasm-pack as the compilation path, [ADR-0007](0007-wasm-build-pipeline.md) subsequently selected `cargo build --target wasm32-unknown-unknown` + `wasm-opt` as the build pipeline, bypassing wasm-pack. The library's WASM compatibility assessment remains valid.

**Related decisions:** This ADR should be revisited if the vendored library fails confirmation criteria (build, accuracy, performance, or binary size). See [ADR-0003](0003-audio-pipeline-architecture.md) for the audio pipeline architecture that connects this emulation core to the Web Audio output path. A follow-up ADR will cover the wasm-bindgen integration strategy and AudioWorklet message protocol design.
