---
status: "proposed"
date: 2026-03-18
decision-makers: []
consulted: []
informed: []
---

# Configure TanStack Router with File-Based Routes, Hash History, and Zod-Validated Search Params

## Context and Problem Statement

ADR-0002 selected TanStack Router as the routing library for SPC Player, citing its type-safe routing and built-in search parameter serialization. However, that decision did not specify the routing configuration approach, view hierarchy, URL schema, or search parameter strategy. These configuration details determine how navigation, deep linking, and URL state synchronization work throughout the application.

SPC Player has five primary views — Player, Playlist, Instrument, Analysis, and Settings — all of which must be directly addressable via URL (per requirements). The URL must also encode shareable playback state (selected track, speed, active voices) to support deep linking. ADR-0005 established a URL-drives-store synchronization pattern with Zustand, meaning TanStack Router is the source of truth for URL-derived state. The application deploys to GitHub Pages (static hosting with no server-side URL rewriting) and uses a persistent player bar visible across all views.

The questions this ADR resolves:

1. Should routes be defined via file-based generation, code-based `createRoute` calls, or a hybrid?
2. Should URLs use hash-based (`/#/player`) or path-based (`/player`) routing?
3. What route tree structure should the application use (flat siblings vs. nested layouts)?
4. What URL schema and search parameter serialization approach should be used for deep linking?
5. How should error boundaries, not-found handling, and loading states be configured?

## Decision Drivers

- **Type safety of route definitions and search parameters** — TanStack Router's primary value proposition is end-to-end type-safe routing. The configuration approach must maximize type inference for route paths, search params, and navigation calls.
- **Deep linking** — every view must be directly addressable via URL, and the URL must encode sufficient state to reconstruct the view (active view, selected track, playback configuration).
- **Search parameter serialization for shareable state** — speed, voice mask, and track identifier must round-trip through URL search params with validation and fallback defaults.
- **URL ↔ Zustand store synchronization** — ADR-0005 specifies URL-drives-store, not bidirectional sync. The router must integrate cleanly with this pattern.
- **GitHub Pages compatibility** — the application deploys to GitHub Pages, which serves static files and does not support server-side URL rewriting or SPA fallback configuration.
- **Persistent player bar across views** — the player transport controls remain visible during navigation between views, requiring a shared root layout.
- **Code splitting via route-based lazy loading** — each view should be a separate bundle chunk to reduce initial load time (FCP < 1.5s, TTI < 3s per requirements).
- **Error boundaries and not-found handling** — invalid routes and view-level errors must be handled gracefully with recovery options.
- **AI agent code quality** — all code is authored by LLMs. The chosen approach must produce consistent, correct output across agent invocations. Well-documented, convention-driven patterns perform better than flexible-but-ambiguous patterns.
- **Integration with planned file structure** — the architecture doc specifies `src/app/` for application shell/routing and `src/features/` for feature modules. Route files must fit this structure.

## Considered Options

- **Option 1: File-based routing with hash history**
- **Option 2: Code-based routing with explicit `createRoute` / `createRouter` calls**
- **Option 3: Hybrid — file-based for view routes, code-based for dynamic sub-routes**

### URL Schema Sub-Options (Evaluated Within Each Option)

- **Hash-based URLs**: `/#/player`, `/#/playlist?track=abc`
- **Path-based URLs**: `/player`, `/playlist?track=abc`

### Route Tree Sub-Options (Evaluated Within Each Option)

- **Flat routes**: all views as siblings under root
- **Nested layout**: root layout shell → view routes as children

## Decision Outcome

Chosen option: **"File-based routing with hash history"**, using a nested root layout, Zod-validated search params via `@tanstack/zod-adapter`, and automatic code splitting.

File-based routing is TanStack Router's recommended and most mature configuration approach. It eliminates route tree boilerplate, provides automatic code splitting via `.lazy.tsx` files, generates the route tree with full type inference, and enforces a consistent file naming convention that AI agents can follow mechanically. Hash history is the only URL strategy that works on GitHub Pages without workarounds, since the hash fragment is never sent to the server and all navigation resolves to `index.html`.

