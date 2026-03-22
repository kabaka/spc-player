---
status: 'accepted'
date: 2026-03-22
---

# Canvas 2D API and AnalyserNode for All Audio Visualizations

## Context and Problem Statement

SPC Player needs real-time audio visualizations — piano roll, spectrum analyzer, stereo field display, voice timeline, and cover art placeholder — rendered at 30–60fps alongside active audio playback. The visualization stage occupies a prominent area of the PlayerView (300px on desktop, 120px on mobile) and must render smoothly without competing with the AudioWorklet's real-time audio processing on the main thread.

Which rendering technology should be used for the visualization canvas, and how should frequency-domain data (FFT) be obtained for the spectrum analyzer?

## Decision Drivers

- **Frame rate targets** — 60fps on desktop, 30fps on mobile, without causing audio underruns or jank
- **2D-only rendering** — all planned visualizations are 2D (scrolling note bars, frequency bars/curves, Lissajous plots, static images); no 3D geometry is involved
- **Browser compatibility** — must work across Chrome, Firefox, Safari (desktop and mobile), and Edge without polyfills or fallbacks
- **Implementation complexity** — the visualization system includes five distinct rendering modes; the rendering API should be straightforward enough that each renderer stays small and maintainable
- **GPU and power efficiency** — mobile devices have thermal and battery constraints; the rendering approach must not force dedicated GPU usage or excessive power draw
- **Accessibility implementation** — canvas content is inherently inaccessible to screen readers; the approach must allow wrapping with ARIA semantics (`role="img"`, `aria-label`) without fighting the rendering technology
- **Bundle size** — no additional rendering library dependencies; the approach should use built-in browser APIs
- **FFT data availability** — the spectrum analyzer needs frequency-domain data derived from the audio output; obtaining this data should not add latency, complexity, or SharedArrayBuffer requirements to the audio pipeline

## Considered Options

- **Option 1: Canvas 2D API** with `AnalyserNode` for FFT data
- **Option 2: WebGL / WebGPU**
- **Option 3: SVG with requestAnimationFrame**
- **Option 4: CSS-only animations**

## Decision Outcome

Chosen option: **"Canvas 2D API with AnalyserNode for FFT data"**, because it provides sufficient performance for all planned 2D visualizations at target frame rates, uses the simplest API surface, requires no additional dependencies, and has universal browser support. The `AnalyserNode` (Web Audio API built-in) provides FFT frequency data for the spectrum analyzer without any custom FFT implementation or SharedArrayBuffer coordination.

### Canvas 2D for Rendering

All five visualization modes (piano roll, spectrum analyzer, stereo field, voice timeline, cover art) render to a single shared `<canvas>` element using the `CanvasRenderingContext2D` API. Only the active renderer's `draw()` method is called per `requestAnimationFrame` tick. Key rendering techniques:

- **Piano roll**: uses `drawImage(canvas, -scrollDelta, 0)` to shift existing content left, drawing only new note data at the right edge — O(new_notes) per frame, not O(total_notes).
- **Spectrum**: `fillRect()` calls batched by color for bar mode; `beginPath()`/`lineTo()` for line/filled modes.
- **Cover art placeholder**: rendered once at track load time (procedural SNES cartridge), then cached — no per-frame cost.
- **DPR-aware sizing**: canvas physical dimensions are scaled by `devicePixelRatio` (capped at 2× on mobile) for crisp rendering without excessive fill cost.

The frame budget analysis (from the visualization plan) allocates ≤6ms for canvas draw calls, ≤2ms for JavaScript data preparation, and ≤2ms for browser compositing, leaving ~40% headroom within the 16.6ms frame budget at 60fps.

### AnalyserNode for FFT Data

The spectrum analyzer needs frequency-domain data. Rather than implementing FFT in the AudioWorklet (which would require SharedArrayBuffer for zero-copy data transfer or postMessage overhead), the built-in `AnalyserNode` is connected to the audio graph on the main thread:

```typescript
const analyser = audioContext.createAnalyser();
analyser.fftSize = 1024; // 512 frequency bins
analyser.smoothingTimeConstant = 0.8;
masterGain.connect(analyser);
```

`getByteFrequencyData()` is called each frame by the spectrum renderer. The `AnalyserNode` runs its FFT on the audio rendering thread natively, and the frequency data is read synchronously on the main thread — no message passing, no SharedArrayBuffer, no custom FFT code.

FFT size is user-configurable (256 / 512 / 1024) via the visualization settings. At the default 1024-point FFT with 48 kHz output sample rate, frequency resolution is ~47 Hz/bin, which is more than sufficient for a visualization-grade spectrum display (not a measurement tool).

### Consequences

