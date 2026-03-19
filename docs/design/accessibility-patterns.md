# Accessibility Patterns for SPC Player Components

**Status:** Final  
**Date:** 2026-03-18  
**Scope:** ARIA roles, keyboard interaction, screen reader strategy, and implementation patterns for all SPC Player UI components — both Tier 1 (Radix-based) and Tier 2 (custom direct-DOM) per ADR-0012.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Transport Controls](#2-transport-controls)
3. [Seek Bar](#3-seek-bar)
4. [Playlist](#4-playlist)
5. [Export Progress](#5-export-progress)
6. [VU Meters](#6-vu-meters)
7. [Virtual Keyboard](#7-virtual-keyboard)
8. [Waveform / Spectrum Analyzer](#8-waveform--spectrum-analyzer)
9. [Channel Mixer](#9-channel-mixer)
10. [DSP Register Inspector](#10-dsp-register-inspector)
11. [Echo Buffer Visualizer & BRR Sample Viewer](#11-echo-buffer-visualizer--brr-sample-viewer)
12. [Cross-Cutting Patterns](#12-cross-cutting-patterns)
13. [Screen Reader Testing Strategy](#13-screen-reader-testing-strategy)

---

## 1. Overview

### Design Principles

1. **Semantic HTML first.** Use ARIA only when no native element conveys the semantics.
2. **Don't fight the rendering model.** Components using direct DOM updates at 60fps (rAF path) must not push ARIA attribute changes at 60fps. Throttle all assistive-technology-facing updates.
3. **Equivalent, not identical.** Non-visual users need equivalent access to information, not an identical visual experience. A numeric readout is better than a silent animation.
4. **Opt-in detail.** Real-time data streams (VU levels, register values) are available on demand, not broadcast continuously via `aria-live`.
5. **Radix integration boundary.** Custom components must integrate cleanly with Radix-based surroundings — focus must move naturally between Radix primitives and custom widgets without traps or dead zones.

### Rendering Model Recap (ADR-0002, ADR-0003)

SPC Player uses a two-tier rendering strategy:

| Tier            | Rendering                 | Update Frequency          | Examples                                            |
| --------------- | ------------------------- | ------------------------- | --------------------------------------------------- |
| Tier 1 (Radix)  | React reconciler          | Interactive (user events) | Dialogs, sliders, tabs, toggles, transport controls |
| Tier 2 (Custom) | Direct DOM via refs + rAF | Up to 60fps               | VU meters, waveforms, register viewer               |

**Critical constraint:** ARIA attributes on Tier 2 components must never update at 60fps. All assistive technology updates are throttled using the shared `createThrottledAnnouncer` utility (§12.2) at ≤ 4 Hz (250ms minimum interval) to prevent screen reader flooding.

### Terminology

This document uses **"instrument mode"** to refer to the state where computer keyboard keys trigger musical notes via the virtual keyboard. This is the canonical term; avoid "note input mode" or "keyboard input mode."

---

## 2. Transport Controls

### Component Description

The player transport bar provides standard media playback controls: play/pause, stop, previous track, next track, repeat mode toggle, and shuffle toggle. These are Tier 1 Radix components (`Button`, `Toggle`).

### ARIA Strategy

```html
<div role="toolbar" aria-label="Playback controls">
  <button aria-label="Previous track">
    <!-- icon -->
  </button>

  <button aria-label="Play">
    <!-- icon changes to pause icon when playing -->
    <!-- aria-label updates dynamically -->
  </button>

  <button aria-label="Stop">
    <!-- icon -->
  </button>

  <button aria-label="Next track">
    <!-- icon -->
  </button>

  <button aria-label="Repeat" aria-pressed="false">
    <!-- icon; aria-pressed reflects state -->
  </button>

  <button aria-label="Shuffle" aria-pressed="false">
    <!-- icon; aria-pressed reflects state -->
  </button>
</div>
```

#### Attribute Details

| Element    | Attribute      | Value                 | Notes                                                                                                                                                                    |
| ---------- | -------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Container  | `role`         | `"toolbar"`           | Groups transport controls as a single composite widget.                                                                                                                  |
| Container  | `aria-label`   | `"Playback controls"` | Identifies the toolbar purpose.                                                                                                                                          |
| Play/Pause | `aria-label`   | `"Play"` or `"Pause"` | **Changes with state.** When stopped/paused, label is "Play". When playing, label is "Pause". A single toggle button — do not use two separate buttons.                  |
| Repeat     | `aria-pressed` | `"true"` / `"false"`  | Reflects whether repeat mode is on. For tri-state repeat (off / repeat all / repeat one), use `aria-label` to describe: `"Repeat: off"`, `"Repeat all"`, `"Repeat one"`. |
| Shuffle    | `aria-pressed` | `"true"` / `"false"`  | Reflects shuffle state.                                                                                                                                                  |

### Keyboard Navigation

Transport controls use the toolbar keyboard pattern per WAI-ARIA APG:

| Key           | Behavior                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- |
| Tab           | Focus enters the toolbar (first button, or last-focused button). Next Tab exits the toolbar. |
| Left Arrow    | Move focus to the previous button in the toolbar. Wraps from first to last.                  |
| Right Arrow   | Move focus to the next button in the toolbar. Wraps from last to first.                      |
| Home          | Move focus to the first button.                                                              |
| End           | Move focus to the last button.                                                               |
| Enter / Space | Activate the focused button.                                                                 |

### State Change Announcements

Buttons announce their own state changes via native ARIA semantics — no additional `aria-live` region is needed for direct button presses. When playback state changes via global keyboard shortcuts (e.g., Space for play/pause while no control is focused), announce the result via a polite live region:

```html
<div
  aria-live="polite"
  aria-atomic="true"
  class="visually-hidden"
  id="playback-announcements"
>
  <!-- "Playing: Song Title" / "Paused" / "Stopped" -->
</div>
```

### Track Info Display

Current time and total duration are visible but must not announce continuously:

```html
<div aria-live="off" aria-label="Playback position">
  <span id="current-time">1:23</span>
  <span aria-hidden="true">/</span>
  <span id="total-time">3:45</span>
</div>
```

Setting `aria-live="off"` prevents screen readers from announcing every time update. Users query the current position by navigating to the element on demand.

---

## 3. Seek Bar

### Component Description

A horizontal slider representing playback position within the current track. Allows click-to-seek and drag-to-scrub. Displays elapsed time and total duration. Built on Radix `Slider`.

### ARIA Strategy

```html
<div class="seek-bar-container">
  <label id="seek-label" class="visually-hidden">Seek</label>
  <div
    role="slider"
    aria-labelledby="seek-label"
    aria-valuemin="0"
    aria-valuemax="225"
    aria-valuenow="83"
    aria-valuetext="1 minute 23 seconds of 3 minutes 45 seconds"
    tabindex="0"
  >
    <!-- Visual track and thumb updated at 60fps; ARIA values throttled -->
  </div>
</div>
```

#### Attribute Details

| Attribute         | Value                     | Notes                                                                                                                               |
| ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `role`            | `"slider"`                | Standard ARIA slider role.                                                                                                          |
| `aria-labelledby` | Points to label           | `"Seek"` — concise label for the control.                                                                                           |
| `aria-valuemin`   | `0`                       | Start of track (seconds).                                                                                                           |
| `aria-valuemax`   | Total duration in seconds | e.g., `225` for a 3:45 track.                                                                                                       |
| `aria-valuenow`   | Elapsed seconds (integer) | e.g., `83` for 1:23. Throttled to ≤ 4 Hz during passive playback. Updated immediately during user scrubbing.                        |
| `aria-valuetext`  | Formatted time string     | `"1 minute 23 seconds of 3 minutes 45 seconds"`. Provides human-readable position that screen readers speak instead of raw seconds. |

### Keyboard Interaction

| Key         | Behavior                                                        |
| ----------- | --------------------------------------------------------------- |
| Right Arrow | Seek forward 5 seconds.                                         |
| Left Arrow  | Seek backward 5 seconds.                                        |
| Up Arrow    | Seek forward 5 seconds (alternate axis, per slider convention). |
| Down Arrow  | Seek backward 5 seconds.                                        |
| Page Up     | Seek forward 15 seconds.                                        |
| Page Down   | Seek backward 15 seconds.                                       |
| Home        | Seek to beginning of track (0:00).                              |
| End         | Seek to end of track (duration).                                |

### `aria-valuetext` Formatting

Convert seconds to spoken-friendly format:

| Elapsed | Duration | `aria-valuetext`                                 |
| ------- | -------- | ------------------------------------------------ |
| 0       | 225      | `"0 seconds of 3 minutes 45 seconds"`            |
| 83      | 225      | `"1 minute 23 seconds of 3 minutes 45 seconds"`  |
| 225     | 225      | `"3 minutes 45 seconds of 3 minutes 45 seconds"` |

```typescript
function formatSeekValueText(elapsedSec: number, durationSec: number): string {
  return `${formatSpokenTime(elapsedSec)} of ${formatSpokenTime(durationSec)}`;
}

function formatSpokenTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (minutes > 0)
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (seconds > 0 || minutes === 0)
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}
```

### Update Throttling

During passive playback (user is not interacting with the slider), `aria-valuenow` and `aria-valuetext` update at ≤ 4 Hz (250ms) via the shared throttle utility (§12.2). During active scrubbing (user is dragging the thumb), updates are immediate — Radix Slider handles this natively.

---

## 4. Playlist

### Component Description

An ordered list of tracks queued for playback. Supports selection, multi-selection, drag-to-reorder, and removal. The currently playing track is visually highlighted. Built on HTML list semantics with custom keyboard enhancements.

### ARIA Strategy

Use `role="listbox"` with `role="option"` items. Listbox is preferred over a plain list because tracks are selectable, and the container manages a single active descendant.

```html
<div
  role="listbox"
  aria-label="Playlist"
  aria-multiselectable="true"
  aria-activedescendant="track-3"
  tabindex="0"
>
  <div
    role="option"
    id="track-1"
    aria-selected="false"
    aria-label="Track 1: Aquatic Ambiance, Donkey Kong Country, 3 minutes 12 seconds"
  >
    <span class="track-number">1</span>
    <span class="track-title">Aquatic Ambiance</span>
    <span class="track-game">Donkey Kong Country</span>
    <span class="track-duration">3:12</span>
  </div>

  <div
    role="option"
    id="track-2"
    aria-selected="false"
    aria-label="Track 2: Corridors of Time, Chrono Trigger, 3 minutes 1 second"
  >
    <!-- ... -->
  </div>

  <div
    role="option"
    id="track-3"
    aria-selected="true"
    aria-current="true"
    aria-label="Track 3: Terra's Theme, Final Fantasy VI, 4 minutes 30 seconds. Now playing."
  >
    <!-- ... -->
  </div>

  <!-- ... -->
</div>
```

#### Attribute Details

| Element       | Attribute               | Value                | Notes                                                                                     |
| ------------- | ----------------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| Container     | `role`                  | `"listbox"`          | Selectable list of options.                                                               |
| Container     | `aria-label`            | `"Playlist"`         | Identifies the widget.                                                                    |
| Container     | `aria-multiselectable`  | `"true"`             | Enables multi-select for batch operations.                                                |
| Container     | `aria-activedescendant` | ID of focused track  | Manages focus without moving DOM focus.                                                   |
| Track         | `role`                  | `"option"`           | Individual selectable item.                                                               |
| Track         | `aria-selected`         | `"true"` / `"false"` | Selection state for batch operations.                                                     |
| Playing track | `aria-current`          | `"true"`             | Marks the currently playing track. Distinct from `aria-selected` (selection vs. current). |
| Track         | `aria-label`            | Full track info      | `"Track N: Title, Game, Duration"`. Append `". Now playing."` for the active track.       |

### Keyboard Interaction

| Key                   | Behavior                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| Tab                   | Focus enters the playlist (active descendant receives visual focus). Next Tab exits. |
| Down Arrow            | Move focus to the next track.                                                        |
| Up Arrow              | Move focus to the previous track.                                                    |
| Home                  | Move focus to the first track.                                                       |
| End                   | Move focus to the last track.                                                        |
| Enter                 | Play the focused track.                                                              |
| Space                 | Toggle selection of the focused track.                                               |
| Ctrl+A / Cmd+A        | Select all tracks.                                                                   |
| Shift+Down / Shift+Up | Extend selection range.                                                              |
| Delete / Backspace    | Remove selected track(s) from playlist. Announce removal.                            |
| Alt+Up Arrow          | Move selected track up (reorder). Announce new position.                             |
| Alt+Down Arrow        | Move selected track down (reorder). Announce new position.                           |

### Reorder Announcements

Keyboard reorder operations announce the result via a polite live region:

```html
<div
  aria-live="polite"
  aria-atomic="true"
  class="visually-hidden"
  id="playlist-announcements"
>
  <!-- "Moved Aquatic Ambiance to position 2 of 10" -->
  <!-- "Removed Terra's Theme from playlist. 9 tracks remaining." -->
  <!-- "3 tracks selected" -->
</div>
```

### Drag-and-Drop Reorder

For mouse/touch drag-and-drop reorder, provide equivalent keyboard access (Alt+Arrow as above). Drag operations are invisible to screen readers — the keyboard alternative is the accessible path. The drag handle element should have:

```html
<span role="img" aria-label="Drag to reorder" class="drag-handle">⠿</span>
```

Or hide the drag handle from the accessibility tree entirely (`aria-hidden="true"`) since keyboard reorder provides the equivalent functionality.

### Empty State

When the playlist is empty:

```html
<div role="listbox" aria-label="Playlist">
  <p role="status">
    No tracks in playlist. Drop SPC files here or use the file picker to add
    tracks.
  </p>
</div>
```

---

## 5. Export Progress

### Component Description

The export pipeline processes single or batched file exports through multiple phases (rendering, encoding, metadata, packaging). Progress is reported per-job and across batches. Built on Radix `Progress` (Tier 1, per ADR-0012).

### ARIA Strategy

#### Single File Export

```html
<div class="export-progress" role="group" aria-label="Export progress">
  <div
    role="progressbar"
    aria-label="Exporting: Terra's Theme"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="45"
    aria-valuetext="Encoding: 45 percent"
  >
    <!-- Visual progress bar -->
  </div>

  <p id="export-phase" aria-hidden="true">Encoding…</p>
  <p id="export-percent" aria-hidden="true">45%</p>
</div>
```

#### Batch Export

```html
<div
  class="export-batch-progress"
  role="group"
  aria-label="Batch export progress"
>
  <!-- Overall batch progress -->
  <div
    role="progressbar"
    aria-label="Batch export"
    aria-valuemin="0"
    aria-valuemax="10"
    aria-valuenow="3"
    aria-valuetext="Exporting file 3 of 10: Terra's Theme"
  >
    <!-- Visual progress bar -->
  </div>

  <!-- Per-file progress -->
  <div
    role="progressbar"
    aria-label="Current file: Terra's Theme"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="72"
    aria-valuetext="Encoding: 72 percent"
  >
    <!-- Visual progress bar -->
  </div>
</div>
```

#### Attribute Details

| Attribute        | Value                                      | Notes                                                                                                                |
| ---------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `role`           | `"progressbar"`                            | Standard ARIA progressbar. Universally supported.                                                                    |
| `aria-valuemin`  | `0`                                        | Progress start.                                                                                                      |
| `aria-valuemax`  | `100` (single) or total file count (batch) | Upper bound of progress.                                                                                             |
| `aria-valuenow`  | Current progress integer                   | Throttled to ≤ 4 Hz (250ms) via the shared throttle utility (§12.2).                                                 |
| `aria-valuetext` | Phase + percentage or batch position       | e.g., `"Encoding: 45 percent"` or `"Exporting file 3 of 10: Terra's Theme"`. Provides context beyond the raw number. |

### Milestone Announcements

Use `aria-live="polite"` announcements at meaningful milestones to avoid flooding. Do not announce every percentage change.

```html
<div
  aria-live="polite"
  aria-atomic="true"
  class="visually-hidden"
  id="export-announcements"
>
  <!-- Milestone announcements inserted here -->
</div>
```

#### Announcement Rules

| Event               | Announcement                                                  | Throttled?                |
| ------------------- | ------------------------------------------------------------- | ------------------------- |
| Export started      | `"Exporting Terra's Theme as WAV"`                            | No (once)                 |
| 25% complete        | `"Export 25 percent complete"`                                | No (milestone)            |
| 50% complete        | `"Export 50 percent complete"`                                | No (milestone)            |
| 75% complete        | `"Export 75 percent complete"`                                | No (milestone)            |
| Export complete     | `"Export complete: Terra's Theme.wav"`                        | No (once)                 |
| Export failed       | `"Export failed: Terra's Theme. Error: insufficient storage"` | No (once)                 |
| Export cancelled    | `"Export cancelled: Terra's Theme"`                           | No (once)                 |
| Batch file boundary | `"Exporting file 3 of 10: Terra's Theme"`                     | No (per-file, infrequent) |
| Batch complete      | `"Batch export complete. 10 files exported."`                 | No (once)                 |

```typescript
// Pseudocode: milestone-based announcement
const MILESTONES = [25, 50, 75];
let announcedMilestones = new Set<number>();

function onProgressUpdate(
  progress: number,
  phase: string,
  announce: (msg: string) => void,
): void {
  const percent = Math.round(progress * 100);

  for (const milestone of MILESTONES) {
    if (percent >= milestone && !announcedMilestones.has(milestone)) {
      announce(`Export ${milestone} percent complete`);
      announcedMilestones.add(milestone);
    }
  }
}
```

### Error and Cancellation

Export errors and cancellations are announced immediately via `aria-live="assertive"` for errors (blocking user attention) and `aria-live="polite"` for cancellations (user-initiated, no urgency).

```html
<div
  aria-live="assertive"
  aria-atomic="true"
  class="visually-hidden"
  id="export-errors"
>
  <!-- "Export failed: Terra's Theme. Error: encoding failed." -->
</div>
```

### Keyboard Interaction

| Key    | Behavior                                                     |
| ------ | ------------------------------------------------------------ |
| Escape | Cancel the active export. Announce cancellation.             |
| Tab    | Focus moves to the cancel button (if export is in progress). |

---

## 6. VU Meters

### Component Description

Eight horizontal or vertical level meters displaying real-time audio amplitude per DSP voice. Visual bars animate at 60fps via canvas or direct DOM style manipulation. A ninth meter may display the stereo master output.

### ARIA Strategy

Use `role="meter"` with a documented fallback strategy. `role="meter"` is the semantically correct ARIA 1.2 role for displaying a scalar value within a known range, but it has incomplete screen reader support as of 2025–2026.

#### Screen Reader Support for `role="meter"`

| Screen Reader                 | Support Status    | Behavior                                                                                             |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| VoiceOver (macOS, Safari 16+) | Supported         | Announces as "level indicator" with value.                                                           |
| NVDA (Chrome/Firefox)         | Partial           | May announce as "progress bar" or with no role. `aria-valuenow` and `aria-valuetext` are still read. |
| JAWS                          | Varies by version | Support improving; may require `aria-roledescription` fallback.                                      |
| TalkBack (Android)            | Partial           | Generally reads value attributes regardless of role support.                                         |

#### Fallback Strategy

The implementation uses a **progressive enhancement** approach:

1. **`role="meter"`** for forward compatibility — as screen reader support matures, the correct role is already in place.
2. **`aria-roledescription="level meter"`** as a fallback description when the role itself is not announced.
3. **Visible numeric readout** always available as a non-ARIA fallback (see below).
4. **`aria-label` with descriptive text** ensures the element is always identifiable regardless of role support.

If automated testing (axe-core) flags `role="meter"` as unsupported, add the expected violation to the known-exceptions list (see §13).

```html
<!-- Container for all 8 channel meters -->
<div role="group" aria-label="Channel levels">
  <!-- Single channel meter -->
  <div
    role="meter"
    aria-roledescription="level meter"
    aria-label="Channel 1 level"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow="72"
    aria-valuetext="72 percent"
    id="vu-meter-1"
  >
    <!-- Visual bar updated via rAF — no ARIA attributes on inner elements -->
    <div class="vu-bar" aria-hidden="true" style="height: 72%"></div>

    <!-- Visible numeric readout — always present, serves as non-ARIA fallback -->
    <span class="vu-numeric" aria-hidden="true">72</span>
  </div>

  <!-- ... channels 2–8 ... -->
</div>

<!-- Numeric readout panel (always accessible, provides full fallback) -->
<div
  role="status"
  aria-label="Channel levels readout"
  class="vu-numeric-readout"
>
  <span>Ch 1: 72%</span>
  <span>Ch 2: 45%</span>
  <!-- ... Ch 3–8 ... -->
</div>
```

#### Degradation Path

The fallback ensures usable behavior at every support level:

| Screen reader capability                     | User experience                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Full `role="meter"` support                  | Announced as "Channel 1 level, level meter, 72 percent" — ideal.                                           |
| Partial support (reads attributes, not role) | Announced with value "72 percent" but no role context. `aria-roledescription="level meter"` fills the gap. |
| No role support                              | `aria-label` and `aria-valuetext` still provide "Channel 1 level: 72 percent".                             |
| Screen reader ignores the element entirely   | Numeric readout panel (`role="status"`) provides the same data as plain text.                              |

#### Attribute Details

| Attribute              | Value                        | Notes                                                                           |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `role`                 | `"meter"`                    | WAI-ARIA 1.2 meter role. Forward-compatible.                                    |
| `aria-roledescription` | `"level meter"`              | Fallback for screen readers that don't announce `role="meter"`.                 |
| `aria-label`           | `"Channel N level"`          | Identifies which channel. Format: "Channel 1 level" through "Channel 8 level".  |
| `aria-valuemin`        | `0`                          | Silence.                                                                        |
| `aria-valuemax`        | `100`                        | Maximum output. Maps to S-DSP clipping threshold.                               |
| `aria-valuenow`        | `0`–`100` (integer)          | Current level as a percentage. Updated at ≤ 4 Hz, **not** at 60fps.             |
| `aria-valuetext`       | `"72 percent"` or `"silent"` | Human-readable level. Use `"silent"` when value is 0, `"clipping"` when at 100. |

### Update Throttling

The visual bar animates at 60fps via rAF. The ARIA attributes (`aria-valuenow`, `aria-valuetext`) and the numeric readout update on a separate timer using the shared throttle utility (§12.2) at 250ms intervals. The screen reader value lags the visual by up to 250ms — this is acceptable and intentional.

```typescript
// Pseudocode: throttled ARIA update for VU meter
// Uses the shared createThrottledUpdater from §12.2
const ariaUpdater = createThrottledUpdater(250);

function updateVuMeter(element: HTMLElement, level: number): void {
  // Visual update — every frame
  const bar = element.querySelector('.vu-bar') as HTMLElement;
  bar.style.height = `${level}%`;

  // ARIA + numeric readout — throttled via shared utility
  ariaUpdater(() => {
    const rounded = Math.round(level);
    element.setAttribute('aria-valuenow', String(rounded));
    element.setAttribute(
      'aria-valuetext',
      rounded === 0
        ? 'silent'
        : rounded >= 100
          ? 'clipping'
          : `${rounded} percent`,
    );
    // Update visible numeric readout
    const numeric = element.querySelector('.vu-numeric') as HTMLElement;
    if (numeric) numeric.textContent = String(rounded);
  });
}
```

### Keyboard Interaction

VU meters are **not interactive** — they display information only. They do not receive keyboard focus individually. The group container is focusable only if the user tabs to it; arrow keys do not navigate between individual meters.

| Key  | Behavior                                                                                  |
| ---- | ----------------------------------------------------------------------------------------- |
| Tab  | Focus moves to the VU meter group as a whole, then past it to the next focusable element. |
| None | Meters are read-only. No key activates or modifies them.                                  |

### Reduced Motion

When `prefers-reduced-motion: reduce` is active:

- Disable smooth bar animation. Bars snap to current level instantly (no CSS transitions).
- Optionally switch to a static numeric-only display.

```css
@media (prefers-reduced-motion: reduce) {
  .vu-bar {
    transition: none;
  }
}
```

### Peak/Clipping Announcement

When a channel clips (reaches maximum), announce it once via a polite live region — but **debounce** to avoid repeated announcements. Do not announce again for the same channel until it drops below the clipping threshold and clips again.

```html
<div
  aria-live="polite"
  aria-atomic="true"
  class="visually-hidden"
  id="vu-announcements"
>
  <!-- Dynamically set: "Channel 3 clipping" -->
</div>
```

---

## 7. Virtual Keyboard

### Component Description

A playable piano keyboard. Users trigger notes via:

- Mouse/touch (click/tap keys)
- Computer keyboard (configurable key-to-note mapping)
- MIDI input (Web MIDI API)

The keyboard spans a configurable range (typically 2–4 octaves). Keys display note names. Active notes are visually highlighted.

### ARIA Strategy

Use `role="group"` on the container and individual `<button>` elements for each key. This follows the principle of semantic HTML first — piano keys are activatable elements, so `<button>` is correct.

**Why not `role="application"`?** The application role disables screen reader virtual cursor and keyboard shortcuts entirely within its scope. This is too aggressive — users still need access to screen reader commands. The group of buttons pattern is more appropriate and well-understood.

**Why not `role="grid"`?** A piano keyboard is not tabular data. While a grid could technically model a row of cells, it imposes a navigation model (arrow keys move between cells) that conflicts with the computer-keyboard-to-note mapping (the same arrow keys might be mapped to notes or octave shifting).

```html
<div
  role="group"
  aria-label="Virtual keyboard, 2 octaves from C3 to B4"
  aria-roledescription="piano keyboard"
  class="virtual-keyboard"
>
  <!-- Octave group -->
  <div role="group" aria-label="Octave 3">
    <button
      aria-label="C3"
      aria-pressed="false"
      data-note="C3"
      data-midi="48"
      class="key white"
      tabindex="-1"
    >
      C3
    </button>
    <button
      aria-label="C sharp 3"
      aria-pressed="false"
      data-note="C#3"
      data-midi="49"
      class="key black"
      tabindex="-1"
    >
      C#3
    </button>
    <!-- ... remaining keys ... -->
  </div>
</div>
```

#### Attribute Details

| Attribute              | Value                                         | Notes                                                                                                           |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `role="group"`         | Container                                     | Groups all keys as a single widget.                                                                             |
| `aria-roledescription` | `"piano keyboard"`                            | Custom role description for screen readers. Overrides generic "group" announcement.                             |
| `aria-label`           | `"Virtual keyboard, 2 octaves from C3 to B4"` | Provides range context. Update dynamically when octave range changes.                                           |
| `aria-pressed`         | `"true"` / `"false"`                          | On each `<button>`. Indicates whether the note is currently sounding.                                           |
| `aria-label` (per key) | `"C3"`, `"C sharp 3"`, `"D3"`, etc.           | Note name. Use words for accidentals ("C sharp", "E flat") rather than symbols for screen reader pronunciation. |

### Keyboard Navigation

The virtual keyboard uses **roving tabindex** for internal navigation. Only one key has `tabindex="0"` at a time; all others have `tabindex="-1"`.

| Key           | Behavior                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Tab           | Moves focus into the keyboard (lands on the currently selected key). Next Tab moves focus out of the keyboard entirely. |
| Right Arrow   | Move focus to the next higher semitone (e.g., C3 → C#3 → D3). Wrap: last key → first key.                               |
| Left Arrow    | Move focus to the next lower semitone. Wrap: first key → last key.                                                      |
| Up Arrow      | Move focus up one octave on the same note (e.g., C3 → C4). No-op if already at the highest octave.                      |
| Down Arrow    | Move focus down one octave on the same note (e.g., C4 → C3). No-op if already at the lowest octave.                     |
| Home          | Move focus to the first key (lowest note).                                                                              |
| End           | Move focus to the last key (highest note).                                                                              |
| Enter / Space | Press (trigger) the focused key. Note sounds while held; releases on key-up.                                            |

### Instrument Mode Input

When the virtual keyboard has focus _and_ instrument mode is active, letter keys (e.g., A, S, D, F for C, D, E, F) trigger notes directly. This is a **separate input mode** from the navigation keys above.

**Mode indicator**: When instrument mode is active, announce it:

```html
<div aria-live="polite" class="visually-hidden" id="keyboard-mode-announcement">
  Instrument mode active. Press Escape to exit.
</div>
```

**Conflict resolution with navigation keys:**

- Arrow keys always navigate (never mapped to notes).
- Letter keys trigger notes only when the virtual keyboard has focus.
- Escape exits instrument mode and returns to standard navigation.
- This matches the keyboard shortcut architecture's layered priority: focused widget → global shortcuts.

### Pressed/Active Note Announcements

When a note is triggered (by any input method), update `aria-pressed="true"` on the corresponding button. When released, set `aria-pressed="false"`.

**Do not use `aria-live` for individual note presses.** Rapid key presses would flood the screen reader. The `aria-pressed` state is available when the user navigates to a key, which is sufficient.

For chord announcements (multiple simultaneous notes), provide an optional status region:

```html
<div
  aria-live="polite"
  aria-atomic="true"
  class="visually-hidden"
  id="active-notes"
>
  <!-- Updated at 250ms throttle: "Playing C3, E3, G3" or "No notes playing" -->
</div>
```

**Known limitation:** For rapid arpeggios and fast scales, the 250ms throttle causes the announcement to lag behind the actual notes. This is an inherent trade-off between announcement frequency and screen reader usability.

### MIDI Input Accessibility

When a note is triggered via MIDI (external controller), the same `aria-pressed` update occurs on the corresponding on-screen key. Additionally, announce MIDI connection status:

```html
<div aria-live="polite" class="visually-hidden" id="midi-status">
  <!-- "MIDI device connected: Akai MPK Mini" -->
  <!-- "MIDI device disconnected" -->
</div>
```

MIDI-triggered notes are announced identically to keyboard-triggered notes — the input method is transparent to the accessibility layer.

### Reduced Motion

Piano key press animations (key depression visual) are disabled under `prefers-reduced-motion`. The pressed state is still conveyed via color change (which has no motion).

---

## 8. Waveform / Spectrum Analyzer

### Component Description

Two related visualizations:

1. **Waveform display**: Time-domain PCM waveform rendered on a `<canvas>` at 60fps via `AnalyserNode.getTimeDomainData()`.
2. **Spectrum analyzer**: Frequency-domain bar chart rendered on a `<canvas>` at 60fps via `AnalyserNode.getFrequencyData()`.

### Classification: Decorative vs. Informational

**These visualizations are primarily decorative.** The information they convey (waveform shape, frequency distribution) is:

- Not actionable — the user cannot interact with or modify the display.
- Redundant — the audio itself conveys the same information to users who can hear it.
- Not essential — no feature depends on reading the waveform.

Therefore: mark them as decorative with `role="img"` and a descriptive `aria-label`. Do not attempt to convey the waveform data via ARIA in real time.

### ARIA Strategy

```html
<!-- Waveform display -->
<div role="img" aria-label="Audio waveform visualization">
  <canvas aria-hidden="true" width="800" height="200"></canvas>
</div>

<!-- Spectrum analyzer -->
<div role="img" aria-label="Frequency spectrum visualization">
  <canvas aria-hidden="true" width="800" height="200"></canvas>
</div>
```

#### Attribute Details

| Attribute     | Value                                                                   | Notes                                                                                                     |
| ------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `role`        | `"img"`                                                                 | Marks the container as a single image-like element.                                                       |
| `aria-label`  | `"Audio waveform visualization"` / `"Frequency spectrum visualization"` | Brief description of what the visualization shows.                                                        |
| `aria-hidden` | `"true"` on `<canvas>`                                                  | Canvas content is not accessible to screen readers. The parent `role="img"` provides the accessible name. |

### Non-Visual Alternative

No real-time text alternative is provided for the waveform or spectrum — the audio itself is the content. However, provide a brief textual description that updates when playback starts/stops:

```html
<!-- Optional: summary that updates when playback starts/stops -->
<p class="visually-hidden" aria-live="off" id="viz-description">
  Waveform showing stereo audio output at 48 kHz. Spectrum analyzer showing
  frequency distribution.
</p>
```

This description is static and does not update during playback. It exists for context, not real-time data.

### Keyboard Interaction

Waveform and spectrum visualizations are **not interactive**. They do not receive keyboard focus.

| Key | Behavior                                                            |
| --- | ------------------------------------------------------------------- |
| Tab | Focus skips past the visualization to the next interactive element. |

### Reduced Motion

Under `prefers-reduced-motion: reduce`:

- **Waveform**: freeze the display at the most recent frame. Do not animate.
- **Spectrum**: show a static snapshot updated at ≤ 1 Hz, or hide completely.
- Both canvases should display a static last-frame image rather than animating.

```css
@media (prefers-reduced-motion: reduce) {
  .waveform-canvas,
  .spectrum-canvas {
    /* Implementation: stop rAF loop, show last frame */
  }
}
```

The reduced-motion preference is detected via `window.matchMedia('(prefers-reduced-motion: reduce)')` and controls the rAF loop in JavaScript:

```typescript
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionQuery.matches;
motionQuery.addEventListener('change', (e) => {
  reduceMotion = e.matches;
});

function animationLoop(): void {
  if (!reduceMotion) {
    renderFrame();
    requestAnimationFrame(animationLoop);
  }
  // When reduced motion: renderFrame called once on data change, not continuously
}
```

---

## 9. Channel Mixer

### Component Description

A grid of controls for 8 DSP voices. Each channel row contains:

- Channel label (1–8)
- Mute toggle button
- Solo toggle button
- Volume slider (0–100%)
- Pan knob/slider (−100 to +100, or L100–R100)

This is the closest to a standard control surface among the custom components.

### ARIA Strategy

Use `role="grid"` — the channel mixer is an interactive 2D control surface where arrow key navigation between cells is the expected interaction pattern. Each channel is a row; each control type is a column.

```html
<div role="grid" aria-label="Channel mixer" aria-rowcount="8" aria-colcount="5">
  <!-- Column headers (visually present as labels) -->
  <div role="row" aria-rowindex="1">
    <div role="columnheader">Channel</div>
    <div role="columnheader">Mute</div>
    <div role="columnheader">Solo</div>
    <div role="columnheader">Volume</div>
    <div role="columnheader">Pan</div>
  </div>

  <!-- Channel 1 -->
  <div role="row" aria-rowindex="2" aria-label="Channel 1">
    <div role="rowheader">1</div>

    <div role="gridcell">
      <button aria-label="Mute channel 1" aria-pressed="false" tabindex="-1">
        M
      </button>
    </div>

    <div role="gridcell">
      <button aria-label="Solo channel 1" aria-pressed="false" tabindex="-1">
        S
      </button>
    </div>

    <div role="gridcell">
      <!-- Radix Slider wrapped in gridcell -->
      <div
        role="slider"
        aria-label="Channel 1 volume"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="80"
        aria-valuetext="80 percent"
        tabindex="-1"
      ></div>
    </div>

    <div role="gridcell">
      <div
        role="slider"
        aria-label="Channel 1 pan"
        aria-valuemin="-100"
        aria-valuemax="100"
        aria-valuenow="0"
        aria-valuetext="center"
        tabindex="-1"
      ></div>
    </div>
  </div>

  <!-- Channels 2–8 follow same pattern -->
</div>
```

**Note on Radix integration:** The volume and pan controls use Radix `Slider` primitives internally, but the Radix slider's own `tabindex` management must be overridden to participate in the grid's roving tabindex. The grid owns focus management; individual Radix sliders defer to it via `tabindex="-1"`.

### Keyboard Navigation

The grid uses a standard data grid keyboard pattern per WAI-ARIA APG:

| Key           | Behavior                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Tab           | Focus enters the grid (lands on the previously focused cell, or row 1 / col 1 on first visit). Next Tab exits the grid. |
| Right Arrow   | Move focus to the next cell in the same row. Wrap: last col → first col of next row.                                    |
| Left Arrow    | Move focus to the previous cell. Wrap: first col → last col of previous row.                                            |
| Down Arrow    | Move focus to the same column in the next row. No-op on last row.                                                       |
| Up Arrow      | Move focus to the same column in the previous row. No-op on first row (header).                                         |
| Home          | Move focus to the first cell in the current row.                                                                        |
| End           | Move focus to the last cell in the current row.                                                                         |
| Ctrl + Home   | Move focus to the first cell in the first row.                                                                          |
| Ctrl + End    | Move focus to the last cell in the last row.                                                                            |
| Enter / Space | Activate the focused control (toggle mute/solo, or enter slider edit mode).                                             |

#### Slider Interaction Within Grid

When a slider cell is focused, the user interacts with it directly:

| Key                                | Behavior                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Enter / Space                      | Enter slider edit mode. Announce: "Editing Channel 1 volume. Use Left and Right to adjust. Press Escape to return to grid." |
| Left / Right Arrow (in edit mode)  | Adjust slider value by 1 step.                                                                                              |
| Page Up / Page Down (in edit mode) | Adjust slider value by 10 steps.                                                                                            |
| Home (in edit mode)                | Set slider to minimum.                                                                                                      |
| End (in edit mode)                 | Set slider to maximum.                                                                                                      |
| Escape                             | Exit slider edit mode. Return to grid navigation. Announce: "Returned to grid navigation."                                  |

This two-layer navigation (grid → slider) prevents arrow keys from being ambiguous: in grid mode they navigate cells; in slider edit mode they adjust values. The mode transition is announced via `aria-live` to prevent invisible modal state.

### State Change Announcements

Channel state changes (mute/solo toggled, volume/pan adjusted) are announced via the button/slider's built-in ARIA semantics. No additional `aria-live` region is needed because:

- `aria-pressed` on mute/solo buttons is announced by screen readers when the button is activated.
- Radix `Slider` announces `aria-valuenow` / `aria-valuetext` changes while the slider has focus.

For **global keyboard shortcuts** (pressing `1`–`8` to toggle mute per the music player UX conventions), announce the result via a polite live region:

```html
<div
  aria-live="polite"
  aria-atomic="true"
  class="visually-hidden"
  id="mixer-announcements"
>
  <!-- "Channel 3 muted" / "Channel 3 unmuted" / "Channel 5 soloed" -->
</div>
```

### Pan Value Text

Convert numeric pan values to human-readable text:

| `aria-valuenow` | `aria-valuetext`     |
| --------------- | -------------------- |
| −100            | `"hard left"`        |
| −50             | `"50 percent left"`  |
| 0               | `"center"`           |
| 50              | `"50 percent right"` |
| 100             | `"hard right"`       |

---

## 10. DSP Register Inspector

### Component Description

A table displaying the 128 bytes of S-DSP register space. Each register has an address (hex), a name/description, and a current hex value. Values update in real time during playback as the SPC700 CPU writes to DSP registers.

### ARIA Strategy

Use a standard HTML `<table>` — not `role="grid"`. Rationale:

- The register inspector is **read-only**. Users do not edit cell values.
- A `<table>` is semantically correct for presenting tabular information.
- A `role="grid"` adds unnecessary complexity (focus management, cell-by-cell navigation) for a read-only display.
- Screen readers already provide excellent table navigation with native `<table>` elements (Ctrl+Alt+Arrow keys in NVDA/JAWS).

```html
<table aria-label="DSP registers">
  <caption class="visually-hidden">
    S-DSP register values. Values update during playback.
  </caption>
  <thead>
    <tr>
      <th scope="col">Address</th>
      <th scope="col">Name</th>
      <th scope="col">Value</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>$00</td>
      <td id="reg-name-0">V0 VOL (L)</td>
      <td aria-describedby="reg-name-0">7F</td>
    </tr>
    <!-- ... remaining registers ... -->
  </tbody>
</table>
```

**Note on value cell labeling:** Value cells use `aria-describedby` pointing to the register name cell rather than `aria-label`. This way, screen readers announce the value first ("7F") followed by the description ("V0 VOL (L)") — value-first ordering is more efficient for scanning a table of values.

### Real-Time Update Strategy

**Problem:** 128 register values can change every DSP cycle. Pushing all changes to the DOM at 60fps would overwhelm screen readers and cause excessive reflow.

**Solution:** Implement a **freeze/live toggle** and throttled updates.

#### Freeze/Live Toggle

```html
<div class="register-inspector-controls">
  <button aria-pressed="false" aria-label="Freeze register values">
    Freeze
  </button>
  <span aria-live="polite" class="visually-hidden" id="freeze-status">
    <!-- "Register display frozen" / "Register display live" -->
  </span>
</div>
```

| State          | Visual                                   | ARIA                         | Behavior                            |
| -------------- | ---------------------------------------- | ---------------------------- | ----------------------------------- |
| Live (default) | Values animate at rAF rate               | Table cells update at ≤ 4 Hz | Screen readers see throttled values |
| Frozen         | Values static, dimmed "paused" indicator | No updates                   | Screen readers see stable snapshot  |

#### Throttled DOM Updates

Even in "live" mode, the table cell text content updates at a maximum of 4 Hz (250ms interval). This uses the same shared throttle utility as VU meters (§12.2).

```typescript
// Uses the shared createThrottledUpdater from §12.2
const registerUpdater = createThrottledUpdater(250);

function updateRegisterDisplay(
  cells: HTMLElement[],
  values: Uint8Array,
  frozen: boolean,
): void {
  if (frozen) return;

  registerUpdater(() => {
    // Batch DOM writes
    for (let i = 0; i < 128; i++) {
      const hex = values[i].toString(16).toUpperCase().padStart(2, '0');
      if (cells[i].textContent !== hex) {
        cells[i].textContent = hex;
      }
    }
  });
}
```

**Changed-value highlighting:** Visually highlight registers that changed since the last update, using both color and a text indicator (e.g., bold or an asterisk) to avoid conveying information by color alone.

### Keyboard Interaction

The table uses standard HTML table keyboard semantics — no custom keyboard handling needed.

| Key                            | Behavior                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Tab                            | Focus moves to the freeze/live toggle button. The table itself is not focusable (screen readers navigate it via virtual cursor). |
| Screen reader table navigation | NVDA: Ctrl+Alt+Arrow keys. VoiceOver: same with VO modifier.                                                                     |

### Search/Filter

For large register tables, provide a search/filter input:

```html
<div>
  <label for="register-search">Filter registers</label>
  <input
    id="register-search"
    type="search"
    aria-label="Filter registers by name or address"
    aria-controls="register-table-body"
  />
  <span aria-live="polite" class="visually-hidden" id="filter-results">
    <!-- "Showing 12 of 128 registers" -->
  </span>
</div>
```

---

## 11. Echo Buffer Visualizer & BRR Sample Viewer

### Component Description

- **Echo buffer visualizer**: Displays the S-DSP's echo buffer contents as a waveform or FIR filter visualization. Shows delay time, feedback level, and FIR coefficient visualization. Updates at 60fps during playback.
- **BRR sample viewer**: Displays decoded BRR (Bit Rate Reduced) audio sample data as a waveform. Shows the waveform shape of individual instrument samples.

### Classification

Both are **primarily decorative / supplementary visual displays**. The meaningful data they represent (echo parameters, sample waveforms) is available via other accessible channels:

- Echo parameters → numeric values in the DSP register inspector or a dedicated echo settings panel.
- BRR sample data → the audio itself when previewed, plus numeric metadata (sample length, loop point, etc.).

### ARIA Strategy

Follow the same pattern as the waveform/spectrum analyzer: `role="img"` with descriptive labels.

```html
<!-- Echo buffer visualizer -->
<div
  role="img"
  aria-label="Echo buffer visualization: 240ms delay, 60% feedback"
>
  <canvas aria-hidden="true" width="600" height="150"></canvas>
</div>

<!-- BRR sample viewer -->
<div
  role="img"
  aria-label="BRR sample waveform: instrument 3, 1024 samples, loop at sample 512"
>
  <canvas aria-hidden="true" width="600" height="100"></canvas>
</div>
```

### Non-Visual Alternative: Metadata Panel

Provide a structured text alternative adjacent to (or togglable alongside) each visualization:

#### Echo Buffer

```html
<div role="region" aria-label="Echo buffer parameters">
  <dl>
    <dt>Delay</dt>
    <dd>240 ms</dd>
    <dt>Feedback</dt>
    <dd>60%</dd>
    <dt>FIR coefficients</dt>
    <dd>127, -96, 64, -32, 16, -8, 4, -2</dd>
  </dl>
</div>
```

#### BRR Sample

```html
<div role="region" aria-label="Sample details">
  <dl>
    <dt>Sample name</dt>
    <dd>Instrument 3</dd>
    <dt>Length</dt>
    <dd>1024 samples</dd>
    <dt>Loop point</dt>
    <dd>Sample 512</dd>
    <dt>Encoding</dt>
    <dd>BRR (4-bit ADPCM)</dd>
  </dl>
  <button aria-label="Preview sample: Instrument 3">Preview</button>
</div>
```

### Dynamic Label Updates

The `aria-label` on the `role="img"` container should update when the displayed data changes (e.g., a different sample is selected, or echo parameters change). These updates are infrequent (user-initiated, not real-time) so no throttling is needed.

### Reduced Motion

Under `prefers-reduced-motion: reduce`:

- Echo buffer animation freezes. Show a static FIR coefficient diagram instead of the animated buffer.
- BRR waveform is already a static display and needs no adjustment.

---

## 12. Cross-Cutting Patterns

### 12.1. Direct DOM Updates and ARIA Synchronization

**Problem:** Tier 2 components bypass React's reconciler via refs and `rAF`. If ARIA attributes are managed by React state, they update via the reconciler — but the visual DOM updates happen outside React. This creates two update paths that can conflict.

**Solution:** ARIA attributes on Tier 2 components are also updated via direct DOM manipulation, not React state. This keeps both visual and ARIA updates in the same code path.

```typescript
// ✅ Correct: both visual and ARIA updates happen in the same rAF/timer callback
function onFrame(meter: HTMLElement, level: number): void {
  // Visual — every frame
  meter.style.setProperty('--level', `${level}%`);

  // ARIA — throttled
  if (shouldUpdateAria()) {
    meter.setAttribute('aria-valuenow', String(Math.round(level)));
  }
}

// ❌ Wrong: ARIA via React state, visual via direct DOM
// React re-render and rAF compete, causing flicker or stale reads
```

**React integration pattern:** The React component renders the initial DOM structure with correct ARIA attributes. A `useEffect` with a ref takes over for runtime updates. React never re-renders the ARIA attributes after mount — the rAF loop owns them.

```tsx
function VuMeter({ channel }: { channel: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Subscribe to audio level updates
    const unsubscribe = audioEngine.onLevel(channel, (level) => {
      updateVuMeter(element, level); // Direct DOM: visual + throttled ARIA
    });

    return unsubscribe;
  }, [channel]);

  return (
    <div
      ref={ref}
      role="meter"
      aria-roledescription="level meter"
      aria-label={`Channel ${channel} level`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      aria-valuetext="silent"
    >
      <div className={styles.bar} aria-hidden="true" />
      <span className={styles.numeric} aria-hidden="true">
        0
      </span>
    </div>
  );
}
```

### 12.2. Shared Throttle Utilities

All throttled ARIA updates and announcements use the same underlying utilities with consistent timing. This ensures uniform behavior across VU meters (§6), DSP registers (§10), export progress (§5), and the seek bar (§3).

#### Throttled Updater

For ARIA attribute updates (non-`aria-live`):

```typescript
/**
 * Creates a throttled updater that executes a callback at most
 * once per interval. Uses the trailing-edge pattern: if called
 * during the cooldown, the latest callback is queued and fires
 * after the interval.
 *
 * Default interval: 250ms (4 Hz).
 */
function createThrottledUpdater(
  intervalMs: number = 250,
): (callback: () => void) => void {
  let lastUpdate = 0;
  let pendingCallback: (() => void) | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return (callback: () => void) => {
    const now = performance.now();
    const elapsed = now - lastUpdate;

    if (elapsed >= intervalMs) {
      callback();
      lastUpdate = now;
      pendingCallback = null;
    } else {
      pendingCallback = callback;
      if (!timerId) {
        timerId = setTimeout(() => {
          if (pendingCallback !== null) {
            pendingCallback();
            lastUpdate = performance.now();
            pendingCallback = null;
          }
          timerId = null;
        }, intervalMs - elapsed);
      }
    }
  };
}
```

#### Throttled Announcer

For `aria-live` region updates:

```typescript
/**
 * Creates a throttled announcer that updates an aria-live region
 * at most once per interval. Discards intermediate messages —
 * only the most recent message is announced after the cooldown.
 *
 * Default interval: 250ms (4 Hz).
 */
function createThrottledAnnouncer(
  liveRegion: HTMLElement,
  intervalMs: number = 250,
): (message: string) => void {
  let lastUpdate = 0;
  let pendingMessage: string | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return (message: string) => {
    const now = performance.now();
    const elapsed = now - lastUpdate;

    if (elapsed >= intervalMs) {
      liveRegion.textContent = message;
      lastUpdate = now;
      pendingMessage = null;
    } else {
      pendingMessage = message;
      if (!timerId) {
        timerId = setTimeout(() => {
          if (pendingMessage !== null) {
            liveRegion.textContent = pendingMessage;
            lastUpdate = performance.now();
            pendingMessage = null;
          }
          timerId = null;
        }, intervalMs - elapsed);
      }
    }
  };
}
```

**Usage rules:**

- Both utilities default to 250ms (4 Hz), the application-wide ARIA throttle rate.
- For discrete events (mute toggle, note press): announce immediately, no throttle.
- For clipping/peak events: announce once per occurrence with debounce (do not re-announce while the condition persists).
- For export milestones: announce immediately at each milestone (§5), no throttle — milestones are infrequent by design.

### 12.3. Reduced Motion — Application-Wide Pattern

All components that use `requestAnimationFrame` must check `prefers-reduced-motion` and respond accordingly.

**Detection:**

```typescript
function createMotionPreference(): {
  readonly reduced: boolean;
  subscribe(callback: (reduced: boolean) => void): () => void;
} {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = query.matches;
  const listeners = new Set<(reduced: boolean) => void>();

  query.addEventListener('change', (e) => {
    reduced = e.matches;
    listeners.forEach((cb) => cb(reduced));
  });

  return {
    get reduced() {
      return reduced;
    },
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}
```

**Component behavior matrix:**

| Component         | Normal                        | Reduced Motion                          |
| ----------------- | ----------------------------- | --------------------------------------- |
| VU meters         | Smooth 60fps bar animation    | Snap to level (no transition)           |
| Waveform display  | Continuous waveform rendering | Freeze on last frame                    |
| Spectrum analyzer | Animated frequency bars       | Static snapshot at ≤ 1 Hz               |
| Echo buffer viz   | Animated buffer visualization | Static FIR diagram                      |
| Virtual keyboard  | Key depression animation      | No animation; color-only pressed state  |
| Channel mixer     | Slider thumb animation        | No thumb animation; value still updates |

### 12.4. Focus Management — Custom ↔ Radix Transitions

**Problem:** When the user Tabs from a Radix component (e.g., a Radix `Tabs` panel) into a custom component (e.g., the channel mixer grid), focus must transfer cleanly. The two systems have different focus management:

- Radix uses its own internal focus management with roving tabindex.
- Custom components use manually implemented roving tabindex.

**Rules:**

1. **Tab order is flat.** Each custom widget participates in the page's tab order as a single tab stop (one element with `tabindex="0"`). Radix components also participate as single tab stops. Tab moves between widgets; arrow keys navigate within widgets.

2. **No focus traps outside modals.** Custom components must never trap focus. Pressing Tab on the last focusable element within a custom widget must move focus to the next widget in DOM order (which may be a Radix component).

3. **Focus restoration.** If a Radix dialog opens while a custom component has focus, focus moves to the dialog (Radix handles this). When the dialog closes, Radix restores focus to the trigger element. If the trigger was inside a custom component, the custom component's roving tabindex should maintain its last-focused state so the user returns to the correct position.

4. **Visible focus indicators.** All focusable elements in custom components must have visible focus indicators that match the Radix component focus style. Use a consistent CSS custom property:

```css
:root {
  --focus-ring: 0 0 0 2px var(--color-focus);
}

.key:focus-visible,
.mixer-cell:focus-visible,
.register-freeze-btn:focus-visible {
  box-shadow: var(--focus-ring);
  outline: none;
}
```

5. **Skip links.** Provide "skip to content" and "skip to player controls" skip links at the top of the page for screen reader and keyboard users to bypass large custom components (e.g., the 8-channel mixer grid).

```html
<!-- At the top of the page, before any content -->
<a href="#main-content" class="skip-link">Skip to content</a>
<a href="#player-controls" class="skip-link">Skip to player controls</a>

<!-- Targets -->
<main id="main-content" tabindex="-1">...</main>
<div id="player-controls" tabindex="-1">...</div>
```

```css
.skip-link {
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.skip-link:focus {
  position: fixed;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  padding: 0.5rem 1rem;
  background: var(--color-surface);
  color: var(--color-text);
  z-index: 9999;
  box-shadow: var(--focus-ring);
}
```

### 12.5. High Contrast and Forced Colors

#### `prefers-contrast: more`

When `prefers-contrast: more` is active, override design tokens to meet enhanced contrast requirements. These overrides are defined in the design tokens system and applied here:

- VU meter bars use solid high-contrast colors rather than gradients.
- Channel mixer boundaries use thicker borders (2px minimum).
- Virtual keyboard key boundaries are strongly defined (no subtle shadows).
- All text meets 7:1 contrast ratio (WCAG AAA for enhanced contrast).
- Focus indicators use higher-contrast colors.

```css
@media (prefers-contrast: more) {
  :root {
    /* Override design tokens for enhanced contrast.
       Actual values are sourced from the design tokens document's
       prefers-contrast override table. */
    --color-vu-bar: var(--color-contrast-high);
    --color-border: var(--color-contrast-border);
    --color-focus: var(--color-contrast-focus);
  }

  .vu-bar {
    background: var(--color-vu-bar);
  }
  .key {
    border: 2px solid var(--color-border);
  }
  .mixer-cell {
    border: 2px solid var(--color-border);
  }
}
```

**Note:** The specific token values for `prefers-contrast: more` overrides are defined in the design tokens document. This section specifies _which_ components apply overrides; the tokens document defines _what_ the override values are.

#### Windows High Contrast Mode (Forced Colors)

For users with `forced-colors: active` (Windows High Contrast), defer to system colors:

```css
@media (forced-colors: active) {
  .vu-bar {
    background: Highlight;
  }
  .key {
    border: 1px solid ButtonText;
  }
  .key[aria-pressed='true'] {
    background: Highlight;
    color: HighlightText;
  }
  *:focus-visible {
    outline: 2px solid Highlight;
  }
}
```

---

## 13. Screen Reader Testing Strategy

### Target Screen Readers

| Screen Reader | Platform           | Priority | Notes                                                                    |
| ------------- | ------------------ | -------- | ------------------------------------------------------------------------ |
| VoiceOver     | macOS / iOS Safari | P0       | Primary development platform. Test with Safari (macOS) and Safari (iOS). |
| NVDA          | Windows / Chrome   | P0       | Most popular free screen reader. Test with Chrome.                       |
| JAWS          | Windows / Chrome   | P1       | Most popular commercial screen reader. Verify critical flows.            |
| TalkBack      | Android / Chrome   | P1       | Mobile screen reader. Test touch interaction + TalkBack gestures.        |

### Test Matrix Per Component

| Component              | What to Test                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transport Controls** | Toolbar announced with label. Play/pause label changes with state. Repeat/shuffle `aria-pressed` announced on toggle. Global shortcut announcements fire via live region.                                                                          |
| **Seek Bar**           | Slider announced with label. `aria-valuetext` reads formatted time. Arrow key increments work (5s small, 15s Page Up/Down). Home/End seek to start/end.                                                                                            |
| **Playlist**           | Listbox announced with item count. `aria-current` marks playing track. Selection/multi-select announced. Alt+Arrow reorder announced with new position. Empty state read.                                                                          |
| **Export Progress**    | Progressbar announced with label and value. `aria-valuetext` reads phase + percentage. Milestone announcements fire at 25/50/75/100%. Error/cancel announced. Batch file boundary announced.                                                       |
| **VU Meters**          | `role="meter"` or `aria-roledescription="level meter"` announced. `aria-valuenow`/`aria-valuetext` read on focus. Throttled updates do not cause repeated announcements. Clipping announcement fires once. Numeric readout accessible as fallback. |
| **Virtual Keyboard**   | `aria-roledescription="piano keyboard"` announced. Key labels read correctly ("C sharp 3" not "C#3"). `aria-pressed` state changes announced on activation. Arrow key navigation works. Instrument mode announcement fires.                        |
| **Waveform/Spectrum**  | Announced as image with label. Not focusable. Does not generate continuous announcements.                                                                                                                                                          |
| **Channel Mixer**      | Grid announced with row/column count. Cell-to-cell navigation via arrow keys works. Mute/solo state announced on toggle. Slider values announced during adjustment. Slider edit mode entry/exit announced.                                         |
| **DSP Registers**      | Table announced with correct column headers. Table navigation works (Ctrl+Alt+Arrow in NVDA). `aria-describedby` on value cells reads register name. Freeze toggle announced. Filter result count announced.                                       |
| **Echo/BRR**           | Announced as image with descriptive label. Metadata panel accessible. Preview button announced.                                                                                                                                                    |

### `role="meter"` Testing Protocol

Because `role="meter"` has incomplete screen reader support, test the following degradation matrix:

| Screen Reader | Expected (ideal)                           | Acceptable (degraded)                                    | Unacceptable           |
| ------------- | ------------------------------------------ | -------------------------------------------------------- | ---------------------- |
| VoiceOver     | "Channel 1 level, level meter, 72 percent" | "Channel 1 level, 72 percent" (no role)                  | No announcement at all |
| NVDA          | "Channel 1 level, level meter, 72 percent" | "Channel 1 level, progress bar, 72 percent" (wrong role) | No value announced     |
| JAWS          | "Channel 1 level, level meter, 72 percent" | "Channel 1 level, 72 percent"                            | No announcement at all |

If a screen reader falls into the "unacceptable" column, file a bug and investigate whether additional ARIA attributes (e.g., `aria-roledescription`) resolve the issue.

### Automated Testing

Use `axe-core` (via `@axe-core/react` in development and `axe-playwright` in E2E tests) to catch:

- Missing `aria-label` on custom components
- Color contrast violations
- Focusable elements without accessible names
- Invalid ARIA attribute values
- Required ARIA properties missing from roles (e.g., `role="meter"` without `aria-valuenow`)

#### Known axe-core Exceptions

| Rule ID                          | Element                 | Reason                                                                                              |
| -------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `aria-allowed-role` (if flagged) | VU meter `role="meter"` | ARIA 1.2 role; axe-core may not recognize it in older versions. Verify support with axe-core ≥ 4.6. |

```typescript
// Playwright E2E test pattern
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('channel mixer has no accessibility violations', async ({ page }) => {
  await page.goto('/player');
  await page.getByRole('tab', { name: 'Mixer' }).click();

  const results = await new AxeBuilder({ page })
    .include('.channel-mixer')
    .analyze();

  expect(results.violations).toEqual([]);
});

test('VU meters announce levels correctly', async ({ page }) => {
  await page.goto('/player');
  await page.getByRole('button', { name: 'Play' }).click();

  // Wait for VU meter ARIA to update (250ms throttle)
  await page.waitForTimeout(300);

  const meter = page.getByRole('meter', { name: 'Channel 1 level' });
  await expect(meter).toHaveAttribute('aria-valuenow', /\d+/);
  await expect(meter).toHaveAttribute('aria-roledescription', 'level meter');
});

test('export progress reports milestones', async ({ page }) => {
  await page.goto('/player');
  // Load a file and start export (setup omitted)

  const announcements = page.locator('#export-announcements');
  // Wait for milestone
  await expect(announcements).toContainText(/Export \d+ percent complete/);
});
```

### Manual Testing Checklist

For each component, perform these manual checks with VoiceOver (macOS) and NVDA (Windows):

- [ ] **Discoverability:** Can the user find the component by tabbing or using the screen reader's element list?
- [ ] **Identification:** Is the component announced with a meaningful name and role?
- [ ] **State:** Are toggle states (`aria-pressed`), values (`aria-valuenow`), and modes announced?
- [ ] **Operation:** Can all interactive elements be activated via keyboard?
- [ ] **Navigation:** Do arrow keys work correctly within composite widgets (grid, keyboard, toolbar)?
- [ ] **Escape:** Can the user exit from within a composite widget back to the page tab order?
- [ ] **Live regions:** Are dynamic updates announced at an appropriate frequency (not too fast, not silent)?
- [ ] **Reduced motion:** Does the component respond to `prefers-reduced-motion`?
- [ ] **High contrast:** Does the component remain usable with `prefers-contrast: more`?
- [ ] **Forced colors:** Does the component remain usable with `forced-colors: active` (Windows High Contrast)?

---

## Appendix A: ARIA Role Summary

| Component              | Role                                                 | Rationale                                                                         |
| ---------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Transport controls     | `toolbar`                                            | Groups playback buttons as a single composite widget.                             |
| Play/Pause             | `button` with dynamic `aria-label`                   | Single toggle button; label changes with state.                                   |
| Repeat / Shuffle       | `button` with `aria-pressed`                         | Toggle button with pressed state.                                                 |
| Seek bar               | `slider`                                             | Standard slider for bounded value selection.                                      |
| Playlist               | `listbox`                                            | Selectable list with active descendant management.                                |
| Playlist item          | `option`                                             | Individual selectable item within list.                                           |
| Export progress        | `progressbar`                                        | Bounded progress indicator. Universally supported.                                |
| VU Meter               | `meter` + `aria-roledescription="level meter"`       | Scalar value within known range. ARIA 1.2 with fallback.                          |
| VU Meter group         | `group`                                              | Groups related meters.                                                            |
| Virtual Keyboard       | `group` with `aria-roledescription="piano keyboard"` | Custom widget. Individual keys are `<button>` elements.                           |
| Waveform display       | `img`                                                | Decorative visualization.                                                         |
| Spectrum analyzer      | `img`                                                | Decorative visualization.                                                         |
| Channel Mixer          | `grid`                                               | Interactive 2D control surface with row/column navigation.                        |
| DSP Register Inspector | `<table>` (native)                                   | Read-only tabular data. Native HTML table is more appropriate than `role="grid"`. |
| Echo Buffer Visualizer | `img`                                                | Decorative visualization with text alternative.                                   |
| BRR Sample Viewer      | `img`                                                | Decorative visualization with text alternative.                                   |

## Appendix B: Throttle Intervals

All continuous ARIA updates use the shared throttle utilities from §12.2 at a default 250ms (4 Hz) interval.

| Data Type              | Visual Update Rate           | ARIA Update Rate                                         | Rationale                                                         |
| ---------------------- | ---------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| VU meter levels        | 60fps                        | ≤ 4 Hz (250ms)                                           | Continuous data; screen reader cannot convey 60fps changes.       |
| DSP register values    | 60fps                        | ≤ 4 Hz (250ms)                                           | Same as VU. Freeze mode available for stable reading.             |
| Seek bar position      | 60fps (visual thumb)         | ≤ 4 Hz (250ms) passive; immediate during scrub           | Passive playback throttled; user interaction is immediate.        |
| Export progress        | Per worker message (~20/sec) | ≤ 4 Hz (250ms) for `aria-valuenow`; milestones immediate | Milestones (25/50/75/100%) are infrequent, announced immediately. |
| Note press/release     | Immediate                    | Immediate                                                | Discrete event; user expects instant feedback.                    |
| Mute/solo toggle       | Immediate                    | Immediate                                                | Discrete event.                                                   |
| Slider adjustment      | Immediate (visual)           | As user drags (Radix handles)                            | Radix slider announces during interaction.                        |
| Clipping event         | Immediate (visual)           | Once per occurrence                                      | Debounced to avoid repeated announcements.                        |
| MIDI device connection | N/A                          | Immediate                                                | Infrequent event; announce once on connect/disconnect.            |
| Playlist reorder       | Immediate                    | Immediate                                                | Discrete user action; announce new position.                      |

## Appendix C: Key Mapping Conflict Resolution

Three systems consume keyboard events. Priority order (highest to lowest):

| Priority | System                      | Active When                                                                                                          | Keys                                                            |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1        | Text input focus            | `<input>`, `<textarea>`, `[contenteditable]` focused                                                                 | All keys — suppress app shortcuts                               |
| 2        | Radix overlay active        | Dialog, menu, popover is open                                                                                        | Escape, Enter, Space, Arrow keys, Tab — Radix handles           |
| 3        | Focused interactive element | A `<button>`, `<a>`, checkbox, radio, select, or any element with `role="button"` / `role="checkbox"` etc. has focus | Enter, Space — yield to native activation behavior              |
| 4        | Focused custom widget       | A custom widget (keyboard, mixer grid) has focus and declares keyboard handling                                      | Varies by widget (see per-component tables)                     |
| 5        | Instrument mode             | Virtual keyboard has focus + instrument mode active                                                                  | Letter keys mapped to notes                                     |
| 6        | Contextual scope            | View-specific shortcuts                                                                                              | View-dependent key bindings                                     |
| 7        | Global scope                | No input/widget has focus, or explicitly non-conflicting                                                             | Space (play/pause), 1-8 (mute), M (mute all), Left/Right (seek) |

**Resolution rules:**

- A lower-priority handler must not fire when a higher-priority handler has consumed the event.
- Global shortcuts (Space for play/pause) must not fire when a Radix `<button>` is focused — the button's own Space handling takes precedence (priority 3 > priority 7).
- The note input system must not capture letter keys when a `<input>` or `<textarea>` has focus (priority 1 > priority 5).
- Custom widgets register as "keyboard-active" components so the `ShortcutManager` yields to them for arrow keys, Enter, and Space. This aligns with WAI-ARIA APG composite widget patterns.
- `event.stopPropagation()` is used by higher-priority handlers to prevent bubbling to lower-priority listeners.