### URL Schema

| URL | View | Search Params |
|-----|------|---------------|
| `/#/` | Player (default) | `?track=<id>&speed=<number>&voices=<bitmask>` |
| `/#/playlist` | Playlist | `?track=<id>` |
| `/#/instrument` | Instrument | `?track=<id>&instrument=<index>` |
| `/#/analysis` | Analysis | `?track=<id>&tab=<memory\|registers\|voices\|echo>` |
| `/#/settings` | Settings | (none) |

Search parameters are defined per-route via Zod schemas with `fallback()` defaults, ensuring invalid or missing params never crash the application:

```typescript
// Example: Player route search params
const playerSearchSchema = z.object({
  track: fallback(z.string(), ''),
  speed: fallback(z.number().min(0.25).max(4), 1),
  voices: fallback(z.number().int().min(0).max(255), 255),
})
```

All search params are optional with sensible defaults. When a user shares a link like `/#/?track=ff6-terra&speed=0.75&voices=240`, the receiving browser validates and applies the params, falling back to defaults for any invalid values.

Audio quality settings (resampler algorithm, output sample rate, DSP interpolation mode) are intentionally excluded from URL search params — they are device-specific preferences stored in IndexedDB via Zustand's persist middleware (per ADR-0005 and ADR-0014) and should not be shared via URL. For example, sharing a 96 kHz link to an iOS Safari user would silently fail because iOS locks AudioContext to 48 kHz.

### Route Tree Structure

A nested layout with a pathless root shell containing the persistent player bar and navigation:

```
src/app/routes/
  __root.tsx              → Root layout: <AppShell> with <Outlet />
  index.tsx               → Player view (matches /#/)
  playlist.tsx            → Playlist view (matches /#/playlist)
  instrument.tsx          → Instrument view (matches /#/instrument)
  analysis.tsx            → Analysis view (matches /#/analysis)
  settings.tsx            → Settings view (matches /#/settings)
```

The root layout (`__root.tsx`) renders the persistent application shell — navigation bar, player transport controls, now-playing display — and an `<Outlet />` for the active view. View transitions swap only the `<Outlet />` content, preserving player bar state and avoiding audio interruption.

With `autoCodeSplitting: true` enabled in the Vite plugin, each route file is a single `.tsx` file containing both route configuration (search params, loaders) and the component. The plugin automatically splits these into critical and non-critical chunks at build time:

```typescript
// src/app/routes/playlist.tsx — single file, auto-split by the plugin
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator, fallback } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { PlaylistView } from '../../features/playlist/PlaylistView'
import { ViewSkeleton } from '../../components/ViewSkeleton'
import { ViewError } from '../../components/ViewError'

const playlistSearchSchema = z.object({
  track: fallback(z.string(), ''),
})

export const Route = createFileRoute('/playlist')({
  validateSearch: zodValidator(playlistSearchSchema),
  component: PlaylistView,
  pendingComponent: ViewSkeleton,
  errorComponent: ViewError,
})
```

The plugin's auto-splitting extracts the component, pendingComponent, and errorComponent into a lazy-loaded chunk, while keeping the search param validation and route matching logic in the critical path. This eliminates the need for manually maintaining paired `.tsx` + `.lazy.tsx` files.

### Router Configuration

```typescript
// src/app/router.ts
import { createRouter, createHashHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen' // auto-generated by file-based routing

const hashHistory = createHashHistory()

export const router = createRouter({
  routeTree,
  history: hashHistory,
  defaultPendingComponent: () => <ViewSkeleton />,
  defaultErrorComponent: ({ error, reset }) => <ViewError error={error} reset={reset} />,
  defaultNotFoundComponent: () => <NotFoundView />,
})
```

### Vite Plugin Configuration

```typescript
// vite.config.ts (see ADR-0009 for the complete configuration)
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
  ],
})
```

