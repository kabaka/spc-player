---
status: "accepted"
date: 2026-03-18
decision-makers: []
consulted: []
informed: []
---

# Define Component Library Scope — Radix Primitives vs. Custom Components

## Context and Problem Statement

ADR-0002 selected React 19 + Radix UI as the UI framework and accessibility primitives layer, but did not specify which Radix primitives to adopt vs. which components to build from scratch. SPC Player's UI spans two distinct categories: standard interactive patterns common to any web application (dialogs, dropdowns, sliders, tabs) and domain-specific audio components with no equivalent in any component library (VU meters, virtual keyboard, timeline scrubber, memory inspector).

Radix UI provides ~30 unstyled primitives with built-in WCAG compliance, keyboard navigation, focus management, and ARIA semantics. Adopting all applicable primitives maximizes accessibility coverage with minimal custom code, but may introduce unnecessary abstraction for components that are trivially implemented with semantic HTML. Conversely, under-adopting Radix means reimplementing complex accessibility patterns (focus trapping, roving tabindex, typeahead, dismiss-on-escape, portal rendering) that are error-prone to build correctly — especially in an AI-maintained codebase.

Which Radix primitives should SPC Player adopt, and which components should be built as custom implementations?

## Decision Drivers

- **WCAG 2.2 AA compliance** — accessibility is a hard requirement (per requirements). Radix primitives automatically handle ARIA roles/attributes, keyboard navigation, focus management, and screen reader announcements for the patterns they cover. Custom components require manual implementation and testing of all these behaviors.
- **Maintenance burden** — Radix maintains accessibility compliance as browsers and screen readers evolve; custom components require ongoing manual ARIA auditing. In an AI-maintained codebase with no dedicated accessibility specialist, this risk is amplified.
- **Bundle size** — Radix primitives are individually installable and tree-shakeable. Each primitive adds ~1–5 kB gzipped. Adopting all 17 standard primitives identified for SPC Player adds an estimated ~30–50 kB total, but only the imported components are bundled. Service Worker caching mitigates repeat-visit cost.
- **Styling flexibility with CSS Modules** — per ADR-0004, all components are styled via CSS Modules using Radix's `data-state`, `data-side`, and `data-orientation` attribute selectors. The CSS approach must work equally well for Radix-wrapped and custom components.
- **Consistency of interaction patterns** — using Radix for all standard patterns ensures consistent keyboard navigation, focus behavior, and animation patterns across the application. Mixing Radix and custom implementations for similar patterns creates interaction inconsistency.
- **Performance** — domain-specific visualization components (VU meters, waveform viewers) bypass React's reconciler via refs and `requestAnimationFrame` (per ADR-0002 and ADR-0003). Radix's React-based rendering model is unsuitable for these 60fps components. Standard UI components operate at interactive frequency (user-initiated events) where Radix's overhead is negligible.
- **AI agent code quality** — Radix primitives have strong representation in LLM training data due to widespread adoption (shadcn/ui, which uses Radix internally, has 80k+ GitHub stars). AI agents produce more correct, idiomatic code when building on Radix than when implementing ARIA patterns from scratch.
- **React 19 compatibility** — Radix UI has verified React 19 compatibility. All primitives work with concurrent rendering and `useSyncExternalStore`.
- **Complexity threshold** — components with complex accessibility requirements (focus trapping, roving tabindex, typeahead search, portal rendering, collision-aware positioning) benefit disproportionately from Radix. Simple elements (a toggle button, a visual separator) can be implemented with semantic HTML and minimal ARIA.

## Considered Options

