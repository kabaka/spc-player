import type { MetadataSlice, SliceCreator } from '../types';

export const createMetadataSlice: SliceCreator<MetadataSlice> = (set) => ({
  metadata: null,

  setMetadata: (metadata) => {
    set({ metadata }, false, 'metadata/setMetadata');
  },

  clearMetadata: () => {
    set({ metadata: null }, false, 'metadata/clearMetadata');
  },
});
