---
status: 'accepted'
date: 2026-03-18
---

# Vite Bundler Configuration: WASM Loading, AudioWorklet Bundling, Code Splitting, and Build Optimization

## Context and Problem Statement

ADR-0002 selected React 19 + TypeScript with Vite as the bundler, citing Vite's fast HMR, native WASM plugin support, and efficient production builds with code splitting. Subsequent ADRs made decisions that depend on specific Vite behaviors:

- ADR-0003 defines a DSP WASM binary loaded via `?url` import and fetched as raw bytes (`ArrayBuffer`), and an AudioWorklet script loaded as a separate compiled asset via `?worker&url` import.
- ADR-0004 selects CSS Modules (`.module.css` files), which Vite supports natively.
- ADR-0006 specifies lazy-loaded WASM encoder modules (libflac.js, ogg-vorbis-encoder-wasm, lame-wasm) via dynamic `import()`.
- ADR-0007 defines raw WASM exports with `cargo build` + `wasm-opt`, no wasm-bindgen, with Vite integration using `?url` for WASM and `?worker&url` for worklets with content-based hashing.

However, none of these ADRs define the actual Vite configuration: plugin selection, build target, code splitting strategy, `rollupOptions`, dev vs. production differences, `base` path for GitHub Pages, or how all these asset types compose in a single build. Without a formalized configuration, these interdependent decisions risk producing incompatible or suboptimal build behavior.

What Vite configuration — plugins, build options, code splitting strategy, and asset handling — should SPC Player use to satisfy the requirements of all upstream ADRs while maintaining build simplicity and production optimization?

## Decision Drivers

- **WASM file handling** — the DSP binary (`.wasm`) must be imported via `?url` and served with the correct MIME type (`application/wasm`). Content-based hashing is required for PWA cache busting. Codec WASM modules (libflac.js, ogg-vorbis-encoder-wasm, lame-wasm) from npm packages must be lazy-loadable via dynamic `import()` as separate chunks.
- **AudioWorklet script bundling** — the worklet script (`spc-worklet.ts`) must be compiled from TypeScript, emitted as a separate asset with a `.js` extension and content-based hashing, and remain self-contained (no imports from the main application bundle). It is loaded via `audioContext.audioWorklet.addModule(url)` using a `?worker&url` import that provides TypeScript compilation without Worker constructor wrapping.
- **Code splitting for route-based lazy loading** — TanStack Router routes (player, playlist, inspector, instrument performer, settings) should be lazy-loaded via dynamic `import()`, creating separate chunks per view so the initial bundle contains only the active route's code.
- **Lazy loading of export codec modules** — encoder libraries (FLAC, OGG Vorbis, MP3) are downloaded only when the user exports in that format. Each must produce an independent chunk via dynamic `import()`.
- **CSS Modules support** — Vite's built-in CSS Modules support must work with `.module.css` files and the `camelCaseOnly` naming convention (per ADR-0004).
- **Dev server performance** — HMR must be fast for TypeScript and CSS changes. The WASM binary is rebuilt separately (`npm run build:wasm`) and a page refresh is acceptable for WASM changes (per ADR-0007).
- **Production build optimization** — minification, tree-shaking, and chunk naming must produce an efficient output. The build target must match the project's browser support requirements (browsers supporting AudioWorklet and WebAssembly).
- **Content-based hashing for cache busting** — all assets (JS chunks, CSS, WASM, worklet script) must have content-based hashes in production filenames, enabling aggressive caching by the Service Worker with automatic invalidation on content changes.
- **Build output for GitHub Pages deployment** — the `base` path must be configurable for GitHub Pages project sites (e.g., `/spc-player/`), and all asset URLs within the build output must respect this base path.
- **Plugin minimalism** — only plugins that address a concrete requirement should be included. Unnecessary plugins increase build complexity, dependency surface, and upgrade risk. The project philosophy favors fewer, well-understood dependencies.

## Considered Options

