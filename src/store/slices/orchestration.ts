import type { OrchestrationSlice, SliceCreator, PlaylistTrack } from '../types';
import { computeTrackId } from '@/core/track-id';
import { parseSpcFile, SPC_MAX_ACCEPTED_SIZE } from '@/core/spc-parser';
import {
  calculateTrackDuration,
  secondsToSamples,
  DSP_SAMPLE_RATE,
} from '@/core/track-duration';
import { audioEngine } from '@/audio/engine';
import { saveSpcToStorage, loadSpcFromStorage } from '@/storage/spc-storage';
import { recordRecentPlay } from '@/storage/recently-played';
import { reportError } from '@/errors/report';
import { audioPipelineError, storageError } from '@/errors/factories';
import { resetRecoveryAttempts } from '@/audio/audio-recovery';

const THREE_SECONDS_IN_SAMPLES = DSP_SAMPLE_RATE * 3;

export const createOrchestrationSlice: SliceCreator<OrchestrationSlice> = (
  set,
  get,
) => ({
  loadFile: async (file: File) => {
    set(
      { isLoadingTrack: true, loadingError: null },
      false,
      'orchestration/loadFile:start',
    );

    try {
      const state = get();

      // Stop current playback if active
      if (state.playbackStatus !== 'stopped') {
        audioEngine.stop();
      }

      // Reject files that exceed the maximum accepted SPC size
      if (file.size > SPC_MAX_ACCEPTED_SIZE) {
        set(
          { isLoadingTrack: false, loadingError: 'File too large' },
          false,
          'orchestration/loadFile:tooLarge',
        );
        return;
      }

      // Read and parse the SPC file
      const buffer = await file.arrayBuffer();
      const parseResult = parseSpcFile(new Uint8Array(buffer));

      if (!parseResult.ok) {
        reportError(parseResult.error);
        set(
          { isLoadingTrack: false, loadingError: parseResult.error.message },
          false,
          'orchestration/loadFile:parseError',
        );
        return;
      }

      const spcFile = parseResult.value;
      const { metadata } = spcFile;

      // Compute content-addressable track ID
      const trackId = await computeTrackId(buffer);

      // Calculate track duration using the metadata cascade
      const current = get();
      const duration = calculateTrackDuration(
        metadata.xid6Timing,
        metadata.songLengthSeconds,
        metadata.fadeLengthMs,
        null, // No per-file user override on initial load
        {
          durationSeconds: current.defaultPlayDuration,
          fadeSeconds: current.defaultFadeDuration,
          loopCount: current.defaultLoopCount,
        },
      );

      // Resolve effective loop count for the UI
      const loopCount = duration.hasLoopData
        ? (duration.structure?.loopCount ?? current.defaultLoopCount)
        : current.defaultLoopCount;

      // Build PlaylistTrack descriptor
      const track: PlaylistTrack = {
        id: trackId,
        filename: file.name,
        title: metadata.title || file.name,
        durationMs: duration.totalSeconds * 1000,
      };

      // Save raw SPC data to IndexedDB for later retrieval
      await saveSpcToStorage({
        hash: trackId,
        name: file.name,
        data: buffer,
        game: metadata.gameTitle,
        artist: metadata.artist,
        addedAt: Date.now(),
        size: buffer.byteLength,
      });

      // Re-read state after async operations — user may have triggered another action
      const latest = get();
      const existingIndex = latest.tracks.findIndex((t) => t.id === trackId);

      // Atomic state update — single set() covering all affected slices
      if (existingIndex === -1) {
        set(
          {
            tracks: [...latest.tracks, track],
            activeIndex: latest.tracks.length,
            activeTrackId: trackId,
            playbackStatus: 'stopped',
            position: 0,
            metadata,
            voiceMuted: Array(8).fill(false) as readonly boolean[],
            voiceSolo: Array(8).fill(false) as readonly boolean[],
            activeInstrumentIndex: null,
            loopRegion: null,
            trackDuration: duration,
            loopCount,
            isLoadingTrack: false,
            loadingError: null,
          },
          false,
          'orchestration/loadFile',
        );
      } else {
        set(
          {
            activeIndex: existingIndex,
            activeTrackId: trackId,
            playbackStatus: 'stopped',
            position: 0,
            metadata,
            voiceMuted: Array(8).fill(false) as readonly boolean[],
            voiceSolo: Array(8).fill(false) as readonly boolean[],
            activeInstrumentIndex: null,
            loopRegion: null,
            trackDuration: duration,
            loopCount,
            isLoadingTrack: false,
            loadingError: null,
          },
          false,
          'orchestration/loadFile',
        );
      }

      // Load SPC into the audio engine.
      // ⚠ loadSpc transfers buffer ownership — all reads must precede this call.
      resetRecoveryAttempts();
      await audioEngine.loadSpc(
        buffer,
        secondsToSamples(duration.playSeconds),
        secondsToSamples(duration.fadeSeconds),
      );

      if (duration.structure) {
        audioEngine.setPlaybackConfig({
          type: 'set-playback-config',
          durationSamples: secondsToSamples(duration.playSeconds),
          fadeOutSamples: secondsToSamples(duration.fadeSeconds),
          loopCount: typeof loopCount === 'number' ? loopCount : null,
          structure: {
            introSamples: secondsToSamples(duration.structure.introSeconds),
            loopSamples: secondsToSamples(duration.structure.loopSeconds),
            endSamples: secondsToSamples(duration.structure.endSeconds),
          },
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      reportError(audioPipelineError('AUDIO_WASM_INIT_FAILED', { detail }));
      set(
        { isLoadingTrack: false, loadingError: detail },
        false,
        'orchestration/loadFile:error',
      );
    }
  },

  nextTrack: async () => {
    const { tracks, activeIndex, repeatMode, shuffleMode } = get();
    if (tracks.length === 0) return;

    let nextIndex: number;

    if (shuffleMode) {
      // Pick a random track, avoiding the current one when possible
      if (tracks.length === 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * tracks.length);
        } while (nextIndex === activeIndex);
      }
    } else if (repeatMode === 'one') {
      // Repeat‑one: restart the current track
      nextIndex = activeIndex;
    } else if (activeIndex >= tracks.length - 1) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        // End of playlist, repeat off — stop
        return;
      }
    } else {
      nextIndex = activeIndex + 1;
    }

    await get().playTrackAtIndex(nextIndex);
  },

  previousTrack: async () => {
    const { tracks, activeIndex, position } = get();
    if (tracks.length === 0) return;

    // If past 3 seconds of playback, restart the current track
    if (position > THREE_SECONDS_IN_SAMPLES) {
      audioEngine.seek(0);
      set({ position: 0 }, false, 'orchestration/previousTrack:restart');
      return;
    }

    const prevIndex = activeIndex > 0 ? activeIndex - 1 : tracks.length - 1;
    await get().playTrackAtIndex(prevIndex);
  },

  playTrackAtIndex: async (index: number) => {
    const { tracks } = get();
    if (index < 0 || index >= tracks.length) return;

    const track = tracks[index];
    const trackId = track.id;

    // Stop current playback
    audioEngine.stop();

    set(
      { isLoadingTrack: true, loadingError: null, activeTrackId: trackId },
      false,
      'orchestration/playTrackAtIndex:start',
    );

    try {
      // Load SPC data from IndexedDB
      const spcData = await loadSpcFromStorage(trackId);
      if (!spcData) {
        reportError(storageError('STORAGE_READ_FAILED', { key: trackId }));
        set(
          {
            isLoadingTrack: false,
            loadingError: 'Track data not found',
            activeTrackId: null,
          },
          false,
          'orchestration/playTrackAtIndex:notFound',
        );
        return;
      }

      // Check for race condition: did another action activate a different track?
      const current = get();
      if (
        current.activeTrackId !== null &&
        current.activeTrackId !== trackId &&
        current.isLoadingTrack
      ) {
        set(
          { isLoadingTrack: false },
          false,
          'orchestration/playTrackAtIndex:aborted',
        );
        return;
      }

      // Parse the SPC file
      const parseResult = parseSpcFile(new Uint8Array(spcData));
      if (!parseResult.ok) {
        reportError(parseResult.error);
        set(
          {
            isLoadingTrack: false,
            loadingError: parseResult.error.message,
            activeTrackId: null,
          },
          false,
          'orchestration/playTrackAtIndex:parseError',
        );
        return;
      }

      const spcFile = parseResult.value;
      const { metadata } = spcFile;

      // Calculate duration with current default settings
      const state = get();
      const duration = calculateTrackDuration(
        metadata.xid6Timing,
        metadata.songLengthSeconds,
        metadata.fadeLengthMs,
        null,
        {
          durationSeconds: state.defaultPlayDuration,
          fadeSeconds: state.defaultFadeDuration,
          loopCount: state.defaultLoopCount,
        },
      );

      const loopCount = duration.hasLoopData
        ? (duration.structure?.loopCount ?? state.defaultLoopCount)
        : state.defaultLoopCount;

      // Atomic cross-slice update
      set(
        {
          activeIndex: index,
          activeTrackId: trackId,
          playbackStatus: 'stopped',
          position: 0,
          metadata,
          voiceMuted: Array(8).fill(false) as readonly boolean[],
          voiceSolo: Array(8).fill(false) as readonly boolean[],
          activeInstrumentIndex: null,
          loopRegion: null,
          trackDuration: duration,
          loopCount,
          isLoadingTrack: false,
          loadingError: null,
        },
        false,
        'orchestration/playTrackAtIndex:loaded',
      );

      // Load into audio engine and start playback
      resetRecoveryAttempts();
      await audioEngine.loadSpc(
        spcData,
        secondsToSamples(duration.playSeconds),
        secondsToSamples(duration.fadeSeconds),
      );

      if (duration.structure) {
        audioEngine.setPlaybackConfig({
          type: 'set-playback-config',
          durationSamples: secondsToSamples(duration.playSeconds),
          fadeOutSamples: secondsToSamples(duration.fadeSeconds),
          loopCount: typeof loopCount === 'number' ? loopCount : null,
          structure: {
            introSamples: secondsToSamples(duration.structure.introSeconds),
            loopSamples: secondsToSamples(duration.structure.loopSeconds),
            endSamples: secondsToSamples(duration.structure.endSeconds),
          },
        });
      }

      const started = audioEngine.play();
      if (started) {
        set(
          { playbackStatus: 'playing' },
          false,
          'orchestration/playTrackAtIndex:play',
        );
        // Fire-and-forget — never block playback on history writes
        void recordRecentPlay(trackId).catch(() => {
          /* fire-and-forget */
        });
      }
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Failed to play track';
      reportError(audioPipelineError('AUDIO_WASM_INIT_FAILED', { detail }));
      set(
        { isLoadingTrack: false, loadingError: detail, activeTrackId: null },
        false,
        'orchestration/playTrackAtIndex:error',
      );
    }
  },

  stopAndClear: () => {
    audioEngine.stop();
    set(
      {
        playbackStatus: 'stopped',
        position: 0,
        activeTrackId: null,
        metadata: null,
        loopRegion: null,
        trackDuration: null,
        loopCount: get().defaultLoopCount,
      },
      false,
      'orchestration/stopAndClear',
    );
  },

  removeTrackSafe: (trackId: string) => {
    const { tracks, activeTrackId, activeIndex: _activeIndex } = get();
    const removeIndex = tracks.findIndex((t) => t.id === trackId);
    if (removeIndex === -1) return;

    const isRemovingActive = trackId === activeTrackId;
    const newTracks = tracks.filter((t) => t.id !== trackId);

    if (isRemovingActive) {
      audioEngine.stop();

      if (newTracks.length === 0) {
        // Playlist is now empty — full reset
        set(
          {
            tracks: newTracks,
            activeIndex: -1,
            activeTrackId: null,
            playbackStatus: 'stopped',
            position: 0,
            metadata: null,
            loopRegion: null,
            trackDuration: null,
            loopCount: get().defaultLoopCount,
            isLoadingTrack: false,
            loadingError: null,
          },
          false,
          'orchestration/removeTrackSafe:emptyPlaylist',
        );
      } else {
        // Advance to next track or clamp to last
        const nextIndex = Math.min(removeIndex, newTracks.length - 1);
        set(
          {
            tracks: newTracks,
            activeIndex: nextIndex,
            activeTrackId: newTracks[nextIndex].id,
            playbackStatus: 'stopped',
            position: 0,
            loopRegion: null,
            trackDuration: null,
          },
          false,
          'orchestration/removeTrackSafe:advanceTrack',
        );
        // Optionally auto-load the next track (caller can trigger playTrackAtIndex)
      }
    } else {
      // Removing an inactive track — recalculate activeIndex
      const newActiveIndex = newTracks.findIndex((t) => t.id === activeTrackId);
      set(
        { tracks: newTracks, activeIndex: newActiveIndex },
        false,
        'orchestration/removeTrackSafe:removeInactive',
      );
    }
  },
});
