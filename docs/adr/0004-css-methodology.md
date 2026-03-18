---
status: "accepted"
date: 2026-03-18
---

# Use CSS Modules with CSS Custom Properties for Styling

## Context and Problem Statement

SPC Player's UI framework decision (ADR-0002) selected React 19 + TypeScript + Vite with Radix UI as the unstyled accessibility primitives layer. Radix UI components ship with zero styles — they provide WCAG-compliant behavior (focus management, keyboard navigation, ARIA attributes) but every visual aspect must be styled by the consumer. The project also requires dark/light theme switching (following `prefers-color-scheme` with user override), mobile-first responsive design with breakpoints at 640px and 1024px, and real-time audio visualization (VU meters, voice state, echo buffer) updating at 60fps via direct DOM manipulation alongside the React reconciler.

Which CSS methodology should SPC Player use to style its components, integrate with Radix UI, implement theming, and support responsive layouts — while maintaining consistent output quality from AI agent authors and avoiding runtime overhead that could interfere with visualization performance?

## Decision Drivers

- **Radix UI compatibility** — Radix UI is unstyled and exposes `data-state`, `data-side`, `data-orientation`, and other data attributes for styling. The CSS approach must integrate cleanly with these data-attribute-driven state changes (e.g., `[data-state="open"]`, `[data-state="checked"]`) without requiring wrapper components or runtime style injection.
- **Dark/light theme implementation** — the application must follow `prefers-color-scheme` by default with a user-overridable preference persisted to IndexedDB. The CSS approach must support efficient theme switching without full-page re-renders or JavaScript-driven style recalculation.
- **AI agent code quality** — all code is authored by LLMs. The CSS methodology must be well-represented in training data to produce consistent, correct, idiomatic output. Approaches with subtle footguns or unusual patterns increase defect rates in AI-generated code.
- **Performance** — real-time VU meters and voice visualization update at 60fps via refs and `requestAnimationFrame`, bypassing React's reconciler (per ADR-0002). The CSS approach must not inject runtime JavaScript that competes for main-thread time, triggers unexpected reflows, or interferes with direct DOM manipulation of visualization elements.
- **Bundle size** — SPC Player is a PWA where first-load performance matters (FCP < 1.5s, TTI < 3s per requirements). The WASM DSP binary already contributes ~50–100 KB; CSS framework overhead should be minimal. Service Worker caching mitigates repeat-visit cost, but the initial download budget is constrained.
- **Mobile-first responsive design** — the application uses three breakpoints (phone < 640px, tablet 640–1024px, desktop > 1024px) with a mobile-first progressive enhancement strategy. The CSS approach must make responsive patterns straightforward and consistent.
- **Maintainability for an AI-maintained codebase** — with no human developers, the CSS methodology must have a simple mental model, clear file organization conventions, and predictable patterns that reduce drift across agent invocations. Complex configuration, implicit behavior, or multi-step indirection increase the risk of inconsistent output.
- **Build pipeline complexity** — Vite is the bundler (per ADR-0002). The CSS approach should integrate with Vite's built-in capabilities or have a well-maintained Vite plugin. Additional build steps, PostCSS plugins, or custom configuration increase fragility in a CI/CD pipeline.

## Considered Options

- **Option 1: CSS Modules** — scoped CSS via `.module.css` files, co-located with components
- **Option 2: Tailwind CSS** — utility-first CSS framework with build-time purging
- **Option 3: Vanilla CSS with CSS custom properties** — plain `.css` files with a design token system
- **Option 4: styled-components / Emotion** — CSS-in-JS with runtime style injection
- **Option 5: Vanilla Extract** — zero-runtime CSS-in-TypeScript with build-time extraction

## Decision Outcome

Chosen option: **"CSS Modules"** (with CSS custom properties for theming), because it is the only option that satisfies all decision drivers simultaneously — zero runtime overhead preserves 60fps visualization performance, native Vite support requires zero build configuration, scoped class names prevent style collisions without runtime cost, CSS custom properties on `:root` enable efficient theme switching via a single class toggle, Radix UI's data-attribute selectors work naturally in standard CSS, AI agents produce consistent and correct output due to strong training data representation, and the co-located `.module.css` file convention provides clear organizational boundaries for an AI-maintained codebase.

Option 2 (Tailwind) was the runner-up due to excellent LLM training data coverage and built-in responsive/dark-mode utilities, but its utility-class approach produces verbose, hard-to-review `className` strings that reduce code readability and increase the surface area for inconsistency across agent invocations — particularly for complex components like the mixer, inspector, and instrument performer where dozens of utilities per element are common. Option 4 (CSS-in-JS) is rejected on performance grounds: runtime style injection competes with the visualization render loop for main-thread time. Option 5 (Vanilla Extract) offers type-safe styles but has limited LLM training data and adds build complexity. Option 3 (vanilla CSS) lacks scoping, creating collision risk in a multi-view SPA with many components.

