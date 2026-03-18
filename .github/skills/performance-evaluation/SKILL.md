---
name: performance-evaluation
description: Profiling methodology, metric collection, bottleneck analysis, and optimization verification.
---

# Performance Evaluation

Use this skill when profiling, analyzing, or optimizing performance. Always measure before and after changes.

## Methodology

1. **Establish baseline**: collect metrics before any changes.
2. **Identify bottleneck**: profile to find the biggest contributor, not the easiest fix.
3. **Hypothesize**: predict what improvement the fix will yield.
4. **Implement**: apply the targeted fix.
5. **Verify**: re-measure. Confirm improvement and no regressions.
6. **Document**: record the change and measured impact.

## Key Metrics

### Load Performance (Core Web Vitals)

- First Contentful Paint (FCP): target < 1.5s.
- Time to Interactive (TTI): target < 3s.
- Largest Contentful Paint (LCP): target < 2.5s.
- Cumulative Layout Shift (CLS): target < 0.1.

### Runtime Performance

- Audio latency: target < 20ms from user action to sound.
- Frame rate: target 60fps during playback with visualizations.
- DSP emulation throughput: must sustain real-time (32 kHz) on mid-range mobile.
- Memory usage: WASM heap + JS heap should remain bounded during extended playback.

### Bundle Performance

- Initial bundle size: minimize for fast first load.
- Code splitting: lazy-load features not needed at startup.
- WASM module size: optimize with `-Oz` or equivalent.
- Asset caching: leverage content-hashed filenames for long cache lifetimes.

## Profiling Tools

- Chrome DevTools Performance tab: CPU profiling, flame charts.
- Chrome DevTools Memory tab: heap snapshots, allocation timeline.
- Lighthouse: automated Core Web Vitals audit.
- `performance.measure()` / `performance.mark()` for custom timing.
- Bundle analyzer (webpack-bundle-analyzer, rollup-plugin-visualizer).

## Rules

- Never optimize without profiling data.
- Optimize the bottleneck, not the thing you know how to optimize.
- Don't sacrifice readability for micro-optimizations outside hot paths.
- The audio render loop is always a hot path.
- Document why an optimization was applied (not just what).
