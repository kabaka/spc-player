/**
 * Checkpoint pre-compute worker — offline DSP rendering for seek checkpoints.
 *
 * This is a module worker (not AudioWorklet). It instantiates its own WASM
 * DSP emulator, renders forward at maximum CPU speed (no audio output),
 * and captures `dsp_snapshot()` at regular intervals. The resulting
 * checkpoints are transferred to the main thread for forwarding to the
 * AudioWorklet, enabling near-instant seeking.
 *
 * The worker self-terminates after completing or encountering an error.
 *
 * @see docs/dev/plans/audio-engine-plan.md §1.9
 * @see docs/adr/0003-audio-pipeline-architecture.md
 */

import type { DspExports } from '../audio/dsp-exports';

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/** Main → Worker: begin checkpoint computation. */
export interface CheckpointWorkerInit {
  readonly type: 'compute';
  readonly wasmBytes: ArrayBuffer;
  readonly spcData: ArrayBuffer;
  /** Interval in DSP samples between checkpoint captures. */
  readonly intervalSamples: number;
  /** Maximum number of checkpoints to produce. */
  readonly maxCheckpoints: number;
}

/** Worker → Main: completed checkpoints. */
export interface CheckpointWorkerResult {
  readonly type: 'checkpoints';
  readonly checkpoints: {
    positionSamples: number;
    stateData: ArrayBuffer;
  }[];
}

/** Worker → Main: progress update. */
export interface CheckpointWorkerProgress {
  readonly type: 'progress';
  readonly fraction: number;
  readonly checkpointCount: number;
}

/** Worker → Main: fatal error. */
export interface CheckpointWorkerError {
  readonly type: 'error';
  readonly message: string;
}

export type CheckpointWorkerMessage =
  | CheckpointWorkerResult
  | CheckpointWorkerProgress
  | CheckpointWorkerError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** DSP frames rendered per chunk — matches MAX_RENDER_FRAMES in WASM. */
const CHUNK_FRAMES = 4096;

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<CheckpointWorkerInit>) => {
  const msg = event.data;
  if (msg.type !== 'compute') return;

  try {
    // 1. Compile + instantiate WASM from raw bytes.
    //    The Rust crate targets wasm32-unknown-unknown with panic=abort,
    //    producing no env imports — empty importObject is correct.
    const { instance } = await WebAssembly.instantiate(msg.wasmBytes, {});
    // WASM exports are untyped at the boundary — cast is unavoidable.
    const wasm = instance.exports as unknown as DspExports;

    // 2. Load SPC data into the WASM instance.
    const spcBytes = new Uint8Array(msg.spcData);
    const spcPtr = wasm.wasm_alloc(spcBytes.byteLength);
    if (spcPtr === 0) {
      postError('Failed to allocate WASM memory for SPC data');
      return;
    }

    new Uint8Array(wasm.memory.buffer, spcPtr, spcBytes.byteLength).set(
      spcBytes,
    );
    const initResult = wasm.dsp_init(spcPtr, spcBytes.byteLength);
    wasm.wasm_dealloc(spcPtr, spcBytes.byteLength);

    if (initResult < 0) {
      postError(`dsp_init returned error code ${initResult}`);
      return;
    }

    // 3. Render forward at maximum speed, capturing snapshots at each interval.
    const checkpoints: {
      positionSamples: number;
      stateData: ArrayBuffer;
    }[] = [];

    const outputPtr = wasm.dsp_get_output_ptr();
    let samplesRendered = 0;
    let nextCapture = msg.intervalSamples;
    const maxSamples =
      msg.intervalSamples * msg.maxCheckpoints + msg.intervalSamples;

    // Progress reporting: send at most ~1 Hz. Track time to throttle.
    let lastProgressTime = Date.now();

    while (
      samplesRendered < maxSamples &&
      checkpoints.length < msg.maxCheckpoints
    ) {
      const toRender = Math.min(CHUNK_FRAMES, maxSamples - samplesRendered);
      const result = wasm.dsp_render(outputPtr, toRender);
      if (result < 0) {
        // Render failure — stop early but return whatever we have so far.
        break;
      }

      samplesRendered += toRender;

      if (samplesRendered >= nextCapture) {
        const snapshotSize = wasm.dsp_snapshot_size();
        const snapPtr = wasm.wasm_alloc(snapshotSize);
        if (snapPtr === 0) {
          // Allocation failure — stop capturing but keep existing checkpoints.
          break;
        }

        const written = wasm.dsp_snapshot(snapPtr);
        if (written > 0) {
          // Copy snapshot out of WASM linear memory into a standalone ArrayBuffer.
          const stateData = new ArrayBuffer(written);
          new Uint8Array(stateData).set(
            new Uint8Array(wasm.memory.buffer, snapPtr, written),
          );
          checkpoints.push({ positionSamples: samplesRendered, stateData });
        }
        wasm.wasm_dealloc(snapPtr, snapshotSize);
        nextCapture += msg.intervalSamples;

        // Send progress at ~1 Hz or every checkpoint, whichever is less frequent.
        const now = Date.now();
        if (now - lastProgressTime >= 1000) {
          lastProgressTime = now;
          const progress: CheckpointWorkerProgress = {
            type: 'progress',
            fraction: maxSamples > 0 ? samplesRendered / maxSamples : 0,
            checkpointCount: checkpoints.length,
          };
          (self as unknown as Worker).postMessage(progress);
        }
      }
    }

    // 4. Transfer completed checkpoints to the main thread.
    //    ArrayBuffers are transferred (zero-copy) rather than cloned.
    const transferables = checkpoints.map((cp) => cp.stateData);
    const result: CheckpointWorkerResult = { type: 'checkpoints', checkpoints };
    (self as unknown as Worker).postMessage(
      result,
      transferables as unknown as Transferable[],
    );
  } catch (err) {
    postError(err instanceof Error ? err.message : String(err));
  }

  // 5. Self-terminate — this worker is single-use.
  self.close();
};

/** Post an error message and self-terminate. */
function postError(message: string): void {
  const msg: CheckpointWorkerError = { type: 'error', message };
  (self as unknown as Worker).postMessage(msg);
  self.close();
}
