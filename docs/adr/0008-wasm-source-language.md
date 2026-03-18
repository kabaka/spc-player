---
status: "accepted"
date: 2026-03-18
---

# Use Rust as the WASM Source Language for Custom DSP and Audio Processing Modules

## Context and Problem Statement

SPC Player uses WebAssembly for performance-critical audio processing that must run inside an AudioWorklet. ADR-0001 selected snes-apu-spcp, a Rust library, as the S-DSP emulation core. ADR-0007 defines a Rust-to-WASM build pipeline using `cargo build --target wasm32-unknown-unknown` with `wasm-opt` post-processing. ADR-0006 selects pre-compiled Emscripten WASM ports of C reference encoders (libFLAC, libvorbisenc, LAME) for audio export — these are vendored artifacts consumed as npm packages, not code the project authors or compiles.

Beyond the DSP emulation core and the vendored codec libraries, the project must implement several custom WASM modules: the linear and windowed sinc resamplers (ADR-0003), TPDF dithering for float32-to-int16 conversion, the `spc-apu-wasm` wrapper crate that defines the WASM export surface (ADR-0007), and potentially future custom audio processing (BRR decoding utilities, gain/filter DSP for instrument adjustment). These are modules the project authors write and maintain.

What programming language should the project use for these custom WASM modules?

The project currently has two distinct WASM compilation approaches:

