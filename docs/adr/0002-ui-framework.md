---
status: "accepted"
date: 2026-03-18
---

# Use React + TypeScript for the UI Framework

## Context and Problem Statement

SPC Player is a complex, multi-view PWA for playing, analyzing, and exporting SNES SPC music files. It requires player controls with playlist drag-reorder, an 8-voice mute/solo mixer, an instrument performer with virtual keyboard and MIDI input, a memory/register inspector, metadata viewer, VU meters, voice visualization, settings panel, and deep linking across all views — all with WCAG 2.2 AA accessibility, dark/light theming, and mobile-first responsive design.

The UI layer must manage significant interactive complexity while maintaining real-time audio visualization performance. All code in this project is written by AI agents (LLMs), making framework familiarity in training data a practical concern for code quality and consistency.

Which UI framework — or no framework — should SPC Player use?

## Decision Drivers

- Complex, multi-view SPA requiring robust state management across player, playlist, instrument, analysis, and settings views
- Real-time visualization updates (VU meters at 60fps, voice state, echo buffer) must not drop frames
- WCAG 2.2 AA accessibility compliance is a hard requirement, demanding mature accessible component primitives
- Mobile-first responsive design across phone, tablet, and desktop breakpoints (framework-agnostic; listed for completeness — primarily a CSS-level concern that does not differentiate options)
- PWA requirements including service worker, install prompt, offline support, and background audio (framework-agnostic; listed for completeness — primarily a platform-API-level concern that does not differentiate options)
- AI agent productivity: all code is authored by LLMs, so framework representation in training data directly impacts output quality
- Bundle size affects first-load performance on mobile networks; Service Worker caching mitigates repeat-visit cost
- Testing story must cover unit, integration, and E2E layers with mature tooling
- Long-term maintainability of a codebase with no human developers
- Ecosystem maturity for routing, state management, and accessibility primitives

## Considered Options

- React + TypeScript (with Vite)
- Vanilla TypeScript (no framework)
- Preact
- Solid.js
- Svelte 5

## Decision Outcome

Chosen option: "React + TypeScript (with Vite)", because it is the only option that simultaneously satisfies all decision drivers — mature accessible component primitives (Radix UI), the strongest AI agent code quality due to dominant training data representation, a proven architecture for complex SPAs, and a gold-standard testing ecosystem — while its primary downside (bundle size) is effectively mitigated by Service Worker caching.

### Consequences

- Good, because AI agents produce high-quality, idiomatic React code consistently, reducing defect rates and review burden.
- Good, because Radix UI provides unstyled, WCAG-compliant primitives for every interactive component we need (dialogs, dropdowns, sliders, tabs, toggles), eliminating the need to build accessibility from scratch.
- Good, because React Testing Library's query-by-role pattern reinforces accessibility compliance — tests that pass also validate ARIA semantics.
- Good, because the vast React ecosystem (Zustand, TanStack Router, Radix UI, react-dnd) provides mature, maintained solutions for state management, routing, accessibility, and drag-reorder, reducing custom code.
- Good, because React 19's concurrent features and ref-based escape hatches support the mixed rendering model we need (reconciled UI + direct DOM for 60fps visualizations).
- Bad, because React + ReactDOM adds ~42 kB gzipped to the initial bundle, though this is a one-time cost cached by the Service Worker and small relative to the WASM DSP binary.
- Bad, because React's reconciler is not designed for per-frame visual updates; VU meters and voice visualizations will require bypassing React via refs and `requestAnimationFrame` for direct DOM manipulation.
- Bad, because React 19 concurrent features introduce behavior changes that may surface compatibility issues with specific third-party libraries.

### Confirmation

- Prototype a VU meter component updating at 60fps using refs and `requestAnimationFrame` to validate that React's reconciler does not interfere with direct DOM updates for real-time visualization.
- Verify Radix UI component compatibility with React 19 by building a test harness exercising Dialog, DropdownMenu, Slider, Tabs, and Toggle primitives.
- Validate TanStack Router deep linking with all planned views (player, playlist, instrument, analysis, settings) and confirm URL state serialization round-trips correctly.
- Measure Lighthouse performance scores (LCP, TTI) and total bundle size with the chosen sub-stack to confirm the application meets the < 1.5s FCP and < 3s TTI targets from requirements.

