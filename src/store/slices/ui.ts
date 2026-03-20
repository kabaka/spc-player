import type { UISlice, SliceCreator } from '../types';

export const createUISlice: SliceCreator<UISlice> = (set) => ({
  isLoadingTrack: false,
  loadingError: null,
  isExportDialogOpen: false,

  setIsLoadingTrack: (loading) => {
    set({ isLoadingTrack: loading }, false, 'ui/setIsLoadingTrack');
  },

  setLoadingError: (error) => {
    set({ loadingError: error }, false, 'ui/setLoadingError');
  },

  setIsExportDialogOpen: (open) => {
    set({ isExportDialogOpen: open }, false, 'ui/setIsExportDialogOpen');
  },
});
