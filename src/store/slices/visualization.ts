import type { VisualizationSlice, SliceCreator } from '../types';

export const createVisualizationSlice: SliceCreator<VisualizationSlice> = (
  set,
) => ({
  activeMode: 'piano-roll',
  pianoRoll: {
    scrollSpeed: 100,
    noteScale: 'chromatic',
    showVoiceLabels: true,
  },
  spectrum: { mode: 'bars', fftSize: 1024, smoothing: 0.8 },
  stereoField: { mode: 'lissajous', decay: 0.95 },
  coverArt: { externalFetchEnabled: false },

  setActiveMode: (mode) => {
    set({ activeMode: mode }, false, 'visualization/setActiveMode');
  },

  setPianoRollSettings: (settings) => {
    set(
      (state) => ({ pianoRoll: { ...state.pianoRoll, ...settings } }),
      false,
      'visualization/setPianoRollSettings',
    );
  },

  setSpectrumSettings: (settings) => {
    set(
      (state) => ({ spectrum: { ...state.spectrum, ...settings } }),
      false,
      'visualization/setSpectrumSettings',
    );
  },

  setStereoFieldSettings: (settings) => {
    set(
      (state) => ({ stereoField: { ...state.stereoField, ...settings } }),
      false,
      'visualization/setStereoFieldSettings',
    );
  },

  setCoverArtSettings: (settings) => {
    set(
      (state) => ({ coverArt: { ...state.coverArt, ...settings } }),
      false,
      'visualization/setCoverArtSettings',
    );
  },
});
