# Zustand Cross-Slice Coordination Patterns

## Status

Draft — design document extending ADR-0005 (State Management Architecture).

> **Revision Notes**
>
> - **R-ZS-1**: Fixed `loadFile` to use `spcFile = parseResult.value` instead of destructuring non-existent `spcData` field. Updated metadata references to use flat `SpcMetadata` (no `id666`/`xid6` sub-objects).
> - **R-ZS-2**: Narrowed `updateJobProgress` phase parameter from `ExportJob['status']` to `ExportProgressPhase`.
> - **R-ZS-3**: Fixed `playTrackAtIndex` metadata and audio engine references to match `SpcFile` shape.
> - **R-ZS-4**: Updated `MetadataSlice` to store merged `SpcMetadata` instead of separate `id666`/`xid6`.

**Target:** Zustand v5 (`zustand@^5.0.0`). All code examples use the Zustand v5 API. In v5, `create` is called directly (not `create()()`), and `store.subscribe` natively accepts a selector as the first argument — no `subscribeWithSelector` middleware is needed.

## Problem Statement

ADR-0005 establishes a single Zustand store composed of domain slices. It explicitly acknowledges that this architecture creates a category of "orchestration actions" — actions that coordinate state mutations across multiple slices in response to a single user intent. Without prescribed patterns, agents will scatter coordination logic across components, create circular slice dependencies, duplicate orchestration logic, and produce inconsistent TypeScript types.

This document defines the canonical patterns for cross-slice coordination, prescribing exactly where orchestration logic lives, how slices interact, how async flows work, and how the store coordinates with the audio engine.

---

## 1. Store Type Foundation

### Combined Store Type

All slices share a single intersection type. Define each slice's state and actions as separate interfaces, then combine them.

```typescript
// src/store/types.ts

import type { StateCreator } from 'zustand'

// ── Domain Types (imported from their respective modules) ──────────
//
// PlaylistTrack          — from @/core/types
// Id666Tags, Xid6Tags    — from @/core/spc-parser
// ExportDefaults          — from @/export/types
// ExportJob, ExportOptions — from @/export/types (see export pipeline doc)

// ── Slice Interfaces ──────────────────────────────────────────────

export interface PlaybackSlice {
  // State
  playbackStatus: 'stopped' | 'playing' | 'paused'
  activeTrackId: string | null
  position: number          // current playback position in samples
  speed: number             // playback speed multiplier (1.0 = normal)
  volume: number            // 0.0 – 1.0

  // Slice-local actions
  setPlaybackStatus: (status: PlaybackSlice['playbackStatus']) => void
  setActiveTrackId: (id: string | null) => void
  setPosition: (position: number) => void
  setSpeed: (speed: number) => void
  setVolume: (volume: number) => void
}

export interface PlaylistSlice {
  // State
  tracks: readonly PlaylistTrack[]
  activeIndex: number        // -1 when no track is active
  shuffleMode: boolean
  repeatMode: 'off' | 'one' | 'all'

  // Slice-local actions
  addTracks: (tracks: PlaylistTrack[]) => void
  removeTrack: (trackId: string) => void
  reorderTracks: (fromIndex: number, toIndex: number) => void
  setActiveIndex: (index: number) => void
  setShuffleMode: (enabled: boolean) => void
  setRepeatMode: (mode: PlaylistSlice['repeatMode']) => void
  clearPlaylist: () => void
}

export interface MixerSlice {
  // State — 8 voices, indexed 0–7
  voiceMuted: readonly boolean[]     // length 8
  voiceSolo: readonly boolean[]      // length 8

  // Slice-local actions
  toggleMute: (voiceIndex: number) => void
  toggleSolo: (voiceIndex: number) => void
  resetMixer: () => void
}

export interface MetadataSlice {
  // State
  metadata: SpcMetadata | null

  // Slice-local actions
  setMetadata: (metadata: SpcMetadata) => void
  clearMetadata: () => void
}

export interface SettingsSlice {
  // State
  theme: 'light' | 'dark' | 'system'
  audioSampleRate: 32000 | 44100 | 48000 | 96000
  resamplingQuality: 'standard' | 'high' | 'custom'
  keyboardMappings: Readonly<Record<string, string>>
  exportDefaults: ExportDefaults

  // Slice-local actions
  setTheme: (theme: SettingsSlice['theme']) => void
  setAudioSampleRate: (rate: SettingsSlice['audioSampleRate']) => void
  setResamplingQuality: (quality: SettingsSlice['resamplingQuality']) => void
  setKeyboardMapping: (action: string, key: string) => void
  setExportDefaults: (defaults: Partial<ExportDefaults>) => void
}

export interface InstrumentSlice {
  // State
  activeInstrumentIndex: number | null
  isMidiConnected: boolean

  // Slice-local actions
  setActiveInstrument: (index: number | null) => void
  setMidiConnected: (connected: boolean) => void
  resetInstrument: () => void
}

export interface UISlice {
  // State — ephemeral loading/error state for orchestration actions
  isLoadingTrack: boolean
  loadingError: string | null

  // Slice-local actions
  setIsLoadingTrack: (loading: boolean) => void
  setLoadingError: (error: string | null) => void
}

export interface ExportSlice {
  // State — mirrors the export pipeline's job-based model.
  // The ExportQueueManager (a singleton service, like the audio engine)
  // owns worker lifecycle and queue ordering. This slice holds the
  // user-visible projection that the UI subscribes to.
  // See the export pipeline design doc for the full ExportJob type,
  // ExportQueueManager architecture, and worker protocol.
  jobs: ExportJob[]
  isExporting: boolean
  queueSize: number
  batchProgress: {
    totalJobs: number
    completedJobs: number
    failedJobs: number
    currentJobId: string | null
  } | null

  // Slice-local actions — called by ExportQueueManager, not by components
  setExportJobs: (jobs: ExportJob[]) => void
  updateJobProgress: (jobId: string, progress: number, phase: ExportProgressPhase) => void
  completeJob: (jobId: string, outputSize: number) => void
  failJob: (jobId: string, error: string) => void
  cancelJob: (jobId: string) => void
  clearCompletedJobs: () => void

  // Actions — called by components, delegated to ExportQueueManager
  enqueueExport: (options: ExportOptions, spcData: ArrayBuffer, label: string) => string
  enqueueBatch: (files: Array<{ options: ExportOptions; spcData: ArrayBuffer; label: string }>) => string[]
  cancelExport: (jobId: string) => void
  cancelAllExports: () => void
}

// ── Orchestration Actions ──────────────────────────────────────────

export interface OrchestrationSlice {
  loadFile: (file: File) => Promise<void>
  nextTrack: () => Promise<void>
  previousTrack: () => Promise<void>
  removeTrackSafe: (trackId: string) => void
  playTrackAtIndex: (index: number) => Promise<void>
  stopAndClear: () => void
}

// ── Combined Store Type ────────────────────────────────────────────

export type AppStore =
  & PlaybackSlice
  & PlaylistSlice
  & MixerSlice
  & MetadataSlice
  & SettingsSlice
  & InstrumentSlice
  & UISlice
  & ExportSlice
  & OrchestrationSlice

// ── Middleware Type ────────────────────────────────────────────────

/**
 * The canonical middleware type tuple, matching the store's middleware stack:
 * `devtools(persist(...))`. All SliceCreator types reference this.
 *
 * If you change the middleware stack, update this type to match.
 * Mismatched tuples silently break TypeScript inference on `set()` and `get()`.
 */
type AppMiddleware = [
  ['zustand/devtools', never],
  ['zustand/persist', unknown],
]

// ── Slice Creator Shorthand ────────────────────────────────────────

/**
 * SliceCreator constrains each slice's StateCreator to reference the full
 * AppStore type. This ensures `set()` and `get()` have correct types.
 */
export type SliceCreator<TSlice> = StateCreator<
  AppStore,
  AppMiddleware,
  [],
  TSlice
>
```

