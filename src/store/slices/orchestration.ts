import type { OrchestrationSlice, SliceCreator } from '../types';

export const createOrchestrationSlice: SliceCreator<OrchestrationSlice> = (
  set,
) => ({
  loadFile: async () => {
    console.warn('loadFile: not implemented until Phase 4');
  },

  nextTrack: async () => {
    console.warn('nextTrack: not implemented until Phase 5');
  },

  previousTrack: async () => {
    console.warn('previousTrack: not implemented until Phase 5');
  },

  playTrackAtIndex: async () => {
    console.warn('playTrackAtIndex: not implemented until Phase 5');
  },

  stopAndClear: () => {
    set(
      {
        playbackStatus: 'stopped',
        position: 0,
        activeTrackId: null,
        metadata: null,
        loopRegion: null,
      },
      false,
      'orchestration/stopAndClear',
    );
  },

  removeTrackSafe: () => {
    console.warn('removeTrackSafe: not implemented until Phase 5');
  },
});
