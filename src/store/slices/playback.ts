import type { PlaybackSlice, SliceCreator } from '../types';

export const createPlaybackSlice: SliceCreator<PlaybackSlice> = (set) => ({
  playbackStatus: 'stopped',
  activeTrackId: null,
  position: 0,
  speed: 1,
  tempo: 1,
  pitch: 1,
  volume: 0.8,
  loopCount: 2,
  trackDuration: null,
  loopRegion: null,

  setPlaybackStatus: (status) => {
    set({ playbackStatus: status }, false, 'playback/setPlaybackStatus');
  },

  setActiveTrackId: (id) => {
    set({ activeTrackId: id }, false, 'playback/setActiveTrackId');
  },

  setPosition: (position) => {
    set({ position }, false, 'playback/setPosition');
  },

  setSpeed: (speed) => {
    set({ speed }, false, 'playback/setSpeed');
  },

  setTempo: (tempo) => {
    set({ tempo }, false, 'playback/setTempo');
  },

  setPitch: (pitch) => {
    set({ pitch }, false, 'playback/setPitch');
  },

  setVolume: (volume) => {
    set(
      { volume: Math.max(0, Math.min(1, volume)) },
      false,
      'playback/setVolume',
    );
  },

  setLoopCount: (count) => {
    set({ loopCount: count }, false, 'playback/setLoopCount');
  },

  setTrackDuration: (duration) => {
    set({ trackDuration: duration }, false, 'playback/setTrackDuration');
  },

  setLoopStart: (time) => {
    set(
      (state) => ({
        loopRegion: {
          startTime: time,
          endTime: state.loopRegion?.endTime ?? time,
          active: state.loopRegion?.active ?? true,
        },
      }),
      false,
      'playback/setLoopStart',
    );
  },

  setLoopEnd: (time) => {
    set(
      (state) => ({
        loopRegion: {
          startTime: state.loopRegion?.startTime ?? 0,
          endTime: time,
          active: state.loopRegion?.active ?? true,
        },
      }),
      false,
      'playback/setLoopEnd',
    );
  },

  toggleLoop: () => {
    set(
      (state) => {
        if (!state.loopRegion) return {};
        return {
          loopRegion: { ...state.loopRegion, active: !state.loopRegion.active },
        };
      },
      false,
      'playback/toggleLoop',
    );
  },

  clearLoop: () => {
    set({ loopRegion: null }, false, 'playback/clearLoop');
  },
});