### Key Rules

- **Every** `StateCreator` (slice creator) uses `AppStore` as its first generic parameter. This gives `set()` and `get()` the correct combined type.
- The `AppMiddleware` type must match the actual middleware stack order. If you add middleware, update `AppMiddleware` in one place.
- The `SliceCreator<TSlice>` alias eliminates repetition. All slice files import and use it.

---

## 2. Orchestration Action Location

**Decision: Option B — Orchestration slice within the store.**

Orchestration actions are defined as a dedicated `OrchestrationSlice`, created with a `StateCreator` that has full `set`/`get` access to all slices. This is the Zustand-idiomatic "SharedSlice" pattern shown in official documentation.

### Why Not the Alternatives

| Option | Verdict | Reason |
|--------|---------|--------|
| A: External `actions/` module | Rejected | Requires importing `useAppStore` and calling `getState()`/`setState()` from outside the store. Actions aren't part of the store type, so they can't be selected by components via hooks. Breaks DevTools action naming. |
| B: Orchestration slice | **Chosen** | Actions live in the store, are typed in `AppStore`, appear in DevTools, can be selected via hooks, and have native `set`/`get` access. |
| C: Actions at `create()` time | Rejected | Equivalent to Option B but without the organizational separation. A dedicated orchestration slice is cleaner when there are many cross-slice actions. |

### Utility Functions

Orchestration actions depend on the following utility functions. These are imported from their respective modules — they are not part of the store.

```typescript
// From @/core/track-id — generates a stable, deterministic ID from file content
import { computeTrackId } from '@/core/track-id'
// Signature: (file: File) => Promise<string>
// Uses crypto.subtle.digest('SHA-256', ...) on file content for dedup.

// From @/storage/spc-storage — loads raw SPC data from IndexedDB
import { loadSpcFromStorage } from '@/storage/spc-storage'
// Signature: (trackId: string) => Promise<ArrayBuffer | null>
// Returns null if the track is not found in storage.

// From @/core/spc-parser — parses SPC binary data
import { parseSpcFile } from '@/core/spc-parser'
// Signature: (buffer: ArrayBuffer) => Result<SpcFile, SpcParseError>
// Returns a Result type per ADR-0015.

// From @/audio/engine — singleton audio engine service
import { audioEngine } from '@/audio/engine'

// From @/errors/report — centralized error reporter per ADR-0015
import { reportError } from '@/errors/report'
```

### Implementation

