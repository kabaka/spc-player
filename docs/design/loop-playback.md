# Loop Playback and Export Semantics

**Status:** Approved  
**Date:** 2026-03-19  
**Related ADRs:** ADR-0003 (audio pipeline), ADR-0005 (state management), ADR-0014 (resampling quality)  
**Related Design Docs:** SPC Parsing (§3.2, §6.2 `Xid6Timing`), Export Pipeline (§2.1), Worker Protocol (§2.2–2.5), Zustand Coordination (§1)

---

## 1. Overview

SPC files are frozen snapshots of the SNES audio subsystem. The SPC700 CPU runs the game's original sound driver code, which sequences notes and loops — exactly as it did on real hardware. There is no "loop point marker" in the audio stream. The SPC700 simply executes instructions continuously and the sound driver's own internal logic determines whether and when the music loops.

Because the emulator runs indefinitely, the **player** must decide when to stop. It does this using external timing metadata:

1. **xid6 timing tags** (most precise): Human-annotated intro length, loop length, end length, fade length, and loop count. These describe the structure of the music as observed by the dumper. Values are in 1/64000-second ticks, offering sub-millisecond precision.

2. **ID666 song length** (less precise): A flat duration in seconds plus fade length in milliseconds. No intro/loop separation — the player treats the entire song length as an undifferentiated block.

3. **Default duration** (fallback): When no metadata exists, the player uses configurable defaults (180 seconds + 10 seconds fade). This is a blind guess, but catches most SNES tracks.

The player does not attempt runtime loop detection via SPC700 program counter monitoring. The metadata-based approach (xid6 → ID666 → default) is more reliable and matches the behavior of established SPC players (foo_input_spc, SNESAmp, Audio Overload).

---

## 2. Loop Concepts

Three independent loop mechanisms operate at different granularities. They are orthogonal — each can be active regardless of the others.

### 2.1 Track Loop (Song-Level Looping)

Track looping refers to how many times the emulator replays the song's natural loop section before fading out. This is the primary loop mechanism for SPC playback.

#### How It Works

The SPC700 runs continuously. The player cannot "skip" a loop iteration or jump to a loop boundary — it can only control **how long** the emulator runs before applying a fade-out. Track loop count determines that total run time.

| Loop Count    | Behavior                                                                          |
| ------------- | --------------------------------------------------------------------------------- |
| 0 (play once) | Run the emulator for `intro` seconds, then fade. The loop body is not reached.    |
| 1–N           | Run for `intro + (loop × N) + end` seconds, then fade.                            |
| ∞ (infinite)  | Run indefinitely. No auto-fade. User must stop manually or advance to next track. |

**"Play once" (loop count 0) clarification:** The emulator runs for `introSeconds` total, then fades. If the intro is shorter than the actual non-repeating section of the music (possible with imprecise xid6 annotations), the track may cut off mid-phrase. This is the correct behavior — loop count 0 means "do not enter the loop body at all."

#### Loop Count Priority Cascade

The effective loop count is resolved with this priority:

| Priority | Source                    | Scope        | Persistence             |
| -------- | ------------------------- | ------------ | ----------------------- |
| 1        | User per-file override    | Single track | IndexedDB               |
| 2        | xid6 tag 0x35             | Single track | Embedded in file        |
| 3        | Global default loop count | All tracks   | Zustand `SettingsSlice` |

The global default is 2 (matching the convention used by foo_input_spc, Audio Overload, and most SPC players).

#### When xid6 Timing Is Absent

When no xid6 timing data is present, the player has no intro/loop/end structure. Loop count control is **unavailable** — the UI disables it and shows a brief explanation. The player falls back to:

- **ID666 song length present:** Play for `songLengthSeconds`, then fade for `fadeLengthMs / 1000` seconds. This is a flat duration with no loop structure.
- **No timing metadata at all:** Play for `defaultPlayDuration` seconds, then fade for `defaultFadeDuration` seconds.

In both cases, the duration can be overridden per-file (stored in IndexedDB).

### 2.2 A-B Loop (User-Defined Region)

A-B loop defines a playback region on the track's timeline that repeats continuously. This is already specified in the requirements document and the `LoopRegion` type in `PlaybackSlice`.

Key interactions with track looping:

