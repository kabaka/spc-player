import type { SliceCreator, UISlice } from '../types';

export const createUISlice: SliceCreator<UISlice> = (set) => ({
  isLoadingTrack: false,
  loadingError: null,
  isExportDialogOpen: false,
  isInstrumentModeActive: false,
  announcement: '',

  setIsLoadingTrack: (loading) => {
    set({ isLoadingTrack: loading }, false, 'ui/setIsLoadingTrack');
  },

  setLoadingError: (error) => {
    set({ loadingError: error }, false, 'ui/setLoadingError');
  },

  setIsExportDialogOpen: (open) => {
    set({ isExportDialogOpen: open }, false, 'ui/setIsExportDialogOpen');
  },

  toggleInstrumentMode: () => {
    set(
      (state) => ({ isInstrumentModeActive: !state.isInstrumentModeActive }),
      false,
      'ui/toggleInstrumentMode',
    );
  },

  setPlaybackAnnouncement: (text) => {
    set({ announcement: text }, false, 'ui/setPlaybackAnnouncement');
  },
});
