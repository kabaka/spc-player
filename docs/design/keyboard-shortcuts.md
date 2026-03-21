# Keyboard Shortcut Architecture — Design Document

**Status:** Draft (Revised)

> **Revision Notes (from peer review)**
>
> - **C-KBD-1**: Expanded scope hierarchy from 5 to 7 levels to prevent capture-phase listener from intercepting Space/Enter on focused interactive elements (WCAG 2.2 SC 2.1.1). Added "focused interactive element" (level 3) and "focused custom widget" (level 4). Updated scope resolver algorithm in §4.1.
> - **C-KBD-2**: Removed Escape from `playlist.deselectAll`. Reassigned to `Ctrl+Shift+KeyA`. Escape is now consistently reserved for "close/exit/cancel" only.
> - **M-KBD-1**: Replaced deprecated `navigator.platform` with `navigator.userAgentData?.platform` plus fallback (§6.3, §7.5).
> - **M-KBD-2**: Removed `MacCtrl` from §1.2. Added future considerations note for macOS physical Control key.
> - **M-KBD-3**: Fixed `useShortcut` hook to destructure `options` fields as stable primitives in the dependency array (§7.4).
> - **M-KBD-4**: Added Space to instrument mode passthrough list so `playback.playPause` works during performance (§3.3, Appendix C).
> - **R-KBD-1**: Fixed `??` → `||` in isMac detection (§6.3, §7.5) — `=== 'macOS'` returns boolean, so `??` never falls through.
> - **R-KBD-2**: Fixed `useShortcut` hook to forward `preventDefault` and `allowRepeat` options to `manager.register()` (§7.4).
> - Standardized terminology on "instrument mode" throughout (removed "instrument keyboard mode," "note input mode," etc.).
> - Added Escape behavior context table (§2.10).
> - Added notes: `Alt+Digit` macOS special characters (§2.4), `/` for search focus (§2.4), intentional `Digit1`/`Digit4` absence in upper octave (§3.2), browser tab unfocus behavior (§8).

---

## Overview

SPC Player has three distinct keyboard interaction domains that compete for the same physical keys:

1. **Global shortcuts** — playback controls, navigation, and general commands active across all views.
2. **Contextual shortcuts** — view-specific actions active only when a particular view has focus.
3. **Instrument keyboard** — when the Instrument view is active and instrument mode is engaged, typing keys map to musical notes, converting the computer keyboard into a playable instrument.

These domains conflict: pressing Space in instrument mode should play a note, not toggle playback. Pressing Delete in the playlist view should remove a track, but in a text field it should delete a character. Pressing Escape in a Radix dialog should close the dialog, not exit instrument mode.

This document defines the registration system, default keymap, conflict resolution strategy, customization model, and implementation patterns that resolve these conflicts.

---

## 1. Shortcut Registration System

### 1.1 Scope Hierarchy

Shortcuts exist in a priority stack. When a key event fires, the system walks the stack from highest to lowest priority. The first scope that claims the key wins; the event does not propagate further.

```text
Priority (highest → lowest)
─────────────────────────────────
1. Text input focus          ← suppresses all app shortcuts
2. Radix overlay active      ← dialog/menu/select handles its own keys
3. Focused interactive el.   ← button/checkbox/slider handles Space/Enter
4. Focused custom widget     ← custom widget handles arrow/Space/Enter
5. Instrument keyboard       ← when instrument mode is ON
6. Contextual scope          ← active view's shortcuts
7. Global scope              ← always-on app-wide shortcuts
```

**Level 3 — Focused interactive element** (new): When `document.activeElement` is a focusable interactive element (button, link, checkbox, radio, select, or any element with `role="button"`, `role="checkbox"`, etc.), Space and Enter are yielded to the element's native behavior. Only non-interactive focus targets allow global shortcuts to claim Space/Enter. This prevents the capture-phase listener from intercepting activation keys on focused Radix `<button>` elements (WCAG 2.2 SC 2.1.1).

**Level 4 — Focused custom widget** (new): Tier 2 components like the virtual keyboard or channel mixer that declare their own keyboard patterns register as "keyboard-active" via `ShortcutManager.registerWidget(element)`. While a registered widget has focus, it controls its own arrow/Space/Enter behavior. See the accessibility patterns document for the "focused custom widget" semantic model.

Each scope is a named layer:

| Scope                 | Lifecycle                                                    | Example                                                  |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `text-input`          | Implicit — detected via `event.target` element type          | Any `<input>`, `<textarea>`, `[contenteditable]`         |
| `radix-overlay`       | Implicit — detected via Radix's internal focus trap          | Open dialog, dropdown menu, select, popover              |
| `interactive-element` | Implicit — detected via `document.activeElement` tag/role    | Focused `<button>`, `<a>`, `<select>`, `[role="button"]` |
| `custom-widget`       | Explicit — registered via `ShortcutManager.registerWidget()` | Virtual keyboard, channel mixer                          |
| `instrument`          | Explicit — toggled by user action                            | Instrument mode ON                                       |
| `contextual`          | Automatic — tied to the active route/view                    | Playlist view, Analysis view, Mixer view                 |
| `global`              | Always active                                                | Play/pause, volume, navigation                           |

### 1.2 Key Naming Convention

All keys are identified using the [`KeyboardEvent.code`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) property (physical key position), not `event.key` (character produced). This ensures layout-independent behavior — a French AZERTY user pressing the physical "Q" position triggers `KeyQ` regardless of the character it types.

Exception: instrument mode uses `event.code` mapped to note values, so the physical layout determines the piano-like arrangement regardless of the OS keyboard layout.

**Modifier encoding:**

Modifiers are represented as an ordered prefix string: `Ctrl+Shift+Alt+Key`. On macOS, `Ctrl` maps to the Command key (`Meta`) for standard shortcuts. The system normalizes platform differences internally.

> **Future Considerations:** macOS physical Control key binding (`MacCtrl`) may be added in a later version to support advanced use cases requiring both Cmd and Ctrl modifiers. This is out of scope for v1.

```text
Format: [Modifier+]*KeyCode

Examples:
  "Space"              → spacebar, no modifiers
  "Ctrl+KeyS"          → Cmd+S on macOS, Ctrl+S elsewhere
  "Shift+Delete"       → Shift + Delete key
  "Ctrl+Shift+KeyM"    → Cmd+Shift+M on macOS
```

Modifier order is always: `Ctrl` → `Shift` → `Alt` (alphabetical), enforced by the normalizer. Users can press modifiers in any order; the system normalizes before lookup.

### 1.3 Registration API

Shortcuts are registered declaratively via a React hook:

```typescript
useShortcut(actionId: ShortcutActionId, handler: () => void, options?: ShortcutOptions)
```

The hook registers the shortcut on mount and unregisters on unmount. The `actionId` maps to a well-known action from the default keymap; the bound key(s) come from the current keymap (default or user-customized).

```typescript
// Example: register a global shortcut
useShortcut('playback.playPause', () => togglePlayback(), { scope: 'global' });

// Example: register a contextual shortcut for the playlist view
useShortcut('playlist.removeTrack', () => removeSelectedTrack(), {
  scope: 'contextual',
});

// Example: multiple shortcuts for one action (primary + secondary binding)
// Handled automatically — the keymap allows arrays of bindings per action
```

For imperative registration outside React (e.g., in a service), the underlying `ShortcutManager` class exposes:

```typescript
shortcutManager.register(actionId, handler, options);
shortcutManager.unregister(actionId, handler);
```

---

## 2. Default Shortcut Map

### 2.1 Design Rationale

The default keymap follows conventions from established audio players (foobar2000, Winamp, Audacity, Spotify, VLC) with adaptations for SPC Player's unique features (8-voice mixer, instrument performer). Where conventions conflict between players, the most common pattern wins. SPC-specific features (voice mute/solo) use numeric keys, consistent with DAW conventions.

### 2.2 Player Controls

| Action              | Default Binding    | Scope  | Notes                                       |
| ------------------- | ------------------ | ------ | ------------------------------------------- |
| Play / Pause        | `Space`            | global | Single toggle. Most universal convention.   |
| Stop                | `Ctrl+Space`       | global | Distinct from pause (resets position to 0). |
| Next track          | `Ctrl+ArrowRight`  | global | Modifier prevents conflict with seek.       |
| Previous track      | `Ctrl+ArrowLeft`   | global |                                             |
| Seek forward (5s)   | `ArrowRight`       | global |                                             |
| Seek backward (5s)  | `ArrowLeft`        | global |                                             |
| Seek forward (30s)  | `Shift+ArrowRight` | global | Larger seek increment.                      |
| Seek backward (30s) | `Shift+ArrowLeft`  | global |                                             |
| Volume up           | `ArrowUp`          | global |                                             |
| Volume down         | `ArrowDown`        | global |                                             |
| Mute / Unmute       | `KeyM`             | global |                                             |
| Speed increase      | `Shift+ArrowUp`    | global | +0.25× step.                                |
| Speed decrease      | `Shift+ArrowDown`  | global | −0.25× step.                                |
| Speed reset (1×)    | `Shift+Backspace`  | global |                                             |
| Toggle repeat mode  | `KeyR`             | global | Cycles: off → all → one.                    |
| Toggle shuffle      | `KeyS`             | global |                                             |

