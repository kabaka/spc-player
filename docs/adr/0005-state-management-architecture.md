---
status: "accepted"
date: 2026-03-18
decision-makers: []
consulted: []
informed: []
---

# Use Zustand with Domain Slices and a Ref-Based Real-Time Audio Channel

## Context and Problem Statement

SPC Player is a complex, multi-view PWA (React 19 + TypeScript + Vite, per ADR-0002) with several distinct state domains that interact in cross-cutting ways. Loading an SPC file, for example, simultaneously affects playback state (reset to stopped), playlist state (set active track), metadata state (populate tags), and DSP state (initialize emulator). The application also receives high-frequency real-time data from the AudioWorklet — VU levels, per-voice DSP state, and register snapshots — at ~60 Hz via MessagePort (per ADR-0003), which must drive 60fps visualization without causing React re-render storms across unrelated components.

ADR-0002 recommended Zustand (~475 B gzipped) as the state management library within its sub-stack table, but that recommendation was preliminary and embedded in a UI framework decision. This ADR formalizes the state management architecture as its own decision, evaluating whether Zustand remains the best choice and — critically — defining the store topology, real-time data flow strategy, persistence approach, and URL synchronization pattern that together constitute the state management architecture.

The key questions are:

1. **Which state management library** should SPC Player use?
2. **What store topology** — single store, multiple stores, or atomic primitives — best fits the application's state domains?
3. **How should real-time audio visualization data flow** from the AudioWorklet to the UI without polluting the reactive state graph?
4. **How should state be persisted** to IndexedDB (settings, playlists, recently played)?
5. **How should URL state and store state stay synchronized** with TanStack Router?

## Decision Drivers

- **High-frequency real-time updates without re-render storms** — the AudioWorklet sends VU levels, per-voice state, and DSP register snapshots at ~60 Hz via MessagePort (per ADR-0003). Visualization components must consume this data at 60fps. Routing this through a reactive store would trigger 60 re-renders per second across every subscribing component, including those that don't display audio state. The state management architecture must provide a clear boundary between reactive UI state and real-time streaming data.
- **Selector/subscription model for granular re-renders** — SPC Player has many independent UI regions (player controls, playlist panel, mixer with 8 voice channels, settings panel, metadata viewer, instrument performer). A component displaying the playlist should not re-render when playback position changes. The library must support fine-grained subscriptions where components only re-render when their specific slice of state changes.
- **Store slice architecture for complex, multi-domain state** — the application has at least 7 distinct state domains (playback, playlist, voice mixer, settings, metadata, instrument performer, export). The architecture must support organizing these into maintainable, independently testable slices with well-defined boundaries, while still allowing cross-slice reads and coordinated updates when a single user action (e.g., loading a file) affects multiple domains.
- **IndexedDB persistence for durable state** — user settings (theme, audio preferences, keyboard mappings), playlists, recently played tracks, and export preferences must survive browser restarts via IndexedDB (per requirements). The persistence mechanism should be declarative or middleware-based rather than requiring manual save/load calls scattered throughout the codebase.
- **URL ↔ store synchronization** — TanStack Router (per ADR-0002) owns URL state including the active view, selected track, and playback configuration. The state management layer must integrate with TanStack Router's search param serialization without creating dual sources of truth or circular update loops.
- **Integration with React 19 concurrent features** — React 19 introduces `useSyncExternalStore` requirements for external stores and concurrent rendering semantics. The state management library must be compatible with concurrent mode without tearing (showing inconsistent state across components during a single render pass).
- **TypeScript ergonomics** — all code is authored by AI agents. The library's TypeScript API should produce correct, idiomatic code from LLMs with minimal type annotation burden. Inference-heavy APIs are preferred over verbose generic annotations.
- **AI agent code quality** — the library must be well-represented in LLM training data to produce consistent, correct patterns across agent invocations. Libraries with large community adoption and extensive examples in training data reduce defect rates.
- **Bundle size** — SPC Player's first-load budget is constrained (FCP < 1.5s, TTI < 3s per requirements). The WASM DSP binary contributes ~50–100 KB. State management overhead should be minimal, though Service Worker caching mitigates repeat-visit cost.
- **DevTools for debugging state** — complex state interactions (cross-slice updates, persistence sync, URL synchronization) require inspection tooling. Time-travel debugging, state diff visualization, or action logging significantly reduce debugging friction.
- **Simplicity vs. flexibility tradeoff** — the architecture should be as simple as the problem allows. Boilerplate, indirection, and ceremony that don't serve a concrete requirement increase maintenance cost in an AI-maintained codebase.