- **Option 1: Maximalist Radix adoption** — use Radix for every standard interactive pattern; custom only for domain-specific components
- **Option 2: Selective Radix adoption** — use Radix for complex interactive primitives only (Dialog, Menu, Slider); build simpler ones (Toggle, Separator, Label) as plain HTML + CSS
- **Option 3: Minimal Radix adoption** — use Radix only for the most accessibility-intensive patterns (Dialog, Menu); custom for everything else
- **Option 4: shadcn/ui** — pre-styled Radix-based components copied into the project (not installed as a dependency)
- **Option 5: React Aria (Adobe)** — hooks-based accessible behavior primitives with custom element rendering

## Decision Outcome

Chosen option: **"Maximalist Radix adoption"** (Option 1), because it provides the strongest accessibility guarantee with the lowest maintenance burden, maximizes interaction consistency across the application, and aligns with the AI-maintained codebase's need for well-documented, battle-tested primitives rather than hand-rolled ARIA implementations. React Aria (Option 5) was the strongest alternative — its hooks-based API and Adobe's dedicated accessibility team are compelling — but Radix's declarative component composition is more mechanical for AI agents to produce correctly, and its vastly larger LLM training data representation (via shadcn/ui adoption) makes it the better fit for an AI-maintained codebase.

Every standard interactive pattern identified in SPC Player's requirements maps to a Radix primitive. Adopting all of them establishes a clear architectural rule: if a Radix primitive exists for the pattern, use it; if not, build custom. This eliminates per-component deliberation about whether a pattern is "complex enough" to justify Radix — a judgment call that introduces inconsistency across AI agent invocations.

Domain-specific components (VU meters, virtual keyboard, timeline scrubber, memory inspector, voice channel strip, echo buffer visualization, ADSR envelope editor, BRR waveform viewer, transport controls) are custom-built because no component library provides these audio-domain primitives. Many of these operate at 60fps via direct DOM manipulation and cannot use React's reconciler.

### Component Classification

#### Tier 1 — Radix Primitives (standard UI patterns)

| Component | Radix Primitive | SPC Player Usage |
|-----------|-----------------|------------------|
| Dialog | `Dialog` | Export dialog, settings dialog, file info |
| Alert Dialog | `AlertDialog` | Destructive confirmations (clear playlist, overwrite export) |
| Dropdown Menu | `DropdownMenu` | File menu, options menus |
| Context Menu | `ContextMenu` | Right-click on playlist items |
| Slider | `Slider` | Volume, playback speed, ADSR parameters, gain |
| Tabs | `Tabs` | In-view tab patterns (Analysis view sub-tabs: memory/registers/voices/echo, export format tabs). Main view navigation uses TanStack Router links per ADR-0013 |
| Toggle | `Toggle` | Mute/solo buttons per voice |
| Toggle Group | `ToggleGroup` | View mode selector, export format selector |
| Switch | `Switch` | Settings toggles (auto-fade, gapless playback) |
| Tooltip | `Tooltip` | Control labels, keyboard shortcut hints |
| Scroll Area | `ScrollArea` | Playlist, memory viewer, register dump |
| Select | `Select` | Sample rate selection, export format dropdown |
| Separator | `Separator` | Visual dividers between UI sections |
| Popover | `Popover` | Info panels, quick settings overlays |
| Progress | `Progress` | Export progress, file loading |
| Checkbox | `Checkbox` | Batch selection in playlist, settings checkboxes |
| Label | `Label` | Form accessibility pairing |
| Visually Hidden | `VisuallyHidden` | Screen reader-only content for visualizations |

#### Tier 2 — Custom Domain Components

