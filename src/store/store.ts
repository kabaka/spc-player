import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { parseSpcFile } from '@/core/spc-parser';
import { calculateTrackDuration } from '@/core/track-duration';
import { reportError } from '@/errors/report';
import { uiError } from '@/errors/factories';
import { idbStorage } from '@/storage/idb-storage';
import { loadSpcFromStorage } from '@/storage/spc-storage';

import type { AppStore } from './types';
import { createPlaybackSlice } from './slices/playback';
import { createPlaylistSlice } from './slices/playlist';
import { createMixerSlice } from './slices/mixer';
import { createMetadataSlice } from './slices/metadata';
import { createSettingsSlice } from './slices/settings';
import { createInstrumentSlice } from './slices/instrument';
import { createUISlice } from './slices/ui';
import { createExportSlice } from './slices/export';
import { createOrchestrationSlice } from './slices/orchestration';
import { createVisualizationSlice } from './slices/visualization';

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (...a) => ({
        ...createPlaybackSlice(...a),
        ...createPlaylistSlice(...a),
        ...createMixerSlice(...a),
        ...createMetadataSlice(...a),
        ...createSettingsSlice(...a),
        ...createInstrumentSlice(...a),
        ...createUISlice(...a),
        ...createExportSlice(...a),
        ...createOrchestrationSlice(...a),
        ...createVisualizationSlice(...a),
      }),
      {
        name: 'spc-player-state',
        storage: createJSONStorage(() => idbStorage),
        partialize: (state) =>
          ({
            // Settings — full
            theme: state.theme,
            audioSampleRate: state.audioSampleRate,
            resamplingQuality: state.resamplingQuality,
            keyboardMappings: state.keyboardMappings,
            exportDefaults: state.exportDefaults,
            defaultLoopCount: state.defaultLoopCount,
            defaultPlayDuration: state.defaultPlayDuration,
            defaultFadeDuration: state.defaultFadeDuration,
            checkpointPreset: state.checkpointPreset,
            // Visualization — persisted
            activeMode: state.activeMode,
            pianoRoll: state.pianoRoll,
            spectrum: state.spectrum,
            stereoField: state.stereoField,
            coverArt: state.coverArt,
            // Playlist — full
            tracks: state.tracks,
            activeIndex: state.activeIndex,
            shuffleMode: state.shuffleMode,
            repeatMode: state.repeatMode,
            // Playback — partial
            volume: state.volume,
            activeTrackId: state.activeTrackId,
          }) as AppStore,
        onRehydrateStorage: () => (state) => {
          if (state?.theme && state.theme !== 'system') {
            localStorage.setItem('spc-theme', state.theme);
          }

          // Restore active track metadata from IndexedDB after reload.
          // This re-parses SPC metadata so transport controls are enabled.
          if (state) {
            const trackId = state.activeTrackId;
            const idx = state.activeIndex;
            const track = idx >= 0 ? state.tracks[idx] : undefined;

            if (trackId && track) {
              restoreTrackMetadata(trackId);
            }
          }
        },
      },
    ),
    { name: 'SpcPlayer' },
  ),
);

/**
 * Restore active track metadata from IndexedDB after store rehydration.
 * Parses the SPC file to extract metadata and duration so the player UI
 * shows track info and transport controls are enabled.
 */
async function restoreTrackMetadata(trackId: string): Promise<void> {
  try {
    const spcData = await loadSpcFromStorage(trackId);
    if (!spcData) return;

    const parseResult = parseSpcFile(new Uint8Array(spcData));
    if (!parseResult.ok) return;

    const { metadata } = parseResult.value;

    // Re-check that the active track hasn't changed during async load
    const current = useAppStore.getState();
    if (current.activeTrackId !== trackId) return;

    const duration = calculateTrackDuration(
      metadata.xid6Timing,
      metadata.songLengthSeconds,
      metadata.fadeLengthMs,
      null,
      {
        durationSeconds: current.defaultPlayDuration,
        fadeSeconds: current.defaultFadeDuration,
        loopCount: current.defaultLoopCount,
      },
    );

    const loopCount = duration.hasLoopData
      ? (duration.structure?.loopCount ?? current.defaultLoopCount)
      : current.defaultLoopCount;

    useAppStore.setState(
      {
        metadata,
        trackDuration: duration,
        loopCount,
        playbackStatus: 'stopped',
        position: 0,
      },
      false,
    );
  } catch (error) {
    reportError(
      uiError('UI_UNEXPECTED_ERROR', {
        detail: `Failed to restore track metadata: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
  }
}