## Considered Options

- **Option 1: Zustand** — lightweight external store with hooks and selector-based subscriptions (~475 B gzipped)
- **Option 2: Jotai** — atomic state management with bottom-up composition (~3.5 kB gzipped)
- **Option 3: Redux Toolkit** — full-featured predictable state container with standardized patterns (~11 kB gzipped)
- **Option 4: React Context + useReducer** — built-in React state management with no external dependencies
- **Option 5: Nanostores** — framework-agnostic atomic stores with minimal footprint (~300 B gzipped)

## Decision Outcome

Chosen option: **"Zustand"** with a single store composed of domain slices, combined with a **ref-based channel for real-time audio visualization data** that bypasses the reactive state graph entirely.

Zustand is the only option that satisfies all decision drivers simultaneously: its selector-based subscription model provides granular re-renders without boilerplate, its slice pattern supports multi-domain state organization with cross-slice access, its `persist` middleware provides declarative IndexedDB synchronization, its `useSyncExternalStore` foundation guarantees React 19 concurrent mode compatibility, and its ~475 B bundle size is the second-smallest of all options — all while being the most widely documented lightweight state library in LLM training data.

The critical architectural insight is that **real-time audio visualization data does not belong in the reactive store at all**. VU levels, per-voice state, and DSP register snapshots arriving at ~60 Hz are streaming telemetry, not application state. They are never persisted, never serialized to URLs, never the basis for conditional UI logic, and never shared across unrelated components. Routing them through any reactive store — Zustand, Jotai, Redux, or Context — would create 60 re-renders per second for every subscribing component. Instead, this data flows through a ref-based channel: the main thread's MessagePort listener writes incoming audio state to a module-scoped mutable object, and visualization components read from this object inside a `requestAnimationFrame` loop for direct DOM updates, bypassing React's reconciler entirely (consistent with ADR-0002's two-tier rendering strategy and ADR-0003's MessagePort design).

### Store Topology: Single Store with Domain Slices

A single Zustand store composed of domain slices, created via the slice pattern (`StateCreator` with mutual access):

| Slice | State Examples | Subscribing Components |
|-------|---------------|----------------------|
| `playback` | status (playing/paused/stopped), position, speed, volume, activeTrackId | Player controls, seek bar, status bar |
| `playlist` | ordered track list, shuffle mode, repeat mode, queue | Playlist panel, queue view |
| `mixer` | per-voice mute/solo state (8 voices) | Mixer panel, voice channel strips |
| `metadata` | ID666 tags, xid6 tags for active track | Metadata viewer, now-playing display |
| `settings` | theme, audio preferences, keyboard mappings, export defaults | Settings panel, theme provider |
| `instrument` | active instrument index, keyboard mapping, MIDI input state | Instrument performer, virtual keyboard |
| `export` | export format, sample rate, progress, active export jobs | Export dialog, progress indicator |

A single store is preferred over multiple independent stores because cross-slice reads are trivial (any selector can read any slice), cross-slice updates are atomic (a single `set()` call can modify multiple slices), and DevTools show the complete state tree in one view. The slice pattern provides the organizational boundaries of separate stores without the coordination complexity.

### Real-Time Audio Visualization Channel

```
AudioWorklet (audio thread)
  → MessagePort.postMessage({ vuLevels, voiceState, dspRegisters })
  → Main thread MessagePort.onmessage handler
  → Writes to audioStateBuffer (module-scoped mutable object)
  → Visualization components read audioStateBuffer in rAF loop
  → Direct DOM updates (transform, style, canvas) — no React re-render
```

The `audioStateBuffer` is a module-scoped mutable object, not a React ref and not reactive state. Visualization components (VU meters, voice state displays, echo buffer visualization) subscribe to it via `requestAnimationFrame`, not via React hooks. This is the same two-tier rendering approach described in ADR-0002's "Performance strategy for real-time visualization" section.

A small subset of audio state — specifically, whether audio is actively playing and the current playback position — does belong in the Zustand store because it drives conditional UI logic (showing play vs. pause button, updating the seek bar). This state changes at low frequency (on user actions, not per frame) and is distinct from the high-frequency visualization telemetry.

