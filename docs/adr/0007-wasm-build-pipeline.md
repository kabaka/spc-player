---
status: "accepted"
date: 2026-03-18
decision-makers: []
consulted: []
informed: []
---

# WASM Build Pipeline: Raw Exports with Cargo and wasm-opt for DSP AudioWorklet Integration

## Context and Problem Statement

ADR-0001 selects snes-apu-spcp (Rust, BSD-2-Clause) as the SNES audio emulation library. ADR-0003 defines the audio pipeline architecture: the main thread compiles the `.wasm` binary into a `WebAssembly.Module`, transfers it to the AudioWorklet via `postMessage`, and the worklet instantiates the module in its own execution context. Pre-allocated buffers in WASM linear memory enable zero-allocation `process()` calls. ADR-0006 selects pre-compiled Emscripten WASM ports of C reference encoders (libFLAC, libvorbisenc, LAME) for audio export.

The project now needs to define the concrete WASM build pipeline for the DSP emulation core: how Rust source becomes a `.wasm` binary, how that binary is loaded and instantiated inside an AudioWorklet, how the JS-WASM boundary is managed, and how all of this integrates with Vite and GitHub Actions CI.

The core tension is between **wasm-bindgen** (which generates JavaScript glue code to handle type conversion, memory management, and error propagation across the JS-WASM boundary) and **raw WASM exports** (where the Rust code exports plain `extern "C"` functions that JavaScript calls directly through `WebAssembly.Instance.exports`). wasm-bindgen adds convenience for general-purpose web applications, but its generated glue code introduces compatibility questions in the constrained AudioWorklet environment — no DOM, no `fetch()`, no guaranteed ES module import support across all browsers.

This ADR also addresses five sub-decisions that are tightly coupled to the interop strategy: build tool selection, AudioWorklet loading mechanics, Vite integration, wasm-opt optimization, and CI configuration.

## Decision Drivers

- **AudioWorklet compatibility** — the DSP WASM module runs exclusively inside an AudioWorklet, which has no DOM, no `fetch()`, no `importScripts()`, and limited ES module import support across browsers. Any generated glue code must function in this environment without modification.
- **Simplicity of WASM instantiation in worklet** — the worklet receives a compiled `WebAssembly.Module` via `postMessage` (per ADR-0003). Instantiation should use the platform primitive `WebAssembly.instantiate(module, importObject)` with minimal ceremony.
- **Type safety at the JS-WASM boundary** — the TypeScript wrapper around WASM exports must provide type-safe function signatures to prevent misuse (wrong argument types, wrong buffer offsets, missing initialization calls).
- **Build reproducibility and CI integration** — the build must produce identical artifacts from the same source, with a clear dependency chain (Rust toolchain version, wasm-opt version) that CI can install and cache reliably.
- **Developer experience** — editing Rust DSP code and testing changes in the browser should have a reasonable feedback loop. Hot reload of WASM is not expected, but a rebuild-and-refresh cycle should take seconds, not minutes.
- **Production binary size** — the `.wasm` artifact directly affects PWA download size and cache footprint. ADR-0001 sets a target of under 150 KB after optimization. wasm-opt integration is essential for production builds.
- **Compatibility with the Module-transfer pattern** — the loading flow defined in ADR-0003 (compile in main thread → transfer Module → instantiate in worklet) must work without modification. The interop strategy must not assume the module is instantiated in the same context where it was compiled.
- **Maintenance burden of glue code** — generated glue code must be audited for AudioWorklet compatibility after every wasm-bindgen version upgrade. Hand-written wrappers are more work up front but fully controlled and stable across toolchain upgrades.
- **Coexistence with Emscripten WASM artifacts** — ADR-0006 introduces pre-compiled Emscripten WASM modules for audio codecs. The DSP build pipeline must coexist cleanly: two distinct WASM origins (Rust/cargo and Emscripten/pre-compiled) with separate loading paths and no toolchain conflicts.

## Considered Options

- **Option 1: wasm-bindgen with `--target web`** — Rust compiled via cargo, post-processed by wasm-bindgen CLI to generate an ES module glue layer with an `init()` function that accepts a `WebAssembly.Module`
- **Option 2: wasm-bindgen with `--target no-modules`** — same compilation, but wasm-bindgen generates a standalone JavaScript glue file without ES module syntax
- **Option 3: Raw WASM exports (no wasm-bindgen)** — Rust compiled via cargo targeting `wasm32-unknown-unknown`, exporting `#[no_mangle] extern "C"` functions; hand-written TypeScript wrapper provides the typed API
- **Option 4: wasm-pack** — high-level tool that wraps cargo, wasm-bindgen, and wasm-opt into a single `wasm-pack build` command

