---
name: wasm-integration
description: WebAssembly build pipeline, memory management, JS interop patterns, and AudioWorklet loading.
---

# WASM Integration

Use this skill when working with the WebAssembly build pipeline, JS-WASM interop, or WASM module loading.

## Build Pipeline

- Source language (C/C++ or Rust) is compiled to `.wasm` via Emscripten or wasm-pack.
- WASM build step integrates into the main build pipeline (Vite plugin or npm script).
- Output: a `.wasm` binary and a thin JS loader/bindings module.
- CI must build WASM as part of the standard build.

## Module Loading

### In Main Thread

```typescript
const module = await WebAssembly.instantiateStreaming(
  fetch('/dsp.wasm'),
  importObject,
);
```

### In AudioWorklet

AudioWorklet has no `fetch()`. Two options:

1. **Message passing**: main thread fetches the WASM binary, sends `ArrayBuffer` via `postMessage`, worklet compiles from buffer.
2. **Inline**: embed WASM as base64 in the worklet script (increases bundle, avoids message round-trip).

Prefer option 1 for smaller initial load.

## Memory Management

- WASM linear memory is allocated at instantiation. Size it for 64KB SPC RAM + DSP state + audio buffers.
- Use typed array views (`new Float32Array(memory.buffer, offset, length)`) to read/write.
- Views are invalidated when memory grows — re-create views after `memory.grow()`.
- Allocate audio output buffers in WASM memory for zero-copy transfer to AudioWorklet.

## Interop Conventions

- Exported WASM functions use C naming (`dsp_init`, `dsp_render`, `dsp_set_voice_mask`).
- JS wrapper provides TypeScript-typed API over raw WASM exports.
- String passing: use `TextEncoder`/`TextDecoder` with WASM memory views (avoid for hot paths).
- Error reporting: WASM sets an error flag; JS checks after each call.

## Performance

- Minimize JS-WASM boundary crossings on the audio thread.
- Batch operations: render a full buffer of samples per call, not one sample at a time.
- Avoid allocations in the render loop — pre-allocate all buffers.
- Use Context7 to check current WASM best practices and browser support.

## Cross-Origin Isolation

If using `SharedArrayBuffer` (for shared memory between threads):

- Server must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- GitHub Pages supports this via response headers (verify deployment config).