### Persistence Strategy: Zustand `persist` Middleware with IndexedDB Storage

Zustand's `persist` middleware wraps the store and automatically serializes/deserializes specified state slices to a configured storage backend. An IndexedDB storage adapter (via `idb-keyval` or a thin custom wrapper around the raw IndexedDB API) replaces the default `localStorage` backend, which is unsuitable due to its 5–10 MB quota and synchronous API.

Persisted slices:
- `settings` — full slice (theme, audio preferences, keyboard mappings)
- `playlist` — full slice (track list, order, shuffle/repeat mode)
- `playback` — partial (recently played track IDs, last volume level; not position or play/pause status)
- `export` — partial (default format and sample rate preferences; not active job state)

Non-persisted slices:
- `metadata` — derived from the loaded SPC file; reconstructed on load
- `mixer` — ephemeral per-session; starts with all voices unmuted
- `instrument` — ephemeral per-session; resets on load

The `persist` middleware's `partialize` option selects which state fields are persisted, keeping the storage footprint small and avoiding serialization of ephemeral or non-serializable state (e.g., in-progress export `Blob` references).

### URL ↔ Store Synchronization Pattern

TanStack Router is the source of truth for URL-derived state:
- Active view (player, playlist, settings, instrument, analysis)
- Selected track identifier
- Optional playback configuration (speed, active voices — for shareable links)

The synchronization follows a **URL-drives-store** pattern, not bidirectional sync:

1. TanStack Router parses search params and route params into typed loader data.
2. Route components read router state via TanStack Router hooks (`useSearch`, `useParams`).
3. When route state implies a store mutation (e.g., navigating to a track URL loads that track), the route component's effect dispatches the store action.
4. Store-driven navigation (e.g., double-clicking a playlist item) calls `router.navigate()` which updates the URL, triggering step 1.

This avoids bidirectional sync by keeping a clear hierarchy: the URL drives initial/navigated state, and user actions flow through the store then optionally update the URL via explicit navigation calls. There is no generic "sync store to URL" middleware, which would create circular update risks.

### Consequences

- Good, because Zustand's selector-based subscriptions provide component-level re-render granularity — a playlist component subscribed to `state.playlist.tracks` does not re-render when `state.playback.position` changes.
- Good, because the slice pattern organizes 7+ state domains into independently testable modules while maintaining the simplicity of a single store with atomic cross-slice updates.
- Good, because the ref-based audio channel completely isolates 60 Hz visualization updates from the React reconciler, preventing re-render storms that would degrade UI performance.
- Good, because the `persist` middleware provides declarative IndexedDB synchronization with minimal code — no manual save/load logic scattered across components.
- Good, because the URL-drives-store pattern avoids circular sync issues between TanStack Router and Zustand by establishing a clear hierarchy of authority.
- Good, because Zustand uses `useSyncExternalStore` internally, guaranteeing tear-free rendering under React 19 concurrent mode.
- Good, because ~475 B gzipped is negligible relative to the application's bundle budget and smaller than all options except Nanostores.
- Good, because Zustand is extensively represented in LLM training data (15k+ GitHub stars, thousands of blog posts and tutorials), producing consistent agent-generated code.
- Good, because Zustand DevTools (via the `devtools` middleware) provide state inspection, action logging, and time-travel debugging out of the box.
- Bad, because the slice pattern requires manual type composition — each slice's `StateCreator` must declare the full store type as a generic parameter, which is verbose and error-prone in TypeScript. This is a one-time cost per slice, not per-component.
- Bad, because the ref-based audio channel creates a parallel data flow path outside React's paradigm, which may confuse contributors (AI agents) who expect all state to flow through the store. Clear documentation and naming conventions (`audioStateBuffer`, not `audioStore`) are needed to maintain the distinction.
- Bad, because the `persist` middleware serializes to IndexedDB asynchronously, creating a window where the store has been updated but the persisted state lags behind. A browser crash during this window loses the most recent state changes. The window is typically <50ms and acceptable for settings/playlists.
- Bad, because cross-slice actions (e.g., `loadTrack` modifying playback, metadata, and mixer slices simultaneously) must be implemented as top-level store actions rather than within individual slices, creating a category of "orchestration" actions that span slice boundaries and are harder to locate.
- Bad, because Zustand's `persist` middleware hydrates asynchronously from IndexedDB, meaning the store starts with default values until hydration completes. This causes a brief flash of default state on initial load. Theme preference specifically requires a synchronous `localStorage` mirror to prevent flash of wrong theme (see [ADR-0004](0004-css-methodology.md)); other settings can tolerate the brief default state. The `onRehydrateStorage` callback can be used to coordinate post-hydration UI updates (e.g., hiding a loading skeleton, triggering dependent initialization) when precise hydration timing matters.