```typescript
// src/store/slices/orchestration.ts

import type { SliceCreator, OrchestrationSlice } from '../types'
import { computeTrackId } from '@/core/track-id'
import { loadSpcFromStorage } from '@/storage/spc-storage'
import { parseSpcFile } from '@/core/spc-parser'
import { audioEngine } from '@/audio/engine'
import { reportError } from '@/errors/report'

export const createOrchestrationSlice: SliceCreator<OrchestrationSlice> = (
  set,
  get,
) => ({
  loadFile: async (file: File) => {
    set(
      { isLoadingTrack: true, loadingError: null },
      false,
      'orchestration/loadFile:start',
    )

    try {
      const state = get()

      // 1. Stop current playback
      if (state.playbackStatus !== 'stopped') {
        audioEngine.stop()
      }

      // 2. Parse the SPC file
      const buffer = await file.arrayBuffer()
      const parseResult = parseSpcFile(buffer)
      if (!parseResult.ok) {
        reportError(parseResult.error)
        set(
          { isLoadingTrack: false, loadingError: parseResult.error.message },
          false,
          'orchestration/loadFile:parseError',
        )
        return
      }
      const spcFile = parseResult.value

      // 3. Build track descriptor
      const trackId = await computeTrackId(file)
      const track: PlaylistTrack = {
        id: trackId,
        filename: file.name,
        title: spcFile.metadata.title || file.name,
        durationMs: spcFile.metadata.songLengthSeconds * 1000,
      }

      // 4. Re-read state after await — user may have triggered another action
      const current = get()
      const existingIndex = current.tracks.findIndex((t) => t.id === trackId)

      // 5. Atomic state update — single set() call covering all slices
      if (existingIndex === -1) {
        set(
          {
            tracks: [...current.tracks, track],
            activeIndex: current.tracks.length,
            activeTrackId: trackId,
            playbackStatus: 'stopped',
            position: 0,
            metadata: spcFile.metadata,
            voiceMuted: Array(8).fill(false) as readonly boolean[],
            voiceSolo: Array(8).fill(false) as readonly boolean[],
            activeInstrumentIndex: null,
            isLoadingTrack: false,
            loadingError: null,
          },
          false,
          'orchestration/loadFile',
        )
      } else {
        set(
          {
            activeIndex: existingIndex,
            activeTrackId: trackId,
            playbackStatus: 'stopped',
            position: 0,
            metadata: spcFile.metadata,
            voiceMuted: Array(8).fill(false) as readonly boolean[],
            voiceSolo: Array(8).fill(false) as readonly boolean[],
            activeInstrumentIndex: null,
            isLoadingTrack: false,
            loadingError: null,
          },
          false,
          'orchestration/loadFile',
        )
      }

      // 6. Send SPC data to audio engine
      await audioEngine.load(spcFile.ram, spcFile.dspRegisters, spcFile.cpuRegisters)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load file'
      reportError({
        code: 'AUDIO_WASM_INIT_FAILED',
        message,
        context: { detail: String(error) },
      })
      set(
        { isLoadingTrack: false, loadingError: message },
        false,
        'orchestration/loadFile:error',
      )
    }
  },

  nextTrack: async () => {
    const { tracks, activeIndex, repeatMode, shuffleMode } = get()
    if (tracks.length === 0) return

    let nextIndex: number
    if (shuffleMode) {
      nextIndex = Math.floor(Math.random() * tracks.length)
    } else if (activeIndex >= tracks.length - 1) {
      if (repeatMode === 'all') {
        nextIndex = 0
      } else {
        return // end of playlist, no repeat
      }
    } else {
      nextIndex = activeIndex + 1
    }

    await get().playTrackAtIndex(nextIndex)
  },

  previousTrack: async () => {
    const { tracks, activeIndex, position, audioSampleRate } = get()
    if (tracks.length === 0) return

    // If past 3 seconds, restart current track
    const threeSecondsInSamples = 3 * audioSampleRate
    if (position > threeSecondsInSamples) {
      set({ position: 0 }, false, 'orchestration/previousTrack:restart')
      audioEngine.seek(0)
      return
    }

    const prevIndex = activeIndex > 0 ? activeIndex - 1 : tracks.length - 1
    await get().playTrackAtIndex(prevIndex)
  },

  removeTrackSafe: (trackId: string) => {
    const { tracks, activeTrackId, activeIndex } = get()
    const removeIndex = tracks.findIndex((t) => t.id === trackId)
    if (removeIndex === -1) return

    const isRemovingActive = trackId === activeTrackId

    // Remove from playlist
    const newTracks = tracks.filter((t) => t.id !== trackId)

    if (isRemovingActive) {
      audioEngine.stop()

      if (newTracks.length === 0) {
        // Playlist empty — full reset
        set(
          {
            tracks: newTracks,
            activeIndex: -1,
            activeTrackId: null,
            playbackStatus: 'stopped',
            position: 0,
            id666: null,
            xid6: null,
          },
          false,
          'orchestration/removeTrackSafe:emptyPlaylist',
        )
      } else {
        // Advance to next (or clamp)
        const nextIndex = Math.min(removeIndex, newTracks.length - 1)
        set(
          {
            tracks: newTracks,
            activeIndex: nextIndex,
            activeTrackId: newTracks[nextIndex].id,
            playbackStatus: 'stopped',
            position: 0,
          },
          false,
          'orchestration/removeTrackSafe:advanceTrack',
        )
      }
    } else {
      // Not removing active — just update the list and recalculate activeIndex
      const newActiveIndex = newTracks.findIndex(
        (t) => t.id === activeTrackId,
      )
      set(
        { tracks: newTracks, activeIndex: newActiveIndex },
        false,
        'orchestration/removeTrackSafe:removeInactive',
      )
    }
  },

  playTrackAtIndex: async (index: number) => {
    const { tracks } = get()
    if (index < 0 || index >= tracks.length) return

    const track = tracks[index]
    const trackId = track.id

    // Stop current playback
    audioEngine.stop()

    set(
      { isLoadingTrack: true, loadingError: null },
      false,
      'orchestration/playTrackAtIndex:start',
    )

    try {
      // Load the track's SPC data from storage
      const spcData = await loadSpcFromStorage(trackId)
      if (!spcData) {
        reportError({
          code: 'STORAGE_READ_FAILED',
          message: `Track data not found in storage.`,
          context: { key: trackId },
        })
        set(
          { isLoadingTrack: false, loadingError: 'Track data not found' },
          false,
          'orchestration/playTrackAtIndex:notFound',
        )
        return
      }

      // Re-read state: did the user do something else while we loaded?
      const current = get()
      if (current.activeTrackId !== null && current.activeTrackId !== trackId) {
        // A different track was activated while we were loading — abort
        set(
          { isLoadingTrack: false },
          false,
          'orchestration/playTrackAtIndex:aborted',
        )
        return
      }

      const parseResult = parseSpcFile(spcData)
      if (!parseResult.ok) {
        reportError(parseResult.error)
        set(
          { isLoadingTrack: false, loadingError: parseResult.error.message },
          false,
          'orchestration/playTrackAtIndex:parseError',
        )
        return
      }

      // Atomic cross-slice update
      set(
        {
          activeIndex: index,
          activeTrackId: trackId,
          playbackStatus: 'stopped',
          position: 0,
          id666: parseResult.value.metadata.id666,
          xid6: parseResult.value.metadata.xid6,
          voiceMuted: Array(8).fill(false) as readonly boolean[],
          voiceSolo: Array(8).fill(false) as readonly boolean[],
          isLoadingTrack: false,
          loadingError: null,
        },
        false,
        'orchestration/playTrackAtIndex:loaded',
      )

      await audioEngine.load(parseResult.value.spcData)
      audioEngine.play()
      set(
        { playbackStatus: 'playing' },
        false,
        'orchestration/playTrackAtIndex:play',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to play track'
      reportError({
        code: 'AUDIO_WASM_INIT_FAILED',
        message,
        context: { detail: String(error) },
      })
      set(
        { isLoadingTrack: false, loadingError: message },
        false,
        'orchestration/playTrackAtIndex:error',
      )
    }
  },

  stopAndClear: () => {
    audioEngine.stop()
    set(
      {
        playbackStatus: 'stopped',
        position: 0,
        activeTrackId: null,
        activeIndex: -1,
        tracks: [],
        id666: null,
        xid6: null,
        voiceMuted: Array(8).fill(false) as readonly boolean[],
        voiceSolo: Array(8).fill(false) as readonly boolean[],
        activeInstrumentIndex: null,
        isLoadingTrack: false,
        loadingError: null,
      },
      false,
      'orchestration/stopAndClear',
    )
  },
})
```

