import { describe, expect, it } from 'vitest';

import type { Xid6Timing } from '@/core/spc-types';
import type { TimingDefaults, UserTimingOverride } from '@/core/track-duration';
import {
  calculateTrackDuration,
  DSP_SAMPLE_RATE,
  samplesToSeconds,
  secondsToSamples,
} from '@/core/track-duration';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DEFAULTS: TimingDefaults = {
  durationSeconds: 180,
  fadeSeconds: 10,
  loopCount: 2,
};

/** Build an Xid6Timing object with sensible defaults. */
function makeXid6(overrides: Partial<Xid6Timing> = {}): Xid6Timing {
  return {
    introLengthTicks: 64_000 * 10, // 10 s
    loopLengthTicks: 64_000 * 30, // 30 s
    endLengthTicks: 64_000 * 2, //  2 s
    fadeLengthTicks: 64_000 * 5, //  5 s
    loopCount: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// secondsToSamples / samplesToSeconds
// ---------------------------------------------------------------------------

describe('secondsToSamples', () => {
  it('converts seconds to samples at 32 kHz', () => {
    expect(secondsToSamples(1)).toBe(32_000);
    expect(secondsToSamples(0)).toBe(0);
    expect(secondsToSamples(2.5)).toBe(80_000);
  });

  it('rounds to the nearest sample', () => {
    // 0.00001 s × 32000 = 0.32 → rounds to 0
    expect(secondsToSamples(0.00001)).toBe(0);
    // 0.5 / 32000 = 0.000015625 → 0.5 samples → rounds to 1 (Math.round)
    expect(secondsToSamples(0.5 / DSP_SAMPLE_RATE)).toBe(1);
  });
});

describe('samplesToSeconds', () => {
  it('converts samples to seconds at 32 kHz', () => {
    expect(samplesToSeconds(32_000)).toBe(1);
    expect(samplesToSeconds(0)).toBe(0);
    expect(samplesToSeconds(64_000)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// calculateTrackDuration
// ---------------------------------------------------------------------------

describe('calculateTrackDuration', () => {
  // ── xid6 structured timing ─────────────────────────────────────────

  describe('xid6 structured timing', () => {
    it('computes correct play + fade with explicit loop count', () => {
      const xid6 = makeXid6({ loopCount: 3 });
      const result = calculateTrackDuration(xid6, null, null, null, DEFAULTS);

      // playSeconds = intro(10) + loop(30)*3 + end(2) = 102
      expect(result.playSeconds).toBe(102);
      expect(result.fadeSeconds).toBe(5); // from xid6 fadeLengthTicks
      expect(result.totalSeconds).toBe(107);
      expect(result.hasLoopData).toBe(true);
      expect(result.timingSource).toBe('xid6');
      expect(result.structure).toEqual({
        introSeconds: 10,
        loopSeconds: 30,
        endSeconds: 2,
        loopCount: 3,
      });
    });

    it('truncates to intro only when loop count is 0 (play once)', () => {
      const xid6 = makeXid6({ loopCount: 0 });
      const result = calculateTrackDuration(xid6, null, null, null, DEFAULTS);

      // playSeconds = intro only = 10
      expect(result.playSeconds).toBe(10);
      expect(result.fadeSeconds).toBe(5);
      expect(result.totalSeconds).toBe(15);
      expect(result.timingSource).toBe('xid6');
      expect(result.structure).toEqual({
        introSeconds: 10,
        loopSeconds: 30,
        endSeconds: 2,
        loopCount: 0,
      });
    });

    it('uses defaults.loopCount when xid6 loopCount is null', () => {
      const xid6 = makeXid6({ loopCount: null });
      const result = calculateTrackDuration(xid6, null, null, null, DEFAULTS);

      // loopCount falls through to defaults.loopCount = 2
      // playSeconds = 10 + 30*2 + 2 = 72
      expect(result.playSeconds).toBe(72);
      expect(result.structure?.loopCount).toBe(2);
      expect(result.timingSource).toBe('xid6');
    });

    it('uses defaults.fadeSeconds when xid6 fadeLengthTicks is 0', () => {
      const xid6 = makeXid6({ fadeLengthTicks: 0, loopCount: 1 });
      const result = calculateTrackDuration(xid6, null, null, null, DEFAULTS);

      expect(result.fadeSeconds).toBe(DEFAULTS.fadeSeconds);
      // playSeconds = 10 + 30*1 + 2 = 42
      expect(result.playSeconds).toBe(42);
    });

    it('treats loopLengthTicks = 0 as non-looping (falls through to ID666)', () => {
      const xid6 = makeXid6({ loopLengthTicks: 0 });
      const result = calculateTrackDuration(xid6, 120, 5000, null, DEFAULTS);

      expect(result.timingSource).toBe('id666');
      expect(result.playSeconds).toBe(120);
      expect(result.hasLoopData).toBe(false);
    });

    it('treats loopLengthTicks = 0 without ID666 as default', () => {
      const xid6 = makeXid6({ loopLengthTicks: 0 });
      const result = calculateTrackDuration(xid6, null, null, null, DEFAULTS);

      expect(result.timingSource).toBe('default');
      expect(result.playSeconds).toBe(180);
    });
  });

  // ── ID666 flat duration ─────────────────────────────────────────────

  describe('ID666 flat duration', () => {
    it('uses ID666 song length and fade', () => {
      const result = calculateTrackDuration(null, 120, 5000, null, DEFAULTS);

      expect(result.playSeconds).toBe(120);
      expect(result.fadeSeconds).toBe(5); // 5000 ms → 5 s
      expect(result.totalSeconds).toBe(125);
      expect(result.hasLoopData).toBe(false);
      expect(result.timingSource).toBe('id666');
      expect(result.structure).toBeNull();
    });

    it('uses defaults.fadeSeconds when ID666 fade is null', () => {
      const result = calculateTrackDuration(null, 90, null, null, DEFAULTS);

      expect(result.fadeSeconds).toBe(DEFAULTS.fadeSeconds);
      expect(result.playSeconds).toBe(90);
      expect(result.timingSource).toBe('id666');
    });

    it('ignores ID666 song length of 0 (falls through to default)', () => {
      const result = calculateTrackDuration(null, 0, 5000, null, DEFAULTS);

      expect(result.timingSource).toBe('default');
    });
  });

  // ── Global defaults ─────────────────────────────────────────────────

  describe('global defaults', () => {
    it('uses global defaults when no metadata is present', () => {
      const result = calculateTrackDuration(null, null, null, null, DEFAULTS);

      expect(result.playSeconds).toBe(180);
      expect(result.fadeSeconds).toBe(10);
      expect(result.totalSeconds).toBe(190);
      expect(result.hasLoopData).toBe(false);
      expect(result.timingSource).toBe('default');
      expect(result.structure).toBeNull();
    });
  });

  // ── User per-file override ──────────────────────────────────────────

  describe('user per-file override', () => {
    it('overrides all sources when durationSeconds is set', () => {
      const xid6 = makeXid6();
      const override: UserTimingOverride = {
        durationSeconds: 60,
        fadeSeconds: 3,
      };
      const result = calculateTrackDuration(
        xid6,
        120,
        5000,
        override,
        DEFAULTS,
      );

      expect(result.playSeconds).toBe(60);
      expect(result.fadeSeconds).toBe(3);
      expect(result.totalSeconds).toBe(63);
      expect(result.timingSource).toBe('user-override');
      expect(result.hasLoopData).toBe(false);
      expect(result.structure).toBeNull();
    });

    it('uses defaults.fadeSeconds when override has duration but no fade', () => {
      const override: UserTimingOverride = { durationSeconds: 45 };
      const result = calculateTrackDuration(
        null,
        null,
        null,
        override,
        DEFAULTS,
      );

      expect(result.playSeconds).toBe(45);
      expect(result.fadeSeconds).toBe(DEFAULTS.fadeSeconds);
      expect(result.timingSource).toBe('user-override');
    });

    it('overrides loopCount only (not duration) with xid6 → uses xid6 structure', () => {
      const xid6 = makeXid6({ loopCount: 2 });
      const override: UserTimingOverride = { loopCount: 5 };
      const result = calculateTrackDuration(
        xid6,
        null,
        null,
        override,
        DEFAULTS,
      );

      // playSeconds = 10 + 30*5 + 2 = 162
      expect(result.playSeconds).toBe(162);
      expect(result.timingSource).toBe('xid6');
      expect(result.structure?.loopCount).toBe(5);
    });

    it('overrides fadeSeconds only with ID666 → uses ID666 duration', () => {
      const override: UserTimingOverride = { fadeSeconds: 7 };
      const result = calculateTrackDuration(
        null,
        100,
        5000,
        override,
        DEFAULTS,
      );

      expect(result.playSeconds).toBe(100);
      expect(result.fadeSeconds).toBe(7); // overridden, not 5 from ID666
      expect(result.totalSeconds).toBe(107);
      expect(result.timingSource).toBe('id666');
    });

    it('overrides fadeSeconds only with xid6 → uses overridden fade', () => {
      const xid6 = makeXid6({ fadeLengthTicks: 64_000 * 5, loopCount: 1 });
      const override: UserTimingOverride = { fadeSeconds: 8 };
      const result = calculateTrackDuration(
        xid6,
        null,
        null,
        override,
        DEFAULTS,
      );

      expect(result.fadeSeconds).toBe(8);
      expect(result.timingSource).toBe('xid6');
      // playSeconds = 10 + 30*1 + 2 = 42
      expect(result.playSeconds).toBe(42);
    });
  });
});
