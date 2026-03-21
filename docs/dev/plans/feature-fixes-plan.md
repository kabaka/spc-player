# Feature Fixes Plan

> **Revision 2** — Updated 2026-03-21 after architect and accessibility reviews.
> Changes: Bug 4 SeekBar subsumed by UX Phase 3; A-B loop accessibility improvements;
> seek bar keyboard step alignment; MIDI standalone DSP initialization notes.

---

## Bug 1: Playback Doesn't Advance to Next Track Unless Player Panel Is Open

**Phase:** A (Stabilization) — no dependencies, can proceed immediately.

### Root Cause

The `setOnPlaybackEnded` callback is registered inside a `useEffect` in `PlayerView.tsx` (lines 95–101). `PlayerView` is a route component — it unmounts when the user navigates to `/playlist`, `/instrument`, `/analysis`, or `/settings`. The effect cleanup runs `audioEngine.setOnPlaybackEnded(null)`, removing the auto-advance callback. After that, when the worklet sends a `playback-ended` message (engine.ts `handleWorkletMessage`), `this.onPlaybackEnded` is null and nothing happens.

### Proposed Fix

Move the callback registration out of `PlayerView` and into a global hook that lives in the root layout (`__root.tsx`), which never unmounts.

**Step 1: Create `src/hooks/useAutoAdvance.ts`**

```ts
import { useEffect } from 'react';
import { audioEngine } from '@/audio/engine';
import { useAppStore } from '@/store/store';

export function useAutoAdvance(): void {
  useEffect(() => {
    audioEngine.setOnPlaybackEnded(() => {
      useAppStore.getState().nextTrack();
    });
    return () => {
      audioEngine.setOnPlaybackEnded(null);
    };
  }, []);
}
```

**Step 2: Call `useAutoAdvance()` in `src/app/routes/__root.tsx`**

Add `useAutoAdvance()` inside `RootComponent`, alongside existing global hooks like `useTheme()` and `useMediaSession()`.

**Step 3: Remove the `useEffect` from `PlayerView.tsx`**

Delete lines 95–101 (the `setOnPlaybackEnded` effect) and remove the unused `audioEngine` import if no other usage remains.

### Testing Approach

- **E2E test**: Load a playlist with 2+ tracks, navigate to the playlist view, let track 1 play to completion, verify track 2 starts automatically.
- **Unit test** for `useAutoAdvance`: verify the callback is registered on mount and cleared on unmount.

---

## Bug 2: A-B Looping Doesn't Work

### Root Cause Analysis

**Primary bug — Units mismatch (samples vs. seconds):**

In `GlobalShortcuts.tsx` (lines ~193–200), the A-B loop shortcuts pass `position` directly to `setLoopStart`/`setLoopEnd`:

```ts
useShortcut('loop.setStart', () => {
  const pos = useAppStore.getState().position; // ← samples (at 32 kHz)
  setLoopStart(pos); // ← store expects SECONDS
});
```

`position` in the store is in samples (at the DSP_SAMPLE_RATE of 32,000 Hz). A position of 10 seconds = 320,000 samples. But `LoopRegion.startTime`/`endTime` are used as **seconds** everywhere:

- `LoopMarkers.tsx` computes `startPercent = (loopRegion.startTime / maxTime) * 100` where `maxTime` is in seconds. With `startTime = 320000` and `maxTime = 180`, `startPercent = 177,778%` — markers render off-screen.
- `PlayerView.tsx` enforcement (line ~156) compares `samplesToSeconds(pos)` against `region.endTime`. If `endTime` is in samples (e.g., 640,000), the seconds value (e.g., 20) will never exceed it, so the loop never triggers.

**Secondary issue — LoopMarkers visibility:**

`LoopMarkers` returns `null` when `!loopRegion || maxTime <= 0`. Even if the loop region was correctly set, the markers only render inside the seek bar in `PlayerView.tsx` (line ~400): `{loopRegion && <LoopMarkers maxTime={...} />}`. This is correct but only visible on the player route.

**Tertiary issue — `instrument.toggleKeyboard` has no keymap binding:**

