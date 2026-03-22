import { describe, expect, it } from 'vitest';

import {
  type DspCheckpoint,
  findNearestCheckpoint,
  validateCheckpoint,
} from './checkpoint-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a DspCheckpoint with the given position and optional stateData. */
function makeCheckpoint(
  positionSamples: number,
  stateData?: ArrayBuffer,
): DspCheckpoint {
  return {
    positionSamples,
    stateData: stateData ?? new ArrayBuffer(0),
  };
}

/**
 * Build a valid checkpoint stateData buffer with the correct "SPCS" magic header.
 * Fills remaining bytes with zeros.
 */
function makeValidState(size: number): ArrayBuffer {
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  // "SPCS" magic in little-endian
  view.setUint32(0, 0x53504353, true);
  return buf;
}

// ---------------------------------------------------------------------------
// findNearestCheckpoint
// ---------------------------------------------------------------------------

describe('findNearestCheckpoint', () => {
  it('returns null for an empty array', () => {
    expect(findNearestCheckpoint([], 100)).toBeNull();
  });

  it('returns the checkpoint at an exact match', () => {
    const cps = [makeCheckpoint(100), makeCheckpoint(200), makeCheckpoint(300)];
    const result = findNearestCheckpoint(cps, 200);
    expect(result).toBe(cps[1]);
  });

  it('returns the nearest prior checkpoint when target is between checkpoints', () => {
    const cps = [makeCheckpoint(100), makeCheckpoint(200), makeCheckpoint(300)];
    const result = findNearestCheckpoint(cps, 250);
    expect(result).toBe(cps[1]);
  });

  it('returns null when target is before the first checkpoint', () => {
    const cps = [makeCheckpoint(100), makeCheckpoint(200)];
    expect(findNearestCheckpoint(cps, 50)).toBeNull();
  });

  it('returns the last checkpoint when target is after the last', () => {
    const cps = [makeCheckpoint(100), makeCheckpoint(200), makeCheckpoint(300)];
    const result = findNearestCheckpoint(cps, 999);
    expect(result).toBe(cps[2]);
  });

  it('returns the single checkpoint when array has one entry and target matches', () => {
    const cps = [makeCheckpoint(500)];
    expect(findNearestCheckpoint(cps, 500)).toBe(cps[0]);
  });

  it('returns the single checkpoint when target is after it', () => {
    const cps = [makeCheckpoint(500)];
    expect(findNearestCheckpoint(cps, 1000)).toBe(cps[0]);
  });

  it('returns null when single checkpoint is after target', () => {
    const cps = [makeCheckpoint(500)];
    expect(findNearestCheckpoint(cps, 100)).toBeNull();
  });

  it('returns the first checkpoint when target equals the first position', () => {
    const cps = [makeCheckpoint(100), makeCheckpoint(200), makeCheckpoint(300)];
    expect(findNearestCheckpoint(cps, 100)).toBe(cps[0]);
  });

  it('handles target at position 0 with checkpoints starting at 0', () => {
    const cps = [makeCheckpoint(0), makeCheckpoint(100)];
    expect(findNearestCheckpoint(cps, 0)).toBe(cps[0]);
  });
});

// ---------------------------------------------------------------------------
// validateCheckpoint
// ---------------------------------------------------------------------------