### 2.3 A-B Loop

| Action             | Default Binding | Scope  | Notes                                                                                                                   |
| ------------------ | --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Set loop start (A) | `BracketLeft`   | global | At current playback position. Shared with instrument velocity (§3.2) — instrument scope (5) takes priority when active. |
| Set loop end (B)   | `BracketRight`  | global | At current playback position. Shared with instrument velocity (§3.2).                                                   |
| Toggle A-B loop    | `KeyL`          | global | Requires both A and B to be set.                                                                                        |
| Clear A-B loop     | `Shift+KeyL`    | global | Clears both loop points.                                                                                                |

### 2.4 Navigation

| Action                  | Default Binding | Scope  | Notes                                      |
| ----------------------- | --------------- | ------ | ------------------------------------------ |
| Go to Player view       | `Alt+Digit1`    | global | View ordering matches tab bar.             |
| Go to Playlist view     | `Alt+Digit2`    | global |                                            |
| Go to Instrument view   | `Alt+Digit3`    | global |                                            |
| Go to Analysis view     | `Alt+Digit4`    | global |                                            |
| Go to Settings view     | `Alt+Digit5`    | global |                                            |
| Focus search / filter   | `Ctrl+KeyF`     | global | Focus the search/filter input if present.  |
| Show keyboard shortcuts | `Shift+Slash`   | global | `?` character — universal help convention. |

> **Note (macOS):** `Alt+Digit1` through `Alt+Digit5` produce special characters on macOS (e.g., `¡`, `™`, `£`, `¢`, `∞`). The shortcut handler calls `event.preventDefault()` to suppress the character insertion, so no stray characters appear. Users who rely on these characters for text input are unaffected because text input focus (priority 1) suppresses all app shortcuts.
>
> **Note (search alternative):** `/` (Slash) is a common "focus search" shortcut in web applications (GitHub, YouTube, Gmail). It is not bound by default to avoid conflict with browser Find (`Ctrl+F`). If user testing reveals demand, `/` could be added as a secondary binding for `navigation.search`. Be aware that binding `/` globally would conflict with the `?` (`Shift+Slash`) shortcut help — the unmodified `/` would need careful scoping.

### 2.5 Playlist Actions

| Action                   | Default Binding        | Scope               | Notes                               |
| ------------------------ | ---------------------- | ------------------- | ----------------------------------- |
| Add files                | `Ctrl+KeyO`            | contextual:playlist | Opens file picker.                  |
| Remove selected track(s) | `Delete` / `Backspace` | contextual:playlist | With confirmation for batch.        |
| Move track up            | `Alt+ArrowUp`          | contextual:playlist | Reorder within playlist.            |
| Move track down          | `Alt+ArrowDown`        | contextual:playlist |                                     |
| Select all               | `Ctrl+KeyA`            | contextual:playlist |                                     |
| Deselect all             | `Ctrl+Shift+KeyA`      | contextual:playlist | Mirrors `Ctrl+KeyA` for select all. |
| Play selected track      | `Enter`                | contextual:playlist | Double-click equivalent.            |

### 2.6 Mixer / Voice Controls

| Action              | Default Binding | Scope  | Notes                           |
| ------------------- | --------------- | ------ | ------------------------------- |
| Toggle voice 1 mute | `Digit1`        | global | Numeric keys for quick toggles. |
| Toggle voice 2 mute | `Digit2`        | global |                                 |
| Toggle voice 3 mute | `Digit3`        | global |                                 |
| Toggle voice 4 mute | `Digit4`        | global |                                 |
| Toggle voice 5 mute | `Digit5`        | global |                                 |
| Toggle voice 6 mute | `Digit6`        | global |                                 |
| Toggle voice 7 mute | `Digit7`        | global |                                 |
| Toggle voice 8 mute | `Digit8`        | global |                                 |
| Solo voice 1        | `Shift+Digit1`  | global | Mute all others, unmute this.   |
| Solo voice 2        | `Shift+Digit2`  | global |                                 |
| Solo voice 3        | `Shift+Digit3`  | global |                                 |
| Solo voice 4        | `Shift+Digit4`  | global |                                 |
| Solo voice 5        | `Shift+Digit5`  | global |                                 |
| Solo voice 6        | `Shift+Digit6`  | global |                                 |
| Solo voice 7        | `Shift+Digit7`  | global |                                 |
| Solo voice 8        | `Shift+Digit8`  | global |                                 |
| Unmute all voices   | `Digit0`        | global | Reset to all-voices-playing.    |

### 2.7 Analysis / Inspector

| Action                     | Default Binding | Scope               | Notes                         |
| -------------------------- | --------------- | ------------------- | ----------------------------- |
| Memory tab                 | `Alt+KeyM`      | contextual:analysis | Sub-tab within Analysis view. |
| Registers tab              | `Alt+KeyR`      | contextual:analysis |                               |
| Voices tab                 | `Alt+KeyV`      | contextual:analysis |                               |
| Echo tab                   | `Alt+KeyE`      | contextual:analysis |                               |
| Toggle hex/decimal display | `KeyH`          | contextual:analysis |                               |

### 2.8 Export

| Action                     | Default Binding   | Scope  | Notes                                 |
| -------------------------- | ----------------- | ------ | ------------------------------------- |
| Open export dialog         | `Ctrl+KeyE`       | global |                                       |
| Quick export (last format) | `Ctrl+Shift+KeyE` | global | Uses the most recent export settings. |

### 2.9 General

