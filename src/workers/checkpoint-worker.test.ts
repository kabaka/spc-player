import { describe, expect, it } from 'vitest';

import type {
  CheckpointWorkerError,
  CheckpointWorkerMessage,
  CheckpointWorkerProgress,
  CheckpointWorkerResult,
} from './checkpoint-worker';

// ---------------------------------------------------------------------------
// C11: Checkpoint worker message types
// ---------------------------------------------------------------------------

describe('CheckpointWorkerMessage types', () => {
  it('progress message has correct shape', () => {
    const msg: CheckpointWorkerProgress = {
      type: 'progress',
      fraction: 0.5,
      checkpointCount: 10,
    };
    expect(msg.type).toBe('progress');
    expect(msg.fraction).toBe(0.5);
    expect(msg.checkpointCount).toBe(10);
  });

  it('result message has correct shape', () => {
    const msg: CheckpointWorkerResult = {
      type: 'checkpoints',
      checkpoints: [
        {
          positionSamples: 160_000,
          stateData: new ArrayBuffer(65_688),
        },
      ],
    };
    expect(msg.type).toBe('checkpoints');
    expect(msg.checkpoints).toHaveLength(1);
    expect(msg.checkpoints[0].positionSamples).toBe(160_000);
  });

  it('error message has correct shape', () => {
    const msg: CheckpointWorkerError = {
      type: 'error',
      message: 'test error',
    };
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('test error');
  });

  it('union type discriminates correctly', () => {
    const messages: CheckpointWorkerMessage[] = [
      { type: 'checkpoints', checkpoints: [] },
      { type: 'progress', fraction: 0.75, checkpointCount: 5 },
      { type: 'error', message: 'fail' },
    ];

    const types = messages.map((m) => m.type);
    expect(types).toEqual(['checkpoints', 'progress', 'error']);
  });
});

// ---------------------------------------------------------------------------
// C11: Engine timeout / cancellation logic (pure logic tests)
// ---------------------------------------------------------------------------

describe('checkpoint worker timeout logic', () => {
  it('setTimeout fires after the configured duration', async () => {
    let terminated = false;
    const TIMEOUT_MS = 50; // Short timeout for testing

    const timeoutId = setTimeout(() => {
      terminated = true;
    }, TIMEOUT_MS);

    expect(terminated).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS + 20));
    expect(terminated).toBe(true);
    clearTimeout(timeoutId);
  });

  it('clearTimeout prevents termination', async () => {
    let terminated = false;
    const TIMEOUT_MS = 50;

    const timeoutId = setTimeout(() => {
      terminated = true;
    }, TIMEOUT_MS);

    clearTimeout(timeoutId);
    await new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS + 20));
    expect(terminated).toBe(false);
  });

  it('cancellation clears timeout and resets progress', () => {
    // Simulate the cancelCheckpointPrecompute logic
    let workerTimeout: ReturnType<typeof setTimeout> | null = null;
    let progress = 0.5;
    let worker: { terminated: boolean } | null = { terminated: false };

    // Set up as spawnCheckpointWorker would
    workerTimeout = setTimeout(() => {
      /* noop */
    }, 60_000);

    // Cancel
    if (workerTimeout !== null) {
      clearTimeout(workerTimeout);
      workerTimeout = null;
    }
    if (worker) {
      worker.terminated = true;
      worker = null;
    }
    progress = 0;

    expect(workerTimeout).toBeNull();
    expect(worker).toBeNull();
    expect(progress).toBe(0);
  });
});
