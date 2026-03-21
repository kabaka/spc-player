# UX Layout Redesign Plan — SPC Player

> Comprehensive design specification for the SPC Player UX overhaul.
> Addresses: desktop layout waste, playlist separation, empty transport bar,
> drag-and-drop, loading layout shift, metadata visibility, theme toggle
> placement, seek bar, and information density.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Responsive Breakpoint Strategy](#2-responsive-breakpoint-strategy)
3. [Overall Layout — Desktop](#3-overall-layout--desktop)
4. [Overall Layout — Tablet](#4-overall-layout--tablet)
5. [Overall Layout — Mobile](#5-overall-layout--mobile)
6. [Component Hierarchy Changes](#6-component-hierarchy-changes)
7. [Bottom Transport Bar](#7-bottom-transport-bar)
8. [Seek Bar Specification](#8-seek-bar-specification)
9. [Drag-and-Drop Behavior](#9-drag-and-drop-behavior)
10. [Loading State Transitions](#10-loading-state-transitions)
11. [Metadata Panel Redesign](#11-metadata-panel-redesign)
12. [Information Density Improvements](#12-information-density-improvements)
13. [Theme Toggle Relocation](#13-theme-toggle-relocation)
14. [Navigation Restructure](#14-navigation-restructure)
15. [Empty States](#15-empty-states)
16. [Accessibility Audit Points](#16-accessibility-audit-points)
17. [Motion & Animation Tokens](#17-motion--animation-tokens)
18. [Migration Approach](#18-migration-approach)

---

## 1. Design Philosophy

**"Retro-futuristic information density"** — SNES nostalgia meets a modern power-user interface.

Core tenets:

- **Every pixel earns its place.** No decorative whitespace. If space exists, fill it with useful information or controls. Closer to foobar2000/MusicBee than Plexamp.
- **Dark by default.** The `#0e0e16` dark theme is the primary surface. The purple accent (`#8b5cf6`) is the signature color. SNES-era pixel aesthetics inform the mood but not the typography or interaction model.
- **Familiar transport controls.** The bottom transport bar follows the universal three-zone layout found in every major music player. Users should never have to learn where play/pause is.
- **Progressive disclosure.** Simple on the surface, powerful one click deeper. The playlist is always visible on desktop (Model B). Metadata is always visible on desktop. The mixer, analysis, and instrument views are one navigation step away.
- **No layout shift. Ever.** Loading states use fixed-height placeholders with shimmer animations. No conditional DOM insertion that changes element positions.

---

## 2. Responsive Breakpoint Strategy

| Token               | Range      | Name    | Layout Model                       |
| ------------------- | ---------- | ------- | ---------------------------------- |
| `--bp-mobile`       | < 768px    | Mobile  | Single column, bottom tab nav      |
| `--bp-tablet`       | 768–1023px | Tablet  | Two column (collapsible sidebar)   |
| `--bp-desktop`      | ≥ 1024px   | Desktop | Three-zone (sidebar + main + info) |
| `--bp-desktop-wide` | ≥ 1440px   | Wide    | Three-zone, wider info panel       |

**CSS approach:** Mobile-first with `min-width` media queries. Use CSS Grid for the shell layout. Container queries for component-level responsiveness within panels.

```css
/* Shell grid at each breakpoint */
/* Mobile:  single column, rows: [main] [transport] [bottomnav] */
/* Tablet:  two columns [sidebar 280px | main], rows: [content] [transport] */
/* Desktop: two columns [sidebar 280px | main+info], rows: [content] [transport] */
/* Wide:    three columns [sidebar 280px | main | info 320px], rows: [content] [transport] */
```

---

## 3. Overall Layout — Desktop (≥ 1024px)

### ASCII Wireframe

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🎮 SPC Player           [Player] [Instrument] [Analysis]        [⚙]│
├──────────┬───────────────────────────────────────────────────────────┤
│          │                                                          │
│ PLAYLIST │  NOW PLAYING                     │  TRACK INFO           │
│ SIDEBAR  │  ┌────────────────────────────┐  │  ┌──────────────────┐ │
│ (280px)  │  │  Visualization Area        │  │  │ Title: Song Name │ │
│          │  │  (Waveform / Spectrum /     │  │  │ Game:  Chrono T. │ │
│ [+ Add]  │  │   Piano Roll / VU meters)  │  │  │ Artist: Mitsuda  │ │
│ ─────────│  │  300px minimum height       │  │  │ Dumper: user123  │ │
│ ▶ Track1 │  └────────────────────────────┘  │  │ Duration: 3:45   │ │
│ ● Track2 │                                  │  │ Fade: 10.0s      │ │
│ ▶ Track3 │  ┌─────────────────────────┐     │  │ Track: 3 of 12   │ │
│ ▶ Track4 │  │ Voice Mixer             │     │  ├──────────────────┤ │
│ ▶ Track5 │  │ [1][2][3][4][5][6][7][8]│     │  │ Technical        │ │
│ ▶ Track6 │  │ (toggles + level meters) │     │  │ SRate: 32000 Hz  │ │
│ ▶ Track7 │  └─────────────────────────┘     │  │ Format: ID666    │ │
│          │                                  │  │ Emulator: ---    │ │
│ ─────────│  [Export ▾]                      │  │ xid6: Yes        │ │
│ Shuffle  │                                  │  └──────────────────┘ │
│ Repeat:🔁│                                  │                       │
├──────────┴──────────────────────────────────┴───────────────────────┤
│ [◄◄] [▶❚❚] [►►]  ▓▓▓▓▓▓▓▓▓▓▓▒▒●▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  1:23 / 3:45  │
│ Track 2 — Song Name · Chrono Trigger        🔊━━━━●━━━  78%       │
└──────────────────────────────────────────────────────────────────────┘
```

### Layout Grid Definition

```
.shell (desktop) {
  display: grid;
  grid-template-columns: 280px 1fr;          /* sidebar | main */
  grid-template-rows: auto 1fr auto;         /* topnav | content | transport */
  min-height: 100dvh;
}
```

At `≥ 1440px` (wide desktop), the info panel separates from the main content:

```
.shell (wide) {
  grid-template-columns: 280px 1fr 320px;    /* sidebar | main | info */
}
```

At `1024–1439px`, the info panel sits below the visualization inside the main content area's scroll region (stacked layout).

### Key Regions

| Region           | Grid Position                                     | Content                                             |
| ---------------- | ------------------------------------------------- | --------------------------------------------------- |
| Top Nav          | `1 / 1 / 2 / -1` (spans all)                      | Logo + horizontal nav links                         |
| Playlist Sidebar | `2 / 1 / 3 / 2`                                   | Playlist + add files + shuffle/repeat               |
| Main Content     | `2 / 2 / 3 / 3` (or `2 / 2 / 3 / -1` on non-wide) | Visualization + mixer + metadata (stacked at <1440) |
| Info Panel       | `2 / 3 / 3 / 4` (wide only)                       | Metadata, technical details                         |
| Transport Bar    | `3 / 1 / 4 / -1` (spans all)                      | Bottom transport (always visible)                   |

---

## 4. Overall Layout — Tablet (768–1023px)

```
┌──────────────────────────────────────────────────────┐
│ 🎮 SPC Player     [Player] [Instrument] [Analysis] ⚙│
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ PLAYLIST │  NOW PLAYING                              │
│ SIDEBAR  │  ┌────────────────────────────────────┐   │
│ (240px)  │  │ Visualization (200px)              │   │
│ toggle ☰ │  └────────────────────────────────────┘   │
│          │                                           │
│ ▶ Track1 │  Song Name — Chrono Trigger               │
│ ● Track2 │  Artist: Mitsuda  ·  3 of 12             │
│ ▶ Track3 │                                           │
│ ▶ Track4 │  [1][2][3][4][5][6][7][8]  Mixer          │
│          │                                           │
│          │  [▸ Track Info]  (collapsible)             │
│          │  [Export ▾]                                │
├──────────┴───────────────────────────────────────────┤
│ [◄◄][▶❚❚][►►]  ──●──────── 1:23/3:45     🔊━●━ 78%│
│ Song Name · Chrono Trigger                           │
└──────────────────────────────────────────────────────┘
```

### Key Differences from Desktop

- Sidebar is **collapsible** via a hamburger toggle. Defaults to open when first visiting, remembers state.
- Sidebar width: 240px (narrower than desktop's 280px).
- Info panel is **not** a separate column — metadata uses a collapsible panel in the main content scroll area.
- Visualization area is shorter (200px vs 300px on desktop).
- Top nav: horizontal but condensed. Settings uses an icon-only gear button.

### Layout Grid

```
.shell (tablet) {
  display: grid;
  grid-template-columns: auto 1fr;      /* sidebar (0 or 240px) | main */
  grid-template-rows: auto 1fr auto;    /* topnav | content | transport */
}
```

The sidebar uses `transform: translateX()` for GPU-only compositing when collapsing, avoiding layout thrash from width animation.

### Sidebar Collapse Accessibility

- Toggle button: `aria-expanded="true/false"`, `aria-controls="playlist-sidebar"`, `aria-label="Toggle playlist sidebar"`.
- When collapsed, sidebar content is hidden via `display: none` (not just `width: 0` with `overflow: hidden`) so screen readers do not read hidden content.
- If user focus is inside the sidebar when it collapses, focus moves to the toggle button.

---

## 5. Overall Layout — Mobile (< 768px)

```
┌────────────────────────────────┐
│ 🎮 SPC Player           [☰]  │
├────────────────────────────────┤
│                                │
│  ┌──────────────────────────┐  │
│  │  Visualization (120px)   │  │
│  └──────────────────────────┘  │
│                                │
│  Song Name                     │
│  Chrono Trigger · Mitsuda      │
│  Track 3 of 12                 │
│                                │
│  [1][2][3][4][5][6][7][8]      │
│                                │
│  [▸ Track Info]                │
│  [Export ▾]                    │
│                                │
│                                │
├────────────────────────────────┤  ← Transport bar (stacked layout)
│  ──────●──────────── 1:23/3:45│
│  [◄◄]  [▶❚❚]  [►►]    🔊 78% │
│  Song Name · Chrono Trigger    │
├────────────────────────────────┤  ← Bottom tab nav
│ 🎵Player   🛠Tools   ⚙Settings│
└────────────────────────────────┘
```

### Key Differences

- **No sidebar.** Playlist is accessed via the Tools tab on the bottom nav.
- **Bottom tab nav** with 3 items: Player, Tools, Settings. The Tools tab contains sub-views for Playlist (default), Instrument, and Analysis, selectable via a top tab bar within the Tools view.
- **Transport bar** sits above the bottom tab nav. Stacked layout (seek bar on top, controls and track info below). Slightly taller (~96px vs ~64px on desktop).
- **Visualization** is compact (120px height) and optional (can be collapsed).
- **Metadata** is a collapsible panel within the scroll area.
- **Seek bar** spans full width.

### Layout Grid

```
.shell (mobile) {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr auto auto;  /* topbar | content | transport | bottomnav */
}
```

The top bar on mobile is a minimal header (logo/title + hamburger menu for quick access to secondary items).

---

## 6. Component Hierarchy Changes

### Current Hierarchy

```
RootComponent (route: __root)
├── <nav> (top nav — horizontal links + ThemeToggle)
├── <main> (Outlet — renders route component)
│   └── PlayerView | PlaylistView | InstrumentView | AnalysisView | SettingsView
├── <div#player-controls> (empty placeholder)
├── <BottomNav> (mobile tab bar)
├── <ShortcutHelpDialog>
├── <InstallPrompt> / <UpdatePrompt>
├── <OfflineIndicator>
└── <ToastContainer>
```

### Proposed Hierarchy

```
RootComponent (route: __root)
├── <TopNav>                          ← simplified, no ThemeToggle
├── <div.layoutBody>                  ← CSS grid sub-container for sidebar + main
│   ├── <PlaylistSidebar>             ← NEW: embedded playlist (desktop/tablet only)
│   │   ├── <AddFilesButton>
│   │   ├── <PlaylistTrackList>       ← shared component, reused in mobile Tools/Playlist
│   │   └── <PlaylistControls>        ← shuffle, repeat
│   └── <main>
│       └── <Outlet>                  ← renders view WITHOUT playlist
│           └── PlayerView (redesigned)
│               ├── <React.lazy(() => import('VisualizationStage'))>  ← code-split
│               ├── <NowPlayingInfo>  ← fixed-height, skeleton + aria-live for loading
│               ├── <VoiceMixer>
│               └── <MetadataPanel>   ← visible by default on wide; collapsible on narrow
├── <TransportBar>                    ← NEW: replaces empty #player-controls
│   ├── <TrackInfoMini>               ← left zone: thumbnail placeholder + title + game
│   ├── <TransportControls>           ← center zone: prev / play-pause / next
│   ├── <SeekBar>                     ← center zone: custom seek bar (src/components/SeekBar/)
│   └── <VolumeControl>              ← right zone: mute + slider
├── <BottomNav>                       ← mobile only (hidden on tablet+), 3 items
├── <DragDropOverlay>                 ← NEW: full-window, invisible until dragenter
├── <React.lazy(() => import('ShortcutHelpDialog'))>  ← lazy-loaded
├── <InstallPrompt> / <UpdatePrompt>
├── <OfflineIndicator>
└── <ToastContainer>
```

### Key Changes

1. **`PlaylistSidebar`** — New component. Renders the playlist inline in the sidebar on desktop/tablet. On mobile, playlist is part of the Tools tab, accessed via bottom nav. Both `PlaylistSidebar` and the mobile Tools/Playlist view reuse `PlaylistTrackList` internally as a shared component.

2. **`TransportBar`** — Replaces the empty `#player-controls`. Contains all primary playback controls. Always visible. Fixed to bottom.

3. **`DragDropOverlay`** — New component. Globally registered at root level. Invisible by default. Shows a full-viewport overlay with drop prompt on `dragenter`.

4. **`PlayerView` simplification** — Transport controls (prev/play/next), seek bar, volume, and speed currently live inside PlayerView. These move to `TransportBar`. PlayerView keeps: visualization, now-playing display (track info), voice mixer, metadata, export button.

5. **`NowPlayingInfo`** — Extracted from PlayerView. Fixed height, uses skeleton shimmer for loading with `aria-live` region to announce loading and loaded states to assistive technology.

6. **`TopNav`** — Loses ThemeToggle. Gains simplified structure. On mobile, becomes a minimal header bar (logo + hamburger menu).

7. **`BottomNav`** — Remains mobile-only. 3 items: Player, Tools, Settings.

8. **Code-splitting** — `VisualizationStage` (and all canvas renderers within it) loaded via `React.lazy()` + `Suspense` to keep initial bundle lean. `ShortcutHelpDialog` also lazy-loaded on first `?` keypress or help icon click.

---

## 7. Bottom Transport Bar

### Visual Specification

```
Desktop (≥ 1024px) — single-row, ~64px height:
┌─────────────────────────────────────────────────────────────────────────────┐
│  [🎮] Song Title                [◄◄] [▶] [►►]   ▓▓▓●▒▒▒▒▒ 1:23/3:45  🔊━●━│
│       Game Name · Artist                                              78%   │
└─────────────────────────────────────────────────────────────────────────────┘
  ╰──── left zone ────╯          ╰──── center zone ─────────────────╯ ╰─right─╯
```

```
Mobile (< 768px) — two-row, ~96px height:
┌────────────────────────────────────────────────────┐
│  ═══════════════●═══════════════════  1:23 / 3:45  │  ← seek bar (full width)
│  [🎮] Song Title    [◄◄] [▶] [►►]        🔊 78%   │  ← track info + transport
│       Game Name                                     │
└────────────────────────────────────────────────────┘
```

### Three-Zone Layout Details

#### Left Zone — Track Info Mini

| Element   | Spec                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| Thumbnail | 40×40px rounded-sm placeholder (game art or `🎮` icon)                                           |
| Title     | `--spc-font-size-sm`, `--spc-font-weight-medium`, single line, `text-overflow: ellipsis`         |
| Subtitle  | `--spc-font-size-xs`, `--spc-color-text-secondary`, single line. Shows: `{gameTitle} · {artist}` |
| Layout    | Flex row, gap-3, vertically centered                                                             |
| Width     | `min-content`, max ~30% of bar width on desktop                                                  |

When no track is loaded, show "No track loaded" in muted text, no thumbnail.

#### Center Zone — Transport + Seek

| Element      | Spec                                                    |
| ------------ | ------------------------------------------------------- |
| Previous     | Icon button, `aria-label="Previous track"`, 36×36px     |
| Play/Pause   | Icon button, `aria-label` toggles, 44×44px (larger)     |
| Next         | Icon button, `aria-label="Next track"`, 36×36px         |
| Seek bar     | Custom component (see §8). Fills remaining center width |
| Time display | `{elapsed} / {total}`, `--spc-font-size-xs`, monospace  |
| Layout       | Flex row, items centered, gap-2. Seek bar `flex: 1`     |

On mobile, seek bar moves to its own row above the transport buttons (full-width).

#### Right Zone — Volume & Secondary

| Element       | Spec                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| Mute toggle   | Icon button, `aria-label="Mute"`, 32×32px                                 |
| Volume slider | Horizontal, 80px width on desktop, hidden on mobile (use hardware volume) |
| Volume %      | `--spc-font-size-xs`, 3ch width, right-aligned                            |
| Layout        | Flex row, gap-2, vertically centered                                      |

On mobile, volume is a single mute/unmute icon button (no slider — use device volume buttons). Volume slider is hidden below 768px.

### CSS Positioning

```css
.transportBar {
  position: fixed;
  bottom: 0; /* on tablet+; on mobile: above bottomNav */
  left: 0;
  right: 0;
  z-index: var(--spc-z-sticky);
  min-height: var(
    --transport-bar-height
  ); /* 64px desktop, 96px mobile — min, not fixed */
  background: var(--spc-color-surface);
  border-top: 1px solid var(--spc-color-border);
  padding: var(--spc-space-2) var(--spc-space-4);
  display: grid;
  /* Desktop: three-zone single row */
  grid-template-columns: minmax(120px, 1fr) 2fr minmax(100px, 1fr);
  align-items: center;
  gap: var(--spc-space-3);
}

@media (max-width: 767px) {
  .transportBar {
    bottom: calc(
      56px + env(safe-area-inset-bottom, 0px)
    ); /* above bottom nav */
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    padding: var(--spc-space-1) var(--spc-space-3);
  }
}
```

### 200% Zoom and Magnification

The fixed-position transport bar can obscure content at high zoom levels. To mitigate:

- Main content area `padding-bottom` **always** accounts for transport bar height at all zoom levels (uses the same `--transport-bar-height` token).
- The transport bar uses `min-height` (not fixed `height`) so content reflows rather than overflows when the user zooms to 200%.
- At 200% zoom on a 320px-wide viewport (minimum WCAG 1.4.4 target), the transport bar + bottom nav must not consume more than 40% of the viewport height. If this threshold is exceeded, the transport bar collapses to a compact single-row mode (play/pause button + minimal seek indicator, no track info text).
- Content beneath the transport bar remains scrollable and accessible at all zoom levels.
- Users with screen magnifiers (ZoomText, macOS Zoom) pan around the screen. The fixed bar will always be visible in the magnified view. The compact mode at extreme zoom ensures it doesn't dominate the viewport.

### ARIA

- Transport bar: `role="toolbar"`, `aria-label="Playback controls"`.
- Roving tabindex within the toolbar: only one button has `tabindex="0"` at a time. Arrow Left/Right moves focus between buttons. Home/End move to first/last button. Tab exits the toolbar entirely.
- Seek bar: see §8 for full ARIA specification.
- Volume: `role="slider"` with percentage value text.
- Track info: `aria-live="polite"` region to announce track changes.
- Tab order flows naturally: TopNav → PlaylistSidebar → Main content → TransportBar → BottomNav (matches visual order since `TransportBar` follows `<main>` in the DOM).

---

## 8. Seek Bar Specification

**Canonical specification.** This section is the single authoritative spec for the seek bar component. It supersedes any seek bar specification in other planning documents.

**File location:** `src/components/SeekBar/SeekBar.tsx` and `src/components/SeekBar/SeekBar.module.css` — a shared component, since the seek bar lives in `TransportBar` (a shared root-level component).

### Behavior Model

The seek bar follows the Spotify/Apple Music/YouTube Music pattern refined to 60fps with A-B loop marker overlay.

#### Visual States

```
IDLE (no hover, no focus):
├────────────────●───────────────────────────────┤
 ◀ played (accent) ▶ ◀ remaining (muted border) ▶
 3px track height. No visible thumb.

HOVER or FOCUS:
 ┌──────┐
 │ 2:05 │  ← time tooltip, follows cursor X (hover) or thumb position (focus)
 └──┬───┘
├════════════════●═══════════════════════════════┤
 5px track height. 12px circular thumb visible.
 Played region: accent gradient. Remaining: surface-raised.

DRAGGING:
 ┌──────┐
 │ 2:05 │  ← time updates live
 └──┬───┘
├════════════════●═══════════════════════════════┤
 5px track height. 16px thumb (larger during drag).
 Cursor: grabbing.

WITH A-B LOOP MARKERS:
├════════════════●═══════════════════════════════┤
           ▲ A                      ▲ B
           │ (marker line)          │ (marker line)
   Region between A-B has a subtle accent-subtle overlay behind the track,
   plus a 1px dashed border along the top/bottom edges of the loop region
   (visual indicator not relying solely on color).
   Markers are 2px wide vertical lines extending 4px above and below the bar,
   colored --spc-color-accent with 80% opacity.

WITH WAVEFORM PREVIEW (stretch goal):
├▓▓▒▓▓▓▓▓▒▒▓▓▓▓●▒▒▓▓▓▒▓▓▓▒▒▒▓▓▓▓▓▒▒▓▓▓▓▓▓▓▓▓┤
 Waveform rendered as a bitmap/canvas behind the track bar.
 Played portion uses accent color; unplayed uses muted color.
 Height matches track height (5px on hover).
```

#### Implementation Approach

Use a `<canvas>` element for the seek bar track (not `<input type="range">`), overlaid with an invisible `<input type="range">` for accessibility. This gives pixel-perfect rendering at 60fps while maintaining screen reader compatibility.

```html
<div class="seekBar" role="group" aria-label="Seek">
  <canvas class="seekCanvas" aria-hidden="true" />
  <input
    type="range"
    class="seekInput"
    min="0"
    max="{totalSeconds}"
    step="5"
    value="{currentSeconds}"
    aria-label="Seek position"
    aria-valuetext="1 minute 23 seconds of 3 minutes 45 seconds"
  />
  <div
    class="loopMarkerA"
    role="slider"
    tabindex="0"
    aria-label="Loop start marker"
    aria-valuemin="0"
    aria-valuemax="{totalSeconds}"
    aria-valuenow="{loopStartSeconds}"
    aria-valuetext="Loop starts at 1 minute 5 seconds"
  />
  <div
    class="loopMarkerB"
    role="slider"
    tabindex="0"
    aria-label="Loop end marker"
    aria-valuemin="0"
    aria-valuemax="{totalSeconds}"
    aria-valuenow="{loopEndSeconds}"
    aria-valuetext="Loop ends at 2 minutes 30 seconds"
  />
  <div class="timeTooltip" aria-hidden="true" />
</div>
```

**Critical accessibility requirements:**

- The wrapper `<div>` has `role="group"` — NOT `role="slider"`. The native `<input type="range">` already provides full slider semantics. A redundant `role="slider"` on the wrapper creates confusing nested-slider structure for screen readers.
- The hidden `<input>` uses `opacity: 0` but **must NOT have `pointer-events: none`**. It sits above the canvas in z-order so it remains the keyboard focus target and is reachable by switch-control users.
- `tabindex="0"` is on the native `<input>`, not on the wrapper div.
- The canvas is `aria-hidden="true"` and non-focusable.

#### `aria-valuetext` Continuous Updates

The hidden input's `aria-valuenow` and `aria-valuetext` update continuously during normal playback, throttled to **≤4 Hz** (every 250ms). This ensures screen readers always have current position data, not just a snapshot from the last user interaction. The canvas renders at 60fps using `audioStateBuffer.positionSamples` directly (bypassing Zustand for the visual update), while the `aria-valuetext` attribute syncs at the lower 4 Hz rate via Zustand store state.

Format: `"{minutes} minutes {seconds} seconds of {totalMinutes} minutes {totalSeconds} seconds"` for short tracks. For tracks over 1 hour: include hours.

#### Rendering Details

- **Canvas update loop**: use `requestAnimationFrame`. Only repaint when `position` changes or on hover/pointer move.
- **Played region**: render from 0% to `(currentTime / totalTime) * 100%` of width. Use `--spc-color-accent`.
- **Remaining region**: render remaining with `--spc-color-surface-raised`.
- **Waveform variant** (if enabled): render pre-computed waveform peaks as vertical bars in the canvas background. Two colors: accent for played, muted for remaining. Peaks pre-computed in a worker at track load time.
- **Thumb**: drawn on canvas OR a CSS-positioned pseudo-element. 12px circle on hover/focus, 16px on drag. `--spc-color-accent` fill with subtle box-shadow.
- **Time tooltip**: absolutely positioned `<div>`, `transform: translateX(...)` to follow pointer. Background `--spc-color-surface-raised`, text `--spc-color-text`, `--spc-font-size-xs`, monospace. Rounded corners (`--spc-radius-sm`). Arrow/caret pointing down.
- **Tooltip visibility**: shown on **hover AND focus** (not hover-only). When a keyboard user adjusts the slider via Arrow/PageUp/PageDown keys, the tooltip appears at the thumb position showing the new time. On touch devices, the tooltip appears during drag.

#### Keyboard Interaction

The following step sizes apply to the native `<input type="range">` and are intercepted via a `keydown` handler:

| Key              | Action               |
| ---------------- | -------------------- |
| Arrow Left/Right | Seek ±5 seconds      |
| Page Up/Down     | Seek ±15 seconds     |
| Home             | Seek to start (0:00) |
| End              | Seek to end          |

The native input's `step` attribute is set to `5` for Arrow key increments. Page Up/Down must be intercepted in a `keydown` handler since the native input doesn't support configurable Page increments.

There are no Shift+Arrow seek bar shortcuts. Large seeks (e.g., ±30s) are global shortcuts managed by the `ShortcutManager` at the application level — not a seek bar behavior.

#### Pointer Interaction

- **Click anywhere on track**: seek to that position. No thumb drag required.
- **Drag thumb**: continuous seeking. Update position on every `pointermove` (throttled to rAF).
- **Touch**: larger hit area (44px minimum height for thumb target area, even though the visible track is 3–5px).

#### A-B Loop Marker Overlay

- Markers are rendered as thin vertical lines (`2px × 16px`) positioned at `(markerTime / totalTime) * barWidth`.
- The region between A and B has both a subtle background fill (`--spc-color-accent-subtle`) AND a 1px dashed border along the top/bottom edges of the loop region, so the loop region is identifiable without relying on color alone.
- **Each marker is keyboard-operable** (WCAG 2.1.1). Markers are focusable elements with `role="slider"`, `aria-label`, `aria-valuemin`/`aria-valuemax`/`aria-valuenow`, and `aria-valuetext`. When focused, Arrow Left/Right adjusts the marker position by ±1 second, Shift+Arrow by ±5 seconds. This lets users fine-tune loop boundaries without replaying the track to the desired position.
- Markers are also draggable via pointer events for mouse/touch users.
- When a loop becomes active (both A and B set), announce via the playback `aria-live` region: "A-B loop active: {startTime} to {endTime}". When cleared: "A-B loop cleared."
- When loop is active, the played portion and marker region use slightly different accent shading to distinguish "played" from "loop region."

---

## 9. Drag-and-Drop Behavior

### Current State

`FileDropZone` renders a permanent visible rectangle (dashed border, ~100px tall) at the top of `PlayerView`. Wastes space, not standard.

### Target State

A **full-window invisible overlay** that activates only during drag operations, plus a small "Add Files" button in the playlist sidebar header.

### Component: `DragDropOverlay`

Mounted once at root level (`__root.tsx`), not inside any route view.

#### State Machine

```
IDLE →(dragenter on window)→ VISIBLE →(drop)→ PROCESSING → IDLE
                               │                ↑
                               └─(dragleave of window, no re-enter within 50ms)─→ IDLE
```

#### IDLE State

- Component renders nothing visible (`display: none` or `visibility: hidden`).
- A global `dragenter` listener on `window` transitions to VISIBLE.

#### VISIBLE State

```
Full-viewport overlay:
┌──────────────────────────────────────────────────────┐
│                                                      │
│             ┌────────────────────────┐               │
│             │                        │               │
│             │    🎮  Drop SPC files  │               │
│             │       to play          │               │
│             │                        │               │
│             └────────────────────────┘               │
│                                                      │
└──────────────────────────────────────────────────────┘
 Background: --spc-color-overlay (rgba(0,0,0,0.6))
 Inner card: --spc-color-surface with dashed border (--spc-color-accent)
 Text: --spc-color-text, --spc-font-size-lg
 z-index: --spc-z-overlay
```

- Covers entire viewport including transport bar and nav.
- Pointer events on overlay handle `dragover` (prevent default) and `drop`.
- A 50ms debounce timer on `dragleave` prevents flickering when dragging over child elements.

#### PROCESSING State

- Brief (< 100ms typically). File(s) are parsed and added to the playlist.
- Overlay dismisses immediately on drop. If parsing is slow enough to notice, show a toast ("Added 5 tracks to playlist") rather than keeping the overlay up.

#### "Add Files" Button

- Small button in playlist sidebar header: `[+ Add Files]`.
- Opens the native file picker (`<input type="file" accept=".spc" multiple>`).
- Also present in the empty state (no tracks loaded) as a larger call-to-action.
- **On all breakpoints:** On mobile (where the sidebar is hidden), the Tools > Playlist sub-view includes its own "Add Files" button. The mobile empty state also shows an "Add Files" call-to-action. A visible file-picker button must always be present — drag-and-drop alone is not sufficient.

#### Accessibility

- Overlay: `aria-hidden="true"`. The overlay is transient and non-interactive — users don't navigate inside it, and a dialog role would be semantically incorrect.
- Screen reader announcement on `dragenter`: via a separate `aria-live="assertive"` region (not on the overlay itself): "Drag detected. Drop SPC files to add to playlist."
- Focus is not trapped.
- Successful file drop: toast notification announces result including count ("Added 5 tracks to playlist"). The `ToastContainer` uses `aria-live` for screen reader announcements.

---

## 10. Loading State Transitions

### Problem

Current code in PlayerView:

```tsx
{
  isLoadingTrack && (
    <div className={styles.loadingIndicator} aria-live="polite">
      Loading track…
    </div>
  );
}
```

This conditionally inserts/removes a DOM element, causing all content below to shift vertically.

### Solution: Fixed-Height Now-Playing Region with Cross-Fade

The `<NowPlayingInfo>` component always renders at the same height regardless of state.

#### Three States, Same Layout Box

```
┌─ NowPlayingInfo (fixed height: 56px on desktop, 48px on mobile) ──────────┐
│                                                                            │
│  State: HAS_TRACK                                                          │
│  ┌──────────────────────────────────────────────────────────┐              │
│  │  Song Title                                              │              │
│  │  Chrono Trigger · Yasunori Mitsuda  ·  Track 3 of 12    │              │
│  └──────────────────────────────────────────────────────────┘              │
│                                                                            │
│  State: LOADING (replaces HAS_TRACK in the same box)                       │
│  ┌──────────────────────────────────────────────────────────┐              │
│  │  ░░░░░░░░░░░░░░░░░░░░░  (shimmer bar, title width)      │              │
│  │  ░░░░░░░░░░░░  ·  ░░░░░░░░░░  (shimmer bars)            │              │
│  └──────────────────────────────────────────────────────────┘              │
│                                                                            │
│  State: EMPTY (no track ever loaded)                                       │
│  ┌──────────────────────────────────────────────────────────┐              │
│  │  No track loaded                                         │              │
│  │  Drop an SPC file or click Add Files                     │              │
│  └──────────────────────────────────────────────────────────┘              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Assistive Technology: Loading Announcements

Visual shimmer is invisible to screen readers. The `NowPlayingInfo` container must provide AT feedback:

- Container has `aria-live="polite"` and `aria-atomic="true"`.
- **On LOADING state:** Set `aria-busy="true"` on the container. Inject screen-reader-only text "Loading track" (visually hidden via `sr-only` class, inside the live region). This triggers the `aria-live` announcement so AT users know something is happening — the visual shimmer alone is insufficient.
- **On HAS_TRACK state:** Remove `aria-busy`. The container's text content updates (track title, game name, etc.) and the live region announces the new content.
- Skeleton shimmer elements are `aria-hidden="true"`.

#### CSS Cross-Fade

```css
.nowPlayingContent {
  position: relative;
  height: 56px; /* fixed — never changes */
  overflow: hidden;
}

.nowPlayingState {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: opacity var(--spc-duration-normal) var(--spc-easing-default);
}

.nowPlayingState[data-state='hidden'] {
  opacity: 0;
  pointer-events: none;
}

.nowPlayingState[data-state='visible'] {
  opacity: 1;
}
```

Both the outgoing state and incoming state are rendered simultaneously (overlapping in the same absolute-positioned container). The outgoing fades to `opacity: 0`, the incoming fades to `opacity: 1`. No DOM insertion/removal. No layout shift.

#### Skeleton Shimmer

```css
.skeleton {
  background: var(--spc-color-skeleton);
  border-radius: var(--spc-radius-sm);
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    opacity: 0.7;
  }
}
```

Two shimmer bars: one for title (~60% width, 16px height) and one for subtitle (~40% width, 12px height), vertically stacked with gap.

#### Error State

Loading errors are NOT shown inline (they don't shift layout either). Instead:

- A toast notification appears: "Failed to load track: [reason]".
- The NowPlayingInfo reverts to the previous track state (or EMPTY if no prior track).

---

## 11. Metadata Panel Redesign

### Current State

`MetadataPanel` is rendered inside a `<CollapsiblePanel>` in `PlayerView`. Collapsed by default. Users must click "Track Info" to see it.

### Target State (Desktop ≥ 1440px)

Metadata is **always visible** in a dedicated right-side info panel (third grid column). No collapse needed.

```
INFO PANEL (320px wide, right column):
┌──────────────────────────────────┐
│  Track Information               │  ← <h2>
│  ────────────────────            │
│  Title      Song Name            │
│  Game       Chrono Trigger       │
│  Artist     Yasunori Mitsuda     │
│  Dumper     user123              │
│  Duration   3:45                 │
│  Fade       10.0s                │
│  Track      3 of 12             │
│                                  │
│  Technical Details               │  ← <h3>
│  ────────────────────            │
│  Format     SPC (ID666)          │
│  xid6       Yes                  │
│  SRate      32000 Hz             │
│  Emulator   SNES9x              │
│                                  │
│  Extended Tags                   │  ← <h3>
│  ────────────────────            │
│  OST Title  CT Original ST       │
│  Disc       1                    │
│  Track #    12                   │
│  Publisher  Square               │
│  Year       1995                 │
│  Comment    Dumped 2024-01-15    │
└──────────────────────────────────┘
```

- Uses a `<dl>` (definition list) layout with two columns: label (muted) and value.
- Fields with empty/null values are omitted (no "—" placeholders for missing data).
- Sections are separated by semantic heading elements (`<h2>`, `<h3>`) that serve both as visual dividers and as navigation landmarks for screen reader users.
- Panel scrolls independently if content overflows.

### Target State (Desktop < 1440px and Tablet)

Metadata is a `<CollapsiblePanel>` in the main content area, **below the voice mixer**. Defaults to open on first load, remembers collapse state.

### Target State (Mobile)

Same collapsible panel as tablet, defaults to collapsed to save vertical space.

---

## 12. Information Density Improvements

### Design Token Adjustments

```css
/* Tighter spacing for information-dense layout */
--spc-space-panel-gap: var(
  --spc-space-2
); /* 8px between items in info panels */
--spc-space-section-gap: var(--spc-space-4); /* 16px between sections */
```

### Specific Density Tactics

1. **Playlist sidebar** — Compact row height: 36px per track (foobar2000-style). Show: track number, title (truncated), duration. Currently playing row highlighted with `--spc-color-accent-subtle` background and a small play icon. On hover: background changes to `--spc-color-hover`; action icons fade in (remove, move up/down). Inline action icons must be at least 24×24px with 4px minimum spacing between adjacent targets (WCAG 2.5.8).

2. **Voice mixer** — Inline with the main content, not in a collapsible panel on desktop. 8 channel strips in a horizontal row. Each strip: toggle button (channel number) + narrow VU meter (vertical, 4px wide, 40px tall). The toggle and meter are stacked vertically within each strip. Solo mode via right-click context menu or Shift+click (keyboard via Shift+[1-8] shortcuts). The grid ARIA pattern (`role="grid"`) is preserved from the existing implementation.

3. **Monospace data** — Technical metadata values (sample rate, format strings, hex addresses) use `--spc-font-mono`. This communicates "this is technical data" and aligns numeric columns naturally.

4. **Two-column metadata** — The `<dl>` uses CSS Grid with `grid-template-columns: auto 1fr` so labels and values align in columns, not flowing inline. Much denser than the current card-style layout.

5. **Compact control groups** — Volume and speed sliders: shorter (80px width on desktop). Label and value on the same line as the slider, not on separate lines.

6. **Status line in transport bar** — Show codec/format info in the transport bar subtitle area: `"Song Name · Chrono Trigger · 32kHz · ID666"`. Matches Winamp's information density in the title bar.

7. **Navigation consolidation** — Desktop/tablet top nav: Player, Instrument, Analysis, ⚙ (gear icon for Settings). Mobile bottom nav: Player, Tools, Settings (3 items). The Tools tab on mobile contains Playlist (default sub-view), Instrument, and Analysis as sub-tabs.

8. **Remove decorative whitespace** — Reduce padding inside panels from `--spc-space-4` (16px) to `--spc-space-3` (12px). Reduce gap between sections from `--spc-space-6` (24px) to `--spc-space-4` (16px). Minimum padding stays at 12px — this is the usability floor.

---

## 13. Theme Toggle Relocation

### Current

`<ThemeToggle>` sits in the top nav bar. Shows current mode text ("System") with an icon (`💻`). Clicking cycles through: System → Light → Dark. The button text is confusing.

### Change

1. **Remove** `<ThemeToggle>` from the top nav.
2. **Add** a "Theme" preference section to the Settings page.
3. Settings UI: radio button group (or segmented control) with three options:
   - ☀️ Light
   - 🌙 Dark
   - 💻 System (match OS)
4. Show preview of the selected theme immediately on selection (the existing CSS transition handles this).
5. Current preference indicator: small text below the control showing "Currently: Dark" (for when "System" is selected, tells the user what the system resolved to).

---

## 14. Navigation Restructure

### Desktop/Tablet Top Nav

```
┌─────────────────────────────────────────────────────────────┐
│ 🎮 SPC Player        Player    Instrument    Analysis    ⚙ │
└─────────────────────────────────────────────────────────────┘
```

- Logo/title on the left. Non-link.
- Navigation links: Player, Instrument, Analysis. Active state: accent underline + accent text.
- Settings: gear icon button on the right (no text label in nav). Navigates to `/settings`.
- **No ThemeToggle.** No Playlist link (playlist is the sidebar).

### Mobile Bottom Nav

```
┌───────────┬───────────┬───────────┐
│  🎵       │  🛠       │  ⚙       │
│ Player    │  Tools    │ Settings  │
└───────────┴───────────┴───────────┘
```

- 3 items: Player, Tools, Settings.
- **Tools** contains sub-views accessible via a top tab bar within the Tools route: Playlist (default), Instrument, Analysis.
- Active item: accent color icon and label.

### Mobile Top Bar

Minimal: logo/title and a hamburger menu for quick access.

```
┌────────────────────────────────────┐
│ 🎮 SPC Player               [☰]  │
└────────────────────────────────────┘
```

The hamburger opens a slide-over menu with: Keyboard Shortcuts, About.

---

## 15. Empty States

### No Track Loaded (Player View)

```
┌──────────────────────────────────────────────┐
│                                              │
│         🎮                                   │
│                                              │
│     No track loaded                          │
│                                              │
│     Drop an SPC file anywhere,               │
│     or click to browse:                      │
│                                              │
│         [ Open SPC File ]                    │
│                                              │
│     Learn more about SPC files →             │
│                                              │
└──────────────────────────────────────────────┘
```

- Centered in the main content area.
- The `[ Open SPC File ]` button opens the file picker.
- "Drop an SPC file anywhere" is true because `DragDropOverlay` handles global drag events.
- The transport bar still renders but with all controls disabled and "No track" text.

### Empty Playlist (Sidebar)

```
┌────────────────┐
│  PLAYLIST      │
│  [+ Add Files] │
│  ─────────     │
│                │
│  No tracks     │
│  added yet.    │
│                │
│  Drop files or │
│  click above.  │
│                │
└────────────────┘
```

Small, unobtrusive. The `[+ Add Files]` button is always present in the sidebar header.

---

## 16. Accessibility Audit Points

All changes must maintain WCAG 2.2 AA. Key audit areas for the redesign:

| Area                  | Requirement                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport bar         | `role="toolbar"` with roving tabindex. All buttons have `aria-label`. `min-height` respects 200% zoom. Compact mode at extreme zoom.                                                                                        |
| Seek bar              | Native `<input type="range">` overlaid on canvas. Wrapper `role="group"` (NOT `role="slider"`). Hidden input NOT `pointer-events: none`. `aria-valuetext` throttled at ≤4 Hz during playback. Tooltip on hover AND focus.   |
| A-B loop markers      | Each marker: `role="slider"` with `aria-label`/`aria-valuetext`, keyboard-operable (Arrow ±1s, Shift+Arrow ±5s). Loop activation/clearance announced via `aria-live`. Loop region uses dashed pattern in addition to color. |
| Volume slider         | `aria-label="Volume"`, `aria-valuetext="78%"`.                                                                                                                                                                              |
| Track changes         | `aria-live="polite"` region announces new track title.                                                                                                                                                                      |
| Loading state         | `aria-busy="true"` on `NowPlayingInfo` during loading. SR-only text "Loading track" in live region. Announce track info on load complete. Shimmer elements `aria-hidden="true"`.                                            |
| Playlist sidebar      | `role="listbox"` or list with `aria-current` on active track. Shares ARIA pattern with mobile playlist view via `PlaylistTrackList`.                                                                                        |
| Sidebar collapse      | Toggle: `aria-expanded`, `aria-controls`. Hidden via `display: none`. Focus moves to toggle on collapse.                                                                                                                    |
| Drag overlay          | `aria-hidden="true"` on overlay. Separate `aria-live` region announces drag events.                                                                                                                                         |
| Canvas visualizations | Container: `role="img"` with descriptive `aria-label`. Inner `<canvas>`: `aria-hidden="true"`.                                                                                                                              |
| Skip links            | "Skip to main content" → `<main id="main-content">`. "Skip to player controls" → `<TransportBar id="player-controls">`.                                                                                                     |
| Color contrast        | All text meets 4.5:1 in both themes. Check `--spc-color-text-muted` against `--spc-color-surface`.                                                                                                                          |
| Focus management      | On route change, focus moves to main content. On track change, focus remains on transport controls.                                                                                                                         |
| Keyboard shortcuts    | All existing shortcuts (`Space`, `1-8`, `M`, `N`, `P`, arrows) work globally. `?` opens help.                                                                                                                               |
| Touch targets         | All buttons ≥ 44×44px. Seek bar hover/drag target ≥ 44px tall. Playlist action icons ≥ 24×24px with 4px spacing.                                                                                                            |
| Reduced motion        | All animations disabled via `prefers-reduced-motion`. Shimmer stops. Cross-fade becomes instant. Canvas visualizations drop to ~4fps or static snapshot.                                                                    |

---

## 17. Motion & Animation Tokens

New tokens for the redesign (extend existing tokens in `tokens.css`):

```css
/* Seek bar transitions */
--spc-seek-track-height-idle: 3px;
--spc-seek-track-height-hover: 5px;
--spc-seek-thumb-size: 12px;
--spc-seek-thumb-size-dragging: 16px;
--spc-seek-transition: height var(--spc-duration-fast) var(--spc-easing-out);

/* Drag overlay */
--spc-drag-overlay-enter: opacity var(--spc-duration-normal)
  var(--spc-easing-out);
--spc-drag-overlay-exit: opacity var(--spc-duration-fast) var(--spc-easing-in);

/* Loading cross-fade */
--spc-loading-crossfade: opacity var(--spc-duration-normal)
  var(--spc-easing-default);

/* Sidebar collapse */
--spc-sidebar-transition: transform var(--spc-duration-slow)
  var(--spc-easing-in-out);

/* Panel layout heights */
--spc-transport-bar-height: 64px;
--spc-transport-bar-height-mobile: 96px;
--spc-now-playing-height: 56px;
--spc-now-playing-height-mobile: 48px;
--spc-visualization-height: 300px;
--spc-visualization-height-tablet: 200px;
--spc-visualization-height-mobile: 120px;

/* Playlist track row */
--spc-playlist-row-height: 36px;
```

All animation tokens are zeroed by `prefers-reduced-motion: reduce` (already handled by existing reduced-motion rule in `tokens.css`).

---

## 18. Migration Approach

### Phase 1: Shell Layout + Transport Bar

**Goal:** Multi-column shell, working transport bar, playlist sidebar stub.

1. Redesign `AppShell.module.css` grid from current layout to the new three-zone responsive grid.
2. Create `TransportBar` component with track info, transport controls (prev/play/next), seek bar (initially reuse existing `<Slider>` with `step="any"` — custom canvas seek bar comes in Phase 3), volume.
3. Move transport controls, seek bar, volume, speed out of `PlayerView` into `TransportBar`. `PlayerView` retains: visualization, now-playing display, voice mixer, metadata, export.
4. Wire `TransportBar` to the same store selectors currently used by `PlayerView`.
5. Remove the empty `#player-controls` div. The `TransportBar` takes its place with `id="player-controls"` for skip-link targeting.
6. Stub `PlaylistSidebar` component that renders a simple track list via shared `PlaylistTrackList`. Hidden on mobile (< 768px). On desktop, shows in the left column.
7. Adjust `BottomNav` to 3 items (Player, Tools, Settings) and show on mobile only (`display: none` at 768px+).
8. Adjust `TopNav` to horizontal links on desktop/tablet (Player, Instrument, Analysis, ⚙), minimal header on mobile.
9. Create `usePlaybackPosition` hook at root level (`__root.tsx`) that reads from `audioStateBuffer.positionSamples` and updates Zustand `position` state at ~4 Hz. This ensures the transport bar always has current position data regardless of which route is active.

**Validation:** App remains usable at all breakpoints. Transport bar is functional. E2E tests updated for new DOM structure.

### Phase 2: Drag-and-Drop Overlay + Loading Fix

**Goal:** Remove permanent drop zone, add global drag overlay, fix layout shift.

1. Create `DragDropOverlay` component at root level.
2. Add global `dragenter`/`dragleave`/`drop` listeners on `window`.
3. Remove `<FileDropZone>` from `PlayerView`.
4. Add `[+ Add Files]` button to `PlaylistSidebar` header and mobile Tools/Playlist view.
5. Refactor `NowPlayingInfo` into a fixed-height component with three states (loading/track/empty) using CSS opacity cross-fade. Add `aria-busy` and `aria-live` for AT loading/loaded announcements (including SR-only "Loading track" text).
6. Replace `loadingError` inline div with toast notification.

**Validation:** Drag-drop works across all views. Loading a new track shows smooth cross-fade with AT announcement. No vertical layout shift.

### Phase 3: Custom Seek Bar

**Goal:** Replace `<Slider>` with custom canvas-based seek bar.

1. Build `SeekBar` component at `src/components/SeekBar/` with canvas rendering.
2. Implement hover and focus states (track expansion, thumb appearance, time tooltip shown on both hover and focus).
3. Implement drag-to-seek with `pointermove` → rAF updates.
4. Integrate A-B loop markers overlay with keyboard operability (`role="slider"` per marker, Arrow key adjustment ±1s, Shift+Arrow ±5s).
5. Add invisible `<input type="range">` for accessibility (no `pointer-events: none`, no `role="slider"` on wrapper div).
6. Wire `aria-valuetext` continuous updates at ≤4 Hz throttle during playback.
7. Keyboard: Arrow ±5s, PageUp/PageDown ±15s, Home/End = start/end. No Shift+Arrow on the seek bar.
8. (Stretch) Add waveform preview rendering using pre-computed peaks.

**Validation:** Seek bar renders at 60fps. No perceptible jank. A-B loop markers display and are operable by keyboard and pointer. Screen reader can operate the slider and receives position updates during playback.

### Phase 4: Information Density + Metadata

**Goal:** Metadata panel always visible on wide desktop. Compact UI polish.

1. Implement wide-desktop (≥ 1440px) three-column layout with info panel.
2. Redesign `MetadataPanel` with `<dl>` grid layout, semantic headings (`<h2>`/`<h3>`), and section groupings.
3. Compact playlist row heights to 36px with 24×24px inline action icons.
4. Inline voice mixer (remove CollapsiblePanel wrapper on desktop). Preserve grid ARIA pattern.
5. Apply tighter spacing tokens.
6. Move ThemeToggle to Settings page.
7. Restructure navigation (desktop: Player/Instrument/Analysis/⚙; mobile: Player/Tools/Settings).

**Validation:** Wide screens show three-column layout. Metadata visible without interaction. Theme toggling works from Settings. All content still accessible on mobile.

### Phase 5: Polish + Mobile Refinement

**Goal:** Mobile-specific refinements and visual polish.

1. Refine mobile transport bar (two-row layout, full-width seek, compact mode at 200% zoom).
2. Refine mobile bottom nav (3 items: Player, Tools, Settings). Build Tools route with Playlist/Instrument/Analysis sub-tabs.
3. Add hamburger menu for secondary navigation on mobile.
4. Empty states with illustrations/CTA.
5. Sidebar collapse animation on tablet (using `transform: translateX()` for GPU-only compositing).
6. Visual polish pass: shadows, border treatments, spacing fine-tuning.
7. Accessibility audit across all breakpoints (skip links, focus management, 200% zoom, reduced motion).
8. E2E test updates for new layout structure.

**Validation:** Full E2E test suite passes. Manual testing on phone/tablet viewports. Lighthouse accessibility score ≥ 95.

---

## Appendix A: Component File Map

| New Component                | Proposed File Path                                          |
| ---------------------------- | ----------------------------------------------------------- |
| `TransportBar`               | `src/components/TransportBar/TransportBar.tsx`              |
| `TransportBar.module.css`    | `src/components/TransportBar/TransportBar.module.css`       |
| `TrackInfoMini`              | `src/components/TransportBar/TrackInfoMini.tsx`             |
| `TransportControls`          | `src/components/TransportBar/TransportControls.tsx`         |
| `SeekBar`                    | `src/components/SeekBar/SeekBar.tsx`                        |
| `SeekBar.module.css`         | `src/components/SeekBar/SeekBar.module.css`                 |
| `VolumeControl`              | `src/components/VolumeControl/VolumeControl.tsx`            |
| `PlaylistSidebar`            | `src/features/playlist/PlaylistSidebar.tsx`                 |
| `PlaylistSidebar.module.css` | `src/features/playlist/PlaylistSidebar.module.css`          |
| `DragDropOverlay`            | `src/components/DragDropOverlay/DragDropOverlay.tsx`        |
| `DragDropOverlay.module.css` | `src/components/DragDropOverlay/DragDropOverlay.module.css` |
| `NowPlayingInfo`             | `src/features/player/NowPlayingInfo.tsx`                    |
| `NowPlayingInfo.module.css`  | `src/features/player/NowPlayingInfo.module.css`             |

Existing files to **modify significantly:**

- `src/app/routes/__root.tsx` — New shell structure, `usePlaybackPosition` hook
- `src/app/routes/AppShell.module.css` — Complete grid rewrite
- `src/features/player/PlayerView.tsx` — Remove transport/seek/volume (moved to TransportBar)
- `src/components/BottomNav/BottomNav.tsx` — 3 items (Player, Tools, Settings), mobile-only
- `src/features/metadata/MetadataPanel.tsx` — dl-grid layout rewrite with semantic headings
- `src/features/settings/SettingsView.tsx` — Add theme preference section

Existing files to **remove:**

- `src/components/FileDropZone/` — Replaced by DragDropOverlay (file picker logic moves to PlaylistSidebar and mobile Tools/Playlist)
- `src/components/ThemeToggle/` — Replaced by settings page section

## Appendix B: Token Additions Summary

```css
/* New tokens to add to src/styles/tokens.css */

/* Layout dimensions */
--spc-sidebar-width: 280px;
--spc-sidebar-width-tablet: 240px;
--spc-info-panel-width: 320px;
--spc-transport-bar-height: 64px;
--spc-transport-bar-height-mobile: 96px;
--spc-now-playing-height: 56px;
--spc-now-playing-height-mobile: 48px;
--spc-playlist-row-height: 36px;
--spc-vis-height: 300px;
--spc-vis-height-tablet: 200px;
--spc-vis-height-mobile: 120px;

/* Seek bar */
--spc-seek-track-height: 3px;
--spc-seek-track-height-hover: 5px;
--spc-seek-thumb-size: 12px;
--spc-seek-thumb-size-drag: 16px;
```

## Appendix C: Code-Splitting Requirements

The following components MUST be loaded via `React.lazy()` + `<Suspense>` to stay within the total JS budget:

| Component                                     | Load trigger                     | Estimated savings          |
| --------------------------------------------- | -------------------------------- | -------------------------- |
| `VisualizationStage` (+ all canvas renderers) | Player route mount               | ~8–10 KB off critical path |
| `ShortcutHelpDialog`                          | First `?` keypress or help click | ~3–5 KB off initial load   |

Visualization canvas components (`PianoRollCanvas`, `SpectrumEqCanvas`, `StereoFieldCanvas`, `VoiceTimelineCanvas`) are nested inside `VisualizationStage` and are automatically code-split with it.