## Decision Outcome

Chosen option: **"Raw WASM exports (no wasm-bindgen)"**, because the DSP emulation interface is a narrow, numeric-only API (~10–15 exported functions passing integers, floats, and memory offsets) that does not benefit from wasm-bindgen's type conversion machinery, and the AudioWorklet environment eliminates the primary advantages of generated glue code while introducing compatibility risks. Raw exports produce the simplest possible instantiation path — a single `WebAssembly.instantiate(module, {})` call in the worklet — with zero generated code to audit, debug, or maintain across toolchain upgrades. The hand-written TypeScript wrapper that mirrors these exports is small, stable, and provides equivalent type safety for the narrow interface surface.

Option 1 (wasm-bindgen `--target web`) was the closest alternative. Its `init()` function can accept a `WebAssembly.Module` directly, bypassing `fetch()`. However, the generated glue code is an ES module that must be bundled into the AudioWorklet script — requiring Vite to resolve and inline the wasm-bindgen output into the worklet entry point. This is feasible but adds a fragile dependency on Vite's worklet bundling behavior and on wasm-bindgen's generated code remaining AudioWorklet-compatible across versions. The type-safety benefit is real but insufficient to justify the integration complexity, given the narrow interface.

Option 2 (`--target no-modules`) avoids ES module syntax but generates a global-scope glue script designed for `<script>` tag inclusion, which is architecturally misaligned with an AudioWorklet context. Option 4 (wasm-pack) is a build orchestration wrapper that internally uses wasm-bindgen — it inherits the same AudioWorklet compatibility concerns as Options 1/2 while adding an additional tool to the dependency chain.

### Build Toolchain

The build pipeline for the DSP WASM module uses `cargo` directly with `wasm-opt` as a separate post-processing step:

1. **Compile**: `cargo build --target wasm32-unknown-unknown --release -p spc-apu-wasm`
2. **Optimize**: `wasm-opt -Oz -o dist/dsp.wasm target/wasm32-unknown-unknown/release/spc_apu_wasm.wasm`

The `-Oz` flag optimizes aggressively for binary size. This two-step pipeline is implemented as an npm script (`npm run build:wasm`) that the main `npm run build` invokes before Vite processes the application source.

wasm-pack is not used because it assumes wasm-bindgen post-processing — its value proposition (orchestrating cargo + wasm-bindgen + wasm-opt) does not apply when wasm-bindgen is excluded.

### Rust Crate Structure

A thin wrapper crate (`spc-apu-wasm`) sits between the vendored `snes-apu-spcp` library and the WASM boundary:

```
vendor/
  snes-apu-spcp/       # Vendored Rust library (BSD-2-Clause, per ADR-0001)
crates/
  spc-apu-wasm/        # Wrapper crate — defines WASM exports
    Cargo.toml          # depends on snes-apu-spcp, crate-type = ["cdylib"]
    src/
      lib.rs            # #[no_mangle] extern "C" exports
```

The wrapper crate:
- Sets `crate-type = ["cdylib"]` to produce a standalone `.wasm` binary.
- Configures `panic = "abort"` and `opt-level = "z"` in the release profile.
- Imports `snes-apu-spcp` as a path dependency.
- Exports a flat C-ABI surface: `dsp_init`, `dsp_render`, `dsp_set_voice_mask`, `dsp_get_voice_state`, `dsp_alloc_spc_buffer`, `dsp_get_output_ptr`, etc.
- Exposes allocator functions (`wasm_alloc`, `wasm_dealloc`) for the main thread to write SPC data into WASM linear memory before transferring the module to the worklet.
- Uses `#![no_std]` with `dlmalloc` (the default allocator for `wasm32-unknown-unknown`) to minimize binary size. Standard library features (formatting, collections) are not needed in the DSP hot path.

### WASM Export Interface

The exported functions use C-ABI naming and pass only primitive types (integers, floats) and memory offsets (pointers into WASM linear memory). The following examples are **illustrative, not exhaustive** — the complete export surface is defined by the TypeScript `DspExports` interface below:

```rust
#[no_mangle]
pub extern "C" fn dsp_init(spc_data_ptr: *const u8, spc_data_len: u32) -> i32;

#[no_mangle]
pub extern "C" fn dsp_render(output_ptr: *mut f32, num_frames: u32) -> i32;

#[no_mangle]
pub extern "C" fn dsp_set_voice_mask(mask: u8);

#[no_mangle]
pub extern "C" fn dsp_get_register(addr: u8) -> u8;

#[no_mangle]
pub extern "C" fn wasm_alloc(size: u32) -> *mut u8;

#[no_mangle]
pub extern "C" fn wasm_dealloc(ptr: *mut u8, size: u32);
```