| Action                 | Default Binding   | Scope  | Notes                                                                                               |
| ---------------------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Open file(s)           | `Ctrl+KeyO`       | global | File picker for SPC files. Note: in playlist view, this is handled by the contextual scope version. |
| Undo                   | `Ctrl+KeyZ`       | global | Playlist operations, setting changes.                                                               |
| Redo                   | `Ctrl+Shift+KeyZ` | global |                                                                                                     |
| Toggle fullscreen      | `KeyF`            | global | Fullscreen API where supported.                                                                     |
| Close dialog / cancel  | `Escape`          | global | Delegates to Radix when overlay is active.                                                          |
| Toggle instrument mode | `Backquote`       | global | `` ` `` key — top-left corner, easy to reach.                                                       |

### 2.10a Instrument View Actions

| Action          | Default Binding | Scope                 | Notes                                                                |
| --------------- | --------------- | --------------------- | -------------------------------------------------------------------- |
| Toggle keyboard | `Backquote`     | contextual:instrument | Same key as global toggle; contextual scope wins in Instrument view. |

### 2.10 Reserved Keys (Never Remappable)

These bindings are hardcoded and cannot be overridden by user customization or instrument mode:

| Key                                     | Action                               | Reason                    |
| --------------------------------------- | ------------------------------------ | ------------------------- |
| `Escape`                                | Close overlay / exit instrument mode | Universal escape hatch    |
| `Tab` / `Shift+Tab`                     | Focus navigation                     | Accessibility requirement |
| `Ctrl+KeyC` / `Ctrl+KeyV` / `Ctrl+KeyX` | Clipboard                            | System convention         |
| `F5`                                    | Refresh                              | Browser convention        |
| `F11`                                   | Browser fullscreen                   | Browser convention        |
| `F12`                                   | DevTools                             | Browser convention        |

**Escape behavior by context:**

Escape is reserved across all scopes. Its behavior varies by the active context, resolved in priority order:

| Context                   | Escape behavior                      | Priority          |
| ------------------------- | ------------------------------------ | ----------------- |
| Radix dialog/menu open    | Close dialog/menu                    | 2 (overlay)       |
| Custom widget focused     | Exit widget / return focus to parent | 4 (custom widget) |
| Instrument mode active    | Exit instrument mode                 | 5 (instrument)    |
| Global (no other context) | General cancel/close                 | 7 (global)        |

The highest-priority context that is active determines the Escape behavior. For example, if a Radix dialog is open while instrument mode is active, Escape closes the dialog (priority 2). Once the dialog is dismissed, the next Escape exits instrument mode (priority 5).

---

## 3. Instrument Keyboard Mode

### 3.1 Activation and Deactivation

Instrument mode converts the computer keyboard into a musical instrument, mapping typing keys to SPC instrument notes.

| Action              | Trigger                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Activate**        | Press `` ` `` (Backquote) — global toggle. Also available via an "Enable Keyboard" toggle button in the Instrument view UI.                                                           |
| **Deactivate**      | Press `` ` `` again, press `Escape`, click the toggle button, or navigate away from the Instrument view.                                                                              |
| **Auto-deactivate** | Navigating to any view other than Instrument automatically disables instrument mode. Opening a Radix overlay (dialog, menu) temporarily suspends it; closing the overlay restores it. |
| **Auto-activate**   | Optionally (user setting), navigating to the Instrument view auto-enables instrument mode. Default: off.                                                                              |

### 3.2 Note Mapping

The mapping follows the standard DAW convention used by FL Studio, Ableton Live, and LMMS — two rows of keys form a piano-like layout spanning two octaves:

**Lower octave (bottom row):**

```
Key:  Z  S  X  D  C  V  G  B  H  N  J  M
Note: C  C# D  D# E  F  F# G  G# A  A# B
Code: KeyZ KeyS KeyX KeyD KeyC KeyV KeyG KeyB KeyH KeyN KeyJ KeyM
```

**Upper octave (top row):**

```
Key:  Q  2  W  3  E  R  5  T  6  Y  7  U  I
Note: C  C# D  D# E  F  F# G  G# A  A# B  C(+1)
Code: KeyQ Digit2 KeyW Digit3 KeyE KeyR Digit5 KeyT Digit6 KeyY Digit7 KeyU KeyI
```

> **Note:** `Digit1` and `Digit4` are intentionally absent from the upper octave mapping. This mirrors a real piano keyboard — there is no black key between E and F, or between B and C. These digit keys are not unmapped by accident. Do not "fix" this by adding them; doing so would break the chromatic layout.

**Octave and velocity controls:**

| Key                  | Action                                 |
| -------------------- | -------------------------------------- |
| `Minus` (`-`)        | Shift octave down (minimum: octave 1)  |
| `Equal` (`=`)        | Shift octave up (maximum: octave 7)    |
| `BracketLeft` (`[`)  | Decrease velocity by 16 (minimum: 1)   |
| `BracketRight` (`]`) | Increase velocity by 16 (maximum: 127) |

The base octave defaults to 4 (middle C = C4). The velocity defaults to 100.

### 3.3 Behavior When Active

When instrument mode is active:

- **Claimed keys** (note keys, octave/velocity keys) produce notes. They do NOT pass through to global or contextual shortcuts.
- **Unclaimed keys** fall through to the next scope. Arrow keys still control volume/seek. `Ctrl+` shortcuts still work.
- **Space** is not mapped to a note and falls through to the global scope, triggering `playback.playPause`. Toggling playback during performance is essential, and Space is physically distant from the note keys, posing no risk of accidental activation.
- **Escape** always exits instrument mode (reserved key).
- **Modifier combos** (Ctrl+, Alt+, Cmd+) bypass instrument mode entirely and fall through to global/contextual scopes. This means `Ctrl+KeyS` still triggers "save" even in instrument mode.
- **Key-down** triggers note-on. **Key-up** triggers note-off. Key repeat events (held key) are suppressed — only the first keydown matters.

The passthrough list (keys that fall through even in instrument mode):

- Arrow keys (Up, Down, Left, Right) — volume and seek
- `Space` — playback toggle
- `Escape` — exit instrument mode (reserved)
- `Tab` / `Shift+Tab` — focus navigation (reserved)

### 3.4 Visual Indicator

When instrument mode is active:

1. **Status badge** — a persistent indicator in the top bar or player area shows "🎹 Keyboard" (or an equivalent icon + label). Uses `aria-live="polite"` for screen reader announcement.
2. **Key hints** — the virtual keyboard UI highlights keys that correspond to the currently pressed computer keys. The on-screen piano keys show their keyboard letter mappings (e.g., "Z" on the C key, "S" on C#).
3. **View border** — a subtle accent-colored border or background tint on the Instrument view signals the mode is engaged. Respects `prefers-reduced-motion` (no animation, static color only).
4. **Transport controls** — playback transport buttons remain visually accessible and clickable. Space continues to toggle playback even in instrument mode.

### 3.5 Interaction with Playback

Instrument mode and playback are independent:

- A track can be playing while instrument mode is active. The user plays notes from the selected instrument _on top of_ the playing track mix.
- If no track is loaded, the instrument still produces sound using the selected instrument sample.
- Transport controls remain available via mouse/touch, via Space (passthrough), and via modifier shortcuts (`Ctrl+Space` for stop, etc.).

---

## 4. Conflict Resolution

### 4.1 Scope Priority Algorithm

When a `keydown` event reaches the `ShortcutManager`, the following resolution runs:

```
function resolveKeyEvent(event: KeyboardEvent): void {
  const combo = normalizeCombo(event)

  // 1. Text input — suppress everything
  if (isTextInputFocused(event.target)) {
    // Allow Escape (to blur), and Tab (to move focus)
    if (combo !== 'Escape' && combo !== 'Tab') return
  }

  // 2. Radix overlay — let Radix handle it
  if (isRadixOverlayActive()) {
    // Radix manages its own keyboard behavior (Escape, arrows, typeahead)
    // Only intercept if combo is a reserved-global (Ctrl+O, etc.) with no Radix meaning
    if (!isReservedGlobal(combo)) return
  }

  // 3. Focused interactive element — yield Space/Enter to native behavior
  if (isFocusedInteractiveElement()) {
    if (combo === 'Space' || combo === 'Enter') return
    // Other keys (letters, arrows, etc.) are NOT yielded — only activation keys
  }

  // 4. Focused custom widget — let widget handle its own keys
  if (isFocusedCustomWidget()) {
    // Registered widgets control arrow/Space/Enter behavior
    if (isWidgetClaimedKey(combo)) return
  }

  // 5. Instrument mode
  if (isInstrumentModeActive()) {
    // Modifier combos bypass instrument mode
    if (hasNonShiftModifier(combo)) {
      // Fall through to contextual → global
    } else if (instrumentKeymap.has(combo)) {
      instrumentKeymap.get(combo)!.handler(event)
      event.preventDefault()
      return
    }
    // Unrecognized keys in instrument mode: suppress to prevent accidental triggers
    // Exception: arrow keys, Space, Escape, Tab fall through
    if (!isPassthroughKey(combo)) {
      event.preventDefault()
      return
    }
  }

  // 6. Contextual scope (active view)
  const contextualAction = contextualKeymap.get(combo)
  if (contextualAction) {
    contextualAction.handler(event)
    event.preventDefault()
    return
  }

  // 7. Global scope
  const globalAction = globalKeymap.get(combo)
  if (globalAction) {
    globalAction.handler(event)
    event.preventDefault()
    return
  }
}
```

**Helper: focused interactive element check (level 3)**

```typescript
function isFocusedInteractiveElement(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body) return false;

  // Native interactive elements
  const tag = el.tagName;
  if (['BUTTON', 'A', 'SELECT'].includes(tag)) return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    // Non-text inputs: checkbox, radio, range, etc.
    return ['checkbox', 'radio', 'range', 'color', 'file'].includes(type);
  }

  // ARIA interactive roles
  const role = el.getAttribute('role');
  if (
    role &&
    [
      'button',
      'checkbox',
      'radio',
      'switch',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'option',
      'tab',
      'link',
    ].includes(role)
  ) {
    return true;
  }

  return false;
}
```

**Helper: focused custom widget check (level 4)**

```typescript
function isFocusedCustomWidget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  // Walk up from activeElement to see if it's inside a registered widget
  return registeredWidgets.some((widget) => widget.contains(el));
}
```

### 4.2 Text Input Suppression

The system detects text input focus by checking:

```typescript
function isTextInputFocused(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    // Only text-like inputs suppress shortcuts
    return [
      'text',
      'search',
      'url',
      'email',
      'password',
      'number',
      'tel',
    ].includes(type);
  }
  if (tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}
```

Non-text inputs (checkboxes, radio buttons, range sliders) do NOT suppress shortcuts. This is important because Radix Toggle and Switch render as buttons, not text inputs.

**Escape key in text fields**: Escape always blurs the text input and returns focus to the main application, re-enabling shortcuts.

### 4.3 Radix Overlay Interaction

Radix UI components (Dialog, DropdownMenu, ContextMenu, Select, AlertDialog) manage their own keyboard behavior:

- **Dialog**: Escape closes, Tab cycles focus within the dialog. Focus is trapped.
- **DropdownMenu / ContextMenu**: Arrow keys navigate items, Escape closes, Enter/Space activates, typeahead by letter key.
- **Select**: Arrow keys navigate options, Enter selects, Escape closes.
- **Popover**: Escape closes, focus is managed.

**Integration strategy**: The `ShortcutManager` does not register a single top-level `keydown` listener that could interfere with Radix. Instead:

- The `ShortcutManager` attaches its listener at the `document` level during the **capture** phase (`{ capture: true }`).
- When a Radix overlay is detected as active (via a React context flag set by a thin wrapper around Radix overlay components), the manager yields to Radix for non-reserved keys.
- Reserved globals (`Ctrl+O` to open file, `Ctrl+E` for export) still fire even with overlays open, because these are application-level commands that should be available regardless of UI state.
- The overlay detection uses a ref-counted context: multiple nested overlays (e.g., a confirm dialog inside a menu) correctly track when all overlays are closed.

```typescript
// Thin wrapper providing overlay detection
export function ShortcutOverlayBoundary({ children }: { children: React.ReactNode }) {
  const { incrementOverlay, decrementOverlay } = useShortcutContext()

  useEffect(() => {
    incrementOverlay()
    return () => decrementOverlay()
  }, [])

  return <>{children}</>
}

