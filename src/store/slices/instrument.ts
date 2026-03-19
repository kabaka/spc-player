import type { InstrumentSlice, SliceCreator } from '../types';

export const createInstrumentSlice: SliceCreator<InstrumentSlice> = (set) => ({
  activeInstrumentIndex: null,
  isMidiConnected: false,

  setActiveInstrument: (index) => {
    set(
      { activeInstrumentIndex: index },
      false,
      'instrument/setActiveInstrument',
    );
  },

  setMidiConnected: (connected) => {
    set({ isMidiConnected: connected }, false, 'instrument/setMidiConnected');
  },

  resetInstrument: () => {
    set(
      { activeInstrumentIndex: null, isMidiConnected: false },
      false,
      'instrument/resetInstrument',
    );
  },
});