No strings, no complex objects, no closures cross the boundary. Error conditions are reported via integer return codes (0 = success, negative = error category). This eliminates wasm-bindgen's primary value proposition (rich type conversions) while making the boundary trivially auditable.

### AudioWorklet WASM Loading Strategy

The loading flow implements ADR-0003's Module-transfer pattern in concrete detail:

**Main thread (application startup):**

```typescript
// 1. Fetch and compile WASM (compileStreaming uses streaming compilation
//    for faster startup than fetch → arrayBuffer → compile)
const wasmModule = await WebAssembly.compileStreaming(
  fetch(dspWasmUrl)  // dspWasmUrl from Vite's ?url import with content hash
);

// 2. Register the AudioWorklet processor script
await audioContext.audioWorklet.addModule(workletUrl);

// 3. Create the AudioWorkletNode
const node = new AudioWorkletNode(audioContext, 'spc-processor', {
  numberOfInputs: 0,
  numberOfOutputs: 1,
  outputChannelCount: [2],
});

// 4. Transfer the compiled Module and SPC data to the worklet
node.port.postMessage(
  { type: 'init', wasmModule, spcData: spcDataArray },
  [spcDataArray.buffer]  // Transfer the SPC ArrayBuffer (zero-copy)
);
```

**AudioWorklet processor (`spc-worklet.ts`):**

```typescript
// Receive the compiled Module — no fetch, no import, no DOM
case 'init': {
  // importObject is empty: the Rust crate uses #![no_std] with panic=abort,
  // producing no env imports. The wasm32-unknown-unknown target does not
  // generate WASI or Emscripten imports.
  const instance = await WebAssembly.instantiate(msg.wasmModule, {});
  const exports = instance.exports as DspExports;

  // Allocate space in WASM memory for SPC data (64 KB + headers)
  const spcPtr = exports.wasm_alloc(msg.spcData.byteLength);
  const wasmMemory = new Uint8Array(
    (exports.memory as WebAssembly.Memory).buffer
  );
  wasmMemory.set(new Uint8Array(msg.spcData), spcPtr);

  // Initialize the DSP emulator with the SPC snapshot
  exports.dsp_init(spcPtr, msg.spcData.byteLength);

  // Cache the output buffer pointer (pre-allocated in WASM linear memory)
  this.outputPtr = exports.dsp_get_output_ptr();
  this.wasm = exports;
  break;
}
```

The `importObject` is `{}` because:
- `wasm32-unknown-unknown` + `#![no_std]` + `panic = "abort"` produces a self-contained WASM binary with no imported functions.
- Panics compile to the `unreachable` WASM instruction, which traps and terminates the instance. No `env.abort` or similar import is needed.
- The Rust code performs no I/O and no system calls.

This is the simplest possible instantiation path: one function call, no import resolution, no glue code initialization.

### Vite Integration

WASM and worklet assets integrate with Vite using standard asset import patterns — no WASM-specific Vite plugin is required:

**WASM file (`dsp.wasm`):**
- The optimized `.wasm` file is placed in `src/wasm/` (or `public/wasm/` for the simplest approach).
- Imported via `import dspWasmUrl from './wasm/dsp.wasm?url'` — Vite resolves this to the final asset path with content-based hash for cache busting (e.g., `/assets/dsp-a1b2c3d4.wasm`).
- The `?url` suffix tells Vite to treat the file as a static asset and return its URL, not attempt to parse it as a module.
- Alternatively, the `.wasm` file can be placed in `public/` and fetched by a known path — this avoids the `?url` import but loses automatic content hashing.

**AudioWorklet script (`spc-worklet.ts`):**
- Imported via `new URL('./audio/spc-worklet.ts', import.meta.url)` — Vite resolves and bundles the worklet script as a separate entry point with content-based hashing.
- The worklet script must be a self-contained module: no imports from the main application bundle (AudioWorklet isolation). Shared types are duplicated or extracted into a types-only module that Vite tree-shakes to zero runtime code.

**Dev vs. Production:**
- **Development**: `npm run build:wasm:dev` compiles with `cargo build --target wasm32-unknown-unknown` (debug profile, no wasm-opt). The unoptimized `.wasm` is larger (~500 KB–1 MB) but builds in seconds and includes DWARF debug info accessible via browser WASM debugging tools.
- **Production**: `npm run build:wasm` compiles with `--release` and runs `wasm-opt -Oz`. The optimized `.wasm` targets under 150 KB (per ADR-0001 confirmation criteria).