Not directly related to A-B loop, but `instrument.toggleKeyboard` is referenced in `InstrumentView.tsx` line 61 via `useShortcut('instrument.toggleKeyboard', ...)`, yet it has **no entry** in `defaultKeymap`. The `ShortcutManager.register` function exits early with `if (!binding) return;`, so the shortcut silently does nothing.

### Proposed Fix

**Step 1: Fix the units mismatch in `GlobalShortcuts.tsx`**

Convert `position` from samples to seconds before passing to `setLoopStart`/`setLoopEnd`:

```ts
import { samplesToSeconds } from '@/core/track-duration';

useShortcut('loop.setStart', () => {
  const pos = useAppStore.getState().position;
  setLoopStart(samplesToSeconds(pos));
});

useShortcut('loop.setEnd', () => {
  const pos = useAppStore.getState().position;
  setLoopEnd(samplesToSeconds(pos));
});
```

**Step 2: Add `instrument.toggleKeyboard` to `default-keymap.ts`**

Add a binding for the missing action:

```ts
binding('instrument.toggleKeyboard', ['Backquote'], 'global'),
```

This uses the same key as `general.toggleInstrumentMode`. These should be unified — either:

- Option A: Remove `general.toggleInstrumentMode` and use `instrument.toggleKeyboard` everywhere.
- Option B: Wire `general.toggleInstrumentMode` in GlobalShortcuts to dispatch the instrument keyboard toggle (via store action).

Recommended: Option B — have `general.toggleInstrumentMode` in GlobalShortcuts trigger the toggle, and remove the separate `useShortcut` call from InstrumentView.

**Step 3: Verify enforcement loop works end-to-end**

After the units fix, the enforcement logic in `PlayerView.tsx` (lines 152–163) should work correctly:

```ts
const currentSec = samplesToSeconds(pos);      // e.g. 20.0
if (currentSec >= region.endTime)               // endTime now also in seconds, e.g. 15.0
```

No changes needed to this logic — the units fix is sufficient.

**Step 4: Loop region activation must be announced to screen readers**

When the user presses `L` to toggle the loop, or when both `[` and `]` have been set and the loop activates, an `aria-live="polite"` region must announce the state change. This uses the existing playback announcements live region in `__root.tsx`.

Implementation:

- When loop toggles **on**, announce: `"Loop activated from {formatTime(startTime)} to {formatTime(endTime)}"` (e.g., "Loop activated from 1:05 to 2:30").
- When loop toggles **off**, announce: `"Loop deactivated"`.
- When a marker is moved (via keyboard or drag), announce: `"Loop start set to {time}"` or `"Loop end set to {time}"`.

The announcement text is set via the existing `setPlaybackAnnouncement` store action, which writes to the `aria-live` region.

### Testing Approach

- **Unit test** for `setLoopStart`/`setLoopEnd`: verify they store values in seconds.
- **Integration test**: press `[` at position 5s, press `]` at position 15s, verify `loopRegion = { startTime: 5, endTime: 15, active: true }`.
- **E2E test**: load a track, set A-B markers via keyboard, let playback reach point B, verify it loops back to point A.
- **Verification**: LoopMarkers should render visible handles between 0–100% of the seek bar.
- **Accessibility test**: verify `aria-live` region announces loop activation/deactivation text.

---

## Bug 3: MIDI Keyboard Issues

### Root Cause Analysis

**Problem 1: "Only produces sound when a song is playing"**

`audioEngine.noteOn(voice, pitch)` posts a `note-on` command to the worklet. The worklet's `process()` method only generates audio when the emulator is initialized with SPC data (via `init` or `load-spc` messages). If no SPC is loaded, or if playback hasn't been started at least once, the WASM DSP instance doesn't exist in the worklet — `noteOn` messages are silently dropped.

Even when an SPC is loaded but playback is paused/stopped, the worklet's `process()` still runs (AudioWorklet processors are always invoked while connected to the audio graph), but the emulator may not be advancing samples. The `note-on` command writes to DSP registers, but if the processor isn't stepping the emulator forward, no audio is produced.

