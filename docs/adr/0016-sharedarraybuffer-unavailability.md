---
status: 'accepted'
date: 2026-03-21
---

# SharedArrayBuffer Unavailability on GitHub Pages

## Context and Problem Statement

SPC Player's audio pipeline communicates across three threads: the main thread (React UI, state management), the AudioWorklet thread (DSP emulation, real-time audio rendering), and an export Web Worker (offline encoding). Several performance-sensitive data flows cross these boundaries — DSP state for visualization, audio control parameters, playback position — and would benefit from zero-copy shared memory via `SharedArrayBuffer`.

`SharedArrayBuffer` requires the server to set two HTTP headers on the document response:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

GitHub Pages, the project's deployment platform, does not support custom HTTP response headers. HTML `<meta>` tags cannot substitute for these headers — browsers explicitly ignore COOP/COEP set via meta tags. Without these headers, `SharedArrayBuffer` is undefined in the global scope, and any code referencing it throws a `ReferenceError`.

The project needs a cross-thread data transfer strategy that works on GitHub Pages while keeping the door open for SharedArrayBuffer adoption when the deployment platform changes.

## Decision Drivers

- **GitHub Pages deployment** — the project deploys to GitHub Pages, which provides no mechanism for setting custom HTTP headers. Migrating hosting platforms is out of scope for the current phase.
- **Audio thread performance** — the AudioWorklet `process()` method runs under a hard real-time constraint (~2.67 ms per 128-frame quantum at 48 kHz). Cross-thread communication must not block or allocate on the audio thread.
- **Visualization data flow** — DSP state (8 voice states, register snapshots, echo buffer metadata) flows from the worklet to the main thread at up to 60 Hz for visualization. `postMessage` serialization overhead is measurable but acceptable at this frequency.
- **Future migration path** — the architecture should not preclude SharedArrayBuffer adoption. Data structures and protocols should be designed so that swapping `postMessage` for SAB-backed views is a localized change, not a system-wide refactor.
- **Browser compatibility** — `postMessage` with `ArrayBuffer` transfer is supported in all target browsers (Chrome, Firefox, Safari, Edge). SharedArrayBuffer support varies and requires the COOP/COEP headers even in browsers that implement it.

## Considered Options

- **Option 1: postMessage with ArrayBuffer transfer** — all cross-thread data uses structured clone via `postMessage`. Large buffers (audio data, SPC file bytes) use `Transferable` semantics for zero-copy ownership transfer.
- **Option 2: SharedArrayBuffer with Atomics** — allocate shared memory regions visible to all threads. Use `Atomics.store`/`Atomics.load` for lock-free synchronization. Requires COOP/COEP headers.
- **Option 3: Service Worker header injection** — use a Service Worker to intercept the document request and inject COOP/COEP headers, enabling SharedArrayBuffer on GitHub Pages.
- **Option 4: Migrate to a platform that supports custom headers** — deploy to Cloudflare Pages, Netlify, or Vercel, which support custom response headers via configuration files.

## Decision Outcome

Chosen option: **"postMessage with ArrayBuffer transfer"** (Option 1), because it works on GitHub Pages without workarounds, is supported in all target browsers, and meets the project's current performance requirements. SharedArrayBuffer is deferred as a future optimization gated on deployment platform migration.

Option 3 (Service Worker header injection) was investigated but rejected. The Service Worker cannot intercept its own registration request or the initial document load that determines COOP/COEP policy. The headers must be present on the initial navigation response, before any Service Worker activates. Some workarounds exist (e.g., `coi-serviceworker`) but they require a page reload on first visit and introduce fragile edge cases with browser updates.

Option 4 (platform migration) would solve the problem but is outside the scope of the current development phase. It remains the recommended path when SharedArrayBuffer becomes a performance bottleneck.

### Consequences