### Consequences

- Good, because CSS Modules have zero runtime overhead — all class name scoping is resolved at build time by Vite's built-in CSS Modules support, leaving no JavaScript to execute on the main thread during rendering or animation.
- Good, because Radix UI's data-attribute styling pattern (`[data-state="open"]`, `[data-side="bottom"]`, etc.) works natively in CSS Module files with no additional tooling, wrappers, or configuration.
- Good, because CSS custom properties on `:root` enable theme switching via a single CSS class toggle (e.g., `.dark` on `<html>`), which triggers instantaneous browser-native variable resolution with no JavaScript style recalculation.
- Good, because LLMs produce idiomatic, consistent CSS Modules code — the pattern of importing a styles object and referencing `styles.className` is well-established in React training data and leaves little room for structural divergence.
- Good, because `.module.css` files co-located with components create a predictable 1:1 mapping between component and stylesheet, giving AI agents a clear organizational convention and making code review straightforward.
- Good, because Vite supports CSS Modules natively with zero configuration — no plugins, no PostCSS setup, no additional dependencies.
- Good, because the generated CSS is standard, forward-compatible CSS that does not depend on any framework's runtime or API stability.
- Good, because bundle size impact is effectively zero beyond the CSS itself — no framework runtime is included.
- Bad, because CSS Modules do not provide built-in utilities for responsive breakpoints; media queries must be written manually in each component's stylesheet, requiring a disciplined convention (e.g., a shared `breakpoints.css` with `@custom-media` or plain variable documentation) to keep breakpoint values consistent.
- Bad, because sharing styles across components requires explicit composition via `composes` or shared CSS files, which is more verbose than utility-class reuse and can lead to implicit coupling if overused.
- Bad, because TypeScript has no awareness of CSS Module class names — misspelled `styles.classNme` compiles without error and silently produces `undefined`, applying no styles. This can be mitigated with a typed CSS Modules plugin (e.g., `vite-plugin-css-modules-typed-scss` or `typed-css-modules`), but adds a build step.
- Bad, because dynamic styling based on JavaScript state requires either CSS custom properties set via inline `style`, conditional class application via `clsx`, or data attributes — all of which are slightly more verbose than CSS-in-JS template literals.

### Confirmation

1. **Radix UI integration verification** — build a test component using Radix Dialog, Slider, and Tabs primitives, styled entirely with CSS Modules using `[data-state]` and `[data-side]` attribute selectors. Verify all visual states (open/closed, checked, disabled, focus-visible) render correctly.
2. **Theme switching verification** — implement a `:root` / `.dark` theme system with CSS custom properties for all design tokens. Verify that toggling the `.dark` class on `<html>` updates all themed components instantly without visible flash or re-render.
3. **Visualization performance verification** — render a VU meter component updating at 60fps via `requestAnimationFrame` alongside CSS Modules-styled UI. Profile with Chrome DevTools Performance tab and verify that no style recalculation from CSS Modules interferes with the animation frame budget (< 16.67ms per frame).
4. **AI output consistency verification** — generate 5 component implementations using the CSS Modules convention and verify that all follow the same structural pattern (co-located `.module.css`, imported styles object, semantic class names).
5. **Build verification** — confirm that `npm run build` produces correctly scoped CSS with no additional Vite configuration beyond the default.

## Pros and Cons of the Options

### CSS Modules

Scoped CSS via `.module.css` files co-located with React components. Class names are locally scoped at build time by Vite's built-in CSS Modules support, producing unique identifiers (e.g., `_header_1a2b3c`) in production. Theming is implemented via CSS custom properties on `:root` with a `.dark` class override.