## Pros and Cons of the Options

### React + TypeScript (with Vite)

Sub-stack: React 19 + ReactDOM (~42 kB gzipped), Zustand (~475 B), TanStack Router (~24.5 kB gzipped), Radix UI (per-component tree-shakeable).

- Good, because React dominates LLM training data, producing the most fluent and idiomatic agent-generated code of any framework.
- Good, because Radix UI provides battle-tested, unstyled, WCAG-compliant primitives for every component SPC Player needs, with excellent composition patterns.
- Good, because React Testing Library + Vitest is the gold standard for component testing, and its query-by-role API reinforces accessibility compliance.
- Good, because Zustand provides lightweight state management (~475 B gzipped) with a minimal API surface and excellent devtools, avoiding Redux boilerplate.
- Good, because TanStack Router offers type-safe routing with built-in search param serialization, ideal for deep linking requirements.
- Good, because the React ecosystem is the largest of any UI framework, offering maintained solutions for virtually every feature (drag-and-drop, virtualization, animation).
- Good, because Vite provides fast HMR, native WASM plugin support, and efficient production builds with code splitting.
- Neutral, because React's component model is well-understood but adds a layer of abstraction over the DOM that must be bypassed for performance-critical rendering.
- Bad, because React + ReactDOM adds ~42 kB gzipped baseline overhead, the largest of the considered options.
- Bad, because the virtual DOM reconciler is unsuitable for per-frame visual updates; VU meters and visualizations require ref-based escape hatches to achieve 60fps.
- Bad, because React 19 concurrent features introduce behavior changes that may surface compatibility issues with specific third-party libraries.

### Vanilla TypeScript (no framework)

Pure TypeScript with direct DOM manipulation, no component framework.

- Good, because it produces the smallest possible bundle with zero framework overhead.
- Good, because it provides full control over rendering with no abstraction layer, ideal for performance-critical audio visualization.
- Good, because there is no framework version to maintain or upgrade.
- Bad, because it requires building a component system, state management, router, and accessibility layer from scratch — thousands of lines of infrastructure code before any features.
- Bad, because there are no standard patterns; each AI agent invocation may produce structurally different component implementations, leading to inconsistent architecture.
- Bad, because testing DOM manipulation code requires a custom test harness, significantly increasing test infrastructure complexity.
- Bad, because accessibility must be implemented manually for every interactive element — ARIA attributes, focus management, keyboard navigation, screen reader announcements — with no primitives to build on.
- Bad, because the development cost is highest of all options: every reusable component (modal, dropdown, slider, tabs, drag-reorder list) must be authored and tested from scratch.
- Bad, because routing and deep linking require a custom implementation including history API integration, URL parsing, and state serialization.

### Preact

Preact with preact/compat for React library compatibility. ~4.7 kB gzipped.

- Good, because it provides a React-compatible API at ~4.7 kB gzipped — roughly 10x smaller than React + ReactDOM.
- Good, because preact/compat enables use of React ecosystem libraries (Radix UI, React Testing Library) without code changes.
- Good, because Preact's smaller size improves first-load performance on constrained networks.
- Neutral, because Preact is reasonably represented in LLM training data, though significantly less than React, which may produce slightly less idiomatic code.
- Bad, because the preact/compat layer introduces debugging friction: stack traces pass through compatibility shims, making it harder to diagnose issues in complex component trees using libraries like Radix UI.
- Bad, because subtle behavioral differences between Preact and React (event system, synthetic events, concurrent features) can cause hard-to-diagnose bugs in libraries that depend on React internals.
- Bad, because Preact's own ecosystem is smaller; relying on React libraries through compat means depending on a compatibility layer that may lag behind React releases.
- Bad, because the ~33 kB size savings over React is largely irrelevant after Service Worker caching and is small compared to the WASM DSP binary.