// Used inside Radix Dialog, Menu, etc. wrappers:
// <Dialog.Content>
//   <ShortcutOverlayBoundary>
//     {content}
//   </ShortcutOverlayBoundary>
// </Dialog.Content>
```

### 4.4 Same-Key Conflicts Between Scopes

When two scopes bind the same key, the higher-priority scope wins. The lower-priority binding is not lost — it resumes when the higher scope is deactivated (e.g., exiting instrument mode re-enables the global binding for that key).

When two bindings exist within the _same_ scope (e.g., a user accidentally binds two global actions to the same key), the customization validator prevents this at configuration time (see §5.3).

### 4.5 Key Event Semantics

| Event            | Usage                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `keydown`        | All shortcut activation. Instrument note-on.                                                                       |
| `keyup`          | Instrument note-off only. Not used for other shortcuts.                                                            |
| `keydown` repeat | Suppressed for instrument mode (no re-triggering). Allowed for seek/volume (holding arrow key seeks continuously). |

`event.preventDefault()` is called for all handled shortcuts to suppress browser defaults (e.g., Space scrolling the page, Backquote inserting a character in some contexts).

---

## 5. Customization

### 5.1 Data Model

The keymap is stored as a record of action IDs to key bindings:

```typescript
type KeyBinding = {
  primary: KeyCombo; // Main binding
  secondary?: KeyCombo; // Optional alternate binding
};