- Good, because the deployment target (GitHub Pages) requires zero configuration for cross-thread communication.
- Good, because `postMessage` with `Transferable` provides zero-copy transfer for `ArrayBuffer` objects, which is sufficient for SPC file loading and audio buffer transfer.
- Good, because the approach works identically in all target browsers without feature detection or fallback paths.
- Bad, because DSP state visualization data (voice states, register snapshots) must be serialized via structured clone on every update. At 60 Hz with 8 voice states, this adds measurable overhead (~0.1–0.3 ms per frame on mid-range hardware).
- Bad, because `AudioStateBuffer` (the main-thread view of worklet state) uses plain objects updated via `postMessage`, not SharedArrayBuffer-backed typed arrays. This means state reads on the main thread reflect the last received message, not the real-time worklet state — introducing up to one message-round-trip of latency.
- Bad, because migrating to SharedArrayBuffer in the future requires changing the `AudioStateBuffer` implementation, the worklet's state publishing mechanism, and any visualization code that reads DSP state. The `postMessage`-based protocol should be designed with this migration in mind (e.g., matching field layouts to future SAB views).
- Neutral, because the performance difference between `postMessage` and SharedArrayBuffer is negligible for control messages (play, pause, mute, speed changes) — these are infrequent events where serialization cost is irrelevant.

## Pros and Cons of the Options

### postMessage with ArrayBuffer transfer

Standard cross-thread messaging using the structured clone algorithm, with `Transferable` objects for zero-copy buffer ownership transfer.

- Good, because it works everywhere — no headers, no platform requirements, no feature detection.
- Good, because `ArrayBuffer` transfer moves ownership without copying, providing zero-copy performance for large payloads (SPC files, audio buffers).
- Good, because the API is simple and well-documented, reducing implementation risk.
- Bad, because non-transferable data (objects, arrays of voice states) is copied via structured clone on every message.
- Bad, because transferred `ArrayBuffer` objects become detached in the sender — the sender cannot read the buffer after transfer. This requires careful ownership management.
- Bad, because there is no shared atomic state — the main thread cannot read the worklet's current playback position without waiting for a message.

### SharedArrayBuffer with Atomics

Shared memory regions accessible from multiple threads, with `Atomics` for synchronization.

- Good, because multiple threads read/write the same memory with zero serialization overhead.
- Good, because `Atomics.load` and `Atomics.store` provide lock-free reads of real-time state (playback position, voice states) with no message latency.
- Good, because it eliminates the structured clone cost for high-frequency state updates.
- Bad, because it requires COOP/COEP headers that GitHub Pages cannot set.
- Bad, because `SharedArrayBuffer` is restricted to secure contexts and specific header configurations, complicating local development and testing.
- Bad, because shared memory introduces concurrency hazards (torn reads, stale data) that require careful use of `Atomics` to avoid.

### Service Worker header injection

A Service Worker intercepts navigation requests and adds COOP/COEP headers to enable SharedArrayBuffer.

- Good, because it could enable SharedArrayBuffer without changing the hosting platform.
- Bad, because the Service Worker cannot intercept its own registration or the initial navigation response — COOP/COEP must be present before the Service Worker activates.
- Bad, because workarounds (e.g., `coi-serviceworker`) require a page reload on first visit, degrading the user experience.
- Bad, because browser implementations of Service Worker interception and COOP/COEP enforcement are evolving, creating a fragile dependency.

### Migrate deployment platform

Move from GitHub Pages to Cloudflare Pages, Netlify, or Vercel, which support `_headers` or `netlify.toml` configuration for custom response headers.

- Good, because it solves the problem at the root — custom headers enable SharedArrayBuffer natively.
- Good, because these platforms offer additional features (edge functions, redirects, preview deployments).
- Bad, because it introduces deployment complexity and a new external dependency.
- Bad, because it is out of scope for the current development phase.

## More Information

- [MDN: SharedArrayBuffer — Security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements)
- [web.dev: Making your website "cross-origin isolated"](https://web.dev/articles/coop-coep)
- ADR-0003 defines the audio pipeline architecture and the `postMessage` + `ArrayBuffer` transfer pattern
- ADR-0007 documents the WASM bytes-transfer pattern used instead of `WebAssembly.Module` transfer