The `autoCodeSplitting: true` option enables TanStack Router's automatic code splitting, which eliminates the need for manually maintaining paired `.tsx` + `.lazy.tsx` route files. When enabled, the plugin automatically splits each route file into critical (search params, loaders, route configuration) and non-critical (component, pendingComponent, errorComponent) chunks at build time. This means each route can be a single `.tsx` file containing all route configuration and the component — the plugin handles the splitting transparently.

### Error Boundaries and Not-Found Handling

- **Root-level `defaultErrorComponent`** catches unhandled errors in any view, displaying a recovery UI with a "Reset" button.
- **Root-level `defaultNotFoundComponent`** catches navigation to undefined routes (e.g., `/#/nonexistent`), displaying a "View not found" message with navigation back to Player.
- **Per-route `errorComponent`** can override the default for view-specific error handling (e.g., the Analysis view can show a specialized error when DSP register data is unavailable).
- **Per-route `pendingComponent`** displays a loading skeleton during lazy route chunk loads, with `defaultPendingComponent` as the fallback.

### URL ↔ Store Synchronization

Per ADR-0005's URL-drives-store pattern:

1. User navigates to `/#/playlist?track=ff6-terra`.
2. TanStack Router validates search params via Zod schema → `{ track: 'ff6-terra' }`.
3. Playlist route component reads validated params via `Route.useSearch()`.
4. A `useEffect` in the route component dispatches `useAppStore.getState().loadTrack('ff6-terra')` if the track differs from the current store value.
5. User double-clicks a different track in the playlist → store action calls `router.navigate({ search: { track: newTrackId } })`.
6. Navigation triggers step 1 again with the new params.

No generic bidirectional sync middleware. The URL is authoritative for navigation-derived state; the store is authoritative for everything else.

### Consequences

- Good, because file-based routing generates the route tree automatically, eliminating 100+ lines of manual `createRoute` / `addChildren` boilerplate and the associated type composition burden.
- Good, because the TanStack Router Vite plugin produces a fully typed `routeTree.gen.ts`, giving compile-time errors for invalid route paths, missing search params, and incorrect `navigate()` calls throughout the application.
- Good, because automatic code splitting via `autoCodeSplitting: true` ensures each view's component is a separate chunk, reducing initial bundle size without any manual `.lazy.tsx` file management or dynamic import wiring.
- Good, because hash-based routing works on GitHub Pages without a `404.html` redirect hack, a custom SPA fallback script, or any server configuration — the hash fragment is never sent to the server.
- Good, because Zod search param validation with `fallback()` defaults ensures malformed or missing URL params never crash the application — they silently fall back to safe defaults, making shared links robust against partial URL corruption.
- Good, because the nested root layout preserves the persistent player bar and navigation across view transitions, preventing audio interruption and avoiding full-page remounts.
- Good, because the convention-driven file naming (`__root.tsx`, `index.tsx`, `playlist.tsx`) gives AI agents a mechanical, unambiguous pattern to follow when adding new views — no architectural judgment required. With `autoCodeSplitting`, adding a new view requires only a single route file.
- Good, because the thin route file / feature module separation keeps route configuration in `src/app/routes/` and view implementation in `src/features/`, matching the planned file structure from the architecture doc.
- Bad, because hash-based URLs are less aesthetically clean than path-based URLs (`/#/playlist` vs. `/playlist`) and are not compatible with SSR if the project ever moves to server rendering (extremely unlikely for this client-only PWA).
- Bad, because hash-based URLs place the entire route path after `#`, meaning browser-native anchor scrolling (`#section-id`) is not available within views. In-view scroll targets must use JavaScript-based scrolling instead.
- Bad, because file-based routing requires route files to live in a designated directory (`src/app/routes/`), not colocated with their feature modules in `src/features/`. This creates a split between "where the route is defined" and "where the view is implemented."
- Bad, because the auto-generated `routeTree.gen.ts` is a build artifact that must be regenerated whenever routes change, adding a code generation step to the development workflow. The Vite plugin handles this automatically in dev mode, but CI must run the generator before type checking.
- Bad, because search params encoded in hash fragments (e.g., `/#/player?track=abc`) are technically part of the fragment identifier, meaning they are handled entirely by TanStack Router's internal parser rather than the standard `URLSearchParams` API. This is transparent to application code but means browser DevTools show the full hash string rather than parsed query parameters.