---

## 3. Slice Implementation Pattern

Each domain slice follows this template:

```typescript
// src/store/slices/playback.ts

import type { SliceCreator, PlaybackSlice } from '../types'

const INITIAL_PLAYBACK_STATE = {
  playbackStatus: 'stopped' as const,
  activeTrackId: null,
  position: 0,
  speed: 1.0,
  volume: 1.0,
}

export const createPlaybackSlice: SliceCreator<PlaybackSlice> = (set) => ({
  ...INITIAL_PLAYBACK_STATE,

  setPlaybackStatus: (status) =>
    set({ playbackStatus: status }, false, 'playback/setStatus'),
  setActiveTrackId: (id) =>
    set({ activeTrackId: id }, false, 'playback/setActiveTrackId'),
  setPosition: (position) =>
    set({ position }, false, 'playback/setPosition'),
  setSpeed: (speed) =>
    set({ speed }, false, 'playback/setSpeed'),
  setVolume: (volume) =>
    set({ volume }, false, 'playback/setVolume'),
})
```

```typescript
// src/store/slices/mixer.ts

import type { SliceCreator, MixerSlice } from '../types'

const INITIAL_MIXER_STATE = {
  voiceMuted: Array(8).fill(false) as readonly boolean[],
  voiceSolo: Array(8).fill(false) as readonly boolean[],
}

export const createMixerSlice: SliceCreator<MixerSlice> = (set) => ({
  ...INITIAL_MIXER_STATE,

  toggleMute: (voiceIndex) =>
    set(
      (state) => {
        const next = [...state.voiceMuted]
        next[voiceIndex] = !next[voiceIndex]
        return { voiceMuted: next }
      },
      false,
      'mixer/toggleMute',
    ),

  toggleSolo: (voiceIndex) =>
    set(
      (state) => {
        const next = [...state.voiceSolo]
        next[voiceIndex] = !next[voiceIndex]
        return { voiceSolo: next }
      },
      false,
      'mixer/toggleSolo',
    ),

  resetMixer: () =>
    set(INITIAL_MIXER_STATE, false, 'mixer/reset'),
})
```

```typescript
// src/store/slices/ui.ts

import type { SliceCreator, UISlice } from '../types'

const INITIAL_UI_STATE = {
  isLoadingTrack: false,
  loadingError: null,
}

export const createUISlice: SliceCreator<UISlice> = (set) => ({
  ...INITIAL_UI_STATE,

  setIsLoadingTrack: (loading) =>
    set({ isLoadingTrack: loading }, false, 'ui/setIsLoadingTrack'),
  setLoadingError: (error) =>
    set({ loadingError: error }, false, 'ui/setLoadingError'),
})
```

---

## 4. Store Creation

```typescript
// src/store/index.ts

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { AppStore } from './types'
import { createPlaybackSlice } from './slices/playback'
import { createPlaylistSlice } from './slices/playlist'
import { createMixerSlice } from './slices/mixer'
import { createMetadataSlice } from './slices/metadata'
import { createSettingsSlice } from './slices/settings'
import { createInstrumentSlice } from './slices/instrument'
import { createUISlice } from './slices/ui'
import { createExportSlice } from './slices/export'
import { createOrchestrationSlice } from './slices/orchestration'
import { createIdbStorage } from './idb-storage'

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (...args) => ({
        ...createPlaybackSlice(...args),
        ...createPlaylistSlice(...args),
        ...createMixerSlice(...args),
        ...createMetadataSlice(...args),
        ...createSettingsSlice(...args),
        ...createInstrumentSlice(...args),
        ...createUISlice(...args),
        ...createExportSlice(...args),
        ...createOrchestrationSlice(...args),
      }),
      {
        name: 'spc-player-state',
        storage: createIdbStorage(),
        partialize: (state) => ({
          // Only settings, playlist shape, and user preferences are persisted.
          // Ephemeral state (playback position, loading flags, export jobs,
          // metadata, mixer) is excluded.
          theme: state.theme,
          audioSampleRate: state.audioSampleRate,
          resamplingQuality: state.resamplingQuality,
          keyboardMappings: state.keyboardMappings,
          exportDefaults: state.exportDefaults,
          tracks: state.tracks,
          shuffleMode: state.shuffleMode,
          repeatMode: state.repeatMode,
          volume: state.volume,
        }),
        version: 1,
      },
    ),
    { name: 'SpcPlayer' },
  ),
)
```

### Middleware Stack Order

```
devtools(                    ← outermost: sees all state changes
  persist(                   ← persists partialize'd subset to IndexedDB
    (...args) => slices      ← slice composition
  )
)
```

The `devtools` middleware is outermost so it can log every action, including those that trigger persistence. The `persist` middleware wraps the slice composition so it can intercept `set()` calls for serialization.

### SliceCreator Middleware Tuple

The `AppMiddleware` type in `types.ts` must exactly match this stack:

```typescript
// Correct — matches devtools(persist(...))
type AppMiddleware = [
  ['zustand/devtools', never],
  ['zustand/persist', unknown],
]

export type SliceCreator<TSlice> = StateCreator<
  AppStore,
  AppMiddleware,
  [],
  TSlice
>
```

If you change the middleware stack (e.g., add `immer`), update `AppMiddleware` to match. Mismatched tuples silently break TypeScript inference on `set()` and `get()`.

---

## 5. Naming Conventions

### Actions

| Category | Naming Pattern | Examples |
|----------|---------------|----------|
| Slice-local setter | `set{Property}` | `setVolume`, `setPlaybackStatus`, `setTheme` |
| Slice-local toggle | `toggle{Property}` | `toggleMute`, `toggleSolo` |
| Slice-local reset | `reset{Slice}` | `resetMixer`, `resetInstrument` |
| Orchestration action | `{verb}{Noun}` (imperative) | `loadFile`, `nextTrack`, `removeTrackSafe`, `stopAndClear`, `playTrackAtIndex` |

