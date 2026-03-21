/// <reference types="zustand/middleware" />
import type { StateCreator } from 'zustand';
import type { SpcMetadata } from '@/core/spc-types';

// ── Domain types ──────────────────────────────────────────────────────

export interface PlaylistTrack {
  readonly id: string;
  readonly filename: string;
  readonly title: string;
  readonly durationMs: number;
}

export interface ExportDefaults {
  readonly format: 'wav' | 'flac' | 'ogg' | 'mp3';
  readonly sampleRate: 32000 | 44100 | 48000 | 96000;
  readonly loopCount: number;
}

export interface ExportJob {
  readonly id: string;
  readonly label: string;
  readonly status:
    | 'queued'
    | 'rendering'
    | 'encoding'
    | 'complete'
    | 'failed'
    | 'cancelled';
  readonly progress: number;
  readonly outputSize: number | null;
  readonly error: string | null;
}

export interface ExportOptions {
  readonly format: ExportDefaults['format'];
  readonly sampleRate: ExportDefaults['sampleRate'];
  readonly loopCount: number;
  readonly fadeSeconds: number;
  readonly durationSeconds: number;
  readonly voiceMask: number;
}

export type ExportProgressPhase = 'rendering' | 'encoding';

export interface LoopRegion {
  startTime: number;
  endTime: number;
  active: boolean;
}

export interface TrackDuration {
  readonly playSeconds: number;
  readonly fadeSeconds: number;
  readonly totalSeconds: number;
  readonly hasLoopData: boolean;
  readonly timingSource: 'xid6' | 'id666' | 'user-override' | 'default';
  readonly structure: LoopStructure | null;
}

export interface LoopStructure {
  readonly introSeconds: number;
  readonly loopSeconds: number;
  readonly endSeconds: number;
  readonly loopCount: number;
}

// ── Slice interfaces ──────────────────────────────────────────────────

export interface PlaybackSlice {
  playbackStatus: 'stopped' | 'playing' | 'paused';
  activeTrackId: string | null;
  position: number;
  speed: number;
  volume: number;
  loopCount: number | 'infinite';
  trackDuration: TrackDuration | null;
  loopRegion: LoopRegion | null;
  setPlaybackStatus: (status: PlaybackSlice['playbackStatus']) => void;
  setActiveTrackId: (id: string | null) => void;
  setPosition: (position: number) => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setLoopCount: (count: number | 'infinite') => void;
  setTrackDuration: (duration: TrackDuration | null) => void;
  setLoopStart: (time: number) => void;
  setLoopEnd: (time: number) => void;
  toggleLoop: () => void;
  clearLoop: () => void;
}

export interface PlaylistSlice {
  tracks: readonly PlaylistTrack[];
  activeIndex: number;
  shuffleMode: boolean;
  repeatMode: 'off' | 'one' | 'all';
  addTracks: (tracks: PlaylistTrack[]) => void;
  removeTrack: (trackId: string) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  setActiveIndex: (index: number) => void;
  setShuffleMode: (enabled: boolean) => void;
  setRepeatMode: (mode: PlaylistSlice['repeatMode']) => void;
  clearPlaylist: () => void;
}

export interface MixerSlice {
  voiceMuted: readonly boolean[];
  voiceSolo: readonly boolean[];
  toggleMute: (voiceIndex: number) => void;
  toggleSolo: (voiceIndex: number) => void;
  resetMixer: () => void;
}

export interface MetadataSlice {
  metadata: SpcMetadata | null;
  setMetadata: (metadata: SpcMetadata | null) => void;
  clearMetadata: () => void;
}

export interface SettingsSlice {
  theme: 'light' | 'dark' | 'system';
  audioSampleRate: 32000 | 44100 | 48000 | 96000;
  resamplingQuality: 'standard' | 'high' | 'custom';
  keyboardMappings: Readonly<Record<string, string>>;
  exportDefaults: ExportDefaults;
  defaultLoopCount: number;
  defaultPlayDuration: number;
  defaultFadeDuration: number;
  setTheme: (theme: SettingsSlice['theme']) => void;
  setAudioSampleRate: (rate: SettingsSlice['audioSampleRate']) => void;
  setResamplingQuality: (quality: SettingsSlice['resamplingQuality']) => void;
  setKeyboardMapping: (action: string, key: string) => void;
  setExportDefaults: (partial: Partial<ExportDefaults>) => void;
  setDefaultLoopCount: (count: number) => void;
  setDefaultPlayDuration: (seconds: number) => void;
  setDefaultFadeDuration: (seconds: number) => void;
}

export interface InstrumentSlice {
  activeInstrumentIndex: number | null;
  isMidiConnected: boolean;
  setActiveInstrument: (index: number | null) => void;
  setMidiConnected: (connected: boolean) => void;
  resetInstrument: () => void;
}

export interface UISlice {
  isLoadingTrack: boolean;
  loadingError: string | null;
  isExportDialogOpen: boolean;
  isInstrumentModeActive: boolean;
  announcement: string;
  setIsLoadingTrack: (loading: boolean) => void;
  setLoadingError: (error: string | null) => void;
  setIsExportDialogOpen: (open: boolean) => void;
  toggleInstrumentMode: () => void;
  setPlaybackAnnouncement: (text: string) => void;
}

export interface ExportSlice {
  jobs: ExportJob[];
  isExporting: boolean;
  queueSize: number;
  batchProgress: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    currentJobId: string | null;
  } | null;
  setExportJobs: (jobs: ExportJob[]) => void;
  updateJobProgress: (
    jobId: string,
    progress: number,
    phase: ExportProgressPhase,
  ) => void;
  completeJob: (jobId: string, outputSize: number) => void;
  failJob: (jobId: string, error: string) => void;
  cancelJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  enqueueExport: (
    options: ExportOptions,
    spcSource:
      | { readonly type: 'buffer'; readonly data: Uint8Array }
      | { readonly type: 'indexeddb'; readonly hash: string },
    label: string,
  ) => string;
  enqueueBatch: (
    files: {
      options: ExportOptions;
      spcSource:
        | { readonly type: 'buffer'; readonly data: Uint8Array }
        | { readonly type: 'indexeddb'; readonly hash: string };
      label: string;
    }[],
  ) => string[];
  cancelExport: (jobId: string) => void;
  cancelAllExports: () => void;
}

export interface OrchestrationSlice {
  loadFile: (file: File) => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  playTrackAtIndex: (index: number) => Promise<void>;
  stopAndClear: () => void;
  removeTrackSafe: (trackId: string) => void;
}

// ── Combined types ────────────────────────────────────────────────────

export type AppStore = PlaybackSlice &
  PlaylistSlice &
  MixerSlice &
  MetadataSlice &
  SettingsSlice &
  InstrumentSlice &
  UISlice &
  ExportSlice &
  OrchestrationSlice;

type AppMiddleware = [
  ['zustand/devtools', never],
  ['zustand/persist', unknown],
];

export type SliceCreator<TSlice> = StateCreator<
  AppStore,
  AppMiddleware,
  [],
  TSlice
>;
