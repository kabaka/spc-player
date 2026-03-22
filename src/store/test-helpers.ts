import { create } from 'zustand';
import type { StateCreator } from 'zustand';

import type { AppStore, SliceCreator } from './types';
import { createPlaybackSlice } from './slices/playback';
import { createPlaylistSlice } from './slices/playlist';
import { createMixerSlice } from './slices/mixer';
import { createMetadataSlice } from './slices/metadata';
import { createSettingsSlice } from './slices/settings';
import { createInstrumentSlice } from './slices/instrument';
import { createUISlice } from './slices/ui';
import { createExportSlice } from './slices/export';
import { createOrchestrationSlice } from './slices/orchestration';
import { createVisualizationSlice } from './slices/visualization';

import type { PlaylistTrack, ExportJob } from './types';

// Test stores omit devtools/persist middleware. The inner function is typed
// with middleware params so slice creators receive their expected args,
// then cast to a plain StateCreator for create().
export const createTestStore = () =>
  create<AppStore>()(((...a: Parameters<SliceCreator<AppStore>>) => ({
    ...createPlaybackSlice(...a),
    ...createPlaylistSlice(...a),
    ...createMixerSlice(...a),
    ...createMetadataSlice(...a),
    ...createSettingsSlice(...a),
    ...createInstrumentSlice(...a),
    ...createUISlice(...a),
    ...createExportSlice(...a),
    ...createOrchestrationSlice(...a),
    ...createVisualizationSlice(...a),
  })) as StateCreator<AppStore>);

export const makeTrack = (
  overrides: Partial<PlaylistTrack> = {},
): PlaylistTrack => ({
  id: overrides.id ?? crypto.randomUUID(),
  filename: overrides.filename ?? 'test.spc',
  title: overrides.title ?? 'Test Track',
  durationMs: overrides.durationMs ?? 120_000,
});

export const makeJob = (overrides: Partial<ExportJob> = {}): ExportJob => ({
  id: overrides.id ?? crypto.randomUUID(),
  label: overrides.label ?? 'Test Export',
  status: overrides.status ?? 'queued',
  progress: overrides.progress ?? 0,
  outputSize: overrides.outputSize ?? null,
  error: overrides.error ?? null,
});