### Solid.js

Solid.js with fine-grained reactivity and no virtual DOM. ~7 kB gzipped.

- Good, because fine-grained reactivity eliminates the virtual DOM, providing excellent rendering performance without reconciliation overhead.
- Good, because the ~7 kB gzipped bundle is significantly smaller than React.
- Good, because the reactive primitive model is well-suited to real-time data flows like audio state updates.
- Neutral, because JSX syntax looks similar to React but follows fundamentally different execution semantics (components run once, not on every render).
- Bad, because LLMs frequently generate subtly broken Solid code — destructuring props breaks reactivity, a mistake that compiles without errors but produces silent bugs at runtime.
- Bad, because the Solid accessibility primitive ecosystem is less mature than React's, with fewer maintained options — Kobalte, the primary library, was at v0.13 with its last publish over 8 months ago as verified in March 2026, indicating uncertain maintenance and a critical risk for WCAG 2.2 AA compliance.
- Bad, because the ecosystem is immature: fewer routing options, fewer maintained utility libraries, and fewer reference implementations for complex SPAs.
- Bad, because the smaller community means fewer Stack Overflow answers, blog posts, and examples in LLM training data, reducing AI agent code quality.
- Bad, because adopting Solid requires the entire team (AI agents) to correctly internalize a reactivity model that superficially resembles React but behaves differently, increasing the risk of subtle defects.

### Svelte 5

Svelte 5 with compiler-based reactivity and no virtual DOM. ~5 kB gzipped. Stable since October 2024.

- Good, because the compiler-based approach eliminates runtime overhead, producing minimal ~5 kB gzipped output with no virtual DOM.
- Good, because built-in accessibility compiler warnings surface a11y issues at build time, reducing defect rates.
- Good, because single-file components are ergonomic for rapid component authoring with co-located markup, style, and logic.
- Neutral, because Svelte's LLM training data representation is growing but remains significantly smaller than React's, which may produce less consistent agent-generated code.
- Bad, because the component library ecosystem is smaller than React's — fewer battle-tested accessible primitives, and no equivalent to Radix UI's breadth and maturity.
- Bad, because single-file component conventions are less standardized than React's function component patterns, which may produce less structurally consistent output across AI agent invocations.
- Bad, because SvelteKit routing, while capable, has fewer reference implementations for complex SPA deep-linking scenarios compared to TanStack Router.
- Bad, because the ecosystem is less mature for the specific needs of this project (accessible component primitives, complex SPA routing, drag-and-drop, real-time visualization patterns).

Ultimately rejected because React's ecosystem maturity — particularly Radix UI for accessibility primitives — and dominant LLM training data representation outweigh Svelte's bundle size advantage, especially given that Service Worker caching neutralizes the initial load cost difference.

## More Information

### Recommended sub-stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React 19 + ReactDOM | Largest ecosystem, best LLM code quality |
| State management | Zustand | ~475 B gzipped, minimal API, excellent devtools |
| Router | TanStack Router | Type-safe routes, built-in search param serialization |
| Accessibility primitives | Radix UI | Unstyled, WCAG-compliant, composable |
| Bundler | Vite | Fast HMR, native WASM plugin support |
| CSS approach | Deferred to a separate ADR | |
| Testing | Vitest + React Testing Library + Playwright | Unit/integration/E2E coverage |

### Performance strategy for real-time visualization

React's reconciler should manage the structural UI (controls, panels, routing) while real-time visualizations (VU meters, voice state, echo buffer) use refs and `requestAnimationFrame` for direct DOM updates, bypassing the reconciler entirely. This two-tier rendering approach is a well-established React pattern for animation-heavy applications.

### Related decisions

- SNES audio emulation library selection (ADR-0001).
- Audio pipeline architecture (ADR-0003).
- CSS methodology selection (ADR-0004, pending).
- State management architecture details (may warrant a separate ADR if Zustand's store structure becomes complex).