**Problem 2: "Sounds are not good"**

The note-on mechanism sets a pitch on a specific SPC voice that already has BRR sample data loaded from the current SPC file. The sound quality depends entirely on what BRR instrument sample is loaded for that voice — it's whatever the game composer put there, not a clean sine wave or piano sample. The ADSR envelope and DSP effects (echo, noise) also remain from the SPC file's register state.

**Problem 3: Shortcuts don't work (Edge/macOS)**

Several potential issues:

- `instrument.toggleKeyboard` has no default keymap binding (see Bug 2 analysis).
- `general.toggleInstrumentMode` is bound to `Backquote` but its handler is a TODO stub in GlobalShortcuts.tsx line 368–369.
- The `useInstrumentKeyboard` hook registers its own `keydown` listener on `document` in capture phase. The `ShortcutManager` also uses capture phase. Both listeners fire, but order depends on which was added first. Since ShortcutManager attaches in `__root.tsx` useEffect (runs first), it intercepts keys before useInstrumentKeyboard. Keys like `KeyM` (mute shortcut), `KeyR` (repeat toggle), `KeyS` (shuffle toggle), `KeyF` (fullscreen) are consumed by ShortcutManager's global handlers before reaching the instrument keyboard, preventing those notes from sounding.
- On Edge/macOS: `navigator.requestMIDIAccess()` behavior differs; Edge may require `sysex` permission or have different security prompts.

### Proposed Fixes

**Fix 3a: Wire instrument mode toggle globally**

In `GlobalShortcuts.tsx`, replace the TODO stub for `general.toggleInstrumentMode`:

```ts
useShortcut('general.toggleInstrumentMode', () => {
  useAppStore.getState().toggleInstrumentMode();
});
```

Add `toggleInstrumentMode` action to the store that toggles a global `isInstrumentModeActive` flag. When active, the ShortcutManager should skip global shortcut dispatch for keys that are note mappings (the passthrough mechanism in `useInstrumentKeyboard` already handles Escape).

**Fix 3b: Coordinate ShortcutManager with instrument mode**

Add an instrument mode check in `ShortcutManager.resolveKeyEvent()` before step 6 (global dispatch). When instrument mode is active, only dispatch shortcuts that are in a reserved set (play/pause, stop, volume, navigation) and let note keys fall through.

The ShortcutManager already has a comment at line ~225: `// 5. Instrument mode — skip for now`. Implement this:

```ts
// 5. Instrument mode — suppress non-reserved global shortcuts
if (this.isInstrumentModeActive()) {
  if (!INSTRUMENT_MODE_PASSTHROUGH.has(combo)) return;
}
```

Where `INSTRUMENT_MODE_PASSTHROUGH` includes transport controls and navigation but excludes single-key shortcuts like `KeyM`, `KeyR`, `KeyS`, `KeyF`, digit keys, etc.

**Fix 3c: Enable standalone instrument preview (longer-term)**

For sound without a playing track, the engine needs a "standalone instrument mode":

1. Load a minimal SPC that initializes the DSP with clean register state.
2. Pre-load a default BRR sample set (e.g., basic waveform samples — sine, sawtooth, square).
3. When the user is on the instrument view with no SPC loaded, auto-load this default instrument SPC.
4. When an SPC is loaded, use its actual BRR samples for preview.

This requires:

- A `src/audio/default-instrument.spc` binary asset (minimal SPC with basic waveforms).
- Engine modification: if noteOn is called without a loaded SPC, auto-init with the default instrument.
- UI: show a "No track loaded — using default instruments" indicator.

**DSP state initialization for standalone mode (architect review feedback):**

Even when no user track is loaded, the DSP must be initialized to a valid state for instrument preview to produce sound. The minimal initialization sequence:

1. **Instantiate the WASM module** in the worklet (send raw bytes, call `WebAssembly.instantiate`).
2. **Zero-fill the 64 KB SPC RAM** — this gives the DSP a clean memory space.
3. **Set DSP global registers** to sane defaults:
   - `FLG` (0x6C) = `0x20` — disable echo, unmute all voices, clear noise.
   - `MVOL_L` (0x0C) = `0x7F`, `MVOL_R` (0x1C) = `0x7F` — master volume max.
   - `EVOL_L` (0x2C) = `0x00`, `EVOL_R` (0x3C) = `0x00` — echo volume off.