**Rule:** Orchestration actions never use the `set` prefix. The `set` prefix is reserved for single-property slice-local setters. If an action touches more than one slice, it gets an imperative verb name and lives in the orchestration slice.

### DevTools Action Names

All `set()` calls include a third argument for DevTools labeling:

```typescript
// Slice-local
set({ volume }, false, 'playback/setVolume')

// Orchestration
set({ ... }, false, 'orchestration/loadFile')
```

Pattern: `{slice}/{actionName}` with an optional `:{phase}` suffix for multi-step orchestrations.

The second argument to `set()` is the `replace` flag (boolean). Use `false` (merge, the default behavior) — not `undefined` — for self-documenting code.

### Selectors

Define selectors as standalone functions, not inside components:

```typescript
// src/store/selectors.ts

import type { AppStore } from './types'

// ── Simple property selectors ──────────────────────────────────────
// Naming: use the property name directly.
export const selectPlaybackStatus = (s: AppStore) => s.playbackStatus
export const selectVolume = (s: AppStore) => s.volume
export const selectTracks = (s: AppStore) => s.tracks
export const selectActiveTrackId = (s: AppStore) => s.activeTrackId
export const selectIsLoadingTrack = (s: AppStore) => s.isLoadingTrack
export const selectLoadingError = (s: AppStore) => s.loadingError
export const selectExportJobs = (s: AppStore) => s.jobs

// ── Derived selectors ──────────────────────────────────────────────
// Naming: use a semantic name that describes the derived value.
export const selectActiveTrack = (s: AppStore) =>
  s.activeIndex >= 0 ? s.tracks[s.activeIndex] ?? null : null

export const selectIsPlaying = (s: AppStore) => s.playbackStatus === 'playing'

export const selectVoiceMask = (s: AppStore): number => {
  // Compute a bitmask from mute/solo arrays for the audio engine
  const hasSolo = s.voiceSolo.some(Boolean)
  let mask = 0
  for (let i = 0; i < 8; i++) {
    const isActive = hasSolo ? s.voiceSolo[i] : !s.voiceMuted[i]
    if (isActive) mask |= (1 << i)
  }
  return mask
}

export const selectHasActiveTrack = (s: AppStore) => s.activeTrackId !== null
```

**Naming rules:**

- Selectors that return a raw state property use the property name: `selectPlaybackStatus`.
- Derived selectors (computing a new value) use a semantic name: `selectIsPlaying`, `selectVoiceMask`.

All selectors are typed `(s: AppStore) => T`.

### Component Usage

```tsx
import { useAppStore } from '@/store'
import { selectPlaybackStatus, selectVolume } from '@/store/selectors'

export function PlayerControls() {
  const status = useAppStore(selectPlaybackStatus)
  const volume = useAppStore(selectVolume)
  const loadFile = useAppStore((s) => s.loadFile)
  // ...
}
```

- Use named selectors for state reads.
- Use inline selectors for action references (actions are referentially stable).

### File Organization

```
src/store/
  index.ts              # Store creation, useAppStore export
  types.ts              # All slice interfaces, AppStore, AppMiddleware, SliceCreator
  selectors.ts          # All selector functions
  idb-storage.ts        # IndexedDB storage adapter for persist middleware
  audio-sync.ts         # Store subscribers for audio engine sync
  test-utils.ts         # createTestStore helper
  slices/
    playback.ts         # createPlaybackSlice
    playlist.ts         # createPlaylistSlice
    mixer.ts            # createMixerSlice
    metadata.ts         # createMetadataSlice
    settings.ts         # createSettingsSlice
    instrument.ts       # createInstrumentSlice
    ui.ts               # createUISlice
    export.ts           # createExportSlice
    orchestration.ts    # createOrchestrationSlice (cross-slice actions)
```

---

## 6. Slice Dependency Rules

### Read Access

| From | To | Allowed? | Mechanism |
|------|----|----------|-----------|
| Slice-local action | Same slice | Yes | `set()` updater function receives current state |
| Slice-local action | Other slice | **No** | — |
| Orchestration action | Any slice | Yes | `get()` returns full `AppStore` |
| Selector | Any slice | Yes | Receives full `AppStore` |

**Rule: Domain slices are self-contained.** A slice-local action in `playback.ts` must not call `get()` to read `mixer` state. If an action needs data from another slice, it belongs in the orchestration slice.

### Write Access

| From | To | Allowed? | Mechanism |
|------|----|----------|-----------|
| Slice-local action | Same slice | Yes | `set({ ownFields })` |
| Slice-local action | Other slice | **No** | — |
| Orchestration action | Any slice | Yes | `set({ fieldsFromAnySlice })` |

**Rule: Only orchestration actions write across slice boundaries.** A `set()` call in `playback.ts` must only include fields defined in `PlaybackSlice`. Cross-slice writes go through orchestration actions.

### Why This Matters

This constraint eliminates circular dependencies. Each domain slice imports only `types.ts`. The orchestration slice imports `types.ts` and external services (audio engine, SPC parser, error reporter). No slice imports another slice.

```
types.ts ← playback.ts
         ← playlist.ts
         ← mixer.ts
         ← metadata.ts
         ← settings.ts
         ← instrument.ts
         ← ui.ts
         ← export.ts
         ← orchestration.ts ← audioEngine, spcParser, reportError
```

The dependency graph is a flat star topology, not a web.

### Enforcement

TypeScript does not structurally prevent a slice from calling `get().otherSliceField`. Enforcement is via code review and lint rules. If a slice-local `StateCreator` function calls `get()`, that is a code smell. Slice-local actions should use either:

- `set({ field: value })` — direct property set
- `set((state) => ({ field: derive(state.ownField) }))` — updater that reads own state

The parameter name in the updater is `state`, but within a slice-local action, only access fields defined in that slice's interface. The `get` parameter should be omitted from slice-local creators when unused:

```typescript
// Good — slice-local, no get() needed
export const createPlaybackSlice: SliceCreator<PlaybackSlice> = (set) => ({
  // ...
})

// Good — orchestration, get() is required
export const createOrchestrationSlice: SliceCreator<OrchestrationSlice> = (
  set,
  get,
) => ({
  // ...
})
```

---

## 7. Async Action Patterns

### Structure

Async orchestration actions follow this template:

```typescript
someAsyncAction: async (input: Input) => {
  // 1. Set loading state
  set({ isLoadingTrack: true, loadingError: null }, false, 'orchestration/action:start')

  try {
    // 2. Read current state
    const state = get()

    // 3. Perform async work
    const result = await someAsyncOperation()

    // 4. Re-read state after await — the store may have changed
    const current = get()
    if (current.activeTrackId !== expectedId) {
      // User initiated a different action — abort this one
      set({ isLoadingTrack: false }, false, 'orchestration/action:aborted')
      return
    }

    // 5. Handle Result type per ADR-0015
    if (!result.ok) {
      reportError(result.error)
      set(
        { isLoadingTrack: false, loadingError: result.error.message },
        false,
        'orchestration/action:resultError',
      )
      return
    }

    // 6. Atomic state update
    set({ ..., isLoadingTrack: false }, false, 'orchestration/action:complete')

    // 7. Trigger side effects (audio engine)
    await audioEngine.load(data)
  } catch (error) {
    // 8. Report unexpected errors per ADR-0015
    const message = error instanceof Error ? error.message : 'Unexpected error'
    reportError({
      code: 'AUDIO_WASM_INIT_FAILED',
      message,
      context: { detail: String(error) },
    })
    set(
      { isLoadingTrack: false, loadingError: message },
      false,
      'orchestration/action:error',
    )
  }
}
```

### Critical Rule: Re-read State After Await

After any `await`, the store state may have changed (the user could have triggered another action). Always call `get()` again to read current state, and check whether your action is still relevant. See the `playTrackAtIndex` implementation in §2 for the canonical example with the stale-state guard.

### Error Handling Per ADR-0015

Every catch block in an orchestration action must:

1. Call `reportError()` with a structured `AppError` — never silently swallow.
2. Use error codes from the `AppError` taxonomy (`SPC_INVALID_HEADER`, `AUDIO_WASM_INIT_FAILED`, etc.).
3. Update `UISlice` loading state so the UI reflects the error.

When handling a `Result` error (from `parseSpcFile` or similar), call `reportError()` directly with the error — do not re-throw it:

```typescript
// Correct — handle Result error inline
const parseResult = parseSpcFile(buffer)
if (!parseResult.ok) {
  reportError(parseResult.error)
  set({ isLoadingTrack: false, loadingError: parseResult.error.message }, false, '...')
  return
}

// Wrong — don't mix Result types and throw
if (!parseResult.ok) {
  throw new Error(parseResult.error.message) // ← violates ADR-0015 Rule 1
}
```

### Cancellation

SPC Player does not need an `AbortController` pattern for most operations because:

1. SPC file parsing is fast (< 50ms for a 66 KB file).
2. Audio engine load is a `postMessage` to the worklet — non-blocking.
3. The "stale action" check after `await` (re-read state and compare IDs) handles the common race condition.

For long-running export operations, the `ExportQueueManager` service manages cancellation via `AbortController` instances. These controllers are stored in a **module-level `Map<string, AbortController>`** inside the `ExportQueueManager`, keyed by job ID — **not** in the Zustand store:

```typescript
// src/export/queue-manager.ts

// Module-level — not in Zustand state.
// AbortController is non-serializable and would break DevTools
// inspection and persist middleware.
const abortControllers = new Map<string, AbortController>()

export function cancelExportJob(jobId: string): void {
  const controller = abortControllers.get(jobId)
  if (controller) {
    controller.abort()
    abortControllers.delete(jobId)
  }
}

export function startExportJob(jobId: string): AbortSignal {
  const controller = new AbortController()
  abortControllers.set(jobId, controller)
  return controller.signal
}
```

The export slice in Zustand only stores the serializable `ExportJob` status — see the `ExportSlice` interface in §1. The export pipeline design doc defines the complete `ExportQueueManager` architecture.

---

## 8. Store-to-AudioEngine Coordination

### Architecture

The audio engine is a **singleton service**, not part of the Zustand store. The store and the audio engine communicate through explicit calls in orchestration actions (imperative) and a subscriber for settings synchronization (reactive).

```
┌──────────┐     imperative calls      ┌──────────────┐
│          │ ─────────────────────────▸ │              │
│  Zustand │                            │ Audio Engine │
│  Store   │ ◂───── subscribe ───────── │  (singleton) │
│          │   (settings/mixer sync)    │              │
└──────────┘                            └──────────────┘
```

### Imperative Calls (Orchestration Actions)

When an orchestration action directly causes an audio engine operation, call the engine explicitly:

```typescript
// In orchestration actions
audioEngine.stop()
await audioEngine.load(spcData)
audioEngine.play()
audioEngine.seek(0)
```

This is the primary coordination mechanism. It is explicit, traceable, and testable.

### Reactive Sync (Store Subscriber)

For settings that can change independently of orchestration actions (e.g., the user adjusts volume via a slider, or mutes a voice via the mixer), use a Zustand subscriber with a selector.

In Zustand v5, `store.subscribe` natively accepts a selector as the first argument — no `subscribeWithSelector` middleware is needed:

```typescript
// src/store/audio-sync.ts

import { useAppStore } from '@/store'
import { selectVoiceMask } from '@/store/selectors'
import { audioEngine } from '@/audio/engine'

/**
 * Subscribes to store changes that need to be forwarded to the audio engine.
 * Call once at app initialization. Returns an unsubscribe function.
 */
export function initAudioSync(): () => void {
  const unsubs: Array<() => void> = []

  // Volume changes → audio engine
  unsubs.push(
    useAppStore.subscribe(
      (s) => s.volume,
      (volume) => { audioEngine.setVolume(volume) },
    ),
  )

  // Speed changes → audio engine
  unsubs.push(
    useAppStore.subscribe(
      (s) => s.speed,
      (speed) => { audioEngine.setSpeed(speed) },
    ),
  )

  // Voice mute/solo → audio engine (computed bitmask)
  unsubs.push(
    useAppStore.subscribe(
      selectVoiceMask,
      (mask) => { audioEngine.setVoiceMask(mask) },
    ),
  )

  // Sample rate changes → audio engine reconfiguration
  unsubs.push(
    useAppStore.subscribe(
      (s) => s.audioSampleRate,
      (sampleRate) => { audioEngine.reconfigure({ sampleRate }) },
    ),
  )

  return () => { unsubs.forEach((fn) => fn()) }
}
```

