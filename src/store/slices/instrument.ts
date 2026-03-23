import type { InstrumentSlice, SliceCreator } from '../types';

export const createInstrumentSlice: SliceCreator<InstrumentSlice> = (set) => ({
  selectedSrcn: null,
  sampleCatalog: [],
  isMidiConnected: false,

  setSelectedSrcn: (srcn) => {
    set({ selectedSrcn: srcn }, false, 'instrument/setSelectedSrcn');
  },

  setSampleCatalog: (catalog) => {
    set({ sampleCatalog: catalog }, false, 'instrument/setSampleCatalog');
  },

  setMidiConnected: (connected) => {
    set({ isMidiConnected: connected }, false, 'instrument/setMidiConnected');
  },

  clearInstrumentState: () => {
    set(
      { selectedSrcn: null, sampleCatalog: [], isMidiConnected: false },
      false,
      'instrument/clearInstrumentState',
    );
  },
});