**Build Order:**
1. `npm run build:wasm` — produces `dist/dsp.wasm` (or `src/wasm/dsp.wasm` depending on pipeline)
2. `npm run build` — Vite processes the application, discovers `dsp.wasm` via `?url` import, copies it to the output directory with content hash

The WASM build must complete before Vite processes the application source. The `build` npm script chains these: `"build": "npm run build:wasm && vite build"`.

### wasm-opt Integration

wasm-opt (from the Binaryen toolkit) performs production optimization on the compiled `.wasm` binary:

- **Flag**: `-Oz` (optimize aggressively for size). This is preferred over `-Os` (optimize for size, less aggressively) because the DSP module's performance is CPU-bound on the emulation logic, not on wasm-opt optimization pass choices — both `-Os` and `-Oz` produce negligible runtime performance differences for this workload, but `-Oz` produces smaller binaries.
- **Pipeline**: runs after `cargo build --release`, operating on the raw cargo output before Vite ingests the asset.
- **Dev builds**: wasm-opt is skipped for faster iteration. Development builds use cargo's debug profile directly.
- **Installation**: wasm-opt is installed via `npm install --save-dev binaryen` (provides the `wasm-opt` binary via npm) or via system package manager. The npm approach is preferred for CI reproducibility — pinned to a specific version in `package.json`.

### CI Build Configuration

GitHub Actions workflow additions for WASM compilation:

```yaml
- name: Install Rust toolchain
  uses: dtolnay/rust-toolchain@stable
  with:
    targets: wasm32-unknown-unknown

- name: Cache Rust compilation
  uses: Swatinem/rust-cache@v2
  with:
    workspaces: "crates/spc-apu-wasm -> target"

- name: Build WASM (release)
  run: cargo build --target wasm32-unknown-unknown --release -p spc-apu-wasm

- name: Optimize WASM
  run: npx wasm-opt -Oz -o src/wasm/dsp.wasm target/wasm32-unknown-unknown/release/spc_apu_wasm.wasm
```

The Rust toolchain and compiled artifacts are cached via `Swatinem/rust-cache` to avoid recompilation when only TypeScript source changes. The `wasm32-unknown-unknown` target is installed alongside the stable Rust toolchain.

Build order in CI: install dependencies → build WASM → lint/typecheck → test → Vite build → deploy.

### Consequences