### Confirmation

1. **Deep link round-trip** — navigate to `/#/playlist?track=test-id` directly in the browser address bar. Verify the Playlist view loads with `track` resolved to `"test-id"` via `Route.useSearch()` and the Zustand store's `activeTrackId` updates to match.
2. **Invalid param fallback** — navigate to `/#/?speed=invalid&voices=-1`. Verify Zod validation falls back to defaults (`speed: 1`, `voices: 255`) without errors or blank screens.
3. **Code splitting verification** — build the production bundle and inspect the output chunks. Verify that each view route produces a separate chunk (e.g., `playlist-[hash].js`, `analysis-[hash].js`) and the initial bundle does not include view component code.
4. **GitHub Pages deployment** — deploy to GitHub Pages and verify that direct navigation to `/#/settings`, `/#/analysis`, and `/#/instrument` all resolve correctly without 404 errors — no `404.html` workaround required.
5. **Player bar persistence** — navigate between Player → Playlist → Instrument → Analysis → Settings. Verify the player bar remains mounted and audio playback (if active) is uninterrupted during transitions.
6. **Back/forward navigation** — navigate Player → Playlist → Settings, then press Back twice. Verify the browser navigates Playlist → Player with correct search params restored at each step.
7. **Route type safety** — attempt `router.navigate({ to: '/nonexistent' })` in TypeScript. Verify the compiler produces a type error for the invalid route path.
8. **Not-found handling** — navigate to `/#/nonexistent`. Verify the `defaultNotFoundComponent` renders with a link back to the Player view.

## Pros and Cons of the Options

### Option 1: File-Based Routing with Hash History

TanStack Router's recommended file-based route generation via the Vite plugin (`@tanstack/router-plugin/vite`), combined with `createHashHistory()` for GitHub Pages compatibility. Route files live in `src/app/routes/` with the auto-generated route tree at `src/app/routeTree.gen.ts`.

- Good, because file-based routing is TanStack Router's recommended and most documented approach, with the most examples in official docs, blog posts, and LLM training data — producing the most reliable AI-generated code.
- Good, because the Vite plugin auto-generates the route tree with full type inference, eliminating manual `createRoute` / `addChildren` wiring and the associated `getParentRoute` type composition.
- Good, because automatic code splitting via `autoCodeSplitting: true` in the Vite plugin requires zero manual file management — the plugin automatically splits route files into critical and non-critical chunks at build time, eliminating the need for paired `.tsx` + `.lazy.tsx` files.
- Good, because the filesystem convention (`__root.tsx`, `index.tsx`, `playlist.tsx`) provides a mechanical, unambiguous pattern for adding new routes — AI agents create a single new file and the route exists with automatic code splitting.
- Good, because hash-based routing (`createHashHistory()`) works on any static hosting including GitHub Pages without server-side rewrite rules, `404.html` redirect scripts, or any deployment configuration.
- Good, because search param validation integrates directly into route definitions via `validateSearch`, co-locating the URL schema with the route it applies to.
- Good, because the Vite plugin watches for file changes in dev mode and regenerates the route tree automatically, providing instant feedback on new or renamed routes.
- Neutral, because the route files directory (`src/app/routes/`) is separate from feature modules (`src/features/`), creating a thin-wrapper pattern where route files import from features. This is a standard separation-of-concerns pattern but adds one level of indirection.
- Bad, because the auto-generated `routeTree.gen.ts` must be committed to the repository (or regenerated in CI before type checking), adding a code generation artifact to the project.
- Bad, because hash-based URLs (`/#/playlist`) are less clean than path-based URLs (`/playlist`) and sacrifice browser-native anchor scrolling within views.
- Bad, because file-based routing introduces a build-time dependency on the TanStack Router Vite plugin — if the plugin has a bug or breaking change, route generation is blocked.