- **Option 1: Minimal Vite configuration** — `@vitejs/plugin-react` plus ecosystem plugins required by upstream ADRs (e.g., TanStack Router's Vite plugin per ADR-0013); `?url` for WASM, `?worker&url` for worklet; moderate `manualChunks` for vendor splitting; built-in CSS Modules; build target `esnext`
- **Option 2: Plugin-assisted WASM handling** — adds `vite-plugin-wasm` + `vite-plugin-top-level-await` for ES module-style WASM imports; otherwise similar to Option 1
- **Option 3: Extensive `rollupOptions` configuration** — adds explicit input entries for the AudioWorklet, fine-grained `manualChunks` for every module category, custom `assetFileNames` / `chunkFileNames` / `entryFileNames` patterns for detailed control over the output structure

## Decision Outcome

Chosen option: **"Minimal Vite configuration"**, because Vite's defaults and built-in features already satisfy every upstream ADR requirement — `?url` imports for WASM, `?worker&url` import for the AudioWorklet script, automatic code splitting on dynamic `import()` boundaries, native CSS Modules support, and content-based hashing — with only `@vitejs/plugin-react` and the TanStack Router Vite plugin (per ADR-0013) as plugins. No WASM-specific plugins are needed. The WASM-specific plugins (Option 2) are unnecessary because the project does not import WASM as ES modules, and extensive `rollupOptions` (Option 3) adds configuration complexity that fights against Vite's optimized defaults without providing measurable benefit.

### Configuration

The complete `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/spc-player/',

  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
  ],

  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },

  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },

  worker: {
    format: 'es',
  },
});
```

This configuration is intentionally minimal. Every line addresses a specific requirement from upstream ADRs or deployment constraints. The following sections explain each concern in detail.

### Plugin Selection

Two plugins are included, both addressing concrete upstream requirements:

**`@tanstack/router-plugin/vite` (TanStack Router Vite plugin)** — added per ADR-0013. Provides file-based route generation from `src/app/routes/`, produces a fully typed `routeTree.gen.ts`, and enables automatic code splitting via `autoCodeSplitting: true` (eliminating the need for manual `.lazy.tsx` files). This plugin must appear before `@vitejs/plugin-react` in the `plugins` array per TanStack Router documentation, as it needs to process route files before JSX transformation.

**`@vitejs/plugin-react`** — provides:

- JSX transform for React components
- React Fast Refresh for HMR during development
- Automatic JSX runtime (`react/jsx-runtime`) — no `import React` needed

No WASM plugin is needed because:

- The DSP `.wasm` binary is imported via `?url` (a built-in Vite feature) and fetched as raw bytes (`ArrayBuffer`) for transfer to the AudioWorklet — it is not imported as an ES module (per ADR-0007).
- Codec WASM modules (per ADR-0006) are npm packages with their own internal WASM loading mechanisms — Vite bundles their JavaScript entry points, and the packages handle their own `.wasm` file loading at runtime.
- `vite-plugin-wasm` and `vite-plugin-top-level-await` solve a problem the project does not have: synchronous ES module-style WASM imports with top-level `await`.

No CSS plugin is needed because Vite supports CSS Modules natively (per ADR-0004).

### WASM File Handling

**DSP binary (`dsp.wasm`):**

```typescript
import dspWasmUrl from '../wasm/dsp.wasm?url';

// In audio engine initialization:
const wasmBytes = await fetch(dspWasmUrl).then((r) => r.arrayBuffer());
```

- The `?url` suffix tells Vite to treat the file as a static asset and return its resolved URL.
- In development: resolves to a dev server URL (e.g., `/src/wasm/dsp.wasm`).
- In production: the file is copied to the output directory with a content-based hash (e.g., `/spc-player/assets/dsp-a1b2c3d4.wasm`) and the import resolves to this hashed path.
- The WASM file is never parsed, transformed, or processed by Vite — it is treated as an opaque binary asset.
- The raw `ArrayBuffer` is sent to the AudioWorklet via `postMessage`, where it is compiled and instantiated with `WebAssembly.instantiate(bytes, {})`. (`WebAssembly.Module` objects are silently dropped by Chromium when sent to AudioWorklet `MessagePort`, so raw bytes are used instead.)
- The file is placed in `src/wasm/dsp.wasm` after the WASM build step (`npm run build:wasm`) places it there (per ADR-0007).

**Codec WASM modules (libflac.js, ogg-vorbis-encoder-wasm, lame-wasm):**

```typescript
// In export adapter factory functions — lazy-loaded on first use:
const getFlacEncoder = () => import('libflac.js');
const getVorbisEncoder = () => import('ogg-vorbis-encoder-wasm');
const getLameEncoder = () => import('lame-wasm');
```

- Standard dynamic `import()` creates a separate chunk for each codec module in the production build.
- Vite/Rollup handles the code splitting automatically — no configuration needed.
- Each codec's internal WASM binary is managed by the package itself (either bundled as a base64 string, loaded via a relative URL, or fetched at initialization).
- Per ADR-0006's LGPL-2.1 compliance for LAME, the MP3 encoder must remain a separate, independently replaceable module — dynamic `import()` satisfies this by producing a separate chunk.

### AudioWorklet Script Bundling

```typescript
import spcWorkletUrl from './spc-worklet.ts?worker&url';

// In audio engine initialization:
await audioContext.audioWorklet.addModule(spcWorkletUrl);
```

- The `?worker&url` import tells Vite to compile TypeScript and emit the file as a separate asset with a `.js` extension and content-based hash, returning the resolved URL as a string.
- In development: Vite compiles and serves the file on-the-fly.
- In production: emitted as e.g. `/spc-player/assets/spc-worklet-a1b2c3d4.js`.
- Despite using `?worker`, Vite does NOT wrap the output in Worker boilerplate when `&url` is appended — the file contains only the AudioWorklet processor code with `registerProcessor()` at the top level.
- **Self-containment constraint**: the worklet script must have zero runtime imports from the main application bundle. `audioContext.audioWorklet.addModule()` loads the script in an isolated AudioWorklet global scope that has no access to the main thread's module graph. Shared TypeScript types can be imported (they are erased at compilation), but runtime values, functions, or modules cannot. This constraint is documented in ADR-0007.
- The `?worker` suffix alone (without `&url`) wraps the file in a `new Worker()` constructor, which is incompatible with `audioWorklet.addModule()`. However, `?worker&url` only returns the URL to the compiled file without any Worker constructor wrapping. This combination provides TypeScript compilation and `.js` output extension while maintaining AudioWorklet compatibility.
- **MIME type consideration**: GitHub Pages serves `.ts` files with MIME type `video/mp2t` (MPEG-2 Transport Stream). Using `?worker&url` ensures the worklet is emitted with a `.js` extension, which is served with `application/javascript` — required by `audioContext.audioWorklet.addModule()`. The earlier `new URL('./file.ts', import.meta.url)` pattern produced output files that retained a `.ts` extension (e.g., `spc-worklet-D9sPDmgk.ts`), causing `addModule()` to fail on GitHub Pages due to the incorrect MIME type.
- The `worker.format: 'es'` configuration in `vite.config.ts` applies to Vite's `?worker` pipeline. Both the AudioWorklet file (via `?worker&url`) and the future export Worker (per ADR-0006) pass through this pipeline, so this setting ensures both are emitted as ES modules.

### Code Splitting Strategy

Code splitting occurs at three levels, all using Vite/Rollup's built-in dynamic `import()` handling:

**1. Route-based splitting (TanStack Router):**

```typescript
// Route definitions use lazy loading:
const playerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player',
  component: lazyRouteComponent(() => import('./features/player/PlayerView')),
});

const playlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/playlist',
  component: lazyRouteComponent(
    () => import('./features/playlist/PlaylistView'),
  ),
});

// ... inspector, instrument, settings routes similarly lazy-loaded
```

Each route's component and its co-located children, styles, and utilities form a separate chunk. The initial page load downloads only the shell (layout, navigation, state management) and the active route's chunk.

**2. Feature-based splitting (export codecs):**

Per ADR-0006, each encoder is lazy-loaded via dynamic `import()` in its adapter factory function. A user who never exports MP3 never downloads the LAME WASM module.

**3. Vendor splitting (`manualChunks`):**

React and ReactDOM (~42 kB gzipped) change infrequently relative to application code. Extracting them into a `react-vendor` chunk means application code changes don't invalidate the cached React chunk, and vice versa. The Service Worker caches both chunks; on subsequent visits, only changed chunks are re-fetched.

The `manualChunks` configuration is deliberately narrow — only `react` and `react-dom` are explicitly separated. Other vendor dependencies (TanStack Router, Radix UI, Zustand) are left to Vite's default splitting heuristics because:

- They change more frequently than React (more active release cycles).
- Aggressively splitting every vendor dependency into separate chunks increases HTTP request count on first load.
- Vite's automatic chunk splitting based on import graph analysis produces reasonable defaults.
- The Service Worker caches all chunks after first load, so the marginal benefit of per-library caching diminishes after the first visit.

### Build Target: `esnext`

`build.target: 'esnext'` instructs esbuild to output modern JavaScript without transpilation. This is appropriate because SPC Player's hard requirements (AudioWorklet, WebAssembly, Service Worker, CSS custom properties) already exclude all legacy browsers:

| Feature            | Minimum Browser Support                  |
| ------------------ | ---------------------------------------- |
| AudioWorklet       | Chrome 66, Safari 14.1, Firefox 76       |
| WebAssembly        | Chrome 57, Safari 11, Firefox 52         |
| CSS Modules        | All modern browsers (build-time feature) |
| Dynamic `import()` | Chrome 63, Safari 11.1, Firefox 67       |
| `import.meta.url`  | Chrome 64, Safari 12, Firefox 62         |

Any browser that supports AudioWorklet supports all ES2022+ syntax features. Transpiling to a lower target would increase bundle size for browsers that cannot run the application regardless.

### Production Source Maps

`build.sourcemap: true` generates source maps in production. This is enabled because:

- WASM-related issues in production require mapping minified JavaScript back to source for diagnosis.
- The Service Worker and AudioWorklet introduce complex loading sequences where stack traces in minified code are unintelligible.
- Source maps are separate files (`.js.map`) — they are not downloaded by users unless browser DevTools are open. There is no performance or bundle size penalty for end users.
- GitHub Pages serves `.map` files without issue.

### `base` Path

`base: '/spc-player/'` configures all asset URLs to be relative to the GitHub Pages project site path. All generated references — `<script src>`, CSS `url()`, dynamic `import()` chunk paths, and `?url` asset imports — are prefixed with this base path.

If the project is deployed to a custom domain (root path), this value changes to `'/'`. The base path can also be set via the `--base` CLI flag at build time, enabling CI to override it without modifying the config file:

```bash
vite build --base=/
```

### CSS Modules Configuration

```typescript
css: {
  modules: {
    localsConvention: 'camelCaseOnly',
  },
},
```

- `localsConvention: 'camelCaseOnly'` converts CSS class names from kebab-case (`main-container`) to camelCase (`mainContainer`) in the imported styles object, and **only** exports the camelCase version. This enforces a single naming convention in TypeScript (`styles.mainContainer`, not `styles['main-container']`) and is consistent with ADR-0004's conventions.
- No additional CSS configuration is needed. CSS Modules (`.module.css` files) and CSS custom properties for theming work with Vite's built-in CSS pipeline.

### Dev vs. Production Build Differences

| Concern        | Development                                              | Production                                              |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| WASM binary    | Debug build (no `wasm-opt`), ~500 KB–1 MB                | Release build + `wasm-opt -Oz`, target < 150 KB         |
| TypeScript     | On-the-fly transform, no bundling                        | Full bundle, tree-shake, minify                         |
| CSS Modules    | Scoped class names, no minification                      | Scoped class names, minified, extracted to `.css` files |
| Source maps    | Inline (default for dev)                                 | Separate `.map` files                                   |
| Code splitting | No splitting (modules served individually)               | Dynamic `import()` boundaries produce separate chunks   |
| Asset hashing  | No hashing (dev server URLs)                             | Content-based hashes on all assets                      |
| HMR            | React Fast Refresh for TSX/CSS changes                   | N/A                                                     |
| WASM changes   | Manual rebuild (`npm run build:wasm:dev`) + page refresh | `npm run build:wasm` runs before `vite build`           |

**Build order** (per ADR-0007):

1. `npm run build:wasm` — compiles Rust to WASM and runs `wasm-opt` (production) or skips optimization (dev)
2. `npm run build` (production) or `npm run dev` (development) — Vite processes the application

The npm scripts enforce this order:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "npm run build:wasm && vite build",
    "build:wasm": "cargo build --target wasm32-unknown-unknown --release -p spc-apu-wasm && wasm-opt -Oz -o src/wasm/dsp.wasm target/wasm32-unknown-unknown/release/spc_apu_wasm.wasm",
    "build:wasm:dev": "cargo build --target wasm32-unknown-unknown -p spc-apu-wasm && cp target/wasm32-unknown-unknown/debug/spc_apu_wasm.wasm src/wasm/dsp.wasm",
    "preview": "vite preview"
  }
}
```

### Content-Based Hashing and PWA Cache Busting

Vite's default production output uses content-based hashes in filenames:

- JavaScript chunks: `[name]-[hash].js` (e.g., `index-a1b2c3d4.js`)
- CSS files: `[name]-[hash].css`
- Static assets (including WASM via `?url`): `[name]-[hash].[ext]`

This naming pattern is compatible with the Service Worker's cache-first strategy: the Service Worker caches assets by URL, and content changes produce new URLs (different hashes), triggering automatic cache updates on the next Service Worker activation. Unchanged assets retain their hash and continue serving from cache.

No custom `assetFileNames`, `chunkFileNames`, or `entryFileNames` configuration is needed — Vite's defaults produce the correct hashing behavior for PWA cache busting.

### Consequences

- Good, because only two plugins (`@tanstack/router-plugin/vite` per ADR-0013 and `@vitejs/plugin-react`) are needed, minimizing the build dependency surface and reducing upgrade risk and build configuration complexity.
- Good, because all WASM and AudioWorklet loading patterns required by ADR-0003 and ADR-0007 work with Vite's built-in features (`?url` imports for WASM, `?worker&url` for the AudioWorklet) — no additional plugins needed.
- Good, because dynamic `import()` for both route-based splitting and codec lazy loading works automatically via Vite's Rollup integration, requiring zero code-splitting configuration.
- Good, because CSS Modules work natively with a single `localsConvention` setting, consistent with ADR-0004.
- Good, because `build.target: 'esnext'` avoids unnecessary transpilation, producing smaller bundles given the project's modern browser requirements.
- Good, because content-based hashing is Vite's default behavior, providing automatic PWA cache busting with no additional configuration.
- Good, because the configuration is ~30 lines of code — small enough to be fully understood and maintained by AI agents without risk of configuration drift.
- Good, because production source maps enable debugging of the complex WASM + AudioWorklet loading pipeline without impacting end-user performance.
- Bad, because the `manualChunks` configuration only separates `react` and `react-dom` — other vendor dependencies may be duplicated across route chunks if imported by multiple routes, slightly increasing total download size. This tradeoff is acceptable because Service Worker caching eliminates repeat-download cost, and the alternative (aggressive per-library splitting) increases request count on first load.
- Bad, because the AudioWorklet script's self-containment constraint (no runtime imports from the main application bundle) must be enforced by developer discipline. Vite's `?worker&url` pipeline bundles the worklet's own imports, but the AudioWorklet global scope has no access to the main thread's module graph — runtime values, functions, or modules from the application bundle cannot be imported. Shared TypeScript types (erased at compilation) are safe; runtime dependencies are not.
- Bad, because the `base` path is hardcoded in `vite.config.ts` and must be changed for non-GitHub-Pages deployments (custom domain or different project name). This can be mitigated by using the `--base` CLI flag at build time.
- Bad, because codec WASM modules from npm packages may internally load their `.wasm` files via `fetch()` with paths relative to the package — Vite's build may not correctly rewrite these internal paths. This must be verified per-package during ADR-0006 confirmation and may require per-package workarounds (e.g., configuring the package's WASM path at initialization, or using `optimizeDeps.exclude` to prevent Vite from pre-bundling the package's WASM loader).

### Confirmation

1. **WASM `?url` import verification** — import `dsp.wasm` via `?url` in both dev and production. Verify that `fetch(url).then(r => r.arrayBuffer())` succeeds (correct path, no CORS issues). In production, verify the filename contains a content-based hash.
2. **AudioWorklet loading verification** — import the worklet script via `import spcWorkletUrl from './spc-worklet.ts?worker&url'` and load it with `audioContext.audioWorklet.addModule(spcWorkletUrl)` in both dev and production. Verify the processor registers correctly. In production, verify the emitted file is valid JavaScript (TypeScript compiled, `.js` extension), contains no unresolved imports, and has a content-based hash.
3. **Code splitting verification** — build the production bundle and inspect the output with `npx vite-bundle-visualizer` or `rollup-plugin-visualizer`. Verify that: (a) each TanStack Router route produces a separate chunk, (b) each codec encoder produces a separate chunk, (c) React + ReactDOM are in a `react-vendor` chunk, and (d) no unexpected code duplication exists across chunks.
4. **CSS Modules verification** — verify that `.module.css` imports produce scoped class names in both dev and production, and that the `camelCaseOnly` convention is applied (e.g., `.main-container` in CSS is only accessible as `styles.mainContainer` in TypeScript).
5. **GitHub Pages deployment verification** — deploy the production build to GitHub Pages and verify all asset URLs resolve correctly with the `/spc-player/` base path. Verify the Service Worker correctly caches and serves all hashed assets.
6. **Codec WASM lazy loading verification** — trigger each export format (FLAC, OGG Vorbis, MP3) and verify the network tab shows the encoder's chunk being downloaded on first use, not at initial page load. Verify the encoder's internal WASM binary loads correctly when served from the production output directory.
7. **Build output size audit** — measure the production build output: initial bundle (app shell + active route), `react-vendor` chunk, and total size. Targets: initial JS bundle < 100 kB gzipped (excluding vendor), `react-vendor` < 45 kB gzipped, total (excluding lazy-loaded codecs and DSP WASM) < 200 kB gzipped.

## Pros and Cons of the Options

### Option 1: Minimal Vite Configuration

`@vitejs/plugin-react` and the TanStack Router Vite plugin (per ADR-0013) as the only plugins. WASM loaded via `?url`, AudioWorklet via `?worker&url`, code splitting via dynamic `import()` and automatic route splitting, CSS Modules via built-in support. A narrow `manualChunks` function separates React + ReactDOM into a vendor chunk. Build target `esnext`. Configuration is ~30 lines.

- Good, because the configuration is trivially understandable — every line maps to a concrete architectural requirement, with no speculative or "might need it later" settings.
- Good, because a single plugin (`@vitejs/plugin-react`) means the build depends on only two tools (Vite and the React plugin), both maintained by the Vite team, minimizing third-party dependency risk.
- Good, because `?url` for WASM and `?worker&url` for the AudioWorklet are documented, stable Vite features — not plugin-specific APIs that could change across plugin versions.
- Good, because Vite's default code splitting on dynamic `import()` boundaries automatically handles route-based splitting (TanStack Router) and codec lazy loading (ADR-0006) with zero configuration.
- Good, because `build.target: 'esnext'` avoids useless transpilation overhead — browsers that can't run ES2022+ also can't run AudioWorklet or WebAssembly, which the application requires.
- Good, because Vite's default content-based hashing produces correct PWA cache-busting behavior without custom filename patterns.
- Good, because the configuration is well-represented in LLM training data (the pattern of "React + Vite with minimal config" is among the most common Vite configurations), reducing the risk of AI agents producing incorrect config edits.
- Neutral, because `manualChunks` only separates React/ReactDOM — other vendor libraries (TanStack Router ~24.5 kB, Radix UI, Zustand) remain in Vite's default splitting. This is a deliberate tradeoff: Service Worker caching makes aggressive vendor splitting unnecessary, and simpler configuration reduces maintenance burden.
- Bad, because there is no build-time validation that the AudioWorklet script avoids importing runtime values from the main application bundle. Vite's `?worker&url` pipeline bundles the worklet's own imports, but the AudioWorklet global scope cannot access the main thread's module graph. An import that resolves at build time but references main-thread-only APIs would fail at runtime in the worklet. This must be caught by E2E tests or manual review.
- Bad, because codec WASM modules from npm packages may require per-package investigation to ensure their internal WASM loading is compatible with Vite's production output (path rewriting, MIME types, CORS).

### Option 2: Plugin-Assisted WASM Handling (`vite-plugin-wasm` + `vite-plugin-top-level-await`)

Adds `vite-plugin-wasm` and `vite-plugin-top-level-await` to enable ES module-style WASM imports: `import init, { dsp_render } from './dsp.wasm'` with top-level `await init()`.

- Good, because ES module-style WASM imports provide a more ergonomic developer experience — `import` statements instead of manual `fetch()` + `arrayBuffer()`.
- Good, because `vite-plugin-wasm` handles WASM binary embedding and module generation automatically.
- Bad, because **the project does not need ES module-style WASM imports**. ADR-0007 explicitly chose raw WASM exports with manual `fetch()` + `arrayBuffer()` — the DSP WASM binary is fetched as raw bytes in the main thread and sent to the AudioWorklet, a flow that ES module WASM imports do not support.
- Bad, because `vite-plugin-wasm` inlines WASM binaries as base64 or uses `fetch()` internally — both incompatible with the bytes-transfer pattern where raw `ArrayBuffer` data is sent to the AudioWorklet via `postMessage` (per ADR-0003).
- Bad, because `vite-plugin-top-level-await` transforms the output to wrap modules in async IIFEs, which can interfere with tree-shaking and produce unexpected module evaluation order.
- Bad, because adding two plugins for a problem the project doesn't have increases the dependency surface and build complexity without benefit.
- Bad, because both plugins are community-maintained (not by the Vite team) — they may lag behind Vite major version upgrades, creating CI breakage risk.
- Bad, because codec WASM modules (libflac.js, ogg-vorbis-encoder-wasm, lame-wasm) ship as npm packages with their own WASM loading — `vite-plugin-wasm` would not improve their integration and could interfere if it attempts to process their internal `.wasm` files.

### Option 3: Extensive `rollupOptions` Configuration

Adds explicit `input` entries for the AudioWorklet, fine-grained `manualChunks` for every dependency category (React, Router, Radix, Zustand, each codec), and custom `assetFileNames` / `chunkFileNames` / `entryFileNames` patterns.

Example configuration fragment:

```typescript
rollupOptions: {
  input: {
    main: 'index.html',
    worklet: 'src/audio/spc-worklet.ts',
  },
  output: {
    manualChunks(id) {
      if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
      if (id.includes('@tanstack/react-router')) return 'router';
      if (id.includes('@radix-ui')) return 'radix-ui';
      if (id.includes('zustand')) return 'zustand';
      if (id.includes('libflac')) return 'codec-flac';
      if (id.includes('ogg-vorbis')) return 'codec-vorbis';
      if (id.includes('lame-wasm')) return 'codec-mp3';
    },
    entryFileNames: 'assets/[name]-[hash].js',
    chunkFileNames: 'assets/[name]-[hash].js',
    assetFileNames: 'assets/[name]-[hash][extname]',
  },
},
```

- Good, because explicit `input` for the worklet ensures it is bundled as a proper entry point with all dependencies resolved — no risk of unresolved imports.
- Good, because granular `manualChunks` gives precise control over chunk boundaries, enabling optimal cache invalidation patterns where each library's chunk changes independently.
- Good, because custom filename patterns provide full control over the output directory structure.
- Bad, because `manualChunks` for codec modules conflicts with dynamic `import()` splitting — codec modules loaded via `import('libflac.js')` are already split into separate chunks by Rollup's dynamic import detection. Explicitly assigning them in `manualChunks` can cause Rollup to emit duplicate code or produce unexpected chunk boundaries.
- Bad, because adding the worklet as an explicit `input` produces a separate HTML entry point scaffold that must be suppressed or handled — it is not a page entry, it is a script asset. This approach fights against Vite's page-based entry model.
- Bad, because per-library `manualChunks` splits produce more HTTP requests on first load (7+ separate chunk requests instead of 2–3), increasing first-visit latency from connection overhead — especially on mobile networks where each request adds round-trip latency. Service Worker caching mitigates subsequent visits but not the first load.
- Bad, because the configuration is ~40 lines of fragile logic that must be updated whenever a dependency is added, removed, or renamed. AI agents modifying `vite.config.ts` must understand the chunk splitting strategy to avoid breaking it, increasing the surface area for configuration defects.
- Bad, because custom `entryFileNames`, `chunkFileNames`, and `assetFileNames` patterns produce the same output as Vite's defaults (`[name]-[hash].[ext]`) — explicit configuration that duplicates default behavior adds maintenance cost without changing behavior.
- Bad, because the Zustand chunk (~475 B gzipped) and individual Radix UI component chunks are too small to justify separate HTTP requests — the overhead of the request exceeds the payload size. Vite's default heuristics merge small modules into shared chunks, which is the better behavior.

## More Information

### Omitted Configuration (Intentionally Left at Defaults)

The following Vite options are intentionally not configured, because the defaults are correct:

| Option                        | Default       | Why Default Is Correct                                                                                        |
| ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| `build.minify`                | `'esbuild'`   | esbuild minification is fast and produces small output; Terser is unnecessary                                 |
| `build.cssMinify`             | `'esbuild'`   | Consistent with JS minification                                                                               |
| `build.assetsInlineLimit`     | `4096` (4 KB) | Small assets (icons, tiny images) are inlined as data URLs; WASM files (> 4 KB) are never inlined             |
| `build.chunkSizeWarningLimit` | `500` (kB)    | Appropriate warning threshold; codec chunks may exceed this, which is acceptable and expected                 |
| `build.outDir`                | `'dist'`      | Standard output directory for CI/CD                                                                           |
| `build.assetsDir`             | `'assets'`    | Standard assets subdirectory                                                                                  |
| `server.port`                 | `5173`        | No port conflicts expected                                                                                    |
| `resolve.alias`               | none          | The project uses relative imports; path aliases add indirection without clear benefit at current project size |

### Codec WASM Compatibility Considerations

Pre-compiled WASM encoder packages (libflac.js, ogg-vorbis-encoder-wasm, lame-wasm) may internally load their `.wasm` files via:

- Inline base64 — works without configuration
- Relative `fetch()` — may break if Vite rewrites the package's internal paths during bundling

If a codec package uses relative `fetch()` for its WASM binary, potential mitigations include:

1. **`optimizeDeps.exclude`** — exclude the package from Vite's dependency pre-bundling, preserving its original file structure
2. **Package-specific initialization** — some packages accept a custom path or URL for their WASM binary at initialization, allowing the application to provide the correct production path
3. **`assetsInclude`** — add the package's WASM file pattern to `assetsInclude` so Vite treats it as a static asset

These mitigations must be evaluated per-package during ADR-0006 confirmation and documented as implementation notes.

### Future Configuration Changes

The configuration may evolve in response to confirmed needs:

- **If `manualChunks` conflicts arise** — if Vite/Rollup produces warnings about circular chunk dependencies or unexpected splitting, `manualChunks` can be removed entirely, deferring to Vite's automatic splitting. The React vendor chunk is an optimization, not a requirement.
- **If AudioWorklet script needs bundled imports** — if the worklet script's self-containment constraint proves too restrictive (e.g., a shared utility is genuinely needed at runtime), the script can be built separately via a second Vite invocation in library mode or migrated to the `?worker&inline` pattern adapted for AudioWorklet. This would require an ADR amendment.
- **If type-checked CSS Modules are needed** — ADR-0004 notes that CSS Module class name typos silently produce `undefined`. If this becomes a observed source of defects, `vite-plugin-typed-css-modules` or a similar plugin can be added to generate `.d.ts` files for CSS Modules at build time.
- **If a visualizer is needed for bundle analysis** — `rollup-plugin-visualizer` can be added as a dev dependency (not a production dependency) to inspect chunk composition during build optimization.

### Related Decisions

- [ADR-0002](0002-ui-framework.md) — selected React 19 + Vite, establishing Vite as the bundler.
- [ADR-0003](0003-audio-pipeline-architecture.md) — defines the WASM bytes-transfer pattern and AudioWorklet loading that this configuration supports.
- [ADR-0004](0004-css-methodology.md) — selected CSS Modules, which this configuration enables via `css.modules.localsConvention`.
- [ADR-0006](0006-audio-codec-libraries.md) — selected lazy-loaded WASM encoder packages, whose dynamic `import()` lazy loading this configuration supports.
- [ADR-0007](0007-wasm-build-pipeline.md) — defines the WASM build pipeline and Vite integration patterns (`?url`, `?worker&url`) that this configuration relies on.
- [ADR-0013](0013-router-configuration.md) — configures TanStack Router with file-based routing; the TanStack Router Vite plugin (`@tanstack/router-plugin/vite`) is included in this configuration per that ADR.
