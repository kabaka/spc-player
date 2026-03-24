import type { InstrumentSlice, SliceCreator } from '../types';

export const createInstrumentSlice: SliceCreator<InstrumentSlice> = (set) => ({
  selectedSrcn: null,
  sampleCatalog: [],
  isMidiConnected: false,
  pitchShift: 0,
  gain: 100,

  setSelectedSrcn: (srcn) => {
    set({ selectedSrcn: srcn }, false, 'instrument/setSelectedSrcn');
  },

  setSampleCatalog: (catalog) => {
    set({ sampleCatalog: catalog }, false, 'instrument/setSampleCatalog');
  },

  setMidiConnected: (connected) => {
    set({ isMidiConnected: connected }, false, 'instrument/setMidiConnected');
  },

  setPitchShift: (value) => {
    set({ pitchShift: value }, false, 'instrument/setPitchShift');
  },

  setGain: (value) => {
    set({ gain: value }, false, 'instrument/setGain');
  },

  clearInstrumentState: () => {
    set(
      {
        selectedSrcn: null,
        sampleCatalog: [],
        isMidiConnected: false,
        pitchShift: 0,
        gain: 100,
      },
      false,
      'instrument/clearInstrumentState',
    );
  },
});