### Confirmation

1. **Re-render verification** — build a prototype with the playback and playlist slices. Attach a render counter to the playlist component. Verify that toggling play/pause does not increment the playlist component's render count.
2. **60 Hz visualization test** — implement a VU meter component reading from `audioStateBuffer` via `requestAnimationFrame`. Feed synthetic 60 Hz data via a mock MessagePort. Verify 60fps updates with zero React re-renders (React Profiler should show no flamegraph entries for the VU meter during data flow).
3. **Persistence round-trip** — configure the `persist` middleware with an IndexedDB adapter. Set settings and playlist state, close and reopen the tab, and verify state is fully restored.
4. **URL sync test** — navigate to a deep link URL containing a track ID and view param. Verify the store's `playback.activeTrackId` and the router's active view match. Then trigger a store action that navigates, verify the URL updates without causing a re-render loop (no infinite `useEffect` cycles).
5. **Concurrent mode compatibility** — render the application under React 19's `<StrictMode>` (which simulates concurrent features). Verify no tearing warnings and no duplicate state updates from double-invoked effects.
6. **Cross-slice action test** — call `loadTrack()` and verify that `playback`, `metadata`, and `mixer` slices all update atomically in a single synchronous `set()` call — not three separate renders.

## Pros and Cons of the Options

### Zustand

A lightweight external store for React, built on `useSyncExternalStore`, with selector-based subscriptions and composable middleware. ~475 B gzipped. Created by Daishi Kato and the Poimandres collective.