| Component | Why Custom | Rendering Strategy |
|-----------|-----------|-------------------|
| VU Meter | No Radix equivalent; 60fps via rAF | Direct DOM (refs + `requestAnimationFrame`) |
| Virtual Keyboard | Piano-style MIDI keyboard; no Radix equivalent | React reconciler (interactive frequency) |
| Timeline Scrubber | Playback position with waveform overlay; domain-specific | Hybrid (React for controls, canvas/rAF for waveform) |
| Memory/Register Viewer | Hex dump display; no Radix equivalent | React reconciler with virtualized scrolling |
| Voice Channel Strip | BRR state, envelope, pitch display per voice | Hybrid (React structure, rAF for real-time values) |
| Echo Buffer Visualization | Echo FIR visualization; no Radix equivalent | Direct DOM (canvas + rAF) |
| ADSR Envelope Editor | Interactive envelope curve editor | Hybrid (Radix Sliders for parameter controls, canvas/rAF for real-time envelope curve visualization and current-phase indicator) |
| BRR Waveform Viewer | Sample waveform rendering | Direct DOM (canvas + rAF) |
| Spectrum Analyzer | FFT-based frequency domain visualization using `AnalyserNode.getFrequencyData()` | Direct DOM (canvas + rAF) |
| Transport Controls | Play/pause/stop/skip buttons | React reconciler (semantic `<button>` elements) |
| Playlist Item | Draggable with metadata; uses Radix internals for context menu | React reconciler with drag library |

#### Tier 2 Accessibility Requirements

Custom components must implement accessibility manually per the accessibility skill:

- **VU Meter / visualizations**: marked as `role="img"` with `aria-label` describing the current level, or use `VisuallyHidden` for screen reader alternative text. Visual-only content is decorative; meaningful state is announced via `aria-live` regions.
- **Virtual Keyboard**: `role="group"` with `aria-label="Virtual keyboard"`. Individual keys are `<button>` elements with `aria-label` (e.g., "C4"). Keyboard navigation via arrow keys (roving tabindex pattern, implemented manually following WAI-ARIA Authoring Practices).
- **Timeline Scrubber**: the seek control uses Radix `Slider` internally for the interactive thumb; the waveform overlay is decorative canvas.
- **Memory/Register Viewer**: `role="grid"` or `role="table"` with column headers. Keyboard navigation via arrow keys for cell focus.
- **Transport Controls**: semantic `<button>` elements with `aria-label` (e.g., "Play", "Pause") and `aria-pressed` where applicable. No Radix needed — `<button>` is inherently accessible.
- **ADSR Envelope Editor**: uses Radix `Slider` primitives for attack, decay, sustain, release parameter controls. The visual envelope curve and real-time phase indicator are rendered via canvas + `requestAnimationFrame` (hybrid approach matching Voice Channel Strip), with `aria-hidden="true"` on the canvas. During playback, the current envelope phase and amplitude are updated at display frequency via rAF, enabling musicians to see the effect of parameter changes in real time.
- **Spectrum Analyzer**: `role="img"` with `aria-label` describing the visualization type. The canvas is decorative; frequency data is not meaningfully conveyed via screen reader. Follows the same accessibility pattern as VU Meter / visualizations.

### Consequences

- Good, because WCAG 2.2 AA compliance for all standard UI patterns is guaranteed by Radix's built-in accessibility implementation — focus trapping in dialogs, roving tabindex in menus, `aria-expanded`/`aria-selected`/`aria-checked` state management, typeahead search in selects, and keyboard dismiss behavior are all handled without custom code.
- Good, because a single architectural rule ("use Radix if a primitive exists, custom if not") eliminates per-component accessibility implementation decisions, reducing inconsistency across AI agent invocations.
- Good, because Radix's data-attribute styling convention (`[data-state]`, `[data-side]`, `[data-orientation]`) integrates seamlessly with CSS Modules (per ADR-0004), providing state-based styling without JavaScript class toggling.
- Good, because all standard interactive patterns share consistent keyboard navigation (arrow keys in menus/tabs, Escape to dismiss, Enter/Space to activate), reducing cognitive load for users who navigate the application via keyboard.
- Good, because Radix primitives are tree-shakeable — only the imported components contribute to bundle size. The estimated ~30–50 kB total (gzipped) for all 18 primitives is comparable to a single feature's code and cached by the Service Worker.
- Good, because custom domain components are clearly separated from standard UI components, creating a maintainable boundary between "use Radix" and "build custom" that scales as the application grows.
- Good, because the accessibility responsibility for custom components is explicit — Tier 2 components have documented a11y requirements above, preventing accessibility gaps from being discovered late.
- Bad, because adopting all 18 Radix primitives adds an estimated ~30–50 kB gzipped to the bundle — more than a selective approach. However, this is within the application's budget given Service Worker caching and is small relative to the WASM DSP binary (~50–100 kB).
- Bad, because trivially simple components (Separator, Label, Visually Hidden) could be implemented in 1–5 lines of semantic HTML. Using Radix for these adds a dependency for negligible accessibility benefit. However, the consistency of always importing from Radix outweighs the marginal size cost.
- Bad, because Radix primitives enforce a specific component composition pattern (Root/Trigger/Content/Portal) that adds structural complexity compared to a single `<hr>` or `<label>`. Developers (agents) must learn the Radix API for each primitive.
- Bad, because Radix version upgrades affect all 18 adopted primitives simultaneously. A breaking change in Radix's API requires updating every component that uses the affected primitive.