- Good, because `WebAssembly.instantiate(module, {})` in the worklet is the simplest possible instantiation path — no glue code initialization, no import resolution, no compatibility concerns across browser AudioWorklet implementations.
- Good, because the empty `importObject` eliminates an entire class of bugs (missing imports, import signature mismatches, imports that reference APIs unavailable in AudioWorklet context).
- Good, because no generated code means no toolchain-upgrade risk — upgrading the Rust compiler or any build tool cannot break the JS-WASM interop layer. The WASM export surface is defined by `#[no_mangle] extern "C"` in Rust and a hand-written TypeScript interface, both fully within the project's control.
- Good, because the build pipeline (`cargo build` + `wasm-opt`) has exactly two tools, both with stable CLIs and straightforward CI integration. No wasm-bindgen CLI version to coordinate with the `wasm-bindgen` crate version.
- Good, because the DSP WASM module and the Emscripten codec WASM modules (ADR-0006) have completely separate build pipelines — the DSP uses `cargo` + `wasm-opt`, the codecs are pre-compiled npm packages. No toolchain conflicts, no shared build state, clear separation of concerns.
- Good, because `#![no_std]` with a minimal allocator produces the smallest possible binary — no Rust standard library bloat, no wasm-bindgen runtime, no generated descriptor sections.
- Good, because Vite's `?url` import provides content-based hashing for cache busting with zero plugin configuration.
- Bad, because the TypeScript wrapper for WASM exports (~10–15 functions) must be authored and maintained by hand. If the Rust export surface changes, the TypeScript interface must be updated manually — there is no compile-time check that the two are in sync.
- Bad, because Rust panics in the DSP code produce WASM `unreachable` traps that silently kill the AudioWorklet instance. There is no automatic panic-to-exception bridge. Because the release profile uses `panic = "abort"`, `std::panic::catch_unwind` is a no-op and cannot be used for recovery. The mitigation strategy is **panic prevention, not panic recovery**: all panic-prone code paths in the Rust wrapper must use exhaustive input validation and safe arithmetic (`checked_add`, `saturating_mul`, etc.) to prevent panics entirely.
- Bad, because the Rust toolchain (`rustc`, `wasm32-unknown-unknown` target) becomes a CI and developer build dependency, increasing contributor onboarding friction (as noted in ADR-0001).
- Bad, because the allocator functions (`wasm_alloc`, `wasm_dealloc`) must be manually exported and correctly used by the JavaScript caller — memory leaks or double-frees are possible if the JS wrapper mismanages allocations. This risk is mitigated by the pre-allocation strategy from ADR-0003: all persistent buffers are allocated once at initialization and never freed during the module's lifetime.
- Bad, because WASM debugging requires browser DevTools WASM support (Chrome's DWARF-based WASM debugging, available since Chrome 93). The debugging experience is less ergonomic than JavaScript — no console.log from Rust without wasm-bindgen's `web_sys::console` bindings.

### Confirmation

1. **Build verification** — run `cargo build --target wasm32-unknown-unknown --release -p spc-apu-wasm` and `wasm-opt -Oz` on the output. Verify the pipeline produces a valid `.wasm` binary with the expected exports (`dsp_init`, `dsp_render`, `dsp_set_voice_mask`, `dsp_get_output_ptr`, `wasm_alloc`, `wasm_dealloc`, `memory`).
2. **Empty importObject verification** — instantiate the optimized `.wasm` binary with `WebAssembly.instantiate(module, {})` in a test. Verify instantiation succeeds with no import-related errors. If the Rust code inadvertently introduces imports (e.g., via a dependency that uses `extern` functions), the build pipeline must detect and fail.
3. **AudioWorklet integration test** — create an end-to-end test that loads an SPC file, compiles the WASM module in the main thread, transfers it to an AudioWorklet via `postMessage`, instantiates it in the worklet, renders one quantum of audio, and verifies non-silent output. This validates the complete Module-transfer flow from ADR-0003.
4. **Binary size verification** — measure the optimized `.wasm` binary size. Target: under 150 KB (per ADR-0001 confirmation criteria).
5. **TypeScript type consistency** — write a build-time script or CI step that parses the `.wasm` binary's export section (via `wasm-tools` or a custom script) and compares it against the TypeScript `DspExports` interface. Any mismatch (missing export, wrong signature) fails CI.
6. **Dev build cycle time** — measure the time from Rust source change to browser-testable result (cargo build + manual browser refresh). Target: under 10 seconds on a modern development machine.
7. **Vite asset hashing** — verify that the production Vite build produces a content-hashed WASM file path (e.g., `dsp-a1b2c3d4.wasm`) and that the application correctly fetches it at runtime.

## Pros and Cons of the Options

### Option 1: wasm-bindgen with `--target web`

Compile Rust with cargo, then post-process the `.wasm` with the wasm-bindgen CLI using `--target web`. This generates an ES module (`.js`) that provides a typed JavaScript API for the WASM exports, along with a modified `.wasm` file. The generated `init()` function accepts a `WebAssembly.Module`, `URL`, `Request`, or `BufferSource`, enabling flexible instantiation. When passed a pre-compiled `Module`, it skips `fetch()` and directly instantiates — compatible in principle with AudioWorklet.

- Good, because generated TypeScript bindings automatically mirror the Rust exported function signatures, providing compile-time type checking at the JS-WASM boundary with zero manual wrapper code.
- Good, because `init(module: WebAssembly.Module)` accepts a pre-compiled Module directly, which is compatible with the Module-transfer pattern from ADR-0003 — the worklet can call `init(receivedModule)` without `fetch()`.
- Good, because wasm-bindgen handles panic hook installation (`console_error_panic_hook`), converting Rust panics to JavaScript exceptions with stack traces — invaluable for debugging DSP emulation bugs during development.
- Good, because wasm-bindgen manages `TextEncoder`/`TextDecoder`, closures, and complex type conversions, which could be useful if the WASM API surface expands beyond numeric types in the future (e.g., returning error messages as strings).
- Good, because wasm-pack (Option 4) can orchestrate wasm-bindgen + wasm-opt in a single command, reducing build script complexity.
- Neutral, because the generated `.wasm` file is slightly larger than raw cargo output due to wasm-bindgen descriptor sections, but wasm-opt removes most of this overhead.
- Bad, because the generated ES module glue code must be loaded in the AudioWorklet context. AudioWorklet scripts are loaded via `audioWorklet.addModule()`, which supports ES module syntax — but importing additional modules from within a worklet module is not universally supported across browsers. The glue code would need to be bundled into the worklet script by Vite, adding a dependency on Vite's worklet bundling behavior.
- Bad, because the generated glue code is opaque — it is machine-generated JavaScript that must be audited for AudioWorklet-incompatible API usage (e.g., `document`, `window`, `fetch`, `URL`, `TextEncoder` — some of which exist in worklet scope, some do not, and this varies across browsers). Every wasm-bindgen version upgrade requires re-auditing.
- Bad, because wasm-bindgen CLI version must be kept in sync with the `wasm-bindgen` crate version in `Cargo.toml`. Version mismatches produce cryptic errors at link time. This creates a coordination burden in CI and across developer machines.
- Bad, because the generated code includes a runtime (`wbg` object) with memory management helpers, closure table management, and heap-object reference counting — none of which are needed for a numeric-only DSP interface, adding dead code to the worklet bundle.

### Option 2: wasm-bindgen with `--target no-modules`

Same Rust compilation and wasm-bindgen post-processing as Option 1, but generates a standalone JavaScript file (no ES module syntax) that attaches exports to a global object or a provided initialization function. Designed for `<script>` tag inclusion in HTML documents.

- Good, because no ES module syntax means no import resolution concerns — the glue code is a self-contained script.
- Good, because it provides the same TypeScript type generation and panic hook support as Option 1.
- Bad, because `--target no-modules` is designed for `<script>` tag contexts, not AudioWorklet contexts. The generated code assigns to global variables (`wasm_bindgen = Object.assign(...)`) which is architecturally misaligned with AudioWorklet's module-based execution model.
- Bad, because it must be loaded via `importScripts()` in a traditional Worker — but AudioWorklet does not support `importScripts()`. It uses `addModule()` exclusively, which expects ES module syntax. Loading `no-modules` output in an AudioWorklet requires wrapping it in an ES module adapter or embedding it inline — both are fragile workarounds.
- Bad, because `--target no-modules` is the least-maintained wasm-bindgen target — community attention and testing focus on `--target web` and `--target bundler`. Edge cases and bugs in `no-modules` may go unfixed longer.
- Bad, because global-scope pollution (attaching to `self` or `globalThis`) in an AudioWorklet can interfere with the worklet's own global registration mechanism (`registerProcessor`).

### Option 3: Raw WASM exports (no wasm-bindgen)

Compile Rust with `cargo build --target wasm32-unknown-unknown`, producing a standard `.wasm` binary with no post-processing by wasm-bindgen. The Rust source exports `#[no_mangle] pub extern "C"` functions that appear directly as exports in the WASM module. A hand-written TypeScript interface defines the typed API. Post-process with `wasm-opt` for production size optimization.

- Good, because `WebAssembly.instantiate(module, {})` is the simplest possible instantiation path — one function call, no initialization sequence, no glue code setup. This is the web platform primitive for WASM instantiation, supported identically in every context (main thread, Worker, AudioWorklet, ServiceWorker).
- Good, because the empty `importObject` eliminates an entire class of integration bugs: no missing imports, no import signature mismatches, no imports that reference APIs unavailable in AudioWorklet.
- Good, because there is zero generated code — the JavaScript-to-WASM interface is fully defined by hand-written Rust (`extern "C"` exports) and hand-written TypeScript (`DspExports` interface). Both are under the project's direct control, auditable, and stable across toolchain upgrades.
- Good, because the build pipeline has exactly two tools (`cargo` and `wasm-opt`) with no version-coordination requirements between them. `cargo` produces a valid `.wasm`; `wasm-opt` optimizes it. Neither tool is aware of the other.
- Good, because `#![no_std]` with a minimal allocator and no wasm-bindgen runtime produces the smallest possible binary — no std library formatting, no closure tables, no heap-object descriptors, no `TextDecoder` polyfills.
- Good, because the DSP interface is a narrow, numeric-only API (~10–15 functions passing `u8`, `u32`, `f32`, and pointers into linear memory). This interface does not benefit from wasm-bindgen's string conversion, closure passing, or JavaScript object interop — making the tool's primary features irrelevant while still paying its complexity cost.
- Neutral, because allocator functions (`wasm_alloc`, `wasm_dealloc`) must be explicitly exported for the main thread to write SPC data into WASM memory. With wasm-bindgen, allocation is handled by the generated runtime — with raw exports, it is the project's responsibility. This is a small amount of additional Rust code (~10 lines) but requires correct JavaScript usage.
- Bad, because Rust panics produce WASM `unreachable` traps that silently terminate the AudioWorklet instance. There is no automatic panic-to-exception bridge. With `panic = "abort"` in the release profile, `catch_unwind` is a no-op — panics must be prevented entirely via exhaustive input validation and safe arithmetic. Debugging panics requires WASM-level debugging tools.
- Bad, because the TypeScript `DspExports` interface must be manually kept in sync with the Rust export surface. Adding or changing an exported function in Rust requires a corresponding manual update to the TypeScript interface — there is no compile-time cross-language check (though CI validation can detect drift).
- Bad, because logging from Rust requires explicitly importing a `log` function in the WASM module's `importObject` (breaking the empty-importObject simplicity) or using a debug build with wasm-bindgen for development only. In practice, the DSP module is sufficiently isolated that printf-style debugging is rare — register dumps and buffer inspections are more effective.

### Option 4: wasm-pack (wrapping wasm-bindgen + wasm-opt)

wasm-pack is a command-line tool that orchestrates the full Rust-to-WASM pipeline: it invokes `cargo build`, runs `wasm-bindgen` for JS glue generation, and optionally runs `wasm-opt` for binary size optimization. A single `wasm-pack build --target web` command produces a ready-to-deploy package with `.wasm`, `.js` glue, and TypeScript `.d.ts` declarations.

- Good, because a single command (`wasm-pack build`) replaces a multi-step build script, reducing build pipeline complexity for projects that use wasm-bindgen.
- Good, because it automatically aligns wasm-bindgen CLI and crate versions, eliminating the version-mismatch bugs that plague manual wasm-bindgen installations.
- Good, because it generates a `package.json` and TypeScript declarations suitable for publishing to npm — useful if the WASM module were distributed as a standalone package (not applicable here since it is an internal build artifact).
- Good, because the `wasm-pack test` subcommand enables headless browser testing of WASM code, which could complement the project's existing Playwright E2E tests.
- Bad, because wasm-pack is an additional tool dependency on top of cargo, with its own version, installation, and update lifecycle. It must be installed in CI and on developer machines.
- Bad, because wasm-pack wraps wasm-bindgen — it inherits all of wasm-bindgen's AudioWorklet compatibility concerns (see Option 1). Choosing wasm-pack does not eliminate the need to evaluate wasm-bindgen's glue code for worklet safety; it merely automates its execution.
- Bad, because wasm-pack's build output structure (pkg/ directory with package.json, .js, .wasm, .d.ts) is designed for npm package publishing, not for integration as an internal build artifact in a Vite application. The output must be adapted (copied, renamed, restructured) to fit the Vite asset pipeline.
- Bad, because when wasm-bindgen is not needed (this ADR's recommended path), wasm-pack's orchestration adds no value — it is a wrapper around a tool that is not being used.
- Bad, because wasm-pack's development has slowed — it was last updated in late 2024, and some of its assumptions (e.g., npm publishing workflow, webpack-centric output) are showing age relative to modern Vite-based build pipelines.

## More Information

### TypeScript WASM Export Interface

The hand-written TypeScript interface provides type-safe access to the raw WASM exports:

```typescript
interface DspExports {
  memory: WebAssembly.Memory;

  // Lifecycle
  dsp_init(spcDataPtr: number, spcDataLen: number): number;
  dsp_reset(): void;

  // Rendering (called from process())
  dsp_render(outputPtr: number, numFrames: number): number;
  dsp_get_output_ptr(): number;

  // Voice control
  dsp_set_voice_mask(mask: number): void;
  dsp_get_voice_state(voiceIndex: number, statePtr: number): number;

  // DSP register access
  dsp_get_register(addr: number): number;
  dsp_set_register(addr: number, value: number): void;

  // Memory management
  wasm_alloc(size: number): number;
  wasm_dealloc(ptr: number, size: number): void;
}
```

This interface is small (~15 methods), stable (the DSP API surface changes infrequently), and trivially auditable. A CI validation step can parse the `.wasm` binary's export section and compare it to this interface to detect drift.

### Debug Logging in Development

Without wasm-bindgen, there is no built-in path from Rust `println!` to the browser console. Two strategies address this:

1. **Import-based logging** (development only): add a `log` function to the `importObject` that the Rust code calls via `extern "C"`. This breaks the empty-importObject property but only in debug builds:

   ```typescript
   const importObject = {
     env: {
       log_value: (code: number, value: number) => {
         console.log(`[DSP] code=${code} value=${value}`);
       },
     },
   };
   ```

   The Rust side conditionally compiles the import (`#[cfg(debug_assertions)]`), so release builds produce zero imports and maintain the empty-importObject guarantee.

2. **Post-hoc inspection**: read DSP register values and buffer contents from JavaScript by creating typed array views over WASM memory after each render call. This does not require any WASM imports and works identically in debug and release builds.

Strategy 2 is preferred for routine debugging. Strategy 1 is available for deep investigation.

### Coexistence with Emscripten WASM Modules

The project produces two kinds of WASM artifacts:

| Artifact | Source | Toolchain | Context | Loading |
| -------- | ------ | --------- | ------- | ------- |
| DSP emulation (`dsp.wasm`) | Rust (snes-apu-spcp) | cargo + wasm-opt | AudioWorklet | Module-transfer via postMessage |
| Audio encoders (FLAC, Vorbis, MP3) | C (libFLAC, libvorbisenc, LAME) | Emscripten (pre-compiled npm packages) | Web Worker | Dynamic `import()` per format |

These two categories have completely separate build pipelines, loading mechanisms, and execution contexts:

- The DSP module is built from Rust source in the project repository. Its build runs as part of `npm run build`. It executes in an AudioWorklet.
- The encoder modules are pre-compiled by package maintainers and consumed as npm runtime dependencies. They are not built by the project. They execute in a Web Worker (not AudioWorklet).

No toolchain conflicts arise because the DSP build uses cargo (Rust) and the encoder packages are pre-compiled (Emscripten is not installed in the project's environment). If a pre-compiled encoder package ever needs to be rebuilt from source (per ADR-0006's risk mitigation), Emscripten would be installed for that one-time operation, not as a permanent build dependency.

### npm Scripts

```json
{
  "scripts": {
    "build:wasm": "cargo build --target wasm32-unknown-unknown --release -p spc-apu-wasm && npx wasm-opt -Oz -o src/wasm/dsp.wasm target/wasm32-unknown-unknown/release/spc_apu_wasm.wasm",
    "build:wasm:dev": "cargo build --target wasm32-unknown-unknown -p spc-apu-wasm && cp target/wasm32-unknown-unknown/debug/spc_apu_wasm.wasm src/wasm/dsp.wasm",
    "build": "npm run build:wasm && vite build",
    "dev": "npm run build:wasm:dev && vite"
  }
}
```

In development, the Rust code is compiled once at startup (`npm run dev`). If the Rust source changes, the developer runs `npm run build:wasm:dev` manually and refreshes the browser. Vite's HMR applies to TypeScript/CSS changes but not to WASM rebuilds — a full page reload is required after WASM recompilation. This is an acceptable tradeoff: Rust DSP code changes are infrequent compared to UI iteration, and the debug build completes in 2–5 seconds.

A future enhancement could add a file watcher (`cargo watch` or `chokidar`) that triggers `build:wasm:dev` on Rust source changes, but this is not implemented initially to avoid build tool complexity.

### Why Not `wee_alloc`?

`wee_alloc` is a compact WASM allocator (~1 KB) historically recommended for size-constrained WASM builds. However, `wee_alloc` is unmaintained (archived since 2022) and has known memory leak bugs. The recommended alternative is `dlmalloc` (Rust's default allocator for `wasm32-unknown-unknown`) or `talc`. The choice of allocator is an implementation detail — the ADR mandates `#![no_std]` to exclude the standard library's formatting and I/O infrastructure, but the specific allocator is selected during implementation based on binary size and correctness at that time.

### Memory Safety at the FFI Boundary

The `extern "C"` functions accept raw pointers and lengths from JavaScript. The Rust wrapper crate must validate these at the FFI boundary:

- Null pointer checks before dereferencing.
- Length bounds checks against WASM linear memory size.
- Alignment verification for typed pointer casts (e.g., `*mut f32` requires 4-byte alignment).

These checks happen once per function call (not per sample) and add negligible overhead. Invalid arguments return an error code rather than causing undefined behavior. This is the "validate at system boundaries" principle — the JS-WASM boundary is the outermost trust boundary for the DSP module.

### Related Decisions

- [ADR-0001](0001-snes-audio-emulation-library.md) — selects snes-apu-spcp (Rust, BSD-2-Clause) as the emulation library. This ADR defines how that library is compiled to WASM and integrated into the AudioWorklet.
- [ADR-0003](0003-audio-pipeline-architecture.md) — defines the Module-transfer pattern (compile in main thread → transfer to worklet → instantiate), the pre-allocated buffer strategy, and the per-quantum render cycle. This ADR provides the concrete implementation of that pattern.
- [ADR-0006](0006-audio-codec-libraries.md) — selects pre-compiled Emscripten WASM encoder libraries for audio export. This ADR documents how the two WASM artifact categories (Rust DSP + Emscripten codecs) coexist without toolchain conflicts.

**Note on ADR-0001**: ADR-0001 references wasm-pack as the WASM compilation path for snes-apu-spcp. This ADR supersedes that assumption — the library compiles cleanly via `cargo build --target wasm32-unknown-unknown` without wasm-pack. ADR-0001's assessment of the library's WASM compatibility remains valid; only the build tooling choice has been refined.