### Option 2: Code-Based Routing with Explicit `createRoute` / `createRouter`

Define all routes programmatically using `createRoute`, manually compose the route tree via `addChildren`, and configure `createRouter` with the assembled tree. No Vite plugin or code generation.

- Good, because routes can be colocated with their feature modules (e.g., `src/features/playlist/route.ts`), keeping route definition and implementation in the same directory.
- Good, because there is no build-time code generation — routes are standard TypeScript modules with no generated artifacts.
- Good, because it offers full programmatic control over route composition, enabling dynamic route registration or conditional routes based on feature flags.
- Neutral, because code-based routing is well-documented in TanStack Router's docs, though the file-based approach has more examples and is more prominently recommended.
- Bad, because manual route tree construction requires explicit `getParentRoute` declarations and `addChildren` chains, producing 50–100+ lines of boilerplate that grows linearly with route count — and type errors in this wiring are cryptic.
- Bad, because code splitting is manual — each route must use `.lazy()` with an explicit dynamic `import()` call, and the developer must decide which route options go in the critical path vs. the lazy module.
- Bad, because TanStack Router's own documentation explicitly states: "code-based routing is not recommended for most use cases" and "file-based routing is the preferred way to define routes."
- Bad, because the manual route tree construction is the most error-prone pattern for AI agents — miswiring `getParentRoute`, forgetting to add a route to the tree, or incorrect `addChildren` nesting produces runtime errors that are difficult to diagnose from generated code alone.
- Bad, because without the Vite plugin's automatic tree generation, adding a new view requires modifying at minimum three locations: the route definition file, the route tree assembly, and the TypeScript type declarations — violating the open-closed principle for route additions.

### Option 3: Hybrid — File-Based for View Routes, Code-Based for Dynamic Sub-Routes

Use file-based routing for the five primary view routes, but define sub-routes or dynamic routes programmatically within feature modules. TanStack Router supports this via Virtual File Routes (`__virtual.ts` files or the `physical()` helper).

- Good, because primary view routes get the benefits of file-based generation (auto code splitting, generated types) while dynamic sub-routes get the flexibility of code-based definition.
- Good, because Virtual File Routes allow mounting a file-based subtree at a specific path, enabling feature modules to own their sub-route structure.
- Neutral, because this approach is documented but less commonly used in the TanStack Router ecosystem, meaning fewer examples in LLM training data and community resources.
- Bad, because mixing two routing paradigms increases cognitive complexity — developers (AI agents) must understand both file-based naming conventions and code-based `createRoute` patterns, and know which to apply in each context.
- Bad, because SPC Player's route tree is flat (five sibling views with no nested sub-routes), making the hybrid approach's flexibility unnecessary — there are no dynamic sub-routes that would benefit from code-based definition.
- Bad, because Virtual File Routes add configuration complexity (`__virtual.ts` files, `physical()` declarations) for a marginal benefit in a flat route tree.
- Bad, because inconsistency between routing approaches across the codebase increases the risk of AI agents generating code using the wrong paradigm for a given location, leading to misplaced route files or incorrect imports.

## More Information

### Dependency Additions

This configuration requires the following packages (all part of the TanStack Router ecosystem already selected in ADR-0002):

| Package | Purpose | Size |
|---------|---------|------|
| `@tanstack/react-router` | Core router (already selected) | ~24.5 kB gzipped |
| `@tanstack/router-plugin` | Vite plugin for file-based route generation | Dev dependency |
| `@tanstack/zod-adapter` | Zod integration for `validateSearch` | ~1 kB gzipped |
| `zod` | Search parameter schema validation | ~13 kB gzipped (Zod v3) or ~17 kB gzipped (Zod v4) |