- A-B loop operates on the **playback timeline**, not on song structure. It doesn't know about intro/loop/end boundaries.
- When both A-B loop and track loop are active, A-B loop takes precedence. Playback loops within the A-B region regardless of the track loop position. The auto-fade timer is suspended while A-B loop is active.
- Deactivating A-B loop resumes normal track loop behavior from the current position. The remaining duration is recalculated from the current position forward.

### 2.3 Playlist Repeat

Playlist repeat controls what happens **after** a track finishes (including its fade). This is already specified in `PlaylistSlice.repeatMode`:

| Mode    | Behavior                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `'off'` | Advance to next track. Stop after the last track.                                                                                               |
| `'one'` | Re-initialize the emulator from the SPC snapshot and replay from the beginning. The full track loop cycle (intro + loops + end + fade) repeats. |
| `'all'` | Advance to next track. After the last track, wrap to the first.                                                                                 |

Playlist repeat is orthogonal to track loop count. A track plays its full `intro + (loop × N) + end + fade` cycle, then playlist repeat determines the next action.

---

## 3. Duration Calculation

Duration calculation is a pure function that resolves timing metadata from all sources into a single `TrackDuration` result. This function is used by both the playback engine and the export pipeline.

### 3.1 TrackDuration Interface

```typescript
/** Resolved duration for a loaded SPC track. */
interface TrackDuration {
  /** Total play time before fade begins (seconds). */
  readonly playSeconds: number;

  /** Fade-out duration (seconds). */
  readonly fadeSeconds: number;

  /** Total duration including fade: playSeconds + fadeSeconds. */
  readonly totalSeconds: number;

  /** Whether the track has structured loop data (intro/loop/end breakdown). */
  readonly hasLoopData: boolean;

  /**
   * Source of timing data, in priority order.
   * - 'user-override': Per-file override from IndexedDB.
   * - 'xid6': Structured timing from xid6 tags.
   * - 'id666': Flat song length from ID666 header.
   * - 'default': No metadata; global defaults applied.
   */
  readonly timingSource: 'xid6' | 'id666' | 'user-override' | 'default';

  /**
   * Structural breakdown, present only when timingSource is 'xid6'.
   * Null for flat durations (ID666, default, or user-override without structure).
   */
  readonly structure: LoopStructure | null;
}

/** Breakdown of a track's timing structure (xid6-sourced). */
interface LoopStructure {
  /** Intro (non-repeating) duration in seconds. */
  readonly introSeconds: number;

  /** Single loop iteration duration in seconds. */
  readonly loopSeconds: number;

  /** Post-loop, pre-fade duration in seconds. */
  readonly endSeconds: number;

  /** Number of loop iterations used in this calculation. */
  readonly loopCount: number;
}
```

### 3.2 Calculation Function