- Good, because class name scoping is resolved entirely at build time — zero runtime JavaScript, zero style injection, zero main-thread cost during rendering or animation.
- Good, because Vite supports CSS Modules natively with no plugins, no PostCSS configuration, and no additional dependencies. A `.module.css` file import in a `.tsx` file just works.
- Good, because Radix UI's data-attribute selectors (`[data-state="open"]`, `[data-state="checked"]`, `[data-side="bottom"]`) are standard CSS attribute selectors that work naturally in `.module.css` files with no adaptation layer.
- Good, because the `import styles from './Component.module.css'` + `className={styles.container}` pattern is heavily represented in LLM training data (Create React App, Next.js, and Vite documentation all use CSS Modules), producing consistent agent output.
- Good, because each component has a co-located `.module.css` file, creating a predictable 1:1 relationship that is easy to navigate, review, and maintain.
- Good, because CSS custom properties (e.g., `var(--color-bg-primary)`) are the web platform's native mechanism for theming, with instantaneous browser-level resolution when the value changes — no JavaScript recalculation, no re-render needed.
- Good, because the output is standard CSS that degrades gracefully and will remain valid as CSS evolves — no framework lock-in beyond the build-time scoping transform.
- Neutral, because CSS Modules do not enforce a design system — consistency of spacing, color, and typography depends on disciplined use of CSS custom properties rather than framework constraints.
- Bad, because responsive media queries must be written manually per component; there is no built-in shorthand or utility system for breakpoints, requiring a convention or shared file to keep `640px` and `1024px` values consistent.
- Bad, because class name typos (`styles.contaner` instead of `styles.container`) silently produce `undefined` at runtime, applying no styles with no error — a debugging hazard unless mitigated by typed CSS Modules generation.
- Bad, because style composition across components using `composes` can create implicit dependencies between stylesheets that are harder to trace than explicit re-use.

### Tailwind CSS

Utility-first CSS framework that generates atomic utility classes (`flex`, `p-4`, `text-sm`, `dark:bg-gray-900`) from a configuration file. Unused utilities are purged at build time, producing minimal CSS output. Version 4 integrates as a Vite plugin.

- Good, because Tailwind is heavily represented in LLM training data — it is one of the most popular CSS frameworks, and AI agents produce fluent Tailwind code.
- Good, because built-in `dark:` variant makes dark/light theme implementation trivial: `className="bg-white dark:bg-gray-900"` requires no custom CSS or additional configuration.
- Good, because built-in responsive prefixes (`sm:`, `md:`, `lg:`) enforce consistent breakpoints across the application without manual media queries.
- Good, because the PurgeCSS integration produces minimal CSS output containing only the utilities actually used, keeping bundle size small.
- Good, because Radix UI provides official Tailwind integration documentation, and `data-[state=open]:` variants enable styling Radix data attributes directly in class strings.
- Good, because the utility-first approach reduces the number of naming decisions — AI agents don't need to invent semantic class names, reducing one source of inconsistency.
- Neutral, because Tailwind v4's Vite plugin integrates cleanly, but adds a build dependency and configuration file (`tailwind.config.ts`) that must be maintained.
- Bad, because utility-class strings become extremely long for complex components — a styled container might read `className="flex flex-col gap-4 p-4 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm"`, reducing readability and making code review difficult.
- Bad, because multiple valid utility combinations can produce the same visual result (e.g., `mx-auto` vs. `ml-auto mr-auto`), creating inconsistency across AI agent invocations that is correct but visually different in code.
- Bad, because complex or custom styling not covered by utilities requires `@apply` directives or arbitrary value syntax (`w-[calc(100%-2rem)]`), mixing paradigms and creating inconsistency.
- Bad, because extracting reusable component styles from long className strings into shared abstractions (e.g., via `clsx` composition or `@apply`) introduces patterns that fight against Tailwind's utility-first philosophy.
- Bad, because Tailwind's configuration file adds a project-level abstraction that must stay in sync with the design system — configuration drift can cause subtle visual inconsistencies.

### Vanilla CSS with CSS Custom Properties

Plain `.css` files with a design token system implemented via CSS custom properties. No build-time scoping, no framework. Styling conventions enforced by naming discipline (e.g., BEM) rather than tooling.

- Good, because it has the lowest possible complexity — standard CSS in standard `.css` files with no tooling, plugins, or build steps.
- Good, because CSS custom properties provide the same theming mechanism as CSS Modules, with native browser resolution.
- Good, because LLMs have extensive CSS training data, producing correct and idiomatic CSS.
- Good, because there is no framework to learn, configure, update, or debug — the approach is eternally stable.
- Good, because bundle size is exactly the CSS written, with no runtime or framework overhead.
- Neutral, because responsive design uses standard media queries, same as CSS Modules.
- Bad, because there is **no scoping mechanism** — class names are global, creating collision risk in a multi-view SPA with many components (player, playlist, mixer, inspector, instrument performer, settings). A shared class name like `.header` or `.container` could unintentionally style elements across views.
- Bad, because preventing name collisions requires strict naming conventions (BEM, SUIT CSS, or similar), which AI agents apply inconsistently — a `.player__controls--active` naming convention in one invocation may become `.playerControlsActive` in another.
- Bad, because styling Radix UI components requires targeting generated DOM structure or wrapping components with named containers, which is fragile if Radix updates its DOM output.
- Bad, because there is no mechanism to detect unused styles — dead CSS accumulates as the application evolves, increasing bundle size over time.

