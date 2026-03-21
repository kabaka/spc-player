import { describe, it, expect } from 'vitest';
import {
  findNearestCheckpoint,
  validateCheckpoint,
  type DspCheckpoint,
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
