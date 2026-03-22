/**
 * Bridges the Zustand settings store with the audio engine.
 * Subscribes to settings changes and forwards them to the engine.
 */

import { audioEngine } from '@/audio/engine';
import { audioPipelineError } from '@/errors/factories';
import { reportError } from '@/errors/report';
import { useAppStore } from '@/store/store';
import type { SettingsSlice } from '@/store/types';

function applyResamplingQuality(
  quality: SettingsSlice['resamplingQuality'],
): void {
  switch (quality) {
    case 'standard':
      audioEngine.setInterpolationMode(0); // Gaussian
      audioEngine.setResamplerMode('linear'); // Reset from sinc if previously high
      break;
    case 'high':
      audioEngine.setInterpolationMode(3); // Sinc
      audioEngine.setResamplerMode('sinc');
      break;
    case 'custom':
      // User controls individual settings — no automatic change
      break;
  }
}

/**
 * Subscribe to Zustand store settings and sync them to the audio engine.
 * Returns an unsubscribe function.
 */
export function subscribeAudioSync(): () => void {
  const unsubscribe = useAppStore.subscribe((state, prevState) => {
    if (state.resamplingQuality !== prevState.resamplingQuality) {
      applyResamplingQuality(state.resamplingQuality);
    }

    if (state.audioSampleRate !== prevState.audioSampleRate) {
      audioEngine
        .recreateAudioContext(state.audioSampleRate)
        .catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          reportError(audioPipelineError('AUDIO_CONTEXT_CLOSED', { detail }));
        });
    }
  });

  return unsubscribe;
}