### styled-components / Emotion (CSS-in-JS Runtime)

Runtime CSS-in-JS libraries that generate styles at runtime using tagged template literals (styled-components) or css prop (Emotion). Styles are injected into the DOM via `<style>` elements during rendering.

- Good, because co-locating styles with component logic in a single `.tsx` file reduces context switching and simplifies component authoring.
- Good, because dynamic styling based on props is ergonomic: `background: ${props => props.isActive ? 'blue' : 'gray'}` requires no conditional className logic.
- Good, because LLMs produce fluent styled-components code — the library is well-represented in training data.
- Good, because the `ThemeProvider` pattern enables centralized theme management with full JavaScript access to theme values.
- Bad, because **runtime style injection adds JavaScript execution to every render cycle** — style strings are parsed, deduplicated, and injected into `<style>` tags on the main thread. In a UI with 60fps visualization, VU meters, and concurrent component updates, this competes directly with `requestAnimationFrame` callbacks for main-thread time and can cause frame drops.
- Bad, because serializing style objects or template literals on every render produces garbage that triggers garbage collection pauses, a known cause of audio visualization jank.
- Bad, because the runtime library adds ~12 kB gzipped (styled-components) or ~7 kB gzipped (Emotion) to the bundle — significant overhead for what is fundamentally a developer experience feature, not an end-user feature.
- Bad, because React 19 introduces changes to how `<style>` elements are handled in concurrent rendering, creating compatibility uncertainty with CSS-in-JS libraries that inject runtime styles into the document head.
- Bad, because the styled-components maintainers have publicly acknowledged the library's move toward maintenance mode, with community momentum shifting to zero-runtime alternatives.
- Bad, because server-side rendering extraction (not relevant to this project) has historically been the primary use case driving library design decisions, meaning client-side-only PWA usage is not the priority optimization target.

### Vanilla Extract

Zero-runtime CSS-in-TypeScript library where styles are authored in `.css.ts` files and compiled to static CSS at build time. Provides a `style()` API, theme contracts (`createTheme`), and the Sprinkles utility layer for atomic CSS.

- Good, because styles are authored in TypeScript, providing full type checking — misspelled property names, invalid values, and undefined theme tokens are caught at compile time, eliminating an entire class of silent CSS bugs.
- Good, because styles are extracted to static `.css` files at build time — zero runtime JavaScript, no style injection, no main-thread cost.
- Good, because `createTheme` and `createThemeContract` provide a type-safe theming system where adding or removing a token produces a compile error, preventing theme inconsistencies.
- Good, because it integrates with Vite via `@vanilla-extract/vite-plugin`.
- Neutral, because styling Radix UI requires the same data-attribute selectors as CSS Modules, which Vanilla Extract supports via `selectors` in the `style()` API — functional but syntactically more verbose.
- Bad, because Vanilla Extract is **significantly less represented in LLM training data** compared to CSS Modules, Tailwind, or styled-components. AI agents frequently produce syntactically incorrect Vanilla Extract code — confusing `style()` with `recipe()`, misusing `createThemeContract`, or generating invalid selector nesting — requiring more review and correction.
- Bad, because the API surface is large: `style`, `styleVariants`, `recipe`, `createTheme`, `createThemeContract`, `createGlobalTheme`, `globalStyle`, `fontFace`, `keyframes`, `createVar`, plus the optional Sprinkles layer — this breadth creates inconsistency in AI-generated code as agents choose different APIs for similar tasks.
- Bad, because the `@vanilla-extract/vite-plugin` adds non-trivial build complexity — it runs a child Vite process to compile `.css.ts` files, which can increase build times and occasionally produce opaque build errors.
- Bad, because the `.css.ts` file convention is less intuitive than separate `.css` files — developers (and AI agents) must understand that these TypeScript files execute at build time, not runtime, which is a non-obvious distinction that leads to mistakes (e.g., importing runtime values into `.css.ts` files, which causes build failures).
- Bad, because the ecosystem and community are smaller than CSS Modules or Tailwind, meaning fewer examples, fewer Stack Overflow answers, and less pattern documentation for AI agents to draw on.

## More Information

### Theming Architecture

CSS custom properties will be organized as a design token system on `:root`, with dark mode overrides applied via a `.dark` class on `<html>`:

