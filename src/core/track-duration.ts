import type { TrackDuration } from '@/store/types';
import type { Xid6Timing } from '@/core/spc-types';

// ── Constants ─────────────────────────────────────────────────────────

/** Native S-DSP sample rate in Hz. All emulator timing uses this rate. */
export const DSP_SAMPLE_RATE = 32_000;

// ── Conversion helpers ────────────────────────────────────────────────

/** Convert a duration in seconds to sample count at the native DSP rate. */
export function secondsToSamples(seconds: number): number {
  return Math.round(seconds * DSP_SAMPLE_RATE);
}

/** Convert a sample count at the native DSP rate to seconds. */
export function samplesToSeconds(samples: number): number {
  return samples / DSP_SAMPLE_RATE;
}

// ── Timing override / defaults ────────────────────────────────────────

/** User-defined per-file overrides, persisted in IndexedDB. */
export interface UserTimingOverride {
  readonly durationSeconds?: number;
  readonly fadeSeconds?: number;
  readonly loopCount?: number;
}

/** Global default timing settings from SettingsSlice. */
export interface TimingDefaults {
  readonly durationSeconds: number; // default: 180
  readonly fadeSeconds: number; // default: 10
  readonly loopCount: number; // default: 2
}

// ── Tick-to-second conversion ─────────────────────────────────────────

const TICKS_PER_SECOND = 64_000;

// ── Duration calculation ──────────────────────────────────────────────

/**
 * Resolve the effective duration for an SPC track.
 *
 * Priority cascade:
 *   1. User per-file override (durationSeconds) → flat duration
 *   2. xid6 timing tags (loopLengthTicks > 0) → structured timing
 *   3. ID666 song length (> 0) → flat duration
 *   4. Global defaults
 */
export function calculateTrackDuration(
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
    const introSeconds = xid6Timing.introLengthTicks / TICKS_PER_SECOND;
    const loopSeconds = xid6Timing.loopLengthTicks / TICKS_PER_SECOND;
    const endSeconds = xid6Timing.endLengthTicks / TICKS_PER_SECOND;

    // Loop count: user per-file override > xid6 tag > global default
    const loopCount =
      userOverride?.loopCount ?? xid6Timing.loopCount ?? defaults.loopCount;

    // Fade: user per-file override > xid6 tag > global default
    const fadeSeconds =
      userOverride?.fadeSeconds ??
      (xid6Timing.fadeLengthTicks > 0
        ? xid6Timing.fadeLengthTicks / TICKS_PER_SECOND
        : defaults.fadeSeconds);

    // loopCount 0 → play intro only (do not enter loop body)
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