describe('validateCheckpoint', () => {
  const EXPECTED_SIZE = 65_688;

  it('returns true for valid checkpoint data', () => {
    const state = makeValidState(EXPECTED_SIZE);
    expect(validateCheckpoint(state, EXPECTED_SIZE)).toBe(true);
  });

  it('returns false when size does not match', () => {
    const state = makeValidState(1024);
    expect(validateCheckpoint(state, EXPECTED_SIZE)).toBe(false);
  });

  it('returns false when magic bytes are wrong', () => {
    const state = new ArrayBuffer(EXPECTED_SIZE);
    const view = new DataView(state);
    view.setUint32(0, 0xdeadbeef, true);
    expect(validateCheckpoint(state, EXPECTED_SIZE)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    const state = new ArrayBuffer(0);
    expect(validateCheckpoint(state, EXPECTED_SIZE)).toBe(false);
  });

  it('returns false when buffer is too small for magic header', () => {
    const state = new ArrayBuffer(2);
    expect(validateCheckpoint(state, 2)).toBe(false);
  });

  it('returns true when size is exactly 4 bytes with correct magic', () => {
    const state = makeValidState(4);
    expect(validateCheckpoint(state, 4)).toBe(true);
  });

  it('returns false when magic is correct but size is wrong', () => {
    const state = makeValidState(EXPECTED_SIZE);
    expect(validateCheckpoint(state, EXPECTED_SIZE + 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forward seek checkpoint optimization (C10)
// ---------------------------------------------------------------------------

describe('forward seek checkpoint selection', () => {
  const DSP_SAMPLE_RATE = 32_000;
  const FORWARD_CHECKPOINT_THRESHOLD = DSP_SAMPLE_RATE; // 1 second

  /**
   * Simulate the forward seek optimization logic from spc-worklet.ts handleSeek.
   * Returns the checkpoint that would be used, or null if rendering from current position.
   */
  function selectForwardSeekCheckpoint(
    checkpoints: readonly DspCheckpoint[],
    currentPosition: number,
    targetPosition: number,
    snapshotSize: number,
  ): DspCheckpoint | null {
    const samplesWithoutCheckpoint = targetPosition - currentPosition;
    if (samplesWithoutCheckpoint <= FORWARD_CHECKPOINT_THRESHOLD) return null;

    const checkpoint = findNearestCheckpoint(checkpoints, targetPosition);
    if (!checkpoint) return null;
    if (checkpoint.positionSamples <= currentPosition) return null;
    if (!validateCheckpoint(checkpoint.stateData, snapshotSize)) return null;

    const samplesWithCheckpoint = targetPosition - checkpoint.positionSamples;
    const samplesSaved = samplesWithoutCheckpoint - samplesWithCheckpoint;
    if (samplesSaved <= FORWARD_CHECKPOINT_THRESHOLD) return null;

    return checkpoint;
  }

  const SNAP_SIZE = 65_688;

  // Checkpoints at 0s, 5s, 10s, 15s (in DSP samples)
  const checkpoints = [
    makeCheckpoint(0 * DSP_SAMPLE_RATE, makeValidState(SNAP_SIZE)),
    makeCheckpoint(5 * DSP_SAMPLE_RATE, makeValidState(SNAP_SIZE)),
    makeCheckpoint(10 * DSP_SAMPLE_RATE, makeValidState(SNAP_SIZE)),
    makeCheckpoint(15 * DSP_SAMPLE_RATE, makeValidState(SNAP_SIZE)),
  ];

  it('uses 10s checkpoint when seeking from 2s to 14s', () => {
    const current = 2 * DSP_SAMPLE_RATE;
    const target = 14 * DSP_SAMPLE_RATE;
    const result = selectForwardSeekCheckpoint(
      checkpoints,
      current,
      target,
      SNAP_SIZE,
    );
    // 10s checkpoint is the nearest before 14s and ahead of 2s
    expect(result).toBe(checkpoints[2]);
    expect(result?.positionSamples).toBe(10 * DSP_SAMPLE_RATE);
  });

  it('does not use a checkpoint for small forward jumps (< 1s)', () => {
    const current = 9 * DSP_SAMPLE_RATE;
    const target = 9.5 * DSP_SAMPLE_RATE;
    const result = selectForwardSeekCheckpoint(
      checkpoints,
      current,
      target,
      SNAP_SIZE,
    );
    expect(result).toBeNull();
  });

  it('does not use a checkpoint when savings < threshold', () => {
    // Current at 9s, target at 10.5s — the 10s checkpoint only saves 0.5s
    const current = 9 * DSP_SAMPLE_RATE;
    const target = 10.5 * DSP_SAMPLE_RATE;
    const result = selectForwardSeekCheckpoint(
      checkpoints,
      current,
      target,
      SNAP_SIZE,
    );
    expect(result).toBeNull();
  });

  it('uses 15s checkpoint when seeking from 2s to 60s', () => {
    const current = 2 * DSP_SAMPLE_RATE;
    const target = 60 * DSP_SAMPLE_RATE;
    const result = selectForwardSeekCheckpoint(
      checkpoints,
      current,
      target,
      SNAP_SIZE,
    );
    // 15s is the nearest checkpoint before 60s
    expect(result).toBe(checkpoints[3]);
  });

  it('returns null when no checkpoints exist', () => {
    const result = selectForwardSeekCheckpoint(
      [],
      2 * DSP_SAMPLE_RATE,
      14 * DSP_SAMPLE_RATE,
      SNAP_SIZE,
    );
    expect(result).toBeNull();
  });

  it('returns null when all checkpoints are behind current position', () => {
    const current = 20 * DSP_SAMPLE_RATE;
    const target = 30 * DSP_SAMPLE_RATE;
    const result = selectForwardSeekCheckpoint(
      checkpoints,
      current,
      target,
      SNAP_SIZE,
    );
    // 15s checkpoint is behind current (20s), so no benefit
    expect(result).toBeNull();
  });
});