```css
/* tokens.css — imported once at the application root */
:root {
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #6b6b6b;
  --color-border: #e0e0e0;
  --color-accent: #3b82f6;
  /* ... additional tokens */
}

:root.dark {
  --color-bg-primary: #0f0f0f;
  --color-bg-secondary: #1a1a1a;
  --color-text-primary: #f0f0f0;
  --color-text-secondary: #a3a3a3;
  --color-border: #2e2e2e;
  --color-accent: #60a5fa;
}
```

Theme switching requires only toggling the `.dark` class on `<html>`, which triggers instantaneous browser-native CSS custom property resolution across all components. No re-render, no JavaScript style recalculation, no flash.

The canonical theme preference is persisted to IndexedDB via Zustand's `persist` middleware (see [ADR-0005](0005-state-management-architecture.md)). However, IndexedDB is asynchronous — a blocking `<script>` cannot read from it before first paint. To prevent flash of wrong theme (FOWT), the theme class is **also mirrored to `localStorage`** on every theme change (`localStorage.setItem('theme', 'dark' | 'light')`). A blocking `<script>` in `index.html` reads `localStorage.getItem('theme')` synchronously and applies the `.dark` or `.light` class on `<html>` before first paint. This dual-write strategy uses IndexedDB as the durable source of truth (consistent with all other persisted settings) while using `localStorage` as a fast synchronous mirror solely for FOWT prevention.

The `prefers-color-scheme` media query is used as the default when no user preference is stored:

```css
@media (prefers-color-scheme: dark) {
  :root:not(.light):not(.dark) {
    /* dark tokens — applied when system preference is dark and no user override */
  }
}
```

### Radix UI Styling Convention

Radix UI components expose data attributes for state styling. In CSS Modules, these are targeted with standard attribute selectors:

```css
/* Dialog.module.css */
.overlay {
  background: rgba(0, 0, 0, 0.5);
}

.overlay[data-state="open"] {
  animation: fadeIn 150ms ease-out;
}

.overlay[data-state="closed"] {
  animation: fadeOut 150ms ease-in;
}

.content[data-state="open"] {
  animation: slideIn 200ms ease-out;
}
```

This approach requires no additional libraries, wrappers, or build plugins. The data attributes are stable parts of Radix UI's public API.

### Responsive Design Convention

To prevent breakpoint value drift, a shared convention file will document the standard breakpoints and provide reusable media query patterns:

```css
/* breakpoints.css — documentation and @custom-media definitions */
/* Phone: < 640px (default, mobile-first base styles) */
/* Tablet: >= 640px */
/* Desktop: >= 1024px */

@custom-media --tablet (min-width: 640px);
@custom-media --desktop (min-width: 1024px);
```

Note: `@custom-media` is a CSS specification in draft (Media Queries Level 5) and requires PostCSS Custom Media plugin for current browser support. If adding a PostCSS plugin is deemed excessive for this single use case, plain numeric media queries with documented constants are an acceptable alternative — the key requirement is that `640px` and `1024px` are defined in exactly one place and referenced consistently.

### Typed CSS Modules (Optional Mitigation)

The silent `undefined` on typo risk can be mitigated by generating TypeScript declaration files for CSS Modules. Tools like `typed-css-modules` or `vite-plugin-typed-css-modules` generate `.module.css.d.ts` files that export the available class names as typed keys, causing `styles.contaner` to produce a TypeScript error instead of a silent runtime `undefined`. This is recommended but not mandatory for v1 — the risk is partially mitigated by co-location (the `.module.css` file is immediately adjacent to the component file) and by AI agents being generally reliable at referencing class names they just defined.

### Visualization Compatibility

The 60fps VU meters and voice visualization components (per ADR-0002 and ADR-0003) use refs and `requestAnimationFrame` for direct DOM updates, bypassing React's reconciler. CSS Modules do not interfere with this pattern — the scoped class names are applied once at mount time, and subsequent direct DOM manipulation (setting `style.width`, `style.transform`, etc.) operates on the already-mounted elements without triggering CSS Module resolution or style recalculation. This is a key advantage over CSS-in-JS solutions, which would inject new `<style>` tags on prop changes, potentially triggering layout recalculation during animation frames.

### Related Decisions

- UI framework and accessibility primitives (ADR-0002): established React + Radix UI as the component stack; this ADR resolves how those components are visually styled.
- Audio pipeline architecture (ADR-0003): established the 60fps visualization requirement that constrains CSS methodology to zero-runtime approaches.
- A follow-up ADR may address the design token system in detail (specific token names, scale values, color system) once visual design work begins.
- State management details for theme state (persisting user preference, syncing with `prefers-color-scheme` changes) will be covered in component implementation, not a separate ADR.
- State management for theme preference persistence is defined by the `settings` slice in [ADR-0005](0005-state-management-architecture.md).