4. **Load default BRR samples into SPC RAM** at known offsets. Write corresponding source directory entries (`DIR`, register 0x5D) pointing to those offsets.
5. **Set per-voice registers** for each voice used by the keyboard:
   - `VOL_L`, `VOL_R` = `0x7F` (max volume).
   - `ADSR1`, `ADSR2` = reasonable envelope (e.g., fast attack, medium decay/sustain, medium release).
   - `SRCN` = source directory entry index for the desired BRR sample.
6. **Start the DSP stepping** so `process()` produces output — set an internal `isStandalone` flag in the worklet so it steps the emulator even without SPC playback state.

The engine should expose a method like `audioEngine.initStandaloneInstrument()` that performs steps 1–6. This is called when the user enters the instrument view with no track loaded. When a real SPC is subsequently loaded, it overwrites all DSP state normally.

**Fix 3d: Improve sound quality (longer-term)**

- Read actual ADSR parameters from DSP state for the selected voice and display them accurately (currently hardcoded placeholder values in `InstrumentView.tsx` line 80–86).
- Allow ADSR envelope editing before note-on (write to DSP registers before triggering note).
- Expose BRR sample metadata (loop point, sample rate) in the UI.

### Testing Approach

- **Unit test**: `ShortcutManager` instrument mode bypass — verify note keys are not consumed when instrument mode is active.
- **Integration test**: toggle instrument mode, press `KeyZ`, verify note-on is fired (not consumed by mute/shuffle).
- **E2E test**: navigate to instrument view, toggle keyboard mode (backtick), press Z key, verify audio output via Web Audio API mock.
- **Cross-browser**: test MIDI initialization on Chrome, Firefox, Edge (macOS).

---

## Bug 4: Seek Bar — Subsumed by UX Phase 3

> **Update (rev 2):** Per architect review, the custom SeekBar component is **subsumed by UX Layout Redesign Phase 3**. The SeekBar is a shared component used by the TransportBar (which lives at root level, not within a feature route). Implementing it as a standalone fix in `src/features/player/` would require moving it again when TransportBar is built.

### Canonical Specification

The SeekBar specification lives in the **UX Layout Redesign plan** (`ux-layout-redesign.md` §8). That is the single source of truth for:

- Component location: `src/components/SeekBar/SeekBar.tsx`
- Props interface and visual design
- Canvas rendering approach
- Phased implementation (basic → hover preview → A-B markers → waveform)

### Key Specifications Carried Forward

The following requirements from this plan's original Bug 4 analysis and from review feedback are **incorporated into the canonical SeekBar spec** in the UX plan. They are listed here for traceability:

#### Keyboard Step Sizes (aligned across all documents)

| Input                 | Behavior                   |
| --------------------- | -------------------------- |
| **Arrow Left/Right**  | Seek ±5 seconds            |
| **Page Up/Page Down** | Seek ±15 seconds           |
| **Home/End**          | Seek to start/end of track |

Note: ±30s Shift+Arrow is a **global shortcut** (registered in `GlobalShortcuts.tsx`, works anywhere regardless of focus). It is **not** part of the SeekBar's own `onKeyDown` handler. The SeekBar's native `<input type="range">` uses `step={5}` for arrow key increments; PageUp/PageDown are intercepted in a `keydown` handler since the native input doesn't support configurable Page increments.

#### A-B Loop Marker Accessibility (MUST-FIX from accessibility review)

Each loop marker handle must be **keyboard-operable** (WCAG 2.1.1):