Zod is a new dependency. Its bundle cost is justified by compile-time type inference from search param schemas, runtime validation with fallback defaults, and broad LLM training data coverage. It may also be used for SPC file metadata validation and other input validation throughout the application, amortizing the bundle cost. If bundle size becomes a concern, Zod v4's tree-shakable `zod/mini` variant offers ~2–4 kB gzipped for simple schemas (a ~64% reduction), though it uses a functional API rather than method chaining.

### File Structure Integration

```
src/
  app/
    routes/                  # TanStack Router file-based routes
      __root.tsx             # Root layout (app shell, nav, player bar, <Outlet />)
      index.tsx              # Player view (route config + component, auto-split)
      playlist.tsx           # Playlist view (route config + component, auto-split)
      instrument.tsx         # Instrument view (route config + component, auto-split)
      analysis.tsx           # Analysis view (route config + component, auto-split)
      settings.tsx           # Settings view (route config + component, auto-split)
    routeTree.gen.ts         # Auto-generated route tree (by Vite plugin)
    router.ts                # Router instance creation with hash history
  features/
    player/                  # Player view implementation
    playlist/                # Playlist view implementation
    instrument/              # Instrument view implementation
    analysis/                # Analysis view implementation
    settings/                # Settings view implementation
```

With `autoCodeSplitting: true`, route files contain both route configuration (search param schema, loaders, meta) and the React component in a single file. The Vite plugin automatically splits these into critical-path and lazy-loaded chunks at build time, so there is no need for separate `.lazy.tsx` companion files.

### Search Parameter Design Rationale

Search params are route-scoped (defined per-route, not globally) because:

1. Different views need different params — the Analysis view needs a `tab` param that is meaningless on the Player view.
2. Route-scoped validation prevents one view's params from leaking into another view's type definitions.
3. TanStack Router's `validateSearch` runs only when the route matches, avoiding unnecessary validation work.

The `voices` param uses a numeric bitmask (0–255) rather than an array of voice indices because:

- A single integer is more compact in URLs than `voices=0&voices=1&voices=2`.
- The S-DSP has exactly 8 voices, making a uint8 bitmask a natural representation (bit N = voice N active).
- Bitmask operations (`voices & (1 << n)`) are idiomatic in audio/DSP code and well-understood by the emulation layer.

Example: `voices=240` represents `0xF0` (binary `11110000`), meaning voices 5–8 are enabled and voices 1–4 are muted.

### Path-Based URL Alternative (Not Chosen)

Path-based routing (`/player`, `/playlist`) would produce cleaner URLs but requires one of these workarounds for GitHub Pages:

1. **`404.html` redirect hack** — a `404.html` that captures the path, encodes it as a query parameter, and redirects to `index.html`, which then decodes and replaces the URL. This adds a visible redirect on every deep link, requires maintaining a separate script, and can interfere with genuine 404 reporting.
2. **Service Worker interception** — after the SW is installed, it can intercept navigation requests and serve `index.html`. But the first visit (before SW installation) still hits a 404, requiring the `404.html` fallback anyway.
3. **Custom domain with a CDN** — Cloudflare or Netlify in front of GitHub Pages can add rewrite rules. This adds deployment complexity and shifts hosting from pure GitHub Pages.

Hash routing avoids all of these. The tradeoff (less clean URLs, no SSR compatibility, no native anchor scrolling) is acceptable for a client-only PWA with no SEO requirements.

### Related Decisions

- [ADR-0002](0002-ui-framework.md) — Selected TanStack Router as the routing library.
- [ADR-0005](0005-state-management-architecture.md) — Defines the URL-drives-store synchronization pattern and Zustand store topology that this ADR's URL schema integrates with.
- [ADR-0004](0004-css-methodology.md) — CSS Modules methodology; route components use CSS Modules for view-level styles.
- [ADR-0009](0009-bundler-configuration.md) — Vite configuration; the TanStack Router Vite plugin integrates into the Vite build pipeline defined there.