### When to Use Which

| Trigger | Mechanism | Example |
|---------|-----------|---------|
| Orchestration action that includes audio ops | Imperative call in the action | `loadFile` calls `audioEngine.load()` |
| UI control that maps 1:1 to an audio param | Store subscriber | Volume slider → `audioEngine.setVolume()` |
| Settings change requiring engine reconfiguration | Store subscriber | Sample rate change → `audioEngine.reconfigure()` |

**Rule:** Never use middleware to intercept `set()` calls and forward them to the audio engine. Middleware is invisible and makes debugging hard. Prefer explicit subscribers with clear source-to-effect mapping.

---

## 9. Testing Patterns

### Testing Orchestration Actions in Isolation

Create a real store instance for each test. Zustand stores are plain objects — no provider needed.

```typescript
// src/store/slices/__tests__/orchestration.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestStore } from '../../test-utils'

// Mock external services
vi.mock('@/audio/engine', () => ({
  audioEngine: {
    stop: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setVoiceMask: vi.fn(),
  },
}))

vi.mock('@/core/spc-parser', () => ({
  parseSpcFile: vi.fn().mockReturnValue({
    ok: true,
    value: {
      spcData: new ArrayBuffer(66048),
      metadata: {
        id666: { title: 'Test Track', durationMs: 180000 },
        xid6: null,
      },
    },
  }),
}))

vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}))

vi.mock('@/storage/spc-storage', () => ({
  loadSpcFromStorage: vi.fn().mockResolvedValue(new ArrayBuffer(66048)),
}))

describe('orchestration/loadFile', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore()
    vi.clearAllMocks()
  })

  it('resets playback state and populates metadata', async () => {
    const file = new File([new ArrayBuffer(66048)], 'test.spc')
    await store.getState().loadFile(file)

    expect(store.getState().playbackStatus).toBe('stopped')
    expect(store.getState().position).toBe(0)
    expect(store.getState().id666?.title).toBe('Test Track')
    expect(store.getState().voiceMuted.every((m) => !m)).toBe(true)
    expect(store.getState().isLoadingTrack).toBe(false)
  })

  it('stops the audio engine before loading', async () => {
    const { audioEngine } = await import('@/audio/engine')
    store.setState({ playbackStatus: 'playing' })

    const file = new File([new ArrayBuffer(66048)], 'test.spc')
    await store.getState().loadFile(file)

    expect(audioEngine.stop).toHaveBeenCalled()
  })

  it('calls reportError on parse failure', async () => {
    const { parseSpcFile } = await import('@/core/spc-parser')
    const { reportError } = await import('@/errors/report')

    vi.mocked(parseSpcFile).mockReturnValue({
      ok: false,
      error: { code: 'SPC_INVALID_HEADER', message: 'Invalid SPC file' },
    })

    const file = new File([new ArrayBuffer(100)], 'bad.spc')
    await store.getState().loadFile(file)

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SPC_INVALID_HEADER' }),
    )
    expect(store.getState().loadingError).toBe('Invalid SPC file')
    expect(store.getState().isLoadingTrack).toBe(false)
  })
})

describe('orchestration/removeTrackSafe', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore({
      tracks: [
        { id: 'a', filename: 'a.spc', title: 'A', durationMs: 1000 },
        { id: 'b', filename: 'b.spc', title: 'B', durationMs: 2000 },
        { id: 'c', filename: 'c.spc', title: 'C', durationMs: 3000 },
      ],
      activeIndex: 1,
      activeTrackId: 'b',
      playbackStatus: 'playing',
    })
  })

  it('advances to next track when removing active track', () => {
    store.getState().removeTrackSafe('b')

    expect(store.getState().tracks).toHaveLength(2)
    expect(store.getState().activeTrackId).toBe('c')
    expect(store.getState().playbackStatus).toBe('stopped')
  })

  it('clears state when removing the last track', () => {
    store.setState({
      tracks: [{ id: 'a', filename: 'a.spc', title: 'A', durationMs: 1000 }],
      activeIndex: 0,
      activeTrackId: 'a',
    })

    store.getState().removeTrackSafe('a')

    expect(store.getState().tracks).toHaveLength(0)
    expect(store.getState().activeTrackId).toBeNull()
    expect(store.getState().id666).toBeNull()
  })

  it('preserves active track when removing inactive track', () => {
    store.getState().removeTrackSafe('a')

    expect(store.getState().tracks).toHaveLength(2)
    expect(store.getState().activeTrackId).toBe('b')
    // activeIndex should be recalculated (was 1, 'a' at 0 removed, 'b' is now 0)
    expect(store.getState().activeIndex).toBe(0)
  })
})
```

### Test Utility: Creating a Store for Tests

```typescript
// src/store/test-utils.ts

import { create } from 'zustand'
import type { AppStore } from './types'
import { createPlaybackSlice } from './slices/playback'
import { createPlaylistSlice } from './slices/playlist'
import { createMixerSlice } from './slices/mixer'
import { createMetadataSlice } from './slices/metadata'
import { createSettingsSlice } from './slices/settings'
import { createInstrumentSlice } from './slices/instrument'
import { createUISlice } from './slices/ui'
import { createExportSlice } from './slices/export'
import { createOrchestrationSlice } from './slices/orchestration'

/**
 * Creates a fresh store instance for testing — no middleware (no devtools,
 * no persist). Accepts optional initial state overrides.
 *
 * The SliceCreator type expects the AppMiddleware tuple, but Zustand's
 * StateCreator is contravariant on the middleware parameter — slice creators
 * designed for a middleware-wrapped store work correctly when composed
 * without middleware. This is by design: the middleware tuple constrains
 * what `set()` signature the creator receives, and a plain `set()` is a
 * valid narrowing of a middleware-enhanced `set()`.
 */
export function createTestStore(overrides?: Partial<AppStore>) {
  const store = create<AppStore>()((...args) => ({
    ...createPlaybackSlice(...args),
    ...createPlaylistSlice(...args),
    ...createMixerSlice(...args),
    ...createMetadataSlice(...args),
    ...createSettingsSlice(...args),
    ...createInstrumentSlice(...args),
    ...createUISlice(...args),
    ...createExportSlice(...args),
    ...createOrchestrationSlice(...args),
  }))

  if (overrides) {
    store.setState(overrides)
  }

  return store
}
```