```html
<!-- Loop start marker -->
<div
  role="slider"
  aria-label="Loop start marker"
  aria-valuemin="{0}"
  aria-valuemax="{duration}"
  aria-valuenow="{loopRegion.startTime}"
  aria-valuetext="Loop starts at 1 minute 5 seconds"
  tabindex="{0}"
/>

<!-- Loop end marker -->
<div
  role="slider"
  aria-label="Loop end marker"
  aria-valuemin="{0}"
  aria-valuemax="{duration}"
  aria-valuenow="{loopRegion.endTime}"
  aria-valuetext="Loop ends at 2 minutes 30 seconds"
  tabindex="{0}"
/>
```

Keyboard interaction for marker handles:

- **Arrow Left/Right**: Adjust marker position ±1 second (fine adjustment).
- **Shift+Arrow Left/Right**: Adjust marker position ±5 seconds (coarse adjustment).
- Constraints: start marker ≤ end marker (clamp, don't swap).

This allows users to **adjust existing marker positions** via keyboard without needing to replay the track to the desired position. The `[` and `]` shortcuts set markers at the current playback position (a separate interaction path).

#### Loop Region Activation Announcement

When the loop region becomes active or is deactivated, the existing `aria-live="polite"` playback announcements region announces the change (see Bug 2, Step 4 above). The SeekBar itself does not manage these announcements — they are handled by the store/shortcut layer.

#### Visual Loop Region Must Not Rely Solely on Color

The loop region overlay must include a subtle pattern (hatching or dotted border) in addition to the `--spc-color-accent-subtle` background fill, ensuring users with color blindness can perceive the loop region. Marker handle lines must be visually distinct via shape/thickness, not just color.

### Dependencies

- **Depends on:** UX Phase 1 (shell grid + TransportBar) — the SeekBar lives inside TransportBar.
- **Depends on:** UX Phase 2 (DragDropOverlay + NowPlayingInfo) — TransportBar needs NowPlayingInfo wired up.
- **Blocked until:** UX Phase 3 begins.

### What Remains in This Plan

The **A-B loop units fix** (Bug 2) and the **loop activation announcements** (Bug 2, Step 4) are independent of the SeekBar component and proceed in Phase A. The current Radix `<Slider>` + `<LoopMarkers>` will work correctly once the units bug is fixed; the custom SeekBar replaces them later in UX Phase 3.

- Replaces `<Slider>` + `<LoopMarkers>` in `PlayerView.tsx`.

---

## Summary of All File Changes

| Bug                  | Files to Change                                                                                                                                                                                     | Type                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **1. Auto-advance**  | `src/hooks/useAutoAdvance.ts` (new), `src/app/routes/__root.tsx` (add hook), `src/features/player/PlayerView.tsx` (remove effect)                                                                   | Move logic            |
| **2. A-B loop**      | `src/shortcuts/GlobalShortcuts.tsx` (add samplesToSeconds conversion + loop announcements), `src/shortcuts/default-keymap.ts` (add `instrument.toggleKeyboard` binding)                             | Bug fix               |
| **3. MIDI keyboard** | `src/shortcuts/GlobalShortcuts.tsx` (wire toggleInstrumentMode), `src/shortcuts/ShortcutManager.ts` (instrument mode bypass), `src/store/types.ts` + `src/store/slices/` (add instrumentMode state) | Bug fix + enhancement |
| **4. Seek bar**      | Deferred to UX Layout Redesign Phase 3 — see `ux-layout-redesign.md` §8. Component at `src/components/SeekBar/SeekBar.tsx`.                                                                         | Subsumed              |

## Implementation Priority

1. **Bug 1 (auto-advance)** — Phase A. Simplest fix, highest user impact. No dependencies.
2. **Bug 2 (A-B loop)** — Phase A. One-line unit conversion fix for core bug, plus loop activation announcements and keymap binding cleanup.
3. **Bug 3a–b (MIDI shortcuts)** — Phase A. Wire the toggle and add ShortcutManager bypass. Medium complexity.
4. **Bug 4 (seek bar)** — Phase C (UX Phase 3). Blocked on UX Phase 1 (TransportBar) and Phase 2. See UX Layout Redesign plan for full spec.
5. **Bug 3c–d (standalone instrument + sound quality)** — Phase D+. Longer-term, requires new WASM/engine capability. See DSP initialization notes in Fix 3c above.
