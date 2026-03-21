/**
 * Pure utility functions for DSP checkpoint operations.
 *
 * Extracted from SpcProcessor for testability. These functions have
 * no WASM or AudioWorklet dependencies.
 *
 * @see docs/dev/plans/audio-engine-plan.md §1.1–1.6
 */

/** Serialized DSP state at a known playback position. */
export interface DspCheckpoint {
  readonly positionSamples: number;
  readonly stateData: ArrayBuffer;
}

/** Magic bytes for checkpoint header validation ("SPCS" as little-endian u32). */
const CHECKPOINT_MAGIC = 0x53504353;

/**
 * Binary search for the largest checkpoint whose positionSamples ≤ targetPosition.
 *
 * The checkpoints array must be sorted ascending by positionSamples.
 * Returns null if no checkpoint exists at or before the target.
 */
export function findNearestCheckpoint(
  checkpoints: readonly DspCheckpoint[],
  targetPosition: number,
): DspCheckpoint | null {
  if (checkpoints.length === 0) return null;

  let lo = 0;
  let hi = checkpoints.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (checkpoints[mid].positionSamples <= targetPosition) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result >= 0 ? checkpoints[result] : null;
}

/**
 * Validate a checkpoint's integrity before restoring it.
 *
 * Checks:
 * 1. stateData.byteLength matches the expected snapshot size
 * 2. First 4 bytes (little-endian u32) equal the "SPCS" magic
 */
export function validateCheckpoint(
  stateData: ArrayBuffer,
  expectedSize: number,
): boolean {
  if (stateData.byteLength !== expectedSize) return false;
  if (stateData.byteLength < 4) return false;

  const header = new DataView(stateData);
  const magic = header.getUint32(0, true);
  return magic === CHECKPOINT_MAGIC;
}