**Key testing rules:**

1. **No middleware in tests.** `devtools` and `persist` add complexity without value in unit tests. The `SliceCreator` type uses `AppMiddleware` generics, but `create()` without middleware still accepts the same slice creators (see docstring above).
2. **Mock external services**, not slices. The `audioEngine`, `parseSpcFile`, `reportError`, and `loadSpcFromStorage` are mocked. Slices use real implementations.
3. **Use `store.getState()` for assertions.** Don't subscribe; read state synchronously after the action.
4. **Use `store.setState()` for initial state.** Set preconditions directly instead of running setup actions.

### Testing Async Actions

```typescript
it('aborts if a different track is activated during load', async () => {
  const store = createTestStore({
    tracks: [
      { id: 'a', filename: 'a.spc', title: 'A', durationMs: 1000 },
      { id: 'b', filename: 'b.spc', title: 'B', durationMs: 2000 },
    ],
  })

  const { loadSpcFromStorage } = await import('@/storage/spc-storage')
  // Simulate slow storage read
  vi.mocked(loadSpcFromStorage).mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve(new ArrayBuffer(66048)), 100)),
  )

  // Start loading track 'a'
  const loadPromise = store.getState().playTrackAtIndex(0)

  // While loading, activate track 'b' directly
  store.setState({ activeTrackId: 'b' })

  await loadPromise

  // Track 'a' load should have aborted — 'b' should remain active
  expect(store.getState().activeTrackId).toBe('b')
})
```

---

## 10. Selector Performance Guidelines

### Stable References

Selectors that return primitives (string, number, boolean) work out of the box — Zustand uses `Object.is` comparison. Selectors that return new objects or arrays on every call cause unnecessary re-renders.

```typescript
// Bad — creates a new object every render, always triggers re-render
const bad = useAppStore((s) => ({
  status: s.playbackStatus,
  volume: s.volume,
}))

// Good — use useShallow for object/array selectors
import { useShallow } from 'zustand/react/shallow'

const { status, volume } = useAppStore(
  useShallow((s) => ({
    status: s.playbackStatus,
    volume: s.volume,
  })),
)

// Good — select individual primitives (prefer this when practical)
const status = useAppStore(selectPlaybackStatus)
const volume = useAppStore(selectVolume)
```

**Rule:** Prefer multiple primitive selectors over a single object selector. Use `useShallow` only when you genuinely need several values and multiple `useAppStore` calls would be unwieldy.

### Expensive Derived Selectors

For selectors that compute expensive derived values, memoize at the selector level:

```typescript
// src/store/selectors.ts

// This is cheap — no memoization needed
export const selectIsPlaying = (s: AppStore) => s.playbackStatus === 'playing'

// This is a loop over 8 items — cheap, but if it ran over 1000 items,
// you'd want to memoize with a library like reselect or zustand's
// createSelector utility
export const selectVoiceMask = (s: AppStore): number => {
  const hasSolo = s.voiceSolo.some(Boolean)
  let mask = 0
  for (let i = 0; i < 8; i++) {
    const isActive = hasSolo ? s.voiceSolo[i] : !s.voiceMuted[i]
    if (isActive) mask |= (1 << i)
  }
  return mask
}
```

For SPC Player's data sizes (8 voices, ~100 tracks max), no selectors need memoization. If a future selector operates on large data sets, add memoization at that point — not preemptively.

---

## 11. Quick Reference

### Adding a New Orchestration Action — Checklist

1. Add the action signature to `OrchestrationSlice` in `src/store/types.ts`.
2. Implement the action in `src/store/slices/orchestration.ts`.
3. Label all `set()` calls with `'orchestration/{actionName}:{phase}'`.
4. If async: re-read state after every `await`; check for stale conditions.
5. If async: wrap in `try`/`catch`; call `reportError()` in catch per ADR-0015.
6. If it touches the audio engine: call the engine explicitly (not via subscriber).
7. Batch all cross-slice state updates into a single `set()` call to prevent intermediate renders.
8. Write tests in `src/store/slices/__tests__/orchestration.test.ts`.
9. If the action should be callable from non-React contexts (e.g., keyboard shortcut handler), verify it works via `useAppStore.getState().actionName()`.

### Adding a New Slice — Checklist

1. Define the slice interface in `src/store/types.ts`.
2. Add the interface to the `AppStore` intersection type.
3. Create `src/store/slices/{sliceName}.ts` using the `SliceCreator` type.
4. Spread the new slice creator into the store in `src/store/index.ts`.
5. If persisted: add fields to the `partialize` function.
6. Create relevant selectors in `src/store/selectors.ts`.
7. Slice-local actions only: do not use `get()`, do not access other slices' fields.

### Prohibited Patterns

| Pattern | Why It's Banned |
|---------|----------------|
| `useEffect` that dispatches a store action on state change to sync slices | Creates hidden coupling and re-render loops. Use orchestration actions. |
| Slice importing another slice | Creates circular dependency risk. Use orchestration slice. |
| `set()` in a slice-local action that includes fields from another slice | Violates slice boundaries. Move to orchestration. |
| Middleware that intercepts `set()` to trigger audio engine calls | Invisible side effects. Use explicit subscribers or action calls. |
| Store action that calls `router.navigate()` | Store should not depend on the router. Components handle navigation after actions. |
| Storing non-serializable values in persisted state | Breaks IndexedDB persistence. Keep `Blob`, `ArrayBuffer`, `AbortController`, functions out of persisted state. |
| Storing `AbortController` in the store | Non-serializable; breaks DevTools and persist middleware. Use a module-level `Map<string, AbortController>` in the service that owns cancellation. |
| Multiple `set()` calls in an orchestration action that could be a single `set()` | Causes intermediate renders with inconsistent state. Batch all cross-slice updates into one `set()`. |
| `throw` after checking a `Result` error | Violates ADR-0015 Rule 1. Handle `Result` errors inline with `reportError()`, don't re-throw. |
| `catch` block that doesn't call `reportError()` | Violates ADR-0015 Rule 4. Every catch must report, recover, or re-throw. |