### Confirmation

1. **Radix coverage audit** — build one component from each Radix primitive category (Dialog, Slider, Tabs, Toggle, Select, ScrollArea) styled with CSS Modules. Verify WCAG 2.2 AA compliance via axe-core automated checks and manual keyboard/screen reader testing.
2. **Custom component a11y verification** — build the Transport Controls and Virtual Keyboard as custom components. Run axe-core and verify keyboard navigation, focus management, and screen reader announcements match the documented accessibility requirements.
3. **Bundle size measurement** — measure the gzipped bundle impact of all 18 Radix primitives after tree-shaking. Verify the total is within the estimated ~30–50 kB range and does not cause FCP/TTI regressions.
4. **Rendering strategy validation** — confirm that Tier 2 direct-DOM components (VU Meter, BRR Waveform Viewer) achieve 60fps when co-existing with Radix-based Tier 1 components on the same page.
5. **AI output consistency** — generate 3 different Radix-based components (Dialog, Slider, Tabs) via AI agents and verify structural consistency (import pattern, CSS Module integration, data-attribute styling).

## Pros and Cons of the Options

### Option 1: Maximalist Radix Adoption

Use Radix for every standard interactive pattern (18 primitives). Build custom only for domain-specific components with no Radix equivalent.

- Good, because accessibility compliance is comprehensive — every standard pattern gets Radix's battle-tested ARIA implementation, keyboard navigation, focus management, and screen reader support.
- Good, because the decision rule is binary and unambiguous: "Does a Radix primitive exist? Use it. Otherwise, build custom." This eliminates subjective per-component judgment calls that would produce inconsistent results across AI agent invocations.
- Good, because all standard patterns share consistent interaction behavior — menus navigate with arrow keys, dialogs trap focus, sliders respond to arrow/home/end keys — creating a predictable experience for keyboard and assistive technology users.
- Good, because Radix maintains accessibility as browsers and screen readers evolve, reducing the ongoing maintenance burden for an AI-maintained codebase with no human accessibility expert.
- Good, because Radix primitives have extensive LLM training data coverage (via shadcn/ui adoption), resulting in higher-quality AI-generated integration code.
- Good, because CSS Modules integration is uniform: every Radix component uses `data-state`, `data-side`, etc. for state styling, establishing a single styling convention project-wide.
- Neutral, because bundle size (~30–50 kB gzipped for all 18 primitives) is larger than selective adoption but within the application's budget after Service Worker caching.
- Bad, because trivially simple patterns (Separator → `<hr>`, Label → `<label>`, Visually Hidden → `clip-path` utility class) receive the full Radix import/composition treatment, adding complexity disproportionate to their accessibility requirements.
- Bad, because 18 Radix primitive dependencies create a larger surface area for Radix version upgrade friction compared to selective adoption.

