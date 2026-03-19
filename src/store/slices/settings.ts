import type { SettingsSlice, SliceCreator } from '../types';

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set) => ({
  theme: 'system',
  audioSampleRate: 48000,
  resamplingQuality: 'standard',
  keyboardMappings: {},
  exportDefaults: {
    format: 'wav',
    sampleRate: 44100,
    loopCount: 2,
  },
  defaultLoopCount: 2,
  defaultPlayDuration: 180,
  defaultFadeDuration: 10,

  setTheme: (theme) => {
    set({ theme }, false, 'settings/setTheme');
  },

  setAudioSampleRate: (rate) => {
    set({ audioSampleRate: rate }, false, 'settings/setAudioSampleRate');
  },

  setResamplingQuality: (quality) => {
    set({ resamplingQuality: quality }, false, 'settings/setResamplingQuality');
  },

  setKeyboardMapping: (action, key) => {
    set(
      (state) => ({
        keyboardMappings: { ...state.keyboardMappings, [action]: key },
      }),
      false,
      'settings/setKeyboardMapping',
    );
  },

  setExportDefaults: (partial) => {
    set(
      (state) => ({
        exportDefaults: { ...state.exportDefaults, ...partial },
      }),
      false,
      'settings/setExportDefaults',
    );
  },

  setDefaultLoopCount: (count) => {
    set({ defaultLoopCount: count }, false, 'settings/setDefaultLoopCount');
  },

  setDefaultPlayDuration: (seconds) => {
    set(
      { defaultPlayDuration: seconds },
      false,
      'settings/setDefaultPlayDuration',
    );
  },

  setDefaultFadeDuration: (seconds) => {
    set(
      { defaultFadeDuration: seconds },
      false,
      'settings/setDefaultFadeDuration',
    );
  },
});