1. **Rust → `wasm32-unknown-unknown`** — for the DSP emulation core and custom modules (this ADR's scope)
2. **C → Emscripten** — for vendored codec libraries consumed as pre-compiled npm packages (ADR-0006's scope)

This ADR formalizes the language choice for approach #1 — code the project owns and maintains. The Emscripten codecs are external dependencies outside the project's compilation pipeline and are unaffected by this decision.

## Decision Drivers

- **Toolchain already present** — ADR-0001 mandates the Rust toolchain (rustc, cargo, `wasm32-unknown-unknown` target) as a build dependency because snes-apu-spcp is a Rust library. Any language that reuses this toolchain adds zero incremental toolchain cost; any other language adds a second compilation toolchain to the project's build and CI pipeline.
- **Memory safety for untrusted data** — custom WASM modules process data derived from SPC files, which are untrusted binary input. Buffer overflows, out-of-bounds reads, and use-after-free in audio processing code could produce corrupted output, infinite loops, or WASM traps that kill the AudioWorklet. The source language should make these bugs structurally difficult or impossible.
- **Integration with snes-apu-spcp** — the `spc-apu-wasm` wrapper crate (ADR-0007) bridges snes-apu-spcp's Rust API to the WASM export surface. The resampler and dithering modules are called from this same wrapper crate. Using the same language enables direct function calls and shared type definitions; a different language requires cross-WASM-module calls or a separate WASM binary.
- **WASM binary size** — all custom WASM modules compile into a single `.wasm` binary (the `spc-apu-wasm` crate). ADR-0001 sets a combined binary size target of under 150 KB after `wasm-opt -Oz`. The language's standard library footprint and code generation overhead directly affect this budget.
- **Performance for DSP operations** — resampling, dithering, and BRR decoding are tight numerical loops processing audio at 32–96 kHz in real-time within an AudioWorklet's 2.67ms quantum budget. The language must compile to efficient WASM with predictable performance and no runtime overhead (no GC pauses, no JIT warmup, no dynamic dispatch in hot paths).
- **AudioWorklet compatibility** — the WASM binary runs inside an AudioWorklet with no DOM, no filesystem, no network access. The language must support `#![no_std]` or equivalent bare-metal compilation that produces a self-contained binary with no system imports (ADR-0007 mandates an empty `importObject`).
- **Build pipeline complexity** — ADR-0007 defines a two-tool pipeline (`cargo` + `wasm-opt`). Adding a second WASM source language would require either a second compiler in the pipeline or a polyglot build orchestrator, increasing CI complexity and build times.
- **LLM code generation quality** — this project is developed primarily by LLM agents. The source language must be well-represented in LLM training data with high-quality WASM-targeting examples. Languages with sparse training data or rapidly evolving WASM support produce less reliable generated code.
- **Ecosystem for audio/DSP** — availability of crates, libraries, or packages for audio processing primitives (FIR filters, interpolation, dithering, fixed-point arithmetic) reduces implementation effort.
- **Contributor onboarding friction** — the project already requires TypeScript proficiency and Rust toolchain installation. Each additional language increases the skills barrier for contributors.

## Considered Options

- **Option 1: Rust** — primary WASM source language for all custom modules
- **Option 2: C/C++ via Emscripten** — compile custom modules using the Emscripten toolchain
- **Option 3: AssemblyScript** — TypeScript-like syntax compiling to WASM
- **Option 4: Zig** — systems language with first-class WASM target
- **Option 5: TypeScript only (no custom WASM)** — implement resampling and dithering in JavaScript within the AudioWorklet, using only vendored WASM for the DSP core

## Decision Outcome

Chosen option: **"Rust"**, because it is the only language that satisfies all decision drivers simultaneously. The Rust toolchain is already a mandatory build dependency (ADR-0001), so adopting Rust for custom modules adds zero incremental toolchain cost. Custom modules (resampler, dithering, BRR utilities) compile into the same `spc-apu-wasm` crate as the DSP wrapper, enabling direct function calls with no cross-module marshalling — the resampler is called from `dsp_render()` as a normal Rust function call, not a WASM import. Rust's ownership model and bounds checking prevent the classes of memory corruption bugs most dangerous in untrusted-data audio processing. The `#![no_std]` + `panic = "abort"` configuration (ADR-0007) produces minimal WASM binaries with no standard library bloat. And Rust-to-WASM is extensively represented in LLM training data, producing reliable code generation for numerical processing and FFI patterns.

Option 5 (TypeScript only) was the pragmatic alternative — it eliminates implementation effort in Rust by keeping resampling/dithering in JavaScript. However, it moves computation onto the JavaScript audio thread where GC pauses and JIT deoptimization are uncontrolled risks, and it splits the audio pipeline between two languages and two execution contexts (WASM for DSP, JS for post-processing), complicating debugging and profiling. The performance risk is acceptable for desktop but concerning for mobile, where AudioWorklet quantum budgets are tighter and JavaScript engine performance varies more.

Option 2 (C/C++ via Emscripten) would require installing Emscripten as a build dependency alongside Rust — a second WASM toolchain for code the project owns. The vendored Emscripten codecs from ADR-0006 are pre-compiled npm packages that do not require Emscripten in the build pipeline; writing custom C modules would. This doubles the WASM compilation surface in CI and contradicts the build pipeline simplicity established in ADR-0007.

Option 3 (AssemblyScript) and Option 4 (Zig) each add a new toolchain with no offsetting integration benefit — neither can share a crate with snes-apu-spcp, requiring a separate WASM module with inter-module function calls.

### Consequences

- Good, because zero incremental toolchain cost — the Rust compiler, cargo, and `wasm32-unknown-unknown` target are already required by ADR-0001 and configured in CI by ADR-0007. No new build tools, no new CI steps, no new environment variables.
- Good, because custom modules compile into the existing `spc-apu-wasm` crate as ordinary Rust source files, producing a single `.wasm` binary. The resampler and dithering functions are called directly from the DSP render path with no WASM boundary crossings, no memory copying, and no import/export overhead.
- Good, because Rust's ownership system, borrow checker, and bounds-checked array access prevent buffer overflows, use-after-free, and data races at compile time — the classes of bugs most likely to produce silent audio corruption or AudioWorklet crashes when processing malformed SPC data.
- Good, because `#![no_std]` with `panic = "abort"` (ADR-0007) eliminates the Rust standard library's formatting, I/O, and threading infrastructure from the binary, keeping the resampler and dithering code at near-zero overhead over the algorithm itself.
- Good, because the Rust crates.io ecosystem provides audio/DSP building blocks (`dasp` for sample format conversion, `rubato` as a reference for resampling algorithms, `realfft` for FFT) that can inform or accelerate implementation, even if the project implements its own versions for WASM size control.
- Good, because a single language (Rust) for all project-authored WASM code means one set of coding conventions, one linting configuration (`clippy`), one testing framework (`cargo test`), and one debugging methodology.
- Bad, because contributors must be proficient in both TypeScript (application code) and Rust (WASM modules). The project cannot attract contributors who know only one of these languages for full-stack work. However, the WASM module surface is small (~500–1000 lines of Rust) and the boundary is well-defined, allowing contributors to work on either side independently.
- Bad, because the resampler and dithering algorithms must be implemented in Rust rather than leveraging existing JavaScript DSP libraries (e.g., Web Audio API's built-in filters, or JavaScript signal processing libraries). This is additional implementation effort — though the algorithms involved (linear interpolation, polyphase sinc, TPDF dithering) are well-documented and straightforward to implement.
- Bad, because Rust's compile times are slower than C, Zig, or AssemblyScript for iterative development. A full release build of the `spc-apu-wasm` crate is estimated at 10–30 seconds; debug builds are faster (~5–10 seconds) but produce larger, slower WASM. Incremental compilation mitigates this for small changes.
- Bad, because debugging Rust-compiled WASM requires browser DevTools WASM support (DWARF-based debugging in Chrome) which is less ergonomic than JavaScript debugging, as noted in ADR-0007.

### Confirmation

1. **Single-binary verification** — confirm that the resampler and dithering modules compile into the `spc-apu-wasm` crate's single `.wasm` output with no additional WASM files or import dependencies. Run `wasm-objdump -x` on the optimized binary and verify the import section is empty (consistent with ADR-0007's empty `importObject` requirement).
2. **Binary size verification** — measure the optimized `.wasm` binary size after adding the linear resampler and TPDF dithering to the `spc-apu-wasm` crate. The combined binary (DSP emulation + resampler + dithering) must remain under 150 KB after `wasm-opt -Oz` (per ADR-0001's confirmation criteria).
3. **Performance verification** — benchmark the Rust-implemented linear resampler (32 kHz → 48 kHz, 128-frame output) in isolation. The resampler must complete well within the 2.67ms AudioWorklet quantum budget on mid-range mobile hardware, alongside the DSP emulation. Target: resampler + dithering combined should consume less than 10% of the quantum budget.
4. **Memory safety verification** — run `cargo clippy` with all warnings enabled and `cargo test` with bounds-checking assertions (`debug_assertions`) enabled. Fuzz-test the resampler and dithering with adversarial inputs (NaN, infinity, maximum/minimum sample values, zero-length buffers) to verify no panics or undefined behavior.
5. **Integration verification** — confirm that the `dsp_render()` export (ADR-0007) calls the resampler and dithering as inline Rust function calls, not WASM imports. Inspect the compiled `.wasm` to verify no inter-module call overhead exists between DSP emulation and post-processing.

## Pros and Cons of the Options

### Option 1: Rust

Use Rust for all custom WASM modules. Custom code (resampler, dithering, BRR utilities) is added as modules within the `spc-apu-wasm` wrapper crate (ADR-0007), compiled alongside the snes-apu-spcp dependency into a single `.wasm` binary via `cargo build --target wasm32-unknown-unknown`.

- Good, because the Rust toolchain is already a mandatory build dependency (ADR-0001). Using Rust for custom modules adds zero new tools, zero new CI configuration, and zero new contributor setup steps beyond what is already required.
- Good, because custom modules live in the same crate as the DSP wrapper, enabling direct function calls between the DSP emulator output and the resampler/dithering stages. No WASM import/export overhead, no memory copying between modules, no serialization.
- Good, because Rust's type system catches buffer overflows, null pointer dereferences, and use-after-free at compile time. For code processing untrusted SPC file data in a real-time audio context, this eliminates entire categories of bugs that in C would manifest as silent audio corruption or AudioWorklet crashes.
- Good, because `#![no_std]` compilation (ADR-0007) strips the standard library, producing minimal binary size. Custom numerical code (resampling, dithering) compiles to tight WASM loops with no runtime overhead.
- Good, because Rust-to-WASM is a well-trodden path with extensive LLM training data, producing high-quality code generation for numerical processing, FFI patterns, and `#![no_std]` bare-metal programming.
- Good, because the `crates.io` ecosystem includes audio/DSP crates that provide reference implementations and building blocks, even if the project implements custom versions for size control.
- Neutral, because Rust's compile times (10–30 seconds for release, 5–10 seconds for debug) are acceptable for the small codebase (~500–1000 lines of custom WASM code) but slower than C or Zig for equivalent code.
- Bad, because the project requires contributors to know both TypeScript and Rust — a less common skill combination than TypeScript alone or TypeScript + C.
- Bad, because Rust's learning curve is steeper than C or AssemblyScript for developers unfamiliar with ownership and lifetimes, though the WASM module code is sufficiently simple (numeric processing, no complex ownership graphs) that advanced Rust patterns are rarely needed.

### Option 2: C/C++ via Emscripten

Write custom WASM modules in C or C++, compiled to WASM using Emscripten (emcc/em++). The custom modules would be compiled into a separate `.wasm` binary or linked with the snes-apu-spcp Rust output.

- Good, because C is the lingua franca of systems programming, with the largest pool of developers and the most extensive DSP library ecosystem (FFTW, libsamplerate, SoX resampler).
- Good, because Emscripten is the most mature WASM compilation toolchain, with 10+ years of production use, extensive documentation, and well-understood optimization flags.
- Good, because C produces extremely compact WASM binaries with minimal overhead — no standard library bloat if compiled with `-nostdlib` or equivalent flags.
- Good, because LLM training data for C is vast, and C audio DSP code generation is well-represented.
- Bad, because Emscripten would become a second WASM compilation toolchain in the build pipeline, alongside Rust/cargo. ADR-0006's Emscripten codecs are pre-compiled npm packages that do not require Emscripten installation; writing custom C code would. This adds `emcc` to CI, contributor setup, and the build dependency chain.
- Bad, because C provides no compile-time memory safety guarantees. Buffer overflows, off-by-one errors, and pointer arithmetic mistakes in resampling code would produce silent audio corruption or WASM traps — exactly the class of bugs that are hardest to diagnose in an AudioWorklet context.
- Bad, because custom C modules cannot be compiled into the same WASM binary as the Rust DSP wrapper without complex cross-compilation (compiling C to WASM object files and linking with Rust WASM output via `wasm-ld`). In practice, this means either (a) a separate WASM module with inter-module calls, or (b) converting the entire DSP pipeline to C. Both add significant complexity.
- Bad, because maintaining two WASM build configurations (Rust Makefile/cargo + Emscripten Makefile) doubles the surface area for build-related CI failures.

### Option 3: AssemblyScript

Write custom WASM modules in AssemblyScript, a TypeScript-like language that compiles directly to WebAssembly. AssemblyScript syntax resembles TypeScript but with WASM-native types (`i32`, `f64`, etc.) and no JavaScript runtime.

- Good, because the syntax is familiar to TypeScript developers, reducing the cognitive context-switch between application code and WASM module code. A project contributor fluent in TypeScript can read and modify AssemblyScript with minimal ramp-up.
- Good, because AssemblyScript compiles directly to WASM with no intermediate step — the `asc` compiler produces `.wasm` output comparable in quality to other toolchains for numerical code.
- Good, because AssemblyScript supports bare-metal compilation (`--runtime stub` or `--runtime none`) that produces self-contained WASM binaries with minimal runtime overhead, compatible with the empty `importObject` requirement.
- Bad, because AssemblyScript modules cannot share a compilation unit with the Rust DSP wrapper crate. Custom modules would compile to a separate `.wasm` binary, requiring either (a) instantiating two WASM modules in the AudioWorklet and calling between them via JavaScript dispatch, or (b) merging WASM binaries with `wasm-merge` — both adding complexity and overhead to the hot audio path.
- Bad, because AssemblyScript adds a third toolchain to the project (Rust for DSP, AssemblyScript for custom modules, pre-compiled Emscripten for codecs), increasing CI setup and build orchestration complexity.
- Bad, because AssemblyScript's ecosystem is small compared to Rust or C. Audio/DSP libraries are rare to nonexistent; resampling and dithering would be written from scratch with no reference crates or libraries to lean on.
- Bad, because LLM training data for AssemblyScript is sparse compared to Rust, C, or TypeScript. Code generation quality for WASM-targeting AssemblyScript is less reliable, particularly for numerical processing patterns and bare-metal runtime configuration.
- Bad, because AssemblyScript's type system, while TypeScript-inspired, has significant semantic differences (value types, nullability rules, garbage collection behavior) that create surprising bugs for TypeScript developers who assume identical behavior.

### Option 4: Zig

Write custom WASM modules in Zig, a systems programming language with first-class `wasm32-freestanding` target support, `comptime` metaprogramming, and explicit control over memory allocation.

- Good, because Zig produces very compact WASM binaries — its minimal runtime and lack of hidden allocations result in binaries competitive with or smaller than Rust's `#![no_std]` output.
- Good, because Zig's `wasm32-freestanding` target produces self-contained WASM with no imports, directly compatible with ADR-0007's empty `importObject` requirement.
- Good, because Zig's explicit error handling (no exceptions, no panics, error unions) produces predictable control flow in WASM, avoiding the WASM `unreachable` trap issue that Rust panics create (ADR-0007 consequence).
- Good, because Zig can seamlessly interoperate with C libraries via its built-in C compiler, allowing direct use of C DSP libraries (libsamplerate, etc.) compiled into the same WASM binary without FFI wrappers.
- Bad, because Zig is a third toolchain alongside Rust (for DSP core) and the existing build pipeline. Contributors must install and maintain the Zig compiler in addition to the Rust toolchain — directly contradicting the zero-incremental-toolchain-cost advantage of Rust.
- Bad, because Zig modules cannot be compiled into the same binary as the Rust `spc-apu-wasm` crate. Custom modules would either (a) require a separate WASM binary with inter-module calls, or (b) require rewriting the `spc-apu-wasm` wrapper crate in Zig and interfacing with snes-apu-spcp via C ABI — a significant refactoring effort.
- Bad, because Zig's WASM ecosystem is young. While the compiler target is stable, available libraries, documentation, and community examples for browser-targeted WASM are significantly less mature than Rust's `wasm-bindgen`/`wasm-pack` ecosystem.
- Bad, because LLM code generation for Zig is less reliable than for Rust or C. Zig's relatively small corpus in training data (compared to Rust, C, or TypeScript) produces more errors in generated code, particularly for `wasm32-freestanding` target specifics, `comptime` patterns, and standard library API usage. For an LLM-developed project, this is a material productivity risk.
- Bad, because Zig does not provide the compile-time memory safety guarantees of Rust's ownership model. While it improves on C (safety-checked slices, no undefined behavior by default), it allows unchecked pointer operations and does not prevent use-after-free at compile time.

### Option 5: TypeScript Only (No Custom WASM)

Do not write any custom WASM modules. Implement the resampler and dithering in JavaScript/TypeScript within the AudioWorklet `process()` method. Use the DSP emulation WASM module (snes-apu-spcp via `spc-apu-wasm`) for emulation only — its output is 32 kHz int16 samples that JavaScript code in the worklet converts to 48 kHz float32.

- Good, because it eliminates all custom Rust code beyond the thin `spc-apu-wasm` wrapper crate (ADR-0007). The resampler, dithering, and any audio post-processing are written in TypeScript — the project's primary language — reducing the bilingual skill requirement.
- Good, because TypeScript code is debuggable with standard browser DevTools, source maps, console logging, and breakpoints — far more ergonomic than WASM binary debugging.
- Good, because it enables rapid iteration on audio post-processing algorithms without Rust recompilation. Changing the resampling algorithm requires only a browser refresh, not a `cargo build` + refresh cycle.
- Good, because TypeScript/JavaScript DSP code has adequate LLM training data and produces reliable code generation for numerical processing (typed arrays, `Float32Array`, `Math` intrinsics).
- Bad, because JavaScript execution in AudioWorklet `process()` is subject to garbage collection pauses. Even with careful pre-allocation, V8's minor GC can pause the audio thread for 0.1–2ms — a significant fraction of the 2.67ms quantum budget. Rust/WASM is not subject to GC.
- Bad, because JavaScript JIT compilation produces unpredictable performance. A resampling function may be interpreted for the first few quanta, JIT-compiled to optimized machine code, then deoptimized if the engine encounters an unexpected type — each transition changes execution time. WASM compilation is ahead-of-time and deterministic.
- Bad, because it contradicts ADR-0003's design decision to keep the AudioWorklet `process()` method as a simple buffer copy with no computation. Moving resampling and dithering into JavaScript `process()` adds ~170 multiply-accumulate operations per quantum (86 input samples × 2 channels) plus format conversion — modest computation, but enough to create GC and deoptimization risk.
- Bad, because the resampler's fractional sample position accumulator (ADR-0003's 86-85-85 pattern) requires persistent state across `process()` calls. In JavaScript, this state is a class field on the `AudioWorkletProcessor` — straightforward, but it introduces mutable state on the audio thread that must be managed carefully to avoid drift or discontinuities.
- Bad, because the export pipeline (ADR-0003's offline path) would still need a WASM-compiled sinc resampler for high-quality offline conversion. If the real-time resampler is in JavaScript and the export resampler is in Rust, two implementations of overlapping functionality must be maintained in two languages — the worst outcome for code duplication.

## More Information

### Dual WASM Compilation Approach

After this ADR, the project has two distinct WASM compilation approaches serving different architectural roles:

| Aspect | Rust → `wasm32-unknown-unknown` | C → Emscripten (pre-compiled) |
| ------ | ------------------------------- | ----------------------------- |
| **Scope** | DSP emulation core, resampler, dithering, custom audio processing | Audio export codecs (libFLAC, libvorbisenc, LAME) |
| **Authored by** | This project | External library authors / Emscripten port maintainers |
| **Build responsibility** | Project CI (ADR-0007) | npm package maintainers (ADR-0006) |
| **Build tool** | `cargo` + `wasm-opt` | Emscripten (performed by package maintainer, not project CI) |
| **Runtime context** | AudioWorklet (real-time, 2.67ms budget) | Web Worker (offline export, no real-time constraint) |
| **Binary count** | Single `.wasm` (spc-apu-wasm crate) | One `.wasm` per codec (lazy-loaded per format) |
| **ADRs** | ADR-0001, ADR-0003, ADR-0007, this ADR | ADR-0006 |

This dual-approach is not a compromise — it reflects two genuinely different use cases. The DSP pipeline is project-authored, latency-critical, tightly integrated code that benefits from a single compilation unit and maximal control. The codecs are stable, third-party reference implementations where consuming pre-compiled artifacts is pragmatically superior to compiling from source (as argued in ADR-0006).

### Rust Proficiency Scope

The Rust code surface in this project is intentionally small and constrained:

- **`spc-apu-wasm` wrapper crate** (~200–400 lines): `extern "C"` export functions, allocator setup, FFI boundary (ADR-0007)
- **Linear resampler** (~50–100 lines): fractional sample position accumulator, linear interpolation inner loop
- **Windowed sinc resampler** (~150–300 lines): polyphase FIR filter with pre-computed kernel, used in export path
- **TPDF dithering** (~30–50 lines): triangular probability density function noise generation and int16 quantization
- **BRR utilities** (future, ~100–200 lines): standalone BRR decode/encode for instrument extraction

Total estimated Rust: 500–1000 lines. This is compact enough that a contributor with TypeScript proficiency can learn the necessary Rust subset (numeric types, array slicing, unsafe blocks for FFI, no advanced generics or lifetime annotations) in a focused session. The Rust code does not use complex ownership patterns, async/await, or trait-heavy abstractions — it is essentially C-style numerical processing with type safety bolted on.

### Future Custom WASM Candidates

The following are potential future candidates, not committed scope. They are listed to validate that the Rust choice supports the project's anticipated needs.

- **BRR sample decoder** — standalone extraction of instrument samples from SPC RAM, decoding BRR blocks to PCM (requirements: per-instrument sample export)
- **Gain/filter processing** — real-time gain adjustment and filter cutoff for instrument performance mode (requirements: instrument adjustment within S-DSP constraints)
- **Variable-speed playback** — SPC700 clock rate adjustment for fractional speed control (requirements: playback speed control)
- **Echo buffer visualization data** — structured extraction of FIR coefficients, delay, and feedback state for echo visualization

Each of these is a small module (~50–200 lines) that benefits from compiling into the same `spc-apu-wasm` crate for zero-overhead integration with the DSP core.

### Related Decisions

- [ADR-0001](0001-snes-audio-emulation-library.md) — selected snes-apu-spcp (Rust, BSD-2-Clause), establishing Rust as the de facto DSP language. This ADR formalizes that implicit choice as an explicit project-wide decision for all custom WASM modules.
- [ADR-0003](0003-audio-pipeline-architecture.md) — defines the resampler and dithering as WASM-side responsibilities, creating the concrete custom modules that this ADR's language choice applies to.
- [ADR-0006](0006-audio-codec-libraries.md) — selects pre-compiled Emscripten WASM for audio codecs, establishing the second WASM compilation approach that coexists with the Rust pipeline decided here.
- [ADR-0007](0007-wasm-build-pipeline.md) — defines the `cargo` + `wasm-opt` build pipeline and the `spc-apu-wasm` crate structure. This ADR confirms Rust as the language that populates that crate beyond the snes-apu-spcp wrapper.
