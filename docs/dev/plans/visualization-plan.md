# Visualization Enhancements Plan — SPC Player

> Design specification for adding DAW-style piano roll, spectrum EQ,
> stereo field, voice timeline visualizations, and cover art display
> to SPC Player. All rendering uses Canvas 2D for performance.

---

## Table of Contents

1. [Design Goals & Visual Language](#1-design-goals--visual-language)
2. [Visualization Stage Component](#2-visualization-stage-component)
3. [Piano Roll Visualization](#3-piano-roll-visualization)
4. [Spectrum / Graphic EQ Visualization](#4-spectrum--graphic-eq-visualization)
5. [Cover Art Display](#5-cover-art-display)
6. [Performance Budget & Rendering Strategy](#6-performance-budget--rendering-strategy)
7. [Memory Budget](#7-memory-budget)
8. [Accessibility](#8-accessibility)
9. [Implementation Phases](#9-implementation-phases)

---

## 1. Design Goals & Visual Language

### Goals

1. **Nostalgia-forward aesthetics** — Visualizations should evoke SNES-era CRT displays and retro audio gear while remaining crisp and readable on modern screens.
2. **Information-dense, not decorative** — Every visualization serves a purpose: understanding what's playing, exploring the audio, or monitoring the DSP state.
3. **60fps on desktop, 30fps on mobile** — Smooth rendering that doesn't compete with audio processing. Mobile targets 30fps with lower canvas resolution to stay within thermal and power budgets.
4. **Progressive disclosure** — Users see the default visualization (waveform or piano roll) immediately. More specialized views (spectrum, stereo field, voice timeline) are one click/swipe away.
5. **Dark-first design** — All visualizations are designed primarily against the `#0e0e16` dark surface. Light theme uses muted versions of the same palette.

### Visual Language

- **Accent color**: `--spc-color-accent` (`#8b5cf6` purple) for active voices, highlights, and primary data.
- **Per-voice colors**: 8 SNES voices each get a fixed color from the voice palette (see Piano Roll §3).
- **Grid lines**: `rgba(255, 255, 255, 0.06)` on dark, `rgba(0, 0, 0, 0.06)` on light.
- **Background**: Transparent (inherits from VisualizationStage container), OR `--spc-color-surface` if the canvas needs an opaque fill.
- **Font**: Monospace (`--spc-font-mono`) for all in-canvas text (note names, frequencies, dB values). Size: 10px, anti-aliased.
- **Animations**: All transitions respect `prefers-reduced-motion`. When reduced-motion is active, visualizations render at ~4fps (essentially a static snapshot updated periodically) or freeze entirely.

### Integration with Layout

The VisualizationStage occupies the top area of the main content in PlayerView. Sizes are defined in the UX Layout Redesign plan:

| Breakpoint | Height |
| ---------- | ------ |
| Desktop    | 300px  |
| Tablet     | 200px  |
| Mobile     | 120px  |

The stage has a tab bar along the top edge for switching between visualization modes. Desktop wireframe:

```
┌──[ Piano Roll ][ Spectrum ][ Stereo ][ Timeline ][ Art ]─────────────┐
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                                                                 │  │
│  │                    Active Visualization Canvas                  │  │
│  │                         (300px height)                          │  │
│  │                                                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

On mobile (120px), the tab bar condenses to icons or a horizontal scroll strip. The canvas is the full width of the stage minus padding.

### Navigation Item Mapping

The VisualizationStage tabs are internal to the PlayerView and do NOT add top-level navigation items. The desktop top nav remains: Player, Instrument, Analysis, ⚙. The mobile bottom nav remains: Player, Tools, Settings (3 items). These visualization tabs are sub-navigation within the Player view only.

---

## 2. Visualization Stage Component

### Architecture

```
VisualizationStage (React.lazy() loaded)
├── <TabBar> (visualization mode selector)
│   ├── Piano Roll (default)
│   ├── Spectrum EQ
│   ├── Stereo Field
│   ├── Voice Timeline
│   └── Cover Art
├── <canvas> (active visualization renderer)
│   └── Managed by the active VisualizationRenderer
└── <VisualizationOverlay> (optional HUD-style overlays: voice labels, time markers)
```

**Code-splitting:** `VisualizationStage` and all canvas renderers are loaded via `React.lazy()` + `<Suspense>`. This keeps them off the critical JS bundle path. The `Suspense` fallback shows a placeholder matching the visualization height (300px/200px/120px) with a subtle shimmer.

### State Management

```typescript
interface VisualizationState {
  activeMode:
    | 'piano-roll'
    | 'spectrum'
    | 'stereo-field'
    | 'voice-timeline'
    | 'cover-art';
  // Per-mode settings (persisted to localStorage)
  pianoRoll: {
    scrollSpeed: number; // pixels per second
    noteScale: 'chromatic' | 'octave';
    showVoiceLabels: boolean;
  };
  spectrum: {
    mode: 'bars' | 'line' | 'filled';
    fftSize: 256 | 512 | 1024;
    smoothing: number; // 0-1
  };
  stereoField: {
    mode: 'lissajous' | 'correlation';
    decay: number; // 0-1
  };
  voiceTimeline: {
    timeWindow: number; // seconds visible
    showEnvelopes: boolean;
  };
  coverArt: {
    externalFetchEnabled: boolean; // opt-in, default false
  };
}
```

Stored in the Zustand `uiStore`. Visualization mode selection persists across sessions (localStorage).

### Rendering Loop

All visualization renderers share a single `requestAnimationFrame` loop managed by `VisualizationStage`. Only the active renderer's `draw()` method is called per frame. Inactive renderers are not ticked.

```typescript
interface VisualizationRenderer {
  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void;
  draw(data: AudioVisualizationData, deltaTime: number): void;
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}
```

The `AudioVisualizationData` is assembled from:

- `audioStateBuffer` (shared Float64Array read from AudioWorklet) — provides per-voice pitch, amplitude, ADSR state.
- FFT data from an `AnalyserNode` connected to the audio graph (for spectrum visualization).
- Direct DSP register reads (for voice state detail).

### Canvas Resolution Management

The canvas uses `devicePixelRatio`-aware sizing:

```typescript
function resizeCanvas(canvas: HTMLCanvasElement, dpr: number): void {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
}
```

**Mobile DPR cap:** On mobile devices (viewport < 768px), the DPR is capped at 2x regardless of the physical device pixel ratio. This halves the rendering area on 3x DPR devices (e.g., iPhone at 3x → renders at 2x), significantly reducing fill cost and keeping frame times under budget.

---

## 3. Piano Roll Visualization

### Concept

A scrolling piano roll that shows which notes each voice is playing, inspired by DAW MIDI editors. Time flows right-to-left (current time at the right edge). Notes appear as horizontal bars whose vertical position maps to pitch and whose color maps to voice number.

### Layout

```
Desktop (300px height):
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│ C6│                    ▓▓▓▓ (voice 3, green)                  │
│ B5│                                                            │
│ A5│          ▓▓▓▓▓▓▓▓▓▓ (voice 1, blue)                      │
│ G5│                                                            │
│ F5│    ▓▓▓▓▓▓ (voice 2, purple)                               │
│ E5│                                              ●●● (now)    │
│ D5│                                                            │
│ C5│                ▓▓▓▓▓▓▓▓▓▓▓▓ (voice 5, cyan)              │
│ B4│                                                            │
│ A4│  ▓▓▓▓ (voice 4, gold)                                     │
│   │                                                            │
│   └────────────────────────────────────────┤ current time ►    │
│     ◀ 3 seconds of history                                    │
└────────────────────────────────────────────────────────────────┘
  LEFT: note labels (optional, toggleable)
  Y axis: pitch (C2 to C8 range, auto-centered on active notes)
  X axis: time (scrolls right-to-left)
```

### Voice Color Palette

Each of the 8 SPC700 voices gets a dedicated color for all visualizations:

| Voice | Color Name | Hex       | Purpose                |
| ----- | ---------- | --------- | ---------------------- |
| 1     | Blue       | `#60a5fa` | Lead melody            |
| 2     | Purple     | `#a78bfa` | Harmony / accent color |
| 3     | Green      | `#4ade80` | Bass / rhythm          |
| 4     | Gold       | `#fbbf24` | Percussion / sfx       |
| 5     | Cyan       | `#22d3ee` | Pad / ambient          |
| 6     | Pink       | `#f472b6` | Counter-melody         |
| 7     | Orange     | `#fb923c` | Arpeggio / texture     |
| 8     | Red        | `#f87171` | Effect / noise         |

Colors chosen for:

- WCAG contrast ≥ 3:1 against `#0e0e16` dark background (AA for non-text elements).
- Distinguishable in the most common color vision deficiency modes (deuteranopia, protanopia). Blue/Gold and Purple/Green pairs maintain distinctness.
- Consistent across all visualization modes.

Light theme variants use 20% darker versions of each color for contrast against light backgrounds.

### Pitch Mapping

The SPC700 doesn't output MIDI note numbers directly. Pitch is derived from the voice's sample rate register (`VxPITCH`):

```
frequency = (VxPITCH / 0x1000) * sampleRate
note = 12 * log2(frequency / 440) + 69   // MIDI note number
```

This gives a continuous pitch value. Notes are quantized to the nearest semitone for vertical positioning, but the bar can be offset by ±0.5 semitones to show pitch bending.

### Rendering Details

- **Note bars**: height = 1 semitone (minus 1px gap). Length = duration of the note in pixels.
- **Active notes**: slightly brighter fill + subtle glow effect (2px blur using `shadowBlur`).
- **Scrolling**: the entire canvas content shifts left each frame. New data is drawn at the right edge. Use `drawImage()` to copy the existing canvas content shifted left, then draw only the new column.
- **Grid**: horizontal lines at octave boundaries (C2, C3, C4...). Vertical lines at 1-second intervals.
- **Auto-range**: the visible pitch range (Y axis) auto-adjusts to the range of actively playing notes ± 1 octave. Smooth transition when the range changes.
- **Voice muting**: when a voice is muted in the mixer, its notes render at 30% opacity.

### Mobile Adaptation

- On mobile (120px height), the piano roll renders with fewer octave rows visible and no note labels on the Y axis.
- Scroll speed adapts to the narrower width — the time window is shorter (2 seconds vs 3 seconds on desktop).

---

## 4. Spectrum / Graphic EQ Visualization

### Concept

A frequency spectrum display that shows the current audio output's frequency content. Three rendering modes: bars (classic graphic EQ), line (smooth spectrum curve), and filled (area under the curve).

### Layout

```
Desktop (300px height):
┌────────────────────────────────────────────────────────────┐
│                                                            │
│ dB│  ▓                                                     │
│   │  ▓  ▓                                                  │
│   │  ▓  ▓  ▓                                               │
│   │  ▓  ▓  ▓  ▓                                            │
│   │  ▓  ▓  ▓  ▓  ▓                                         │
│   │  ▓  ▓  ▓  ▓  ▓  ▓     ▓                                │
│   │  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓                             │
│   │  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓     ▓                │
│   │  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  ▓  │
│   └────────────────────────────────────────────────────────│
│    20Hz  50   100  200  500  1k  2k  5k  10k  16k          │
└────────────────────────────────────────────────────────────┘
  Y axis: amplitude (dB, logarithmic)
  X axis: frequency (logarithmic scale)
```

### Data Source

Uses an `AnalyserNode` connected after the main audio output:

```typescript
const analyser = audioContext.createAnalyser();
analyser.fftSize = 1024; // 512 bins, configurable
analyser.smoothingTimeConstant = 0.8;
masterGain.connect(analyser);
```

The `getByteFrequencyData()` output is rendered each frame. For the per-voice spectrum variant (stretch goal), each voice's output would need a separate `AnalyserNode` — this is expensive and deferred.

### Rendering Modes

1. **Bars** (default): classic graphic EQ. Bars are 4px wide with 1px gap, colored with accent gradient (bottom = muted, top = accent). Bar count adapts to canvas width.

2. **Line**: smooth bezier curve through the frequency points. Line color = accent. No fill. 2px line width.

3. **Filled**: same curve as Line, but the area below is filled with a gradient (accent at top, fading to transparent at bottom).

### Peak Hold

In all modes, peak indicators (small horizontal lines or dots) sit at the highest recent value for each frequency bin, decaying slowly (3dB/second). This is a standard spectrum analyzer feature that helps show the peak envelope of the audio.

### Mobile Adaptation

- On mobile, the spectrum uses fewer bins (FFT size 256 instead of 1024) and the bars are wider.
- Peak hold is disabled on mobile to reduce rendering cost.
- Render at 30fps with lower canvas resolution (DPR capped at 2x).

---

## 5. Cover Art Display

### Concept

Show album/game artwork alongside the currently playing track. Cover art adds visual context and makes the player feel more complete.

### Art Sources (Priority Order)

1. **Embedded in SPC file** — Some SPC files (with xid6 extended tags) can contain embedded artwork. Check xid6 sub-chunks for an image payload.

2. **User-provided** — Let the user assign artwork to tracks/games via the settings or metadata panel. Stored in IndexedDB keyed by game title.

3. **RetroArch Thumbnails** (external, opt-in) — RetroArch maintains a large collection of SNES game box art on GitHub:
   - Repository: `libretro-thumbnails/Nintendo_-_Super_Nintendo_Entertainment_System`
   - Images: Named/boxart/\*.png
   - Matching: requires a game title → RetroArch title mapping (fuzzy match).
   - **Opt-in only**: External network fetch is disabled by default. Users must explicitly enable it in Settings > Privacy > "Fetch cover art from RetroArch thumbnails." A brief explanation describes what data is sent (game title) and where (GitHub raw.githubusercontent.com).
   - When enabled, fetched art is cached in IndexedDB for offline use.

4. **Generated placeholder** — When no artwork is available, display a procedurally generated placeholder image using Canvas 2D:
   - Background: a stylized SNES cartridge shape (rounded rectangle with the characteristic label area and connector pins silhouette) rendered in the voice color palette.
   - Text: game title rendered in `--spc-font-mono` overlaid on the cartridge label area, centered, with automatic font sizing to fit.
   - Colors: derived from a hash of the game title string, mapped into the voice color palette, ensuring each game gets a unique but consistently-generated placeholder.
   - Generated at display time, no pre-built static assets needed.
   - This approach gives every track a unique visual identity even without external art.

### Layout

In the VisualizationStage "Art" tab:

```
Desktop (300px height):
┌────────────────────────────────────────────────────────────┐
│                                                            │
│        ┌──────────────┐                                    │
│        │              │   Song Title                       │
│        │  Cover Art   │   Game: Chrono Trigger             │
│        │   (240×240)  │   Artist: Yasunori Mitsuda         │
│        │              │   Year: 1995                       │
│        │              │   Track 3 of 12                    │
│        └──────────────┘                                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

On mobile (120px height), the art is smaller (80×80px) with a single line of text beside it.

### Image Rendering

- Art is rendered to a `<canvas>` element (not an `<img>` tag) for consistent rendering pipeline.
- Images are scaled to fit (contain, not cover) within the allocated square.
- A subtle vignette or border effect can be applied via canvas compositing.
- CSS filter: none (raw pixels for retro aesthetic).

### Privacy Considerations

- **Default:** no external fetches. Generated placeholder only.
- **Opt-in:** the RetroArch thumbnail source must be explicitly enabled in Settings > Privacy. The setting explains what happens: "When enabled, game titles are sent to GitHub (raw.githubusercontent.com) to fetch box art from the RetroArch thumbnails repository."
- Once fetched, art is cached in IndexedDB and never re-fetched unless the user clears the cache.
- No tracking, no analytics, no server-side processing.

---

## 6. Performance Budget & Rendering Strategy

### Frame Budget

At 60fps, each frame has **16.6ms**. The audio worklet runs on its own thread and is not affected by main-thread rendering. The visualization rendering budget:

| Component                     | Budget    |
| ----------------------------- | --------- |
| Canvas draw calls             | ≤ 6ms     |
| JavaScript (data prep, state) | ≤ 2ms     |
| Browser compositing           | ≤ 2ms     |
| **Headroom**                  | **6.6ms** |

This gives ~40% headroom for GC pauses and other main-thread work.

### Mobile Frame Budget

On mobile (< 768px), the visualization targets **30fps** (33.3ms per frame) with the following adaptations:

| Adaptation                        | Effect                              |
| --------------------------------- | ----------------------------------- |
| Frame rate target: 30fps          | Skip every other rAF callback       |
| Canvas DPR cap: 2x                | Reduce fill cost on 3x DPR devices  |
| Reduce CSS dimensions             | E.g., 120px height instead of 300px |
| FFT size: 256 (spectrum)          | Fewer bins to render                |
| Disable peak hold (spectrum)      | Fewer draw calls per frame          |
| Disable glow effects (piano roll) | Avoid `shadowBlur` cost             |
| Shorter time window (piano roll)  | Less scrolling history to draw      |

These adaptations are applied automatically based on viewport width at component mount time. If a device later resizes above 768px (e.g., landscape rotation on tablet), the renderer can upgrade to desktop settings.

### Adaptive Quality (Future Enhancement)

If frame times consistently exceed the budget (measured over a 1-second rolling average), quality can degrade automatically:

1. Drop from 60fps → 30fps on desktop.
2. Reduce canvas resolution (lower DPR).
3. Simplify rendering (disable glow, reduce bar count, widen grid spacing).
4. As a last resort, show static snapshot updated every 250ms.

This is a stretch goal — the initial implementation uses the fixed mobile/desktop split described above.

### Rendering Optimizations

1. **Shared rAF loop**: `VisualizationStage` runs one `requestAnimationFrame` loop. Only the active renderer draws. Tab-switching is instant (activate the new renderer, deactivate the old one — no teardown/setup delay).

2. **Canvas buffer reuse**: piano roll uses `drawImage(canvas, -scrollDelta, 0)` to shift existing content, only drawing new data at the right edge. This reduces per-frame draw calls from O(n\*notes) to O(new_notes).

3. **Typed arrays**: all rendering data is read from typed arrays (`Float64Array`, `Uint8Array`) — no object allocation per frame.

4. **Off-screen pre-computation**: waveform peaks (for seek bar waveform preview) are computed once in a worker at track load time, not per-frame.

5. **Canvas `willReadFrequently: false`**: do NOT set `willReadFrequently` unless doing `getImageData()` (we're not). This lets the browser GPU-accelerate the canvas.

6. **Batch draw calls**: group `fillRect()` calls by color to minimize context state changes. Use `Path2D` for complex shapes if reused.

---

## 7. Memory Budget

Canvas backbuffers are a significant memory cost. The total memory budget for visualizations:

| Item                                                     | Calculation              | Memory      |
| -------------------------------------------------------- | ------------------------ | ----------- |
| Main viz canvas (1200×600 CSS @ 2x DPR)                  | 2400 × 1200 × 4 bytes/px | **11.5 MB** |
| Seek bar waveform canvas (800×10 @ 2x DPR)               | 1600 × 20 × 4            | 0.13 MB     |
| Note history buffer (8 voices × 1024 entries × 16 bytes) | 8 × 16 KB                | 0.13 MB     |
| FFT data buffer (1024 bins × 4 bytes)                    | 4 KB                     | ~0 MB       |
| Cover art decoded (240×240 × 4)                          | 0.23 MB                  | 0.23 MB     |
| **Total**                                                |                          | **~12 MB**  |

This is well within the browser's per-tab memory limits (~256–512 MB typical), even on mobile devices with 3–4 GB RAM.

**Note:** The 11.5 MB main canvas is the dominant cost. On mobile, the smaller canvas dimensions (e.g., 360×240 CSS @ 2x DPR = 720×480 physical) reduce this to ~1.4 MB, bringing the total mobile memory to ~2 MB.

### Memory Lifecycle

- Canvas backbuffers are allocated when `VisualizationStage` mounts and freed when it unmounts.
- When navigating away from the Player view, `VisualizationStage` unmounts (React removes the DOM element), and the browser frees the canvas backbuffer.
- Cover art images are cached in IndexedDB and decoded into canvas only when the Art tab is active.

---

## 8. Accessibility

Canvas-based visualizations are inherently inaccessible to screen readers. The following mitigations ensure compliance with WCAG 2.2 AA:

### Visual Accessibility

1. **Color is not the only indicator** — Voice identity uses both color AND spatial position (consistent Y-axis placement in piano roll, labeled bars in spectrum). Where voice identity is shown outside the canvas (e.g., mixer labels), text labels are always present.

2. **Contrast** — all colors in the voice palette meet 3:1 contrast against the dark background (non-text elements, WCAG 1.4.11). Text rendered inside the canvas (note labels, frequency labels) meets 4.5:1. Light theme variants are adjusted to maintain contrast.

3. **Reduced motion** — when `prefers-reduced-motion: reduce` is active:
   - Piano roll: static snapshot, updated ~4fps.
   - Spectrum: static bars, updated ~4fps.
   - Stereo field: no animation, just a dot for current position.
   - Voice timeline: static chart, no scrolling.
   - All transition animations between tabs are instant (no cross-fade).

### Screen Reader Accessibility

4. **Canvas container role** — Each visualization canvas is wrapped in a container with:

   ```html
   <div
     role="img"
     aria-label="Piano roll visualization showing 5 active voices playing notes in octaves 3 through 5"
   >
     <canvas aria-hidden="true"></canvas>
   </div>
   ```

   The `role="img"` on the container identifies it as a graphical region. The `aria-label` provides a text description that is updated periodically (not per-frame — once per track change or mode switch). The inner `<canvas>` is `aria-hidden="true"` since it has no semantic content.

5. **Visualization mode tabs** — the tab bar uses standard `role="tablist"` / `role="tab"` / `role="tabpanel"` semantics:

   ```html
   <div role="tablist" aria-label="Visualization modes">
     <button
       role="tab"
       aria-selected="true"
       id="tab-piano-roll"
       aria-controls="panel-piano-roll"
     >
       Piano Roll
     </button>
     <!-- ... other tabs ... -->
   </div>
   <div role="tabpanel" id="panel-piano-roll" aria-labelledby="tab-piano-roll">
     <div role="img" aria-label="...">
       <canvas aria-hidden="true"></canvas>
     </div>
   </div>
   ```

6. **Tab keyboard interaction** — Arrow Left/Right moves between tabs. Home/End for first/last. Enter/Space activates. Focus follows selection (the active tab receives focus on arrow key press).

7. **Skip link** — The visualization stage is a non-interactive visual region. A skip link allows keyboard users to jump past it: "Skip visualization" → next focusable element (the voice mixer).

### Touch Accessibility

8. **Pinch-to-zoom** (stretch goal) — on mobile, pinch gestures on the canvas could zoom the time or frequency axis. This is deferred — initial implementation has no gesture support.

9. **No essential interaction in canvas** — no controls or buttons live inside the canvas. All interactive elements (tabs, settings) are standard HTML elements outside the canvas.

---

## 9. Implementation Phases

### Phase E-1: VisualizationStage Shell + Piano Roll

**Goal:** Tabbed container with a working piano roll visualization.

1. Create `VisualizationStage` component with tab bar (Piano Roll active, others as placeholders).
2. Wrap in `React.lazy()` + `<Suspense>` for code-splitting. Fallback: a shimmer placeholder matching the visualization height.
3. Set up the shared `requestAnimationFrame` loop in `VisualizationStage`.
4. Implement `PianoRollRenderer` with:
   - Voice pitch extraction from `audioStateBuffer`.
   - Note bar rendering with per-voice colors.
   - Time scrolling with canvas shift optimization.
   - Octave grid lines.
   - Auto-range Y axis.
5. Add canvas container with `role="img"` and descriptive `aria-label`.
6. Wire voice mute state (dim muted voices to 30% opacity).
7. Apply mobile adaptations (30fps, smaller canvas, shorter time window, DPR cap at 2x).
8. Add "Skip visualization" skip link.

**Validation:** Piano roll renders at 60fps desktop / 30fps mobile. Voices visible in distinct colors. Screen reader announces "Piano roll visualization" on the container. Canvas elements are `aria-hidden`. Tab navigation works with keyboard.

### Phase E-2: Spectrum EQ + Stereo Field

**Goal:** Two additional visualization modes.

1. Implement `SpectrumRenderer` with bars, line, and filled modes.
2. Connect `AnalyserNode` to audio graph (non-destructive tap).
3. Implement peak hold (desktop only).
4. Implement `StereoFieldRenderer` (Lissajous mode using L/R channel data).
5. Add mode-specific settings (FFT size, smoothing, decay) to the viz state.
6. Update `aria-label` on the container per active visualization mode.
7. Apply mobile adaptations (30fps, fewer FFT bins, no peak hold, DPR cap at 2x).

**Validation:** All three viz modes render correctly. Tab switching is instant. Settings persist.

### Phase E-3: Voice Timeline + Cover Art

**Goal:** Remaining visualization modes.

1. Implement `VoiceTimelineRenderer` — horizontal timeline showing voice on/off states over time, like a simplified DAW arrangement view.
2. Implement cover art display:
   - xid6 embedded art extraction.
   - Generated placeholder with stylized SNES cartridge shape and game title text.
   - User-provided art upload (stored in IndexedDB).
   - RetroArch thumbnail fetch (opt-in, behind Settings > Privacy toggle).
   - IndexedDB caching for fetched art.
3. Add privacy setting UI: "Fetch cover art from RetroArch thumbnails" toggle with explanation text.
4. Update `aria-label` descriptions for timeline and cover art views.

**Validation:** All 5 visualization modes functional. Cover art displays embedded/generated/user/RetroArch art in priority order. External fetch only happens when explicitly enabled. Generated placeholders look reasonable.

### Phase E-4: Polish + Mobile Refinement

**Goal:** Visual polish and mobile optimization.

1. Add glow effects to piano roll active notes (desktop only).
2. Refine color palette for light theme.
3. Test and tune mobile 30fps performance (profile on mid-range Android + iPhone SE).
4. Add pinch-to-zoom gesture support (stretch goal).
5. Ensure `prefers-reduced-motion` disables all canvas animations (static ~4fps snapshots).
6. Visual polish: smooth transitions between tab panels, subtle fade-in on first render.
7. Accessibility audit: verify `role="img"`, `aria-label`, `aria-hidden`, tab ARIA patterns, skip link, and keyboard navigation.

**Validation:** All visualizations polished. 30fps stable on mobile. Reduced-motion mode works. Accessibility audit passes.

---

## Appendix A: Data Flow — AudioWorklet to Visualization

```
AudioWorklet (spc-worklet.ts)
  │
  ├── audioStateBuffer (Float64Array, ~600 bytes)
  │   ├── positionSamples
  │   ├── voicePitches[0..7]
  │   ├── voiceVolumes[0..7]
  │   ├── voiceStates[0..7]   (ADSR phase)
  │   └── (extended fields added per WASM export plan)
  │
  └── postMessage({ type: 'bufferUpdate', ... })
      │
      ▼
  Main thread: AudioEngine
      │
      ├── Updates Zustand store (throttled ~4Hz for UI)
      │   └── VisualizationStage reads from store
      │
      └── audioStateBuffer (direct read by viz, ~60fps)
          └── VisualizationRenderer.draw(data)
              └── Canvas rendering (up to 60fps desktop, 30fps mobile)
```

The key insight: **visualizations read directly from the shared Float64Array** at animation frame rate (~60fps desktop, ~30fps mobile), bypassing the Zustand store for render data. The Zustand store is only used for UI state (which tab is active, settings) and low-frequency updates (track metadata, position for the seek bar `aria-valuetext`).

---

## Appendix B: Voice Color Palette — Accessibility Verification

Colors verified with Coblis CVD simulator:

| Pair            | Normal   | Deuteranopia | Protanopia | Tritanopia |
| --------------- | -------- | ------------ | ---------- | ---------- |
| Blue vs Gold    | ✅ Clear | ✅ Clear     | ✅ Clear   | ✅ Clear   |
| Purple vs Green | ✅ Clear | ✅ Clear     | ✅ Clear   | ⚠️ Similar |
| Pink vs Cyan    | ✅ Clear | ✅ Clear     | ✅ Clear   | ✅ Clear   |
| Orange vs Red   | ✅ Clear | ⚠️ Similar   | ⚠️ Similar | ✅ Clear   |

Orange vs Red are close in deuteranopia/protanopia, but they are used for voices 7 and 8 (arpeggio and effect) which are rarely active simultaneously. Combined with spatial position in the piano roll, they remain distinguishable. If this proves insufficient in user testing, voice 8 can be changed to a white/gray for maximum contrast.