- Good, because Canvas 2D is a zero-dependency browser built-in with universal support across all target browsers (Chrome, Firefox, Safari, Edge — desktop and mobile).
- Good, because the API is straightforward — `fillRect()`, `drawImage()`, `beginPath()`/`lineTo()` — keeping each renderer implementation under ~200 lines.
- Good, because Canvas 2D compositing is GPU-accelerated by default in all modern browsers (when `willReadFrequently` is not set), providing hardware acceleration without the complexity of managing a WebGL context.
- Good, because `AnalyserNode` eliminates the need to implement FFT in the AudioWorklet, avoiding SharedArrayBuffer requirements (ADR-0016) and keeping the audio pipeline focused on emulation and resampling.
- Good, because `AnalyserNode` provides built-in smoothing (`smoothingTimeConstant`) and configurable FFT sizes, reducing application-level signal processing code.
- Good, because the single-canvas architecture with swappable renderers keeps the DOM structure simple and supports instant tab switching with no teardown/setup delay.
- Good, because canvas elements wrapped in `<div role="img" aria-label="...">` with `<canvas aria-hidden="true">` provide clean accessibility semantics without fighting the rendering technology.
- Bad, because Canvas 2D lacks shader-based effects (blur, glow, bloom) that could enhance visual appeal. The `shadowBlur` property is available but expensive — disabled on mobile to meet frame budget.
- Bad, because canvas content cannot be styled with CSS (unlike SVG/DOM elements), so theme switching requires re-rendering with updated colors rather than CSS custom property cascading.
- Bad, because per-voice spectrum analysis (showing each voice's frequency content separately) would require 8 separate `AnalyserNode` instances, which is expensive. This is deferred as a stretch goal.
- Bad, because `AnalyserNode` frequency data represents the mixed output, not per-voice data. Per-voice frequency analysis would require either separate audio graph routing per voice or custom FFT in the worklet.

### Confirmation

- Implement the `VisualizationStage` component with `PianoRollRenderer` and `SpectrumRenderer`. Measure frame times using `performance.now()` around the `draw()` call on desktop (target: ≤6ms) and mobile (target: ≤10ms at 30fps).
- Verify that `AnalyserNode.getByteFrequencyData()` returns valid frequency data synchronized with audio playback — spectrum bars should visibly respond to the audio content.
- Profile main-thread CPU usage during visualization rendering. Confirm that visualization rendering does not cause audio underruns (AudioWorklet quantum overruns) on mid-range mobile hardware.
- Test `prefers-reduced-motion: reduce` behavior — visualizations should drop to ~4fps static snapshots.

## Pros and Cons of the Options

### Canvas 2D API

The HTML5 Canvas 2D rendering context (`CanvasRenderingContext2D`), a built-in browser API for immediate-mode 2D drawing. Combined with `AnalyserNode` from the Web Audio API for FFT data.

- Good, because it is universally supported across all browsers with zero dependencies or polyfills.
- Good, because the immediate-mode API (draw commands execute directly) has predictable performance characteristics — no retained scene graph overhead, no DOM diffing.
- Good, because GPU-accelerated compositing is enabled by default in modern browsers, providing hardware acceleration transparently.
- Good, because `drawImage()` enables efficient canvas-to-canvas blitting for the piano roll's scrolling buffer technique.
- Good, because `AnalyserNode` provides built-in FFT with no custom implementation, running natively on the audio thread.
- Good, because the API surface is small and well-documented, reducing learning curve for contributors.
- Neutral, because performance is sufficient for the planned visualizations but would not scale to complex particle systems or 3D scenes (not needed here).
- Bad, because text rendering quality varies across browsers and DPR settings — monospace labels in the canvas may appear slightly blurry at non-integer DPR scales.
- Bad, because there is no built-in scene graph or hit testing — interactive visualization features (clicking on a note in the piano roll) would require manual coordinate math.

### WebGL / WebGPU

GPU-accelerated rendering APIs providing shader-based programmable graphics pipelines (WebGL 2.0 or the newer WebGPU API).

- Good, because GPU shaders enable visually rich effects — bloom, blur, particle systems, real-time color grading — at near-zero CPU cost.
- Good, because it can handle thousands of draw calls per frame efficiently (vertex batching, instanced rendering), scaling to arbitrarily complex visualizations.
- Good, because WebGL 2.0 has broad browser support (>97% globally).
- Bad, because the API complexity is dramatically higher — shader programs (GLSL), buffer management, texture binding, state machine management — for visualizations that only need `fillRect()` and `lineTo()`.
- Bad, because WebGL forces dedicated GPU context allocation, increasing power consumption on mobile devices even when rendering simple 2D content.
- Bad, because WebGPU is not yet universally supported (Safari support is recent, Firefox is experimental), creating browser compatibility gaps.
- Bad, because debugging WebGL rendering issues requires specialized tools (Spector.js, RenderDoc), increasing development friction.
- Bad, because it adds no meaningful capability for the planned 2D visualizations — the performance headroom of Canvas 2D is already sufficient.
- Bad, because WebGL context loss can occur on mobile when the system reclaims GPU memory, requiring recovery code that adds complexity.

### SVG with requestAnimationFrame

Scalable Vector Graphics rendered in the DOM, updated each frame via JavaScript manipulating SVG element attributes.

- Good, because SVG elements are part of the DOM and can be styled with CSS, enabling theme switching via CSS custom properties without JavaScript re-rendering.
- Good, because SVG elements are inherently accessible — screen readers can traverse SVG content, and elements can have `<title>` and `<desc>` attributes.
- Good, because SVG scales cleanly at any DPR without manual resolution management.
- Bad, because DOM manipulation (creating, updating, removing SVG elements) at 60fps causes layout thrashing and GC pressure from frequent DOM node allocation.
- Bad, because the piano roll would require hundreds of `<rect>` elements updated per frame (note bars entering and leaving the visible window), each triggering style recalculation and layout.
- Bad, because the spectrum analyzer with 512 bars would require 512 `<rect>` elements with height attributes updated every frame — a known performance bottleneck in SVG.
- Bad, because browser SVG rendering performance varies significantly across engines — Safari's SVG performance is notably slower than Chrome's for high-element-count animated scenes.
- Bad, because mixing SVG DOM rendering with `requestAnimationFrame` often produces frame drops due to the browser's layout/paint pipeline interleaving with JavaScript execution.

### CSS-only Animations

Using CSS transforms, transitions, and animations on HTML elements (e.g., `<div>` bars for the spectrum, absolutely positioned elements for notes).

- Good, because CSS animations run on the compositor thread, theoretically freeing the main thread entirely.
- Good, because CSS custom properties and themes work naturally.
- Good, because DOM elements have built-in accessibility.
- Bad, because CSS animations require the final state to be known in advance — real-time audio data that changes every frame cannot be driven by CSS transitions without JavaScript constantly updating inline styles, negating the compositor-thread benefit.
- Bad, because creating 512 DOM elements for spectrum bars and updating their `height` style at 60fps causes severe layout thrashing — the same problem as SVG but worse, since generic DOM elements have more layout overhead.
- Bad, because the piano roll's scrolling history with hundreds of note bars would require continuous DOM element creation and removal, creating GC pressure.
- Bad, because complex drawing (Lissajous curves for stereo field, arbitrary shapes for cover art placeholders) cannot be expressed in CSS — the approach would require falling back to canvas for some modes, fragmenting the rendering architecture.
- Bad, because there is no CSS equivalent of `AnalyserNode.getByteFrequencyData()` — frequency data still requires JavaScript, so the "CSS-only" framing is misleading.

## More Information

### AnalyserNode vs. Custom FFT in AudioWorklet

An alternative to `AnalyserNode` is computing the FFT inside the AudioWorklet and transferring frequency data to the main thread. This was rejected because:

1. **SharedArrayBuffer complexity** — ADR-0016 documents that SharedArrayBuffer is unavailable without specific COOP/COEP headers, which conflict with GitHub Pages hosting. Transferring FFT data would require `postMessage`, adding latency.
2. **AudioWorklet processing budget** — the worklet already runs SPC700 CPU emulation, S-DSP emulation, and output resampling. Adding a 1024-point FFT (~5,000 multiply-accumulate operations) per quantum would consume additional budget that is tight on mobile.
3. **AnalyserNode is purpose-built** — it runs its FFT on the audio rendering thread (separate from the AudioWorklet thread), provides built-in windowing and smoothing, and exposes data synchronously to the main thread via typed arrays.

The tradeoff is that `AnalyserNode` operates on the mixed stereo output, not per-voice data. Per-voice spectrum analysis remains a stretch goal that would require a different approach (either 8 `AnalyserNode` instances with per-voice audio routing, or custom FFT in the worklet with postMessage transfer).

### Relationship to Existing Visualizations

The `SpectrumAnalyzer` component currently in `src/features/analysis/AnalysisView.tsx` will be relocated to the `VisualizationStage` as part of Phase E implementation. The existing component already uses Canvas 2D and `AnalyserNode`, validating this ADR's approach in production.

### Related Decisions

- [ADR-0003](0003-audio-pipeline-architecture.md) — Audio pipeline architecture; the `AnalyserNode` connects to the master gain node in the audio graph.
- [ADR-0016](0016-sharedarraybuffer-unavailability.md) — SharedArrayBuffer unavailability; informs the decision to use `AnalyserNode` rather than shared-memory FFT transfer from the worklet.
- [ADR-0021](0021-cover-art-approach.md) — Cover art approach; the procedural cover art placeholder is rendered using Canvas 2D as decided here.