- Good, because selector-based subscriptions (`useStore(store, selector)`) provide per-component re-render control — components only re-render when their selected value changes via `Object.is` comparison, directly addressing the granular re-render requirement.
- Good, because the slice pattern (`StateCreator` with mutual slice access) supports multi-domain state organization within a single store, enabling cross-slice reads without prop drilling or context chaining.
- Good, because a single store with slices allows atomic cross-slice updates — calling `set()` once to modify playback, metadata, and mixer state produces a single React re-render, not three.
- Good, because built-in `persist` middleware supports custom storage adapters (IndexedDB), `partialize` for selective persistence, and `merge` for hydration strategy — matching all persistence requirements with declarative configuration.
- Good, because the `devtools` middleware provides Redux DevTools integration with action names, state diffs, and time-travel debugging.
- Good, because it uses `useSyncExternalStore` internally, providing tear-free rendering under React 19 concurrent mode without additional configuration.
- Good, because ~475 B gzipped is negligible overhead — smaller than a single SVG icon in many applications.
- Good, because it is the most popular lightweight React state library (44k+ GitHub stars), with extensive representation in LLM training data, blog posts, Stack Overflow answers, and official documentation.
- Good, because the API surface is minimal — `create`, `useStore`, `set`, `get`, `subscribe` — reducing the surface area for AI agent errors.
- Good, because stores are plain JavaScript objects accessible outside React (via `store.getState()` and `store.subscribe()`), enabling integration with non-React code paths like the MessagePort listener or service worker.
- Neutral, because Zustand does not enforce architectural patterns (unlike Redux Toolkit's opinionated slices) — this is flexibility for experienced teams but means AI agents must be given explicit slice conventions to follow.
- Bad, because the slice pattern's TypeScript ergonomics are verbose — each slice creator must declare the intersection type of all slices as a generic parameter, leading to repetitive type definitions as the store grows.
- Bad, because there is no built-in action/reducer pattern — state mutations are direct `set()` calls, which provide less structure than Redux Toolkit's `createSlice`/`createAsyncThunk` for complex async flows. For SPC Player's mostly synchronous state, this is acceptable.
- Bad, because Zustand middleware stacking (`devtools(persist(immer(...)))`) is ordered and can produce confusing behavior if middleware is composed incorrectly.

### Jotai

An atomic state management library for React, using a bottom-up approach where state is composed from independent atoms. ~3.5 kB gzipped. Created by Daishi Kato (same author as Zustand).

- Good, because the atomic model provides inherently granular re-renders — each atom is an independent subscription, so components only re-render when their specific atoms change, without requiring manual selector optimization.
- Good, because atoms can be composed via derived atoms (`atom((get) => get(atomA) + get(atomB))`), enabling declarative computed state that is naturally memoized.
- Good, because each atom is independently testable without needing to mock a full store.
- Good, because `atomWithStorage` provides built-in persistence to localStorage (and can be adapted for IndexedDB with a custom storage adapter).
- Good, because atom-level granularity naturally avoids re-render storms — a VU meter atom could update without affecting a playlist atom. (Though for 60 Hz data, even atomic updates are too frequent for React reconciliation.)
- Neutral, because Jotai has good but not dominant LLM training data representation — ~19k GitHub stars vs. Zustand's ~44k, resulting in somewhat less consistent AI-generated code.
- Bad, because ~3.5 kB gzipped is ~7× larger than Zustand, though still small in absolute terms.
- Bad, because the atomic model fragments state into many independent atoms, making it difficult to perform atomic cross-slice updates — coordinating a `loadTrack` action that modifies playback, metadata, and mixer atoms simultaneously requires either `jotai/utils`'s `useAtomCallback` or a derived write atom, adding indirection.
- Bad, because there is no single state tree to inspect — DevTools show individual atoms rather than a unified view, making it harder to understand the full application state during debugging.
- Bad, because the bottom-up composition model does not naturally express the "domain slice" pattern — organizing 50+ atoms across 7 domains requires naming conventions and file structure discipline that Jotai does not enforce.
- Bad, because accessing Jotai state outside React (e.g., in the MessagePort listener) requires creating a detached store instance and manually wiring it, which is less ergonomic than Zustand's `store.getState()`.

### Redux Toolkit

The official, opinionated toolset for Redux — a predictable state container for JavaScript apps. Includes `createSlice`, `createAsyncThunk`, Immer integration, and Redux DevTools. ~11 kB gzipped.

- Good, because `createSlice` enforces a standardized pattern for defining reducers, actions, and selectors — this structured convention reduces drift across AI agent invocations and makes code reviews mechanical.
- Good, because the action/reducer pattern provides a complete audit trail: every state change is a dispatched action with a type string, visible in Redux DevTools with full time-travel debugging.
- Good, because built-in Immer integration allows writing mutable-style reducer logic that produces immutable updates, reducing a common source of bugs.
- Good, because Redux is the most extensively documented state management library in existence, with the most LLM training data of any option. AI agents produce highly fluent Redux code.
- Good, because `createAsyncThunk` provides a standardized pattern for async operations (e.g., loading SPC files from IndexedDB, encoding exports) with automatic pending/fulfilled/rejected action dispatching.
- Good, because `createSelector` (via Reselect) provides memoized derived state computation.
- Good, because strong ecosystem: `redux-persist` for persistence, `redux-toolkit-query` for caching, `redux-devtools-extension` for debugging.
- Neutral, because Redux has been evolving to reduce boilerplate (Redux Toolkit is much leaner than classic Redux), but the action/dispatch/reducer indirection still adds more ceremony than direct `set()` calls for simple state updates.
- Bad, because ~11 kB gzipped is 23× larger than Zustand — a meaningful cost for a PWA with a constrained first-load budget, even with Service Worker caching.
- Bad, because the action/reducer indirection adds boilerplate for every state change — even a simple `toggleMute(voiceIndex)` requires defining an action creator, writing a reducer case, and dispatching through the store. This boilerplate is justified in large team environments but adds friction in an AI-maintained codebase with no collaborative workflow to benefit from the structure.
- Bad, because `redux-persist` stores entire state slices by default and requires Transform configuration for partial persistence (e.g., persisting `settings` but not `mixer`), adding configuration complexity.
- Bad, because accessing Redux state outside React requires importing the store instance directly, and dispatching requires the same — functionally equivalent to Zustand's `store.getState()`/`store.setState()` but with more indirection.

### React Context + useReducer

React's built-in state management primitives. `useReducer` provides reducer-based state logic; `React.createContext` + `useContext` distributes state to the component tree. No external dependencies.

- Good, because it requires zero additional dependencies — the entire state management solution is built from React primitives, minimizing bundle size.
- Good, because it uses native React APIs that are guaranteed to be compatible with React 19 concurrent features, including `useTransition` and `useDeferredValue`.
- Good, because every React developer (and every LLM trained on React code) understands `useContext` and `useReducer` — the patterns are foundational.
- Good, because `useReducer` provides structured action/dispatch semantics without an external library.
- Neutral, because there is no built-in DevTools — debugging requires custom logging middleware or React DevTools' component tree inspection, which is less ergonomic than Redux DevTools.
- Bad, because **Context does not provide subscription-based re-rendering** — every component consuming a context re-renders when any value in that context changes, regardless of whether the component uses the changed value. This is the critical flaw for SPC Player: a playlist component sharing a context with playback state would re-render on every playback position update.
- Bad, because mitigating the re-render problem requires splitting state into many separate contexts (one per domain or sub-domain), each with its own Provider — leading to deeply nested Provider trees ("Provider hell") that are difficult to maintain and compose.
- Bad, because `useReducer` state is local to a component tree — sharing state across distant parts of the tree requires lifting it to a common ancestor and threading it through context, which couples component hierarchy to state topology.
- Bad, because there is no built-in persistence mechanism — IndexedDB sync must be implemented manually with `useEffect` listeners on every persisted state value.
- Bad, because accessing context state outside React (e.g., in a MessagePort listener or service worker message handler) is not possible without extracting state into a module-scoped variable, defeating the purpose of using context.
- Bad, because cross-slice atomic updates require either a single monolithic context (re-render problem) or coordinated dispatches across multiple contexts (no atomicity guarantee within a single render).

### Nanostores

A framework-agnostic atomic store library with an extremely small footprint. ~300 B gzipped for the core, with optional React integration via `@nanostores/react` (~200 B). Created by Andrey Sitnik (PostCSS, Autoprefixer author).

- Good, because ~300 B core + ~200 B React integration is the smallest option — roughly half the size of Zustand.
- Good, because the framework-agnostic design means store logic can be reused if the UI framework ever changes (unlikely but non-zero possibility).
- Good, because atomic stores provide granular subscriptions — each store is independently subscribable, avoiding re-render cascading.
- Good, because the API is minimal and functional: `atom()`, `map()`, `computed()`, `onSet()`.
- Neutral, because computed stores (`computed(storeA, storeB, (a, b) => ...)`) provide derived state composition, similar to Jotai's derived atoms.
- Bad, because the ecosystem is significantly smaller than Zustand, Jotai, or Redux — ~5k GitHub stars, fewer blog posts, and substantially less representation in LLM training data. AI agents produce less consistent and less idiomatic Nanostores code compared to Zustand or Redux.
- Bad, because there is no official persistence middleware — IndexedDB sync must be implemented manually via `onSet` listeners on each persisted store, similar to the Context + useReducer approach.
- Bad, because there are no official DevTools — state must be debugged via console logging or custom tooling.
- Bad, because the atomic model shares Jotai's weakness for cross-store atomic updates — modifying multiple independent stores in response to a single action (e.g., `loadTrack`) cannot be batched into a single React render without explicit `batched()` calls or relying on React 18+'s automatic batching (which may not cover all update patterns from external stores).
- Bad, because `@nanostores/react` uses `useSyncExternalStore` but the integration layer is thinner and less battle-tested than Zustand's, with fewer edge cases covered in production applications.
- Bad, because organizing 7 state domains across many small independent stores requires strong naming conventions and file structure discipline that the library does not provide or enforce.

## More Information

### Zustand Slice Pattern Reference

The recommended slice pattern for SPC Player's store:

```typescript
// Each slice is a StateCreator that receives the full store type
type PlaybackSlice = { /* playback state and actions */ };
type PlaylistSlice = { /* playlist state and actions */ };
type MixerSlice = { /* mixer state and actions */ };
// ... additional slices

type AppStore = PlaybackSlice & PlaylistSlice & MixerSlice & /* ... */;

// Each slice can read/write other slices via the set/get parameters
const createPlaybackSlice: StateCreator<AppStore, [], [], PlaybackSlice> = (set, get) => ({
  // state and actions, with access to full store via get()
});

// Single store composed from all slices
const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (...args) => ({
        ...createPlaybackSlice(...args),
        ...createPlaylistSlice(...args),
        ...createMixerSlice(...args),
        // ... additional slices
      }),
      { /* persist config */ }
    )
  )
);
```

### Real-Time Audio Channel Implementation Sketch

```typescript
// Module-scoped mutable object — NOT reactive state, NOT a React ref
const audioState = {
  vuLevels: new Float32Array(16),  // 8 voices × 2 channels
  voiceState: new Array(8),        // per-voice DSP state objects
  dspRegisters: new Uint8Array(128),
};

// MessagePort listener writes directly to the ref
port.onmessage = (event) => {
  audioState.vuLevels.set(event.data.vuLevels);
  audioState.voiceState = event.data.voiceState;
  audioState.dspRegisters.set(event.data.dspRegisters);
};

// Visualization component reads from the ref in a rAF loop
function VuMeter({ voiceIndex }: { voiceIndex: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frameId: number;
    const update = () => {
      const level = audioState.vuLevels[voiceIndex * 2]; // left channel
      if (barRef.current) {
        barRef.current.style.transform = `scaleY(${level})`;
      }
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [voiceIndex]);
  return <div ref={barRef} className={styles.vuBar} />;
}
```

### IndexedDB Persistence Configuration

The `persist` middleware will be configured with:

- **Storage adapter:** a thin wrapper implementing Zustand's `StateStorage` interface over `idb-keyval` (or raw IndexedDB if the dependency is not justified — see library evaluation).
- **Storage key:** `"spc-player-state"` — a single IndexedDB entry containing the serialized persisted state.
- **`partialize`:** a function that extracts only the persisted fields from the full store, excluding ephemeral slices (`metadata`, `mixer`, `instrument`) and non-serializable values.
- **`merge`:** a deep merge strategy that allows the persisted state to be hydrated into the store without overwriting default values for fields that were added in newer versions of the application (forward-compatible hydration).
- **`version`:** an integer version number enabling migration logic when the persisted state schema changes between application versions.

### URL ↔ Store Integration Detail

TanStack Router search params are the source of truth for URL-representable state. The pattern avoids `useEffect`-based bidirectional sync in favor of explicit, unidirectional flows:

- **URL → Store (on navigation):** Route loader or component mount reads `useSearch()` and dispatches store actions to sync (e.g., `useAppStore.getState().loadTrackById(search.trackId)`). This is a one-time effect per navigation, not a subscription.
- **Store → URL (on user action):** When a user action logically implies a URL change (e.g., selecting a track), the action handler calls `router.navigate({ search: { trackId } })`. The URL update triggers a route transition, not a direct store mutation.
- **Derived state:** Values derivable from the URL (active view, selected track ID) should be read from TanStack Router hooks, not duplicated in the Zustand store. Components needing both URL state and store state import both hooks.

### Why Not a Hybrid (Zustand + Nanostores / Zustand + Jotai)?

Using multiple state management libraries — e.g., Zustand for structured slices and Nanostores or Jotai atoms for fine-grained real-time state — was considered and rejected. The real-time visualization data is better served by the ref-based channel (which has zero library overhead and zero React reconciliation cost) than by any reactive library, no matter how lightweight. Adding a second state library would increase bundle size, split developer mental models across two paradigms, and add a coordination layer between the two systems — all for a problem that refs solve more simply and performantly.

### Related Decisions

- [ADR-0001](0001-snes-audio-emulation-library.md) — SNES audio emulation library selection. The emulation core runs in the AudioWorklet and produces the real-time state data that this ADR routes via the ref-based channel.
- [ADR-0002](0002-ui-framework.md) — UI framework selection. Established React 19 + Zustand as the preliminary sub-stack. This ADR formalizes and extends that recommendation with architectural detail.
- [ADR-0003](0003-audio-pipeline-architecture.md) — Audio pipeline architecture. Defines the MessagePort protocol and ~60 Hz data flow from the AudioWorklet to the main thread, which this ADR's ref-based channel consumes.
- [ADR-0004](0004-css-methodology.md) — CSS methodology. Independent; styling approach does not affect state management architecture.
- A follow-up ADR may be needed for the **IndexedDB storage library selection** if the choice between `idb-keyval`, Dexie, or a raw IndexedDB wrapper warrants formal evaluation.