```typescript
/** User-defined per-file overrides, persisted in IndexedDB. */
interface UserTimingOverride {
  readonly durationSeconds?: number;
  readonly fadeSeconds?: number;
  readonly loopCount?: number;
}

/** Global default timing settings from SettingsSlice. */
interface TimingDefaults {
  readonly durationSeconds: number; // default: 180
  readonly fadeSeconds: number; // default: 10
  readonly loopCount: number; // default: 2
}

/**
 * Resolve the effective duration for an SPC track.
 *
 * Priority cascade:
 *   1. User per-file override (IndexedDB)
 *   2. xid6 timing tags
 *   3. ID666 song length
 *   4. Global defaults
 *
 * @param xid6Timing   - Parsed xid6 timing data, or null if absent.
 * @param id666SongLengthSeconds - Song length from ID666 header, or null.
 * @param id666FadeLengthMs - Fade length from ID666 header in ms, or null.
 * @param userOverride  - Per-file override from IndexedDB, or null.
 * @param defaults      - Global defaults from SettingsSlice.
 */
function calculateTrackDuration(
  xid6Timing: Xid6Timing | null,
  id666SongLengthSeconds: number | null,
  id666FadeLengthMs: number | null,
  userOverride: UserTimingOverride | null,
  defaults: TimingDefaults,
): TrackDuration {
  // ── Priority 1: Full user override (user provided a flat duration) ───
  if (userOverride?.durationSeconds != null) {
    const fadeSeconds = userOverride.fadeSeconds ?? defaults.fadeSeconds;
    return {
      playSeconds: userOverride.durationSeconds,
      fadeSeconds,
      totalSeconds: userOverride.durationSeconds + fadeSeconds,
      hasLoopData: false,
      timingSource: 'user-override',
      structure: null,
    };
  }

  // ── Priority 2: xid6 structured timing ───────────────────────────────
  if (xid6Timing !== null && xid6Timing.loopLengthTicks > 0) {
    const introSeconds = xid6Timing.introLengthTicks / 64_000;
    const loopSeconds = xid6Timing.loopLengthTicks / 64_000;
    const endSeconds = xid6Timing.endLengthTicks / 64_000;

    // Loop count: user per-file override > xid6 tag > global default
    const loopCount =
      userOverride?.loopCount ?? xid6Timing.loopCount ?? defaults.loopCount;

    // Fade: user per-file override > xid6 tag > global default
    const fadeSeconds =
      userOverride?.fadeSeconds ??
      (xid6Timing.fadeLengthTicks > 0
        ? xid6Timing.fadeLengthTicks / 64_000
        : defaults.fadeSeconds);

    const playSeconds =
      loopCount === 0
        ? introSeconds
        : introSeconds + loopSeconds * loopCount + endSeconds;

    return {
      playSeconds,
      fadeSeconds,
      totalSeconds: playSeconds + fadeSeconds,
      hasLoopData: true,
      timingSource: 'xid6',
      structure: { introSeconds, loopSeconds, endSeconds, loopCount },
    };
  }

  // ── Priority 3: ID666 flat song length ───────────────────────────────
  if (id666SongLengthSeconds != null && id666SongLengthSeconds > 0) {
    const fadeSeconds =
      userOverride?.fadeSeconds ??
      (id666FadeLengthMs != null
        ? id666FadeLengthMs / 1_000
        : defaults.fadeSeconds);

    return {
      playSeconds: id666SongLengthSeconds,
      fadeSeconds,
      totalSeconds: id666SongLengthSeconds + fadeSeconds,
      hasLoopData: false,
      timingSource: 'id666',
      structure: null,
    };
  }

  // ── Priority 4: Global defaults ──────────────────────────────────────
  return {
    playSeconds: defaults.durationSeconds,
    fadeSeconds: defaults.fadeSeconds,
    totalSeconds: defaults.durationSeconds + defaults.fadeSeconds,
    hasLoopData: false,
    timingSource: 'default',
    structure: null,
  };
}
```

### 3.3 Infinite Loop Mode

When the user selects infinite loop mode, the playback engine bypasses `calculateTrackDuration` and sets `durationSamples = null`. No fade is applied. Playback continues until the user stops, skips, or toggles off infinite mode.

Infinite mode is incompatible with export (export requires a finite duration). The export dialog does not offer an infinite option.

### 3.4 Duration ↔ Samples Conversion

All worker communication uses sample counts, not seconds. The conversion is:

```typescript
const DSP_SAMPLE_RATE = 32_000;

function secondsToSamples(seconds: number): number {
  return Math.round(seconds * DSP_SAMPLE_RATE);
}

function samplesToSeconds(samples: number): number {
  return samples / DSP_SAMPLE_RATE;
}
```

These use the native DSP sample rate (32 kHz), not the output sample rate. The resampler handles rate conversion; the emulator and protocol always operate in 32 kHz sample space.

---

## 4. Playback Integration

### 4.1 Configuring the AudioWorklet

When a track is loaded, the main thread computes `TrackDuration` and sends the resolved values to the AudioWorklet. The existing `MainToWorklet.LoadSpc` message is augmented (or the worklet receives a follow-up configuration message):

```typescript
namespace MainToWorklet {
  /**
   * Configure playback duration and fade for the loaded SPC.
   * Sent after LoadSpc, or when the user changes loop count during playback.
   */
  interface SetPlaybackConfig {
    readonly type: 'set-playback-config';

    /**
     * Total samples to render before fade begins (at 32 kHz).
     * null = infinite playback (no auto-fade).
     */
    readonly durationSamples: number | null;

    /** Fade-out duration in samples (at 32 kHz). 0 = no fade. */
    readonly fadeOutSamples: number;

    /**
     * Loop count for informational/progress reporting.
     * The worklet does not use this for rendering decisions — it
     * relies on durationSamples for timing. This value is echoed
     * back in telemetry so the main thread can display "Loop 2 of 3".
     */
    readonly loopCount: number | null;

    /**
     * Structural timing for progress reporting (optional).
     * When present, the worklet can report which structural segment
     * (intro, loop N, end, fade) is currently playing.
     */
    readonly structure: {
      readonly introSamples: number;
      readonly loopSamples: number;
      readonly endSamples: number;
    } | null;
  }
}
```

