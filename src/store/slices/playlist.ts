import type { PlaylistSlice, SliceCreator } from '../types';

export const createPlaylistSlice: SliceCreator<PlaylistSlice> = (set) => ({
  tracks: [],
  activeIndex: -1,
  shuffleMode: false,
  repeatMode: 'off',

  addTracks: (tracks) => {
    set(
      (state) => ({ tracks: [...state.tracks, ...tracks] }),
      false,
      'playlist/addTracks',
    );
  },

  removeTrack: (trackId) => {
    set(
      (state) => {
        const newTracks = state.tracks.filter((t) => t.id !== trackId);
        const removedIndex = state.tracks.findIndex((t) => t.id === trackId);
        let newActiveIndex = state.activeIndex;

        if (removedIndex !== -1 && removedIndex < state.activeIndex) {
          newActiveIndex = state.activeIndex - 1;
        } else if (removedIndex === state.activeIndex) {
          newActiveIndex = -1;
        }

        return { tracks: newTracks, activeIndex: newActiveIndex };
      },
      false,
      'playlist/removeTrack',
    );
  },

  reorderTracks: (fromIndex, toIndex) => {
    set(
      (state) => {
        const newTracks = [...state.tracks];
        const [moved] = newTracks.splice(fromIndex, 1);
        if (!moved) return {};
        newTracks.splice(toIndex, 0, moved);

        let newActiveIndex = state.activeIndex;
        if (state.activeIndex === fromIndex) {
          newActiveIndex = toIndex;
        } else if (
          fromIndex < state.activeIndex &&
          toIndex >= state.activeIndex
        ) {
          newActiveIndex = state.activeIndex - 1;
        } else if (
          fromIndex > state.activeIndex &&
          toIndex <= state.activeIndex
        ) {
          newActiveIndex = state.activeIndex + 1;
        }

        return { tracks: newTracks, activeIndex: newActiveIndex };
      },
      false,
      'playlist/reorderTracks',
    );
  },

  setActiveIndex: (index) => {
    set({ activeIndex: index }, false, 'playlist/setActiveIndex');
  },

  setShuffleMode: (enabled) => {
    set({ shuffleMode: enabled }, false, 'playlist/setShuffleMode');
  },

  setRepeatMode: (mode) => {
    set({ repeatMode: mode }, false, 'playlist/setRepeatMode');
  },

  clearPlaylist: () => {
    set({ tracks: [], activeIndex: -1 }, false, 'playlist/clearPlaylist');
  },
});