### Option 2: Selective Radix Adoption

Use Radix for complex interactive primitives with significant accessibility requirements (Dialog, AlertDialog, DropdownMenu, ContextMenu, Slider, Tabs, Select, Popover, ScrollArea, Tooltip — 10 primitives). Build simpler patterns (Toggle, ToggleGroup, Switch, Separator, Progress, Checkbox, Label, VisuallyHidden — 8 patterns) as plain HTML + CSS with manual ARIA.

- Good, because it focuses Radix adoption on primitives where the accessibility implementation is genuinely complex — focus trapping, portal rendering, collision-aware positioning, typeahead search, roving tabindex — where the build-vs-buy value is highest.
- Good, because simple patterns like `<button aria-pressed>` (Toggle), `<hr>` (Separator), `<progress>` (Progress), `<label>` (Label), and a CSS `clip-path` class (Visually Hidden) are trivially correct in semantic HTML with no Radix overhead.
- Good, because fewer Radix dependencies (~10 vs. ~18) reduces version upgrade surface area and total bundle size.
- Bad, because the decision boundary ("complex enough for Radix?") is subjective and requires per-component judgment. AI agents may classify the same pattern differently across invocations — should Switch use Radix or `<input type="checkbox" role="switch">`? Should Checkbox use Radix or `<input type="checkbox">`? This ambiguity creates inconsistency.
- Bad, because custom Toggle, Switch, and Checkbox implementations must handle `aria-pressed`/`aria-checked` state, keyboard activation (Space + Enter for toggle, Space for checkbox), and disabled state — which is straightforward but must be tested and maintained manually.
- Bad, because the project ends up with two interaction paradigms: Radix components styled via `[data-state]` attributes and custom components styled via CSS classes or `aria-` attributes. This inconsistency complicates the CSS Modules convention.
- Bad, because accessibility compliance for the 8 custom patterns must be manually verified and maintained as browsers evolve, adding ongoing audit burden.

### Option 3: Minimal Radix Adoption

Use Radix only for Dialog, AlertDialog, DropdownMenu, ContextMenu, and Select (~5 primitives) — the patterns with the most complex accessibility requirements (focus trapping, portal rendering, collision-aware positioning). Build everything else custom.

- Good, because the absolute minimum Radix dependency surface (~5 primitives) minimizes bundle size impact and version upgrade risk.
- Good, because it forces the project to build a thorough understanding of ARIA patterns, which benefits the custom domain-specific components that have no Radix equivalent regardless.
- Bad, because implementing Slider (range input with keyboard step, min/max, orientation, range selection, `aria-valuemin`/`aria-valuemax`/`aria-valuenow` announcements), Tabs (roving tabindex, `aria-selected`, automatic/manual activation modes, panel association), and ScrollArea (custom scrollbar with keyboard scrolling, scroll position announcement) from scratch is error-prone and time-consuming — these are not trivially accessible patterns.
- Bad, because AI agents have significantly less training data for custom ARIA implementations than for Radix-based patterns, producing more accessibility bugs in generated code.
- Bad, because maintaining 13+ custom interactive components' accessibility compliance requires ongoing manual testing with screen readers (NVDA, VoiceOver, JAWS) — a testing burden that Radix adoption eliminates for standard patterns.
- Bad, because interaction behavior will vary between the 5 Radix components (consistent keyboard patterns) and the 13+ custom components (potentially inconsistent keyboard patterns), creating a fragmented user experience for assistive technology users.
- Bad, because the time saved on bundle size is vastly outweighed by the time spent building, testing, and maintaining accessible custom implementations.

### Option 4: shadcn/ui

Copy pre-built, pre-styled components from shadcn/ui into the project. shadcn/ui components are built on Radix primitives with Tailwind CSS styling. Components are copied into the codebase (not installed as a dependency) and can be modified freely.