### 4.2 Worklet Responsibilities

The AudioWorklet's `SpcProcessor` is responsible for:

1. **Sample counting:** Increment a rendered sample counter on each `process()` call. Reset when a new SPC is loaded or after a seek.

2. **Fade gain ramp:** When `renderedSamples >= durationSamples`, apply a linear gain ramp from 1.0 → 0.0 over `fadeOutSamples`. The gain at sample position `s` within the fade region:

   ```
   fadeProgress = (s - durationSamples) / fadeOutSamples
   gain = 1.0 - fadeProgress
   ```

   Apply `gain` to both left and right channels of the output buffer. The gain is applied **after** the DSP produces output but **before** writing to the AudioWorklet output array.

3. **Playback ended signal:** When `renderedSamples >= durationSamples + fadeOutSamples`, emit `WorkletToMain.PlaybackEnded` and fill the output buffer with silence. The main thread handles advancing to the next track (via playlist logic) or stopping.

4. **Infinite mode:** When `durationSamples === null`, skip all duration checks. The worklet renders indefinitely until it receives a `Stop` or `Pause` message.

### 4.3 Dynamic Loop Count Updates

The user can change the loop count during playback (e.g., decide to listen to more loops, or switch to infinite). The `SetPlaybackConfig` message supports this:

- **Increasing loop count:** The new `durationSamples` is larger. If the worklet has already entered the fade region, it cancels the fade and resumes full-volume playback.
- **Decreasing loop count:** The new `durationSamples` may be less than the current render position. If so, the worklet begins fading immediately from the current position.
- **Switching to infinite:** `durationSamples` becomes `null`. Any active fade is cancelled; playback continues at full volume.
- **Switching from infinite to finite:** The worklet receives a new `durationSamples`. If the current position is already past it, begin fading immediately.

### 4.4 Telemetry Extensions

The existing `WorkletToMain.Telemetry` message is extended with loop-aware progress:

```typescript
namespace WorkletToMain {
  interface Telemetry {
    // ... existing fields (positionSamples, vuLeft, vuRight, etc.) ...

    /**
     * Current structural segment, when loop structure is known.
     * Null when no xid6 timing is available.
     */
    readonly segment: PlaybackSegment | null;
  }
}

/** Identifies the current position within the track's loop structure. */
interface PlaybackSegment {
  /** Which structural part is currently playing. */
  readonly phase: 'intro' | 'loop' | 'end' | 'fade';

  /**
   * Current loop iteration (1-based). Only meaningful when phase is 'loop'.
   * null during intro, end, or fade.
   */
  readonly currentLoop: number | null;

  /** Total configured loop count. null for infinite mode. */
  readonly totalLoops: number | null;
}
```

### 4.5 A-B Loop Interaction

A-B loop is enforced on the main thread via seek commands. When the worklet's telemetry reports `positionSamples >= loopRegion.endTime * DSP_SAMPLE_RATE`, the main thread sends a `Seek` message to jump back to `loopRegion.startTime * DSP_SAMPLE_RATE`.

While A-B loop is active:

- The auto-fade timer is paused. The worklet's `durationSamples` check is effectively bypassed because the main thread keeps seeking before the duration is reached.
- The `PlaybackEnded` signal is not emitted (the track never reaches its natural end).
- When A-B loop is deactivated, normal duration tracking resumes. If the current position has already exceeded `durationSamples`, fade begins immediately.

---

## 5. Export Integration

### 5.1 Duration Computation for Export

The existing `MainToExportWorker.StartExport` message already includes `durationSamples` and `fadeOutSamples`. The main thread computes these from `calculateTrackDuration` before sending:

```typescript
function buildExportDuration(trackDuration: TrackDuration): {
  durationSamples: number;
  fadeOutSamples: number;
} {
  return {
    durationSamples: secondsToSamples(trackDuration.playSeconds),
    fadeOutSamples: secondsToSamples(trackDuration.fadeSeconds),
  };
}
```