type CustomKeymap = Partial<Record<ShortcutActionId, KeyBinding>>;
```

The settings store (Zustand, per ADR-0005) holds:

```typescript
// In the settings slice
keymap: {
  custom: CustomKeymap; // User overrides (sparse — only changed bindings)
  instrumentOctave: number; // Persisted last octave
  instrumentVelocity: number; // Persisted last velocity
  autoEnableInstrumentMode: boolean; // Auto-enable when navigating to Instrument view
}
```

The _effective keymap_ is computed by merging defaults with user overrides:

```typescript
function getEffectiveKeymap(): FullKeymap {
  return { ...DEFAULT_KEYMAP, ...customKeymap };
}
```

Only user-modified bindings are stored. This keeps the persisted blob small and allows default bindings to evolve across app versions without overwriting user customizations for actions they haven't touched.

### 5.2 Persistence

Per ADR-0005, the settings slice is persisted to IndexedDB via Zustand's `persist` middleware. Keyboard customizations are part of the settings slice and survive browser restarts.

The persisted structure:

```
IndexedDB → spc-player-settings → keymap.custom
```

### 5.3 Validation Rules

When a user modifies a binding:

1. **Conflict detection** — before accepting a new binding, check if the combo is already bound to another action in the same scope. If so, show a warning: "This key is already assigned to [Action Name]. Reassign it?" Confirming unbinds the conflicting action.
2. **Cross-scope awareness** — warn (but allow) if the new binding shadows a binding in a lower-priority scope. Example: binding a contextual shortcut to `Space` shadows the global play/pause binding in that view.
3. **Reserved key protection** — reserved keys (Escape, Tab, clipboard shortcuts) cannot be bound to any action. The UI disables them as targets.
4. **Minimum binding** — the following actions must always have at least one binding and cannot be fully unbound:
   - `playback.playPause`
   - `navigation.showShortcuts`
   - `general.toggleInstrumentMode`
5. **Modifier validation** — standalone modifier keys (Shift, Ctrl, Alt alone) are not valid bindings.

### 5.4 Reset to Defaults

Two reset options:

- **Reset single action**: restores the default binding for one action, removing the user override.
- **Reset all**: clears the entire `custom` keymap, reverting everything to defaults. Requires confirmation (Radix AlertDialog).

### 5.5 Customization UI

The settings view includes a "Keyboard Shortcuts" section:

```
┌────────────────────────────────────────────────────────┐
│ Keyboard Shortcuts                        [Reset All]  │
├─────────────┬──────────────────────────────────────────┤
│ Filter: [___________]  Category: [All ▾]               │
├─────────────┬──────────────┬───────────────┬───────────┤
│ Action      │ Primary      │ Secondary     │           │
├─────────────┼──────────────┼───────────────┼───────────┤
│ Play/Pause  │ [Space     ] │ [  —  ][+]    │ [↺]       │
│ Stop        │ [⌘ Space   ] │ [  —  ][+]    │ [↺]       │
│ Next Track  │ [⌘ →       ] │ [  —  ][+]    │ [↺]       │
│ ...         │              │               │           │
├─────────────┼──────────────┼───────────────┼───────────┤
│ ⚠ Conflict: "Space" is also bound to Play/Pause       │
│   [Reassign] [Cancel]                                  │
└────────────────────────────────────────────────────────┘
```

- Each binding cell is a button. Clicking it enters "recording mode" — the cell shows "Press a key…" and the next keypress (with optional modifiers) becomes the new binding.
- The `[↺]` button resets that single action to its default.
- The `[+]` button adds a secondary binding.
- Filter and category dropdowns narrow the list for discoverability.
- Changes apply immediately (no Save button). The sparse override model means only modified bindings are persisted.

---

## 6. Discoverability

### 6.1 Keyboard Shortcut Help Panel

Pressing `?` (`Shift+Slash`) opens a modal overlay listing all active shortcuts. The panel is a Radix Dialog:

```
┌─────────────────────────────────────────────────────────────┐
│  Keyboard Shortcuts                                    [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PLAYBACK                         NAVIGATION                │
│  ┄┄┄┄┄┄┄┄┄                        ┄┄┄┄┄┄┄┄┄┄               │
│  Space        Play / Pause         Alt+1     Player          │
│  ⌘+Space      Stop                 Alt+2     Playlist        │
│  ⌘+→          Next track           Alt+3     Instrument      │
│  ⌘+←          Previous track       Alt+4     Analysis        │
│  → / ←        Seek ±5s             Alt+5     Settings        │
│  ↑ / ↓        Volume               ⌘+F       Search          │
│  M            Mute                                           │
│                                                             │
│  MIXER                            INSTRUMENT                 │
│  ┄┄┄┄┄                            ┄┄┄┄┄┄┄┄┄┄                │
│  1–8          Toggle voice mute    `         Toggle mode     │
│  Shift+1–8    Solo voice           Z–M       Lower octave    │
│  0            Unmute all           Q–U       Upper octave    │
│                                   - / =      Octave ±        │
│  GENERAL                          [ / ]      Velocity ±      │
│  ┄┄┄┄┄┄┄                                                    │
│  ⌘+O          Open file           A-B LOOP                  │
│  ⌘+E          Export               ┄┄┄┄┄┄┄┄                 │
│  ⌘+Z          Undo                [          Set loop start  │
│  ?            This help            ]          Set loop end   │
│  Esc          Close / Exit mode    L          Toggle loop    │
│                                   Shift+L    Clear loop     │
│                                                             │
│         Press Escape to close. Edit in Settings.             │
└─────────────────────────────────────────────────────────────┘
```

The panel:

- Groups shortcuts by category with clear section headers.
- Shows the _effective_ binding (user-customized if modified, default otherwise).
- Displays platform-appropriate symbols (`⌘` on macOS, `Ctrl` on Windows/Linux).
- Includes a link to the full customization UI in Settings.
- Is searchable (filter field at the top for large keymaps).

### 6.2 Shortcut Hints in Tooltips

Every button and menu item that has a keyboard shortcut shows the shortcut in its Radix Tooltip:

```
┌──────────────┐
│  Play/Pause  │
│    Space     │  ← shortcut hint, dimmed text
└──────────────┘
```

Implementation: a `ShortcutHint` component reads the effective binding for a given action ID and renders the platform-formatted key combo. This is composed into Radix Tooltip content:

```tsx
<Tooltip.Content>
  <span>Play/Pause</span>
  <ShortcutHint actionId="playback.playPause" />
</Tooltip.Content>
```

### 6.3 Platform-Aware Display

Key combos are displayed using platform-native conventions:

| Key               | macOS   | Windows/Linux |
| ----------------- | ------- | ------------- |
| `Ctrl+` (logical) | `⌘`     | `Ctrl+`       |
| `Alt+`            | `⌥`     | `Alt+`        |
| `Shift+`          | `⇧`     | `Shift+`      |
| `ArrowUp`         | `↑`     | `↑`           |
| `ArrowDown`       | `↓`     | `↓`           |
| `ArrowLeft`       | `←`     | `←`           |
| `ArrowRight`      | `→`     | `→`           |
| `Space`           | `Space` | `Space`       |
| `Backspace`       | `⌫`     | `Backspace`   |
| `Delete`          | `⌦`     | `Delete`      |
| `Escape`          | `Esc`   | `Esc`         |
| `Enter`           | `↵`     | `Enter`       |

Platform detection:

```typescript
const isMac =
  navigator.userAgentData?.platform === 'macOS' ||
  /Mac|iPhone|iPad/.test(navigator.platform);
```

On macOS, the logical `Ctrl` modifier renders as `⌘` because the system normalizes `Meta` → `Ctrl` internally.

### 6.4 Context-Sensitive Hints

When a view-specific shortcut is available, the view may display an inline hint. Example: the playlist view's empty state could show "Press ⌘O to add files". The instrument view header shows "Press ` to enable keyboard" when instrument mode is off.

---

## 7. Implementation Pattern

### 7.1 TypeScript Types

```typescript
// ── Key Combo Types ──

/** Physical key code (KeyboardEvent.code values) */
type PhysicalKey =
  | 'KeyA'
  | 'KeyB'
  | 'KeyC'
  | 'KeyD'
  | 'KeyE'
  | 'KeyF'
  | 'KeyG'
  | 'KeyH'
  | 'KeyI'
  | 'KeyJ'
  | 'KeyK'
  | 'KeyL'
  | 'KeyM'
  | 'KeyN'
  | 'KeyO'
  | 'KeyP'
  | 'KeyQ'
  | 'KeyR'
  | 'KeyS'
  | 'KeyT'
  | 'KeyU'
  | 'KeyV'
  | 'KeyW'
  | 'KeyX'
  | 'KeyY'
  | 'KeyZ'
  | 'Digit0'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Digit4'
  | 'Digit5'
  | 'Digit6'
  | 'Digit7'
  | 'Digit8'
  | 'Digit9'
  | 'Space'
  | 'Enter'
  | 'Escape'
  | 'Backspace'
  | 'Delete'
  | 'Tab'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Minus'
  | 'Equal'
  | 'BracketLeft'
  | 'BracketRight'
  | 'Backquote'
  | 'Slash'
  | 'Period'
  | 'Comma'
  | 'Semicolon'
  | 'Quote'
  | 'Backslash'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown';

/** Modifier flags */
type Modifiers = {
  ctrl: boolean; // Cmd on macOS, Ctrl elsewhere
  shift: boolean;
  alt: boolean; // Option on macOS
};

/** Normalized key combination string: "Ctrl+Shift+KeyA" */
type KeyCombo = string & { readonly __brand: unique symbol };

// ── Scope Types ──

type ShortcutScope = 'global' | 'contextual' | 'instrument';

type ContextualScopeId =
  | 'playlist'
  | 'analysis'
  | 'instrument-view'
  | 'mixer'
  | 'settings';

// ── Action ID Types ──

type PlaybackAction =
  | 'playback.playPause'
  | 'playback.stop'
  | 'playback.nextTrack'
  | 'playback.previousTrack'
  | 'playback.seekForward'
  | 'playback.seekBackward'
  | 'playback.seekForwardLong'
  | 'playback.seekBackwardLong'
  | 'playback.volumeUp'
  | 'playback.volumeDown'
  | 'playback.mute'
  | 'playback.speedUp'
  | 'playback.speedDown'
  | 'playback.speedReset'
  | 'playback.toggleRepeat'
  | 'playback.toggleShuffle';

type NavigationAction =
  | 'navigation.player'
  | 'navigation.playlist'
  | 'navigation.instrument'
  | 'navigation.analysis'
  | 'navigation.settings'
  | 'navigation.search'
  | 'navigation.showShortcuts';

type PlaylistAction =
  | 'playlist.addFiles'
  | 'playlist.removeTrack'
  | 'playlist.moveUp'
  | 'playlist.moveDown'
  | 'playlist.selectAll'
  | 'playlist.deselectAll'
  | 'playlist.playSelected';

type MixerAction =
  | 'mixer.toggleVoice1'
  | 'mixer.toggleVoice2'
  | 'mixer.toggleVoice3'
  | 'mixer.toggleVoice4'
  | 'mixer.toggleVoice5'
  | 'mixer.toggleVoice6'
  | 'mixer.toggleVoice7'
  | 'mixer.toggleVoice8'
  | 'mixer.soloVoice1'
  | 'mixer.soloVoice2'
  | 'mixer.soloVoice3'
  | 'mixer.soloVoice4'
  | 'mixer.soloVoice5'
  | 'mixer.soloVoice6'
  | 'mixer.soloVoice7'
  | 'mixer.soloVoice8'
  | 'mixer.unmuteAll';

type AnalysisAction =
  | 'analysis.memoryTab'
  | 'analysis.registersTab'
  | 'analysis.voicesTab'
  | 'analysis.echoTab'
  | 'analysis.toggleHexDecimal';

type ExportAction = 'export.open' | 'export.quick';

type GeneralAction =
  | 'general.openFile'
  | 'general.undo'
  | 'general.redo'
  | 'general.fullscreen'
  | 'general.close'
  | 'general.toggleInstrumentMode';

type ABLoopAction =
  | 'abLoop.setStart'
  | 'abLoop.setEnd'
  | 'abLoop.toggle'
  | 'abLoop.clear';

type ShortcutActionId =
  | PlaybackAction
  | NavigationAction
  | PlaylistAction
  | MixerAction
  | AnalysisAction
  | ExportAction
  | GeneralAction
  | ABLoopAction;

// ── Keymap Types ──

type KeyBinding = {
  primary: KeyCombo;
  secondary?: KeyCombo;
};

type ShortcutDefinition = {
  id: ShortcutActionId;
  label: string; // Human-readable: "Play / Pause"
  category: ShortcutCategory;
  scope: ShortcutScope;
  contextualScope?: ContextualScopeId;
  defaultBinding: KeyBinding;
  reserved: boolean; // If true, cannot be rebound
};

type ShortcutCategory =
  | 'Playback'
  | 'Navigation'
  | 'Playlist'
  | 'Mixer'
  | 'Analysis'
  | 'Export'
  | 'General'
  | 'A-B Loop'
  | 'Instrument';

type CustomKeymap = Partial<Record<ShortcutActionId, KeyBinding>>;

type FullKeymap = Record<ShortcutActionId, KeyBinding>;

// ── Hook Types ──

type ShortcutOptions = {
  scope?: ShortcutScope;
  contextualScope?: ContextualScopeId;
  enabled?: boolean; // Dynamic enable/disable
  preventDefault?: boolean; // Default: true
  allowRepeat?: boolean; // Allow key repeat events. Default: false
};

// ── Instrument Types ──

type NoteValue = number; // MIDI note number (0–127)

type InstrumentKeyMapping = {
  code: PhysicalKey;
  note: NoteValue;
  octaveRelative: number; // 0 = base octave, 1 = base + 1
};

type InstrumentKeyboardState = {
  enabled: boolean;
  baseOctave: number; // 1–7, default 4
  velocity: number; // 1–127, default 100
  activeNotes: Set<NoteValue>;
};
```

### 7.2 Architecture Diagram

```
                    ┌──────────────────┐
                    │   KeyboardEvent  │
                    │   (document,     │
                    │    capture phase)│
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  ShortcutManager │
                    │                  │
                    │  ┌─────────────┐ │
                    │  │  Normalize   │ │   event.code + modifiers
                    │  │  KeyCombo    │ │   → "Ctrl+Shift+KeyM"
                    │  └──────┬──────┘ │
                    │         │        │
                    │  ┌──────▼──────┐ │
                    │  │  Scope      │ │   1. Text input?
                    │  │  Resolver   │ │   2. Radix overlay?
                    │  │  (7 levels) │ │   3. Interactive el?
                    │  └──────┬──────┘ │   4. Custom widget?
                    │         │        │   5. Instrument mode?
                    │  ┌──────▼──────┐ │
                    │  │  Keymap     │ │   defaults merged w/ user overrides
                    │  │  Lookup     │ │
                    │  └──────┬──────┘ │
                    │         │        │
                    │  ┌──────▼──────┐ │
                    │  │  Dispatch   │ │   call registered handler
                    │  │  Handler    │ │   event.preventDefault()
                    │  └─────────────┘ │
                    └──────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼────┐  ┌─────▼──────┐  ┌────▼──────────┐
    │  Global      │  │ Contextual │  │  Instrument   │
    │  Handlers    │  │ Handlers   │  │  Key Handler  │
    │              │  │            │  │               │
    │ playPause()  │  │ remove()   │  │ noteOn(C4)    │
    │ volumeUp()   │  │ moveUp()   │  │ noteOff(C4)   │
    │ nextTrack()  │  │ ...        │  │ octaveUp()    │
    └──────────────┘  └────────────┘  └───────────────┘
```

### 7.3 ShortcutManager Core

The `ShortcutManager` is a singleton class (not a React component) that owns the document-level listener. React hooks and components interact with it through a context provider.

```typescript
class ShortcutManager {
  private globalHandlers: Map<KeyCombo, RegisteredHandler>;
  private contextualHandlers: Map<
    ContextualScopeId,
    Map<KeyCombo, RegisteredHandler>
  >;
  private instrumentHandler: InstrumentKeyHandler | null;
  private activeContextualScope: ContextualScopeId | null;
  private overlayDepth: number; // ref-counted overlay tracking
  private effectiveKeymap: FullKeymap;
  private registeredWidgets: Set<HTMLElement>; // custom widgets (level 4)

  constructor(keymap: FullKeymap) {
    /* ... */
  }

  // Called once at app init
  attach(): void {
    document.addEventListener('keydown', this.handleKeyDown, { capture: true });
    document.addEventListener('keyup', this.handleKeyUp, { capture: true });
  }

  detach(): void {
    document.removeEventListener('keydown', this.handleKeyDown, {
      capture: true,
    });
    document.removeEventListener('keyup', this.handleKeyUp, { capture: true });
  }

  // Registration
  register(
    actionId: ShortcutActionId,
    handler: () => void,
    options: ShortcutOptions,
  ): () => void;
  setActiveContextualScope(scope: ContextualScopeId | null): void;
  setInstrumentMode(enabled: boolean): void;
  pushOverlay(): void;
  popOverlay(): void;

  // Custom widget registration (level 4)
  registerWidget(element: HTMLElement): () => void; // returns unregister fn

  // Keymap management
  updateKeymap(custom: CustomKeymap): void;
  getEffectiveKeymap(): FullKeymap;
  getBindingForAction(actionId: ShortcutActionId): KeyBinding;

  // Private
  private handleKeyDown(event: KeyboardEvent): void;
  private handleKeyUp(event: KeyboardEvent): void;
  private normalizeCombo(event: KeyboardEvent): KeyCombo;
}
```

### 7.4 React Integration

```typescript
// ── Provider ──

const ShortcutContext = createContext<ShortcutManager | null>(null)

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const keymap = useSettingsStore(state => state.keymap)
  const managerRef = useRef<ShortcutManager>()

  if (!managerRef.current) {
    const effective = mergeKeymap(DEFAULT_KEYMAP, keymap.custom)
    managerRef.current = new ShortcutManager(effective)
  }

  useEffect(() => {
    const manager = managerRef.current!
    manager.attach()
    return () => manager.detach()
  }, [])

  // Sync keymap changes
  useEffect(() => {
    const effective = mergeKeymap(DEFAULT_KEYMAP, keymap.custom)
    managerRef.current!.updateKeymap(effective)
  }, [keymap.custom])

  return (
    <ShortcutContext.Provider value={managerRef.current}>
      {children}
    </ShortcutContext.Provider>
  )
}

// ── Hook: useShortcut ──

export function useShortcut(
  actionId: ShortcutActionId,
  handler: () => void,
  options?: ShortcutOptions
): void {
  const manager = useContext(ShortcutContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  // Destructure needed fields from options to use as stable primitives
  // in the dependency array. This avoids re-registering when the caller
  // passes a new object reference with the same values.
  const { scope = 'global', enabled = true, contextualScope,
          preventDefault = true, allowRepeat = false } = options ?? {}

  useEffect(() => {
    if (!manager || enabled === false) return
    const stableHandler = () => handlerRef.current()
    return manager.register(actionId, stableHandler,
      { scope, contextualScope, preventDefault, allowRepeat })
  }, [manager, actionId, enabled, scope, contextualScope, preventDefault, allowRepeat])
}

// ── Hook: useActiveContextualScope ──
// Called by each view's root component to declare its contextual scope

export function useActiveContextualScope(scope: ContextualScopeId): void {
  const manager = useContext(ShortcutContext)

  useEffect(() => {
    manager?.setActiveContextualScope(scope)
    return () => manager?.setActiveContextualScope(null)
  }, [manager, scope])
}

// ── Hook: useShortcutHint ──
// Returns the display string for a shortcut (platform-formatted)

export function useShortcutHint(actionId: ShortcutActionId): string {
  const manager = useContext(ShortcutContext)
  if (!manager) return ''
  const binding = manager.getBindingForAction(actionId)
  return formatKeyCombo(binding.primary)
}
```

### 7.5 Key Normalization

```typescript
function normalizeCombo(event: KeyboardEvent): KeyCombo {
  const parts: string[] = [];

  // Normalize Meta (Cmd on macOS) to 'Ctrl' for cross-platform consistency
  const isMac =
    navigator.userAgentData?.platform === 'macOS' ||
    /Mac|iPhone|iPad/.test(navigator.platform);
  const ctrlPressed = isMac ? event.metaKey : event.ctrlKey;

  if (ctrlPressed) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');

  // Exclude modifier-only keys from the combo
  const code = event.code;
  if (
    ![
      'ShiftLeft',
      'ShiftRight',
      'ControlLeft',
      'ControlRight',
      'AltLeft',
      'AltRight',
      'MetaLeft',
      'MetaRight',
    ].includes(code)
  ) {
    parts.push(code);
  }

  return parts.join('+') as KeyCombo;
}
```

### 7.6 Event Handling Integration Points

```
App Component Tree
──────────────────
<ShortcutProvider>                    ← owns ShortcutManager
  <RouterProvider>
    <RootLayout>                      ← persistent player bar + nav
      <PlayerBar>
        useShortcut('playback.playPause', ...)   ← global
        useShortcut('playback.mute', ...)         ← global
      </PlayerBar>
      <Outlet>                        ← active view
        <PlaylistView>
          useActiveContextualScope('playlist')
          useShortcut('playlist.removeTrack', ...)  ← contextual
          useShortcut('playlist.addFiles', ...)      ← contextual
        </PlaylistView>
        ─── OR ───
        <InstrumentView>
          useActiveContextualScope('instrument-view')
          <InstrumentKeyboard>        ← instrument mode handler
          </InstrumentKeyboard>
        </InstrumentView>
      </Outlet>
      <Dialog>                        ← Radix overlay
        <ShortcutOverlayBoundary>     ← increments overlay depth
          ...
        </ShortcutOverlayBoundary>
      </Dialog>
    </RootLayout>
  </RouterProvider>
</ShortcutProvider>
```

### 7.7 Contextual Scope Lifecycle

Each route view declares its contextual scope via `useActiveContextualScope`. This hook sets the active scope on mount and clears it on unmount, naturally tied to route transitions:

```typescript
// In PlaylistView.tsx
export function PlaylistView() {
  useActiveContextualScope('playlist');
  // ... rest of the component
}
```

Because React unmounts the old view before mounting the new one during route transitions, there is a brief moment of no active contextual scope. This is acceptable — during the transition, only global shortcuts are active.

### 7.8 Instrument Mode Integration

The `InstrumentKeyboard` component within the Instrument view owns the instrument mode lifecycle:

```typescript
function InstrumentKeyboard() {
  const manager = useContext(ShortcutContext);
  const instrumentState = useSettingsStore((s) => s.keymap);
  const [enabled, setEnabled] = useState(false);

  // Toggle handler (registered globally so ` works from any view)
  useShortcut(
    'general.toggleInstrumentMode',
    () => {
      setEnabled((prev) => !prev);
    },
    { scope: 'global' },
  );

  useEffect(() => {
    manager?.setInstrumentMode(enabled);
  }, [enabled, manager]);

  // Auto-disable on navigation away from Instrument view
  // (handled by useActiveContextualScope cleanup in parent)
}
```

Note-on and note-off handlers are registered internally by the `ShortcutManager` when instrument mode is active, using the note mapping table. They call into the audio engine's instrument performer API to trigger sounds.

---

## 8. Accessibility Considerations

### 8.1 Screen Reader Announcements

- When instrument mode activates: `aria-live="assertive"` region announces "Instrument keyboard enabled. Press Escape to exit."
- When instrument mode deactivates: announces "Instrument keyboard disabled."
- Shortcut conflicts during customization: announced via `aria-live="polite"`.

### 8.2 Focus Indicators

- All interactive elements maintain visible focus indicators (per accessibility skill).
- The shortcut recording mode in settings shows a prominent focus ring and "Press a key…" label for screen readers.
- Tab order is preserved — keyboard shortcuts supplement but do not replace standard Tab navigation.

### 8.3 Keyboard Navigation vs. Keyboard Shortcuts

These are distinct systems:

| Concern     | Keyboard Navigation                     | Keyboard Shortcuts              |
| ----------- | --------------------------------------- | ------------------------------- |
| Purpose     | Move focus between elements             | Trigger actions without focus   |
| Keys        | Tab, Shift+Tab, Arrow keys (in widgets) | Any key combo                   |
| Standard    | WCAG 2.2 / WAI-ARIA patterns            | Application-specific            |
| Overridable | No                                      | Yes (customizable)              |
| Scope       | Follows DOM focus order                 | Scope-based priority (7 levels) |

The shortcut system never interferes with standard keyboard navigation. Tab, Shift+Tab, and arrow-key navigation within Radix composite widgets (tabs, toolbars, menus) always take priority. The focused interactive element (level 3) and focused custom widget (level 4) checks ensure that Space and Enter activate focused buttons and controls before being claimed by application shortcuts.

### 8.4 Browser Tab Unfocus Behavior

`keydown` events do not fire when the browser tab is not focused. If the user switches to another tab or application while a note is held in instrument mode, the corresponding `keyup` event will never arrive. The instrument handler must implement a safety mechanism (e.g., `visibilitychange` listener) to release all active notes when the tab loses focus. Similarly, modifier key state (Ctrl, Shift held down) may become stale after tab switching — the normalizer should read modifier state from the event itself, not from cached state.

---

## Appendix A: Complete Default Keymap Reference

```typescript
export const DEFAULT_KEYMAP: Record<ShortcutActionId, ShortcutDefinition> = {
  // ── Playback ──
  'playback.playPause': {
    id: 'playback.playPause',
    label: 'Play / Pause',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Space' as KeyCombo },
    reserved: false,
  },
  'playback.stop': {
    id: 'playback.stop',
    label: 'Stop',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+Space' as KeyCombo },
    reserved: false,
  },
  'playback.nextTrack': {
    id: 'playback.nextTrack',
    label: 'Next Track',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+ArrowRight' as KeyCombo },
    reserved: false,
  },
  'playback.previousTrack': {
    id: 'playback.previousTrack',
    label: 'Previous Track',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+ArrowLeft' as KeyCombo },
    reserved: false,
  },
  'playback.seekForward': {
    id: 'playback.seekForward',
    label: 'Seek Forward (5s)',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'ArrowRight' as KeyCombo },
    reserved: false,
  },
  'playback.seekBackward': {
    id: 'playback.seekBackward',
    label: 'Seek Backward (5s)',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'ArrowLeft' as KeyCombo },
    reserved: false,
  },
  'playback.seekForwardLong': {
    id: 'playback.seekForwardLong',
    label: 'Seek Forward (30s)',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Shift+ArrowRight' as KeyCombo },
    reserved: false,
  },
  'playback.seekBackwardLong': {
    id: 'playback.seekBackwardLong',
    label: 'Seek Backward (30s)',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Shift+ArrowLeft' as KeyCombo },
    reserved: false,
  },
  'playback.volumeUp': {
    id: 'playback.volumeUp',
    label: 'Volume Up',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'ArrowUp' as KeyCombo },
    reserved: false,
  },
  'playback.volumeDown': {
    id: 'playback.volumeDown',
    label: 'Volume Down',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'ArrowDown' as KeyCombo },
    reserved: false,
  },
  'playback.mute': {
    id: 'playback.mute',
    label: 'Mute / Unmute',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'KeyM' as KeyCombo },
    reserved: false,
  },
  'playback.speedUp': {
    id: 'playback.speedUp',
    label: 'Speed +0.25×',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Shift+ArrowUp' as KeyCombo },
    reserved: false,
  },
  'playback.speedDown': {
    id: 'playback.speedDown',
    label: 'Speed −0.25×',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Shift+ArrowDown' as KeyCombo },
    reserved: false,
  },
  'playback.speedReset': {
    id: 'playback.speedReset',
    label: 'Speed Reset (1×)',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Backspace' as KeyCombo },
    reserved: false,
  },
  'playback.toggleRepeat': {
    id: 'playback.toggleRepeat',
    label: 'Toggle Repeat',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'KeyR' as KeyCombo },
    reserved: false,
  },
  'playback.toggleShuffle': {
    id: 'playback.toggleShuffle',
    label: 'Toggle Shuffle',
    category: 'Playback',
    scope: 'global',
    defaultBinding: { primary: 'KeyS' as KeyCombo },
    reserved: false,
  },

  // ── Navigation ──
  'navigation.player': {
    id: 'navigation.player',
    label: 'Player View',
    category: 'Navigation',
    scope: 'global',
    defaultBinding: { primary: 'Alt+Digit1' as KeyCombo },
    reserved: false,
  },
  'navigation.playlist': {
    id: 'navigation.playlist',
    label: 'Playlist View',
    category: 'Navigation',
    scope: 'global',
    defaultBinding: { primary: 'Alt+Digit2' as KeyCombo },
    reserved: false,
  },
  'navigation.instrument': {
    id: 'navigation.instrument',
    label: 'Instrument View',
    category: 'Navigation',
    scope: 'global',
    defaultBinding: { primary: 'Alt+Digit3' as KeyCombo },
    reserved: false,
  },
  'navigation.analysis': {
    id: 'navigation.analysis',
    label: 'Analysis View',
    category: 'Navigation',
    scope: 'global',
    defaultBinding: { primary: 'Alt+Digit4' as KeyCombo },
    reserved: false,
  },
  'navigation.settings': {
    id: 'navigation.settings',
    label: 'Settings View',
    category: 'Navigation',
    scope: 'global',
    defaultBinding: { primary: 'Alt+Digit5' as KeyCombo },
    reserved: false,
  },
  'navigation.search': {
    id: 'navigation.search',
    label: 'Focus Search',
    category: 'Navigation',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+KeyF' as KeyCombo },
    reserved: false,
  },
  'navigation.showShortcuts': {
    id: 'navigation.showShortcuts',
    label: 'Keyboard Shortcuts',
    category: 'Navigation',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Slash' as KeyCombo },
    reserved: false,
  },

  // ── Playlist ──
  'playlist.addFiles': {
    id: 'playlist.addFiles',
    label: 'Add Files',
    category: 'Playlist',
    scope: 'contextual',
    contextualScope: 'playlist',
    defaultBinding: { primary: 'Ctrl+KeyO' as KeyCombo },
    reserved: false,
  },
  'playlist.removeTrack': {
    id: 'playlist.removeTrack',
    label: 'Remove Track',
    category: 'Playlist',
    scope: 'contextual',
    contextualScope: 'playlist',
    defaultBinding: { primary: 'Delete' as KeyCombo },
    reserved: false,
  },
  'playlist.moveUp': {
    id: 'playlist.moveUp',
    label: 'Move Track Up',
    category: 'Playlist',
    scope: 'contextual',
    contextualScope: 'playlist',
    defaultBinding: { primary: 'Alt+ArrowUp' as KeyCombo },
    reserved: false,
  },
  'playlist.moveDown': {
    id: 'playlist.moveDown',
    label: 'Move Track Down',
    category: 'Playlist',
    scope: 'contextual',
    contextualScope: 'playlist',
    defaultBinding: { primary: 'Alt+ArrowDown' as KeyCombo },
    reserved: false,
  },
  'playlist.selectAll': {
    id: 'playlist.selectAll',
    label: 'Select All',
    category: 'Playlist',
    scope: 'contextual',
    contextualScope: 'playlist',
    defaultBinding: { primary: 'Ctrl+KeyA' as KeyCombo },
    reserved: false,
  },
  'playlist.deselectAll': {
    id: 'playlist.deselectAll',
    label: 'Deselect All',
    category: 'Playlist',
    scope: 'contextual',
    contextualScope: 'playlist',
    defaultBinding: { primary: 'Ctrl+Shift+KeyA' as KeyCombo },
    reserved: false,
  },
  'playlist.playSelected': {
    id: 'playlist.playSelected',
    label: 'Play Selected',
    category: 'Playlist',
    scope: 'contextual',
    contextualScope: 'playlist',
    defaultBinding: { primary: 'Enter' as KeyCombo },
    reserved: false,
  },

  // ── Mixer ──
  'mixer.toggleVoice1': {
    id: 'mixer.toggleVoice1',
    label: 'Toggle Voice 1',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit1' as KeyCombo },
    reserved: false,
  },
  'mixer.toggleVoice2': {
    id: 'mixer.toggleVoice2',
    label: 'Toggle Voice 2',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit2' as KeyCombo },
    reserved: false,
  },
  'mixer.toggleVoice3': {
    id: 'mixer.toggleVoice3',
    label: 'Toggle Voice 3',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit3' as KeyCombo },
    reserved: false,
  },
  'mixer.toggleVoice4': {
    id: 'mixer.toggleVoice4',
    label: 'Toggle Voice 4',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit4' as KeyCombo },
    reserved: false,
  },
  'mixer.toggleVoice5': {
    id: 'mixer.toggleVoice5',
    label: 'Toggle Voice 5',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit5' as KeyCombo },
    reserved: false,
  },
  'mixer.toggleVoice6': {
    id: 'mixer.toggleVoice6',
    label: 'Toggle Voice 6',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit6' as KeyCombo },
    reserved: false,
  },
  'mixer.toggleVoice7': {
    id: 'mixer.toggleVoice7',
    label: 'Toggle Voice 7',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit7' as KeyCombo },
    reserved: false,
  },
  'mixer.toggleVoice8': {
    id: 'mixer.toggleVoice8',
    label: 'Toggle Voice 8',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit8' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice1': {
    id: 'mixer.soloVoice1',
    label: 'Solo Voice 1',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit1' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice2': {
    id: 'mixer.soloVoice2',
    label: 'Solo Voice 2',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit2' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice3': {
    id: 'mixer.soloVoice3',
    label: 'Solo Voice 3',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit3' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice4': {
    id: 'mixer.soloVoice4',
    label: 'Solo Voice 4',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit4' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice5': {
    id: 'mixer.soloVoice5',
    label: 'Solo Voice 5',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit5' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice6': {
    id: 'mixer.soloVoice6',
    label: 'Solo Voice 6',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit6' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice7': {
    id: 'mixer.soloVoice7',
    label: 'Solo Voice 7',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit7' as KeyCombo },
    reserved: false,
  },
  'mixer.soloVoice8': {
    id: 'mixer.soloVoice8',
    label: 'Solo Voice 8',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Shift+Digit8' as KeyCombo },
    reserved: false,
  },
  'mixer.unmuteAll': {
    id: 'mixer.unmuteAll',
    label: 'Unmute All',
    category: 'Mixer',
    scope: 'global',
    defaultBinding: { primary: 'Digit0' as KeyCombo },
    reserved: false,
  },

  // ── Analysis ──
  'analysis.memoryTab': {
    id: 'analysis.memoryTab',
    label: 'Memory Tab',
    category: 'Analysis',
    scope: 'contextual',
    contextualScope: 'analysis',
    defaultBinding: { primary: 'Alt+KeyM' as KeyCombo },
    reserved: false,
  },
  'analysis.registersTab': {
    id: 'analysis.registersTab',
    label: 'Registers Tab',
    category: 'Analysis',
    scope: 'contextual',
    contextualScope: 'analysis',
    defaultBinding: { primary: 'Alt+KeyR' as KeyCombo },
    reserved: false,
  },
  'analysis.voicesTab': {
    id: 'analysis.voicesTab',
    label: 'Voices Tab',
    category: 'Analysis',
    scope: 'contextual',
    contextualScope: 'analysis',
    defaultBinding: { primary: 'Alt+KeyV' as KeyCombo },
    reserved: false,
  },
  'analysis.echoTab': {
    id: 'analysis.echoTab',
    label: 'Echo Tab',
    category: 'Analysis',
    scope: 'contextual',
    contextualScope: 'analysis',
    defaultBinding: { primary: 'Alt+KeyE' as KeyCombo },
    reserved: false,
  },
  'analysis.toggleHexDecimal': {
    id: 'analysis.toggleHexDecimal',
    label: 'Toggle Hex/Dec',
    category: 'Analysis',
    scope: 'contextual',
    contextualScope: 'analysis',
    defaultBinding: { primary: 'KeyH' as KeyCombo },
    reserved: false,
  },

  // ── Export ──
  'export.open': {
    id: 'export.open',
    label: 'Export…',
    category: 'Export',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+KeyE' as KeyCombo },
    reserved: false,
  },
  'export.quick': {
    id: 'export.quick',
    label: 'Quick Export',
    category: 'Export',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+Shift+KeyE' as KeyCombo },
    reserved: false,
  },

  // ── A-B Loop ──
  'abLoop.setStart': {
    id: 'abLoop.setStart',
    label: 'Set Loop Start (A)',
    category: 'A-B Loop',
    scope: 'global',
    defaultBinding: { primary: 'BracketLeft' as KeyCombo },
    reserved: false,
  },
  'abLoop.setEnd': {
    id: 'abLoop.setEnd',
    label: 'Set Loop End (B)',
    category: 'A-B Loop',
    scope: 'global',
    defaultBinding: { primary: 'BracketRight' as KeyCombo },
    reserved: false,
  },
  'abLoop.toggle': {
    id: 'abLoop.toggle',
    label: 'Toggle A-B Loop',
    category: 'A-B Loop',
    scope: 'global',
    defaultBinding: { primary: 'KeyL' as KeyCombo },
    reserved: false,
  },
  'abLoop.clear': {
    id: 'abLoop.clear',
    label: 'Clear A-B Loop',
    category: 'A-B Loop',
    scope: 'global',
    defaultBinding: { primary: 'Shift+KeyL' as KeyCombo },
    reserved: false,
  },

  // ── General ──
  'general.openFile': {
    id: 'general.openFile',
    label: 'Open File…',
    category: 'General',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+KeyO' as KeyCombo },
    reserved: false,
  },
  'general.undo': {
    id: 'general.undo',
    label: 'Undo',
    category: 'General',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+KeyZ' as KeyCombo },
    reserved: false,
  },
  'general.redo': {
    id: 'general.redo',
    label: 'Redo',
    category: 'General',
    scope: 'global',
    defaultBinding: { primary: 'Ctrl+Shift+KeyZ' as KeyCombo },
    reserved: false,
  },
  'general.fullscreen': {
    id: 'general.fullscreen',
    label: 'Toggle Fullscreen',
    category: 'General',
    scope: 'global',
    defaultBinding: { primary: 'KeyF' as KeyCombo },
    reserved: false,
  },
  'general.close': {
    id: 'general.close',
    label: 'Close / Cancel',
    category: 'General',
    scope: 'global',
    defaultBinding: { primary: 'Escape' as KeyCombo },
    reserved: true,
  },
  'general.toggleInstrumentMode': {
    id: 'general.toggleInstrumentMode',
    label: 'Toggle Instrument Mode',
    category: 'General',
    scope: 'global',
    defaultBinding: { primary: 'Backquote' as KeyCombo },
    reserved: false,
  },
};
```

## Appendix B: Instrument Note Mapping Table

```typescript
export const INSTRUMENT_KEY_MAP: InstrumentKeyMapping[] = [
  // Lower octave (base)
  { code: 'KeyZ', note: 0, octaveRelative: 0 }, // C
  { code: 'KeyS', note: 1, octaveRelative: 0 }, // C#
  { code: 'KeyX', note: 2, octaveRelative: 0 }, // D
  { code: 'KeyD', note: 3, octaveRelative: 0 }, // D#
  { code: 'KeyC', note: 4, octaveRelative: 0 }, // E
  { code: 'KeyV', note: 5, octaveRelative: 0 }, // F
  { code: 'KeyG', note: 6, octaveRelative: 0 }, // F#
  { code: 'KeyB', note: 7, octaveRelative: 0 }, // G
  { code: 'KeyH', note: 8, octaveRelative: 0 }, // G#
  { code: 'KeyN', note: 9, octaveRelative: 0 }, // A
  { code: 'KeyJ', note: 10, octaveRelative: 0 }, // A#
  { code: 'KeyM', note: 11, octaveRelative: 0 }, // B

  // Upper octave (base + 1)
  // Note: Digit1 and Digit4 are intentionally absent — there is no black key
  // between E and F (Digit1 would be between KeyE/E and KeyR/F) or between
  // B and C (Digit4 would be between KeyU/B and KeyI/C). This mirrors the
  // chromatic layout of a real piano keyboard.
  { code: 'KeyQ', note: 0, octaveRelative: 1 }, // C
  { code: 'Digit2', note: 1, octaveRelative: 1 }, // C#
  { code: 'KeyW', note: 2, octaveRelative: 1 }, // D
  { code: 'Digit3', note: 3, octaveRelative: 1 }, // D#
  { code: 'KeyE', note: 4, octaveRelative: 1 }, // E
  { code: 'KeyR', note: 5, octaveRelative: 1 }, // F
  { code: 'Digit5', note: 6, octaveRelative: 1 }, // F#
  { code: 'KeyT', note: 7, octaveRelative: 1 }, // G
  { code: 'Digit6', note: 8, octaveRelative: 1 }, // G#
  { code: 'KeyY', note: 9, octaveRelative: 1 }, // A
  { code: 'Digit7', note: 10, octaveRelative: 1 }, // A#
  { code: 'KeyU', note: 11, octaveRelative: 1 }, // B
  { code: 'KeyI', note: 0, octaveRelative: 2 }, // C (next octave start)
];

// MIDI note computed as: (baseOctave + octaveRelative) * 12 + note
```

## Appendix C: Known Binding Conflicts and Resolutions

This table documents key bindings where the same physical key serves different purposes depending on scope, and the designed resolution:

| Key                  | Global                                      | Instrument Mode                     | Resolution                                                                                                                         |
| -------------------- | ------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Digit1`–`Digit8`    | Voice mute toggle                           | Upper octave notes (2,3,5,6,7 only) | Instrument mode claims these keys; voice mute unavailable in instrument mode. Mixer controls remain accessible via mouse.          |
| `KeyM`               | Mute/unmute audio                           | Lower octave B note                 | Instrument mode claims; audio mute via mouse or `Ctrl+M` (not bound by default but available as secondary).                        |
| `KeyR`               | Toggle repeat                               | Upper octave F note                 | Instrument mode claims; repeat toggle via mouse.                                                                                   |
| `KeyS`               | Toggle shuffle                              | Lower octave C# note                | Instrument mode claims; shuffle toggle via mouse.                                                                                  |
| `KeyF`               | Toggle fullscreen                           | Not mapped (instrument)             | Falls through to global; fullscreen works in instrument mode.                                                                      |
| `Space`              | Play/pause                                  | Not mapped (instrument)             | **Falls through** to global; playback toggle works in instrument mode via passthrough. Space is physically distant from note keys. |
| `ArrowUp/Down`       | Volume                                      | Not mapped (instrument)             | Falls through to global; volume works in instrument mode.                                                                          |
| `ArrowLeft/Right`    | Seek                                        | Not mapped (instrument)             | Falls through to global; seek works in instrument mode.                                                                            |
| `Escape`             | Close/cancel                                | Exit instrument mode                | Reserved — always exits mode first, then closes overlays.                                                                          |
| `Delete`             | _Playlist:_ remove track                    | Not mapped                          | Contextual scope; only active in playlist view.                                                                                    |
| `BracketLeft` (`[`)  | Set loop start (A)                          | Decrease velocity                   | Instrument mode (scope 5) claims; A-B loop set-start unavailable in instrument mode.                                               |
| `BracketRight` (`]`) | Set loop end (B)                            | Increase velocity                   | Instrument mode (scope 5) claims; A-B loop set-end unavailable in instrument mode.                                                 |
| `Ctrl+KeyO`          | _Global:_ open file / _Playlist:_ add files | Not mapped                          | Contextual scope wins when in playlist view; both trigger file picker, contextual version is playlist-aware.                       |

## Appendix D: Open Questions for Implementation

1. **Shortcut recording UX**: Should the recording mode in settings capture the _first_ valid keypress, or should it wait for a full combo (e.g., user presses Ctrl, then K)? Recommendation: capture on keyup of the final key in the combo, with a visual indicator showing the combo building in real time.

2. **Accessibility of instrument mode**: Screen reader users cannot use the instrument keyboard in the same way. Consider an alternative input method — typing note names (e.g., "C4") in an input field, or using MIDI input. The keyboard shortcut help panel should note that instrument mode is a sighted/hearing user feature with MIDI as the accessible alternative.

3. **Gamepad support**: The shortcut system could be extended to support gamepad inputs for playback controls. This is out of scope for the initial implementation but the `ShortcutManager`'s architecture (combo → action mapping) accommodates non-keyboard input sources.

4. **Touch shortcut gestures**: On mobile, swipe gestures could map to actions (swipe left/right for next/previous). This could integrate with the same action ID system but uses a separate gesture recognition layer, not the keyboard `ShortcutManager`.