- Good, because shadcn/ui provides both accessibility (via underlying Radix) and styling (via Tailwind) in a single copy-paste operation, reducing initial setup time.
- Good, because copied components can be freely modified — there is no dependency to update, no version lock-in.
- Good, because shadcn/ui has exceptional LLM training data coverage (~80k GitHub stars), producing highly fluent AI-generated integration code.
- Good, because the component catalog covers all 18 standard patterns identified for SPC Player plus additional patterns (Sonner toasts, Drawer, Command palette).
- Bad, because shadcn/ui components are styled with **Tailwind CSS**, which directly conflicts with ADR-0004's decision to use CSS Modules. Adopting shadcn/ui would require either violating ADR-0004 or rewriting every component's styling from Tailwind to CSS Modules — negating the copy-paste benefit.
- Bad, because shadcn/ui's design system (shadcn's color palette, spacing scale, border radius conventions) would need to be replaced with SPC Player's design tokens, requiring modification of every copied component.
- Bad, because copied components become the project's responsibility to maintain. When Radix releases accessibility fixes, shadcn/ui components do not automatically receive them — the project must manually track and apply upstream changes or re-copy.
- Bad, because the copy-paste model encourages component proliferation — shadcn/ui ships many components the project may not need, and the "copy everything" approach invites unused code.
- Bad, because shadcn/ui assumes Tailwind's utility-class approach for responsive design, dark mode (`dark:` variant), and animation (`animate-` utilities), none of which exist in a CSS Modules project.

### Option 5: React Aria (Adobe)

Use React Aria's hooks-based accessible behavior primitives (`useButton`, `useDialog`, `useSlider`, `useTab`, etc.) instead of Radix's component-based primitives. React Aria provides behavior and ARIA semantics via hooks that attach to your own elements, giving full control over rendering and markup.