The export worker renders exactly `durationSamples + fadeOutSamples` samples. The fade gain ramp is baked into the PCM data before encoding — unlike playback, where the fade is applied post-render.

### 5.2 Export Dialog Loop Controls

The export dialog adapts its controls based on the timing source:

#### When xid6 Timing Is Available (`hasLoopData === true`)

| Field              | Default Value               | Editable            | Source          |
| ------------------ | --------------------------- | ------------------- | --------------- |
| Intro duration     | `structure.introSeconds`    | Read-only           | xid6            |
| Loop duration      | `structure.loopSeconds`     | Read-only           | xid6            |
| Loop count         | `structure.loopCount`       | Yes (spinner, 0–99) | xid6 / settings |
| End duration       | `structure.endSeconds`      | Read-only           | xid6            |
| Fade duration      | `trackDuration.fadeSeconds` | Yes                 | xid6 / settings |
| **Total duration** | Computed                    | Read-only (derived) | Computed        |

Total duration updates live as the user changes loop count or fade duration:

```
total = intro + (loop × loopCount) + end + fade
```

#### When xid6 Timing Is Absent (`hasLoopData === false`)

| Field          | Default Value               | Editable           | Source          |
| -------------- | --------------------------- | ------------------ | --------------- |
| Total duration | `trackDuration.playSeconds` | Yes (number input) | ID666 / default |
| Fade duration  | `trackDuration.fadeSeconds` | Yes                | ID666 / default |
| Loop count     | —                           | Disabled           | N/A             |

The loop count control is disabled with a tooltip: "Loop count requires xid6 timing metadata."

### 5.3 Export and Infinite Mode

Export always produces a finite file. The export dialog does not offer an infinite loop option. If the user is in infinite playback mode when opening the export dialog, the dialog pre-fills with the last finite loop count (from xid6, settings, or per-file override).

---

## 6. Settings and Persistence

### 6.1 Global Defaults (SettingsSlice)

These settings are stored in the Zustand `SettingsSlice` and persisted via the store's `persist` middleware:

```typescript
interface SettingsSlice {
  // ... existing settings ...

  /** Default loop count when xid6 timing is present but tag 0x35 is absent. */
  defaultLoopCount: number; // default: 2, range: 0–99

  /** Default play duration for tracks without any timing metadata (seconds). */
  defaultPlayDuration: number; // default: 180, range: 10–3600

  /** Default fade-out duration (seconds). */
  defaultFadeDuration: number; // default: 10, range: 0–60

  // Actions
  setDefaultLoopCount: (count: number) => void;
  setDefaultPlayDuration: (seconds: number) => void;
  setDefaultFadeDuration: (seconds: number) => void;
}
```

### 6.2 Per-File Overrides (IndexedDB)

Per-file timing overrides persist across sessions and are not stored in Zustand (they are too numerous and infrequently accessed to justify reactive state). They are keyed by the track's SHA-256 content hash (the same `trackId` used elsewhere).

```typescript
/** Persisted in IndexedDB, keyed by trackId (SHA-256 hash). */
interface PerFileTimingOverride {
  readonly trackId: string;

  /** Custom loop count. Null means "use xid6 tag or global default." */
  readonly loopCount: number | null;

  /** Custom total play duration (seconds). Null means "use metadata or default." */
  readonly durationSeconds: number | null;

  /** Custom fade duration (seconds). Null means "use metadata or default." */
  readonly fadeSeconds: number | null;

  /** Timestamp of last modification (for potential UI display or cleanup). */
  readonly updatedAt: number;
}
```

The `calculateTrackDuration` function receives the resolved `UserTimingOverride` from IndexedDB. The orchestration layer is responsible for loading the override before computing the duration.

### 6.3 Override Flow

```
User changes loop count in transport controls
  → Write to IndexedDB (PerFileTimingOverride)
  → Recalculate TrackDuration via calculateTrackDuration()
  → Update PlaybackSlice.trackDuration
  → Send SetPlaybackConfig to AudioWorklet with new durationSamples
```

---

## 7. State Changes (Zustand)

### 7.1 PlaybackSlice Additions

