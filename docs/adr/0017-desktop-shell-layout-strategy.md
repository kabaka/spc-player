---
status: 'accepted'
date: 2026-03-21
---

# Desktop Shell Layout Strategy

## Context and Problem Statement

SPC Player needs a responsive layout strategy that accommodates all planned features: persistent transport controls, an always-visible playlist sidebar, in-context file loading, and efficient mobile navigation. The initial prototype rendered all controls inside `PlayerView` with no sidebar, wasting horizontal space on desktop and lacking a clear responsive model for tablet and mobile viewports.

How should the application shell be structured to support four distinct viewport sizes while keeping transport controls always accessible and the playlist visible on larger screens?

## Decision Drivers

- **Transport accessibility** — playback controls (play/pause, seek, volume) must be visible and reachable at all times, regardless of the active route.
- **Playlist visibility** — desktop users expect a persistent playlist panel; mobile users need the same functionality without sacrificing content area.
- **Layout stability** — no layout shift during loading or navigation transitions.
- **Responsive consistency** — a single CSS strategy that covers mobile through wide desktop without view-specific overrides.
- **CSS maintainability** — the grid system should be straightforward to reason about and extend for future panels (e.g., info/metadata panel at wide breakpoints).
- **Mobile navigation conventions** — mobile music players use bottom tab bars; desktop apps use horizontal top nav.

## Considered Options

- **Option 1: CSS Grid shell with four responsive breakpoints** — a mobile-first grid layout with breakpoints at 768px, 1024px, and 1440px, a root-level `TransportBar`, and a `PlaylistSidebar` visible on tablet/desktop.
- **Option 2: Flexbox-based layout with conditional rendering** — use flexbox for the shell, conditionally rendering sidebar and transport components per breakpoint via JS media queries.
- **Option 3: CSS-only single-column layout** — keep all content in a single scrollable column at all sizes, with the playlist accessible via route navigation only.

## Decision Outcome

Chosen option: **"CSS Grid shell with four responsive breakpoints"** (Option 1), because it is the only option that satisfies all decision drivers — persistent transport, always-visible sidebar on desktop, no layout shift, and clean maintainability through CSS Grid's explicit region model.

The four breakpoints are:

| Token   | Range      | Layout                                                                          |
| ------- | ---------- | ------------------------------------------------------------------------------- |
| Mobile  | < 768px    | Single column · bottom 3-tab nav · stacked transport bar above nav · no sidebar |
| Tablet  | 768–1023px | Collapsible sidebar (240px) · horizontal top nav · fixed transport bar          |
| Desktop | ≥ 1024px   | Fixed sidebar (280px) · horizontal top nav · fixed transport bar                |
| Wide    | ≥ 1440px   | Three-column (sidebar 280px + main + info panel 320px) · fixed transport bar    |

Key structural decisions:

- **TransportBar** is a root-level fixed component with a three-zone layout (track info | controls + seek | volume). On mobile it stacks into two rows above the bottom nav.
- **PlaylistSidebar** is always visible on desktop, collapsible on tablet (via `transform: translateX()` for GPU compositing), and hidden on mobile where playlist access moves to the bottom nav's Tools tab.
- **Navigation** uses horizontal top nav on tablet/desktop and a 3-item bottom tab bar (Player / Tools / Settings) on mobile.
- **Position sync** uses a root-level `requestAnimationFrame` hook (`usePlaybackPosition`) decoupled from `PlayerView`, so the seek bar in `TransportBar` updates independently.
- CSS follows **mobile-first** conventions with `min-width` media queries.

### Consequences

- Good, because transport controls are always visible and accessible regardless of route or viewport.
- Good, because CSS Grid's named regions make the shell layout self-documenting and easy to extend (e.g., adding the wide-desktop info panel is a one-line `grid-template-columns` change).
- Good, because `PlayerView` is simplified — it no longer owns playback controls, only visualization and metadata.
- Good, because the mobile bottom-nav pattern matches user expectations from native music apps.
- Bad, because sidebar collapse state must be managed and persisted, adding state complexity on tablet.
- Bad, because the mobile "Tools" hub page (containing playlist, instrument, and analysis sub-views) is an additional routing surface that must be implemented.
- Neutral, because the wide-desktop info panel (≥ 1440px) is defined in the grid but its content is deferred to a later phase.

### Confirmation

Implementation can be verified by:

- Visual inspection at each breakpoint confirms correct region placement.
- The `TransportBar` remains visible during route transitions (no unmount/remount).
- Playwright E2E tests at mobile (375px), tablet (768px), and desktop (1280px) viewport widths validate layout regions.

## Pros and Cons of the Options

### CSS Grid shell with four responsive breakpoints

Mobile-first CSS Grid layout with explicit breakpoints. `TransportBar` and `PlaylistSidebar` are root-level components rendered outside the route `<Outlet>`.

- Good, because CSS Grid provides explicit, named layout regions that are easy to rearrange per breakpoint.
- Good, because root-level `TransportBar` persists across route changes without remounting.
- Good, because sidebar collapse uses `transform` (GPU-composited) rather than width animation, avoiding layout thrash.
- Good, because the four-breakpoint model covers mobile through ultrawide with minimal CSS.
- Bad, because four breakpoints require testing at each size to prevent regressions.
- Bad, because sidebar collapse/expand state adds persistence and focus-management requirements.

### Flexbox-based layout with conditional rendering

Use flexbox for the shell. Render sidebar and transport bar conditionally based on JS `matchMedia` queries.

- Good, because flexbox is widely understood and requires less mental model overhead than grid.
- Bad, because conditionally rendering components via JS causes layout shift and component remounting on resize.
- Bad, because flexbox does not provide named regions, making the shell harder to reason about as complexity grows.
- Bad, because JS-driven conditional rendering mixes layout concerns with component lifecycle, complicating testing.

### CSS-only single-column layout

Keep all views in a single scrollable column. Playlist is a separate route, not a sidebar.

- Good, because it is the simplest implementation with no sidebar state to manage.
- Bad, because playlist is not visible alongside the player, forcing constant route switching on desktop.
- Bad, because it wastes significant horizontal space on desktop and wide viewports.
- Bad, because it does not match desktop music player conventions, reducing usability for the primary audience.

## More Information

- Full design specification: [`docs/dev/plans/ux-layout-redesign.md`](../dev/plans/ux-layout-redesign.md)
- ADR-0004 documents CSS methodology decisions (design tokens, utility patterns)
- ADR-0018 documents the bundle size budget increase driven in part by these layout features