- Good, because React Aria is backed by Adobe with a dedicated accessibility team and extensive screen reader testing across NVDA, JAWS, and VoiceOver — arguably the most thorough accessibility testing of any React primitives library.
- Good, because the hooks-based API (`useDialog`, `useSlider`, `useTab`) gives complete control over rendered markup and element choice, avoiding the fixed component composition pattern (`Root/Trigger/Content/Portal`) that Radix imposes.
- Good, because React Aria provides internationalization (i18n) support out of the box, including right-to-left layout and localized date/number formatting — a capability Radix does not offer.
- Good, because React Aria covers a broad set of patterns including drag-and-drop, toast, color picker, and calendar — several of which are not available in Radix.
- Bad, because React Aria's hooks-based API requires more boilerplate per component — each hook returns props objects that must be spread onto the correct elements, and developers must compose multiple hooks for complex patterns. This is more error-prone for AI agents than Radix's declarative component tree.
- Bad, because React Aria has significantly less LLM training data representation than Radix (via shadcn/ui's ~80k+ stars). AI agents produce less consistent and less idiomatic code when building on React Aria, which is a critical factor for an AI-maintained codebase.
- Bad, because React Aria's styling is fully DIY — it provides no data-attribute conventions like Radix's `[data-state]`, meaning state-based CSS requires additional wiring (CSS classes, ARIA attribute selectors, or a separate state management approach), complicating the CSS Modules integration defined in ADR-0004.
- Bad, because the React Aria ecosystem is designed to work best with Adobe's Spectrum design system (React Spectrum). Using React Aria without React Spectrum means forgoing the pre-built component layer and building all visual components from hooks — similar effort to Radix but with a less familiar API for AI agents.
- Neutral, because React Aria's bundle size is comparable to Radix when using individual hooks packages, though the total can be larger for complex components that compose many hooks.

## More Information

### Import Convention

Radix UI primitives are imported from the `radix-ui` unified package (Radix UI v2+):

```tsx
import { Dialog, Slider, Tabs } from 'radix-ui';
```

Each primitive is tree-shaken from the unified package — only imported components contribute to bundle size. This replaces the v1 pattern of separate `@radix-ui/react-*` packages.

### Styling Convention (aligned with ADR-0004)

All Radix primitives are styled via co-located CSS Module files using data-attribute selectors:

```css
/* ExportDialog.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
}

.overlay[data-state="open"] {
  animation: fadeIn 150ms ease-out;
}

.content {
  background: var(--color-bg-primary);
  border-radius: 8px;
  padding: var(--space-6);
}

.content[data-state="open"] {
  animation: slideUp 200ms ease-out;
}
```

```tsx
// ExportDialog.tsx
import { Dialog } from 'radix-ui';
import styles from './ExportDialog.module.css';

export function ExportDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title>Export</Dialog.Title>
          {/* export options */}
          <Dialog.Close />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

### Wrapper Component Convention

Where SPC Player needs project-specific defaults (consistent animation, theme token usage, standard sizes), thin wrapper components are created around Radix primitives:

```
src/components/ui/
  Dialog/
    Dialog.tsx          # Wrapper with project defaults
    Dialog.module.css   # Styled via CSS Modules
  Slider/
    Slider.tsx
    Slider.module.css
  Tabs/
    Tabs.tsx
    Tabs.module.css
  ...
```

These wrappers re-export Radix's sub-components with project-standard `className` bindings applied, so feature code imports from `components/ui/Dialog` (via relative paths, consistent with ADR-0009's import convention) rather than directly from `radix-ui`. This creates a single point of control for styling and animation conventions without adding behavioral abstraction.

### Radix Accessibility Features by Primitive

Key accessibility behaviors provided by Radix that would require manual implementation if building custom:

| Primitive | Accessibility Features Provided |
|-----------|-------------------------------|
| Dialog | Focus trap, Escape to close, scroll lock, `aria-modal`, title/description association, return focus on close |
| AlertDialog | Same as Dialog plus required action acknowledgment pattern, cancel-first focus |
| DropdownMenu | Roving tabindex, typeahead search, `aria-expanded`, sub-menu navigation, Escape to close parent, portal rendering |
| ContextMenu | Same as DropdownMenu plus right-click trigger, long-press for touch |
| Slider | `aria-valuemin/max/now`, arrow key stepping, Home/End, Page Up/Down, orientation, range mode |
| Tabs | `role="tablist"`, `aria-selected`, roving tabindex with arrow keys, automatic/manual activation, panel association via `aria-controls` |
| Select | `aria-expanded`, typeahead search, `aria-selected`, arrow key navigation, Home/End, collision-aware positioning |
| Tooltip | Delay management, `aria-describedby` association, Escape to dismiss, provider for global delay |
| ScrollArea | Custom scrollbar with keyboard scrolling, `aria-orientation`, scroll position tracking |

### Performance Impact Assessment

Radix primitives operate at interactive frequency — they render and update in response to user events (clicks, key presses, pointer moves), not per-frame. The reconciler cost of Radix's component trees is negligible for interactive-frequency updates (<10ms per event). All 60fps rendering paths (VU meters, voice state, echo buffer) use custom Tier 2 components with direct DOM manipulation, completely outside of Radix's React-based rendering.

### Related Decisions

- **ADR-0002** (UI Framework): selected React 19 + Radix UI as the foundational stack. This ADR scopes precisely which Radix primitives to adopt.
- **ADR-0004** (CSS Methodology): established CSS Modules + data-attribute styling convention. This ADR confirms that convention applies to all Radix primitives.
- **ADR-0005** (State Management): defines the Zustand store slices that Radix-based UI components subscribe to (e.g., Tabs wired to the router, Sliders wired to playback/mixer state).
- A future ADR may address the **design token system** (color palette, spacing scale, typography) that populates the CSS custom properties used by all components.
- A future ADR may address the **wrapper component API surface** — specifically, how much behavioral customization the thin Radix wrappers expose vs. hardcode.