```typescript
interface PlaybackSlice {
  // ... existing fields (playbackStatus, activeTrackId, position, etc.) ...

  /**
   * Current track loop count. Controls how many loop iterations play
   * before fade-out. 'infinite' disables auto-fade.
   *
   * Only meaningful when the loaded track has xid6 loop data.
   * When no loop data exists, this value is ignored by the worklet.
   */
  loopCount: number | 'infinite';

  /**
   * Resolved duration for the active track.
   * Computed via calculateTrackDuration() when a track is loaded.
   * Null when no track is loaded.
   */
  trackDuration: TrackDuration | null;

  // ... existing A-B loop fields (loopRegion) remain unchanged ...

  // Actions
  setLoopCount: (count: number | 'infinite') => void;
  setTrackDuration: (duration: TrackDuration | null) => void;
}
```

### 7.2 SettingsSlice Additions

As defined in §6.1: `defaultLoopCount`, `defaultPlayDuration`, `defaultFadeDuration`, and their setter actions.

### 7.3 Orchestration Impact

The `loadFile` and `playTrackAtIndex` orchestration actions are updated to:

1. Load per-file timing overrides from IndexedDB.
2. Call `calculateTrackDuration()` with the parsed metadata, override, and global defaults.
3. Set `PlaybackSlice.trackDuration`.
4. Set `PlaybackSlice.loopCount` to the resolved loop count (from override, xid6, or default).
5. Send `SetPlaybackConfig` to the AudioWorklet.

When the user changes loop count during playback:

1. Update `PlaybackSlice.loopCount`.
2. If applicable, write the new per-file override to IndexedDB.
3. Recalculate `TrackDuration` and update `PlaybackSlice.trackDuration`.
4. Send `SetPlaybackConfig` to the AudioWorklet with the new `durationSamples`.

---

## 8. UI Implications

This section notes UI requirements that arise from loop semantics. Full UI specifications are deferred to dedicated design docs.

### 8.1 Loop Count Control

- Location: player transport area, near the existing repeat/shuffle controls.
- Appearance: a compact spinner or dropdown showing the current loop count (e.g., "×2", "×3", "∞").
- Disabled state: when the active track has no xid6 loop data (`trackDuration.hasLoopData === false`). Show a tooltip explaining why.
- Infinite toggle: a dedicated button or a special entry in the dropdown (e.g., "∞" or "Loop forever").

### 8.2 Seek Bar Segmentation

When xid6 timing is available, the seek bar can display structural segments:

```
|--intro--|--loop 1--|--loop 2--|--end--|--fade--|
```

Each segment is a proportionally-sized visual region. The current playback position indicator moves through these segments, and the `PlaybackSegment` from telemetry identifies which segment is active.

When no loop data is available, the seek bar displays a single undivided track duration.

### 8.3 Export Dialog

As specified in §5.2: adaptive controls based on `hasLoopData`, with loop count editable only when structural timing exists.

### 8.4 Metadata Display

The metadata panel should show the timing source (`timingSource` from `TrackDuration`) so users understand why a track plays for a specific duration. When xid6 timing is present, show the intro/loop/end/fade breakdown.

---

## 9. Edge Cases

### 9.1 xid6 Timing with loopLengthTicks = 0

Some xid6 blocks include intro length but a loop length of 0 (e.g., jingles or sound effects that don't loop). In this case, `hasLoopData` is `false` — the track is treated as non-looping. Play duration = `introLengthTicks / 64000 + endLengthTicks / 64000`.

### 9.2 Extremely Large Loop Counts

The user could set loop count to 99 on a track with a 2-minute loop, producing a 198-minute play duration. This is allowed for playback (the user can stop at any time). For export, the dialog shows the computed total duration prominently so the user is aware of the file size implications.

### 9.3 Seek During Fade

If the user seeks to a position before `durationSamples` while the track is fading, the fade cancels and playback resumes at full volume. The fade will re-trigger when playback again reaches `durationSamples`.

### 9.4 Speed Changes

Playback speed affects the real-time rate of sample consumption but not the total sample count. A 2× speed track still renders the same number of DSP samples — it just plays in half the wall-clock time. `durationSamples` and `fadeOutSamples` are always in terms of DSP-output samples, not wall-clock time.

### 9.5 Re-initialization After Track Repeat

When playlist repeat mode is `'one'`, the emulator is re-initialized from the original SPC snapshot after fade completes. This resets all SPC700 CPU state, DSP registers, and RAM to the snapshot values. The track plays from the beginning with the full loop cycle again, not from a loop boundary.
