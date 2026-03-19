import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { idbStorage } from '@/storage/idb-storage';

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
            // Playlist — full
            tracks: state.tracks,
            activeIndex: state.activeIndex,
            shuffleMode: state.shuffleMode,
            repeatMode: state.repeatMode,
            // Playback — partial
            volume: state.volume,
          }) as AppStore,
        onRehydrateStorage: () => (state) => {
          if (state?.theme && state.theme !== 'system') {
            localStorage.setItem('spc-theme', state.theme);
          }
        },
      },
    ),
    { name: 'SpcPlayer' },
  ),
);
