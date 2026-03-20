/**
 * Audio pipeline recovery — rebuild audio graph after failures.
 *
 * @see docs/adr/0015-error-handling.md — recovery strategies
 * @see src/audio/engine.ts — AudioEngine singleton
 */

import { audioEngine } from './engine';
import { reportError } from '@/errors/report';
import { audioPipelineError } from '@/errors/factories';
import { showToast } from '@/components/Toast/toast-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECOVERY_ATTEMPTS = 3;

let recoveryAttempts = 0;

// ---------------------------------------------------------------------------
// recoverAudioPipeline
// ---------------------------------------------------------------------------

/**
 * Attempt to rebuild the audio pipeline after a worklet crash or WASM trap.
 *
 * Flow:
 * 1. Takes a snapshot of current state (if possible)
 * 2. Tears down the AudioWorklet node
 * 3. Rebuilds the audio engine
 * 4. Restores from snapshot
 * 5. Shows toast on success/failure
 */
export async function recoverAudioPipeline(): Promise<boolean> {
  recoveryAttempts++;

  if (recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
    showToast(
      'error',
      'Audio recovery failed after multiple attempts. Please reload the page.',
    );
    return false;
  }

  // 1. Try to capture snapshot before teardown
  let snapshot: ArrayBuffer | null = null;
  try {
    snapshot = await audioEngine.requestSnapshot();
  } catch {
    // Snapshot may fail if worklet is dead — continue recovery without state
  }

  // 2. Tear down and rebuild
  try {
    await audioEngine.destroy();
    await audioEngine.init();

    // 3. Restore snapshot if available
    if (snapshot && snapshot.byteLength > 0) {
      audioEngine.restoreSnapshot(snapshot);
    }

    recoveryAttempts = 0;
    showToast('success', 'Audio playback recovered.');
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    reportError(audioPipelineError('AUDIO_WASM_INIT_FAILED', { detail }), {
      silent: true,
    });

    showToast(
      'error',
      `Audio recovery failed (attempt ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}). ${
        recoveryAttempts < MAX_RECOVERY_ATTEMPTS
          ? 'Retrying…'
          : 'Please reload the page.'
      }`,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// recoverAudioContext
// ---------------------------------------------------------------------------

/**
 * Resume a suspended AudioContext (typically due to autoplay policy).
 * Must be called from a user gesture event handler.
 */
export async function recoverAudioContext(): Promise<boolean> {
  try {
    const resumed = audioEngine.play();
    if (resumed) {
      return true;
    }
    showToast('warning', 'Audio is paused. Tap anywhere to resume.');
    return false;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    reportError(audioPipelineError('AUDIO_CONTEXT_SUSPENDED', { detail }), {
      silent: true,
    });
    showToast('error', 'Failed to resume audio. Please reload the page.');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reset (for testing)
// ---------------------------------------------------------------------------

export function resetRecoveryAttempts(): void {
  recoveryAttempts = 0;
}
