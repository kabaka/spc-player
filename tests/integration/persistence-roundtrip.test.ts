/**
 * Integration test: persistence round-trip via Zustand persist middleware.
 *
 * Verifies: state changes → storage write → fresh store rehydration.
 *
 * Uses an in-memory StateStorage mock (fake-indexeddb is not installed).
 * This tests the Zustand persist configuration (partialize, rehydration)
 * rather than the IndexedDB adapter itself.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// In-memory storage (shared across module resets via vi.hoisted)
// ---------------------------------------------------------------------------

const { storageData } = vi.hoisted(() => ({
  storageData: new Map<string, string>(),
}));

// ---------------------------------------------------------------------------
// Module mocks — replace IndexedDB-dependent modules
// ---------------------------------------------------------------------------

vi.mock('@/storage/idb-storage', () => ({
  idbStorage: {
    getItem: (name: string) => storageData.get(name) ?? null,
    setItem: (name: string, value: string) => {
      storageData.set(name, value);
    },
    removeItem: (name: string) => {
      storageData.delete(name);
    },
  } satisfies StateStorage,
}));

vi.mock('@/storage/spc-storage', () => ({
  saveSpcToStorage: vi.fn().mockResolvedValue(1),
  loadSpcFromStorage: vi.fn().mockResolvedValue(null),
  deleteSpcFromStorage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/storage/recently-played', () => ({
  recordRecentPlay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/audio/engine', () => ({
  audioEngine: {
    stop: vi.fn(),
    loadSpc: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockReturnValue(true),
    seek: vi.fn(),
    setPlaybackConfig: vi.fn(),
    setOnPlaybackEnded: vi.fn(),
    setVolume: vi.fn(),
    setVoiceMask: vi.fn(),
    setSpeed: vi.fn(),
  },
}));

vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait long enough for async persist writes and rehydration reads. */
const flushAsyncStorage = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 100));

/** Import a fresh useAppStore by resetting module cache. */
async function importFreshStore() {
  vi.resetModules();
  const mod = await import('@/store/store');
  return mod.useAppStore;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('persistence round-trip', () => {
  beforeEach(() => {
    storageData.clear();
    vi.resetModules();
  });

  // -----------------------------------------------------------------------
  // Settings persistence
  // -----------------------------------------------------------------------

  describe('settings', () => {
    it('persists and restores theme', async () => {
      const store1 = await importFreshStore();
      store1.getState().setTheme('dark');
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().theme).toBe('dark');
    });

    it('persists and restores audioSampleRate', async () => {
      const store1 = await importFreshStore();
      store1.getState().setAudioSampleRate(96000);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().audioSampleRate).toBe(96000);
    });

    it('persists and restores volume', async () => {
      const store1 = await importFreshStore();
      store1.getState().setVolume(0.3);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().volume).toBeCloseTo(0.3);
    });

    it('persists and restores resamplingQuality', async () => {
      const store1 = await importFreshStore();
      store1.getState().setResamplingQuality('high');
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().resamplingQuality).toBe('high');
    });

    it('persists and restores defaultLoopCount', async () => {
      const store1 = await importFreshStore();
      store1.getState().setDefaultLoopCount(5);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().defaultLoopCount).toBe(5);
    });

    it('persists and restores defaultPlayDuration', async () => {
      const store1 = await importFreshStore();
      store1.getState().setDefaultPlayDuration(300);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().defaultPlayDuration).toBe(300);
    });

    it('persists and restores defaultFadeDuration', async () => {
      const store1 = await importFreshStore();
      store1.getState().setDefaultFadeDuration(15);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().defaultFadeDuration).toBe(15);
    });

    it('persists and restores exportDefaults', async () => {
      const store1 = await importFreshStore();
      store1.getState().setExportDefaults({ format: 'flac', loopCount: 4 });
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      const defaults = store2.getState().exportDefaults;
      expect(defaults.format).toBe('flac');
      expect(defaults.loopCount).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // Playlist persistence
  // -----------------------------------------------------------------------

  describe('playlist', () => {
    it('persists and restores tracks', async () => {
      const store1 = await importFreshStore();
      const tracks = [
        {
          id: 'abc123',
          filename: 'boss.spc',
          title: 'Boss Battle',
          durationMs: 180_000,
        },
        {
          id: 'def456',
          filename: 'town.spc',
          title: 'Town Theme',
          durationMs: 120_000,
        },
      ];
      store1.getState().addTracks(tracks);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().tracks).toHaveLength(2);
      expect(store2.getState().tracks[0].id).toBe('abc123');
      expect(store2.getState().tracks[1].title).toBe('Town Theme');
    });

    it('persists and restores activeIndex', async () => {
      const store1 = await importFreshStore();
      store1.getState().addTracks([
        { id: 'a', filename: 'a.spc', title: 'A', durationMs: 60_000 },
        { id: 'b', filename: 'b.spc', title: 'B', durationMs: 60_000 },
      ]);
      store1.getState().setActiveIndex(1);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().activeIndex).toBe(1);
    });

    it('persists and restores shuffleMode', async () => {
      const store1 = await importFreshStore();
      store1.getState().setShuffleMode(true);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().shuffleMode).toBe(true);
    });

    it('persists and restores repeatMode', async () => {
      const store1 = await importFreshStore();
      store1.getState().setRepeatMode('all');
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().repeatMode).toBe('all');
    });
  });

  // -----------------------------------------------------------------------
  // Playback — partial persistence
  // -----------------------------------------------------------------------

  describe('playback — partial persistence', () => {
    it('persists activeTrackId', async () => {
      const store1 = await importFreshStore();
      store1.getState().setActiveTrackId('track-xyz');
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().activeTrackId).toBe('track-xyz');
    });
  });

  // -----------------------------------------------------------------------
  // Non-persisted state should NOT be restored
  // -----------------------------------------------------------------------

  describe('non-persisted state', () => {
    it('does not restore metadata', async () => {
      const store1 = await importFreshStore();
      store1.getState().setMetadata({
        title: 'Should Not Persist',
        gameTitle: 'Test',
        artist: 'Test',
        dumperName: '',
        comments: '',
        dumpDate: '',
        emulatorUsed: '',
        songLengthSeconds: 0,
        fadeLengthMs: 0,
        ostTitle: null,
        ostDisc: null,
        ostTrack: null,
        publisher: null,
        copyrightYear: null,
        id666Format: 'text',
        xid6Timing: null,
      });
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().metadata).toBeNull();
    });

    it('does not restore mixer voice mute/solo state', async () => {
      const store1 = await importFreshStore();
      store1.getState().toggleMute(0);
      store1.getState().toggleSolo(3);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().voiceMuted).toEqual(Array(8).fill(false));
      expect(store2.getState().voiceSolo).toEqual(Array(8).fill(false));
    });

    it('does not restore playbackStatus', async () => {
      const store1 = await importFreshStore();
      store1.getState().setPlaybackStatus('playing');
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().playbackStatus).toBe('stopped');
    });

    it('does not restore position', async () => {
      const store1 = await importFreshStore();
      store1.getState().setPosition(42_000);
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().position).toBe(0);
    });

    it('does not restore UI loading state', async () => {
      const store1 = await importFreshStore();
      store1.getState().setIsLoadingTrack(true);
      store1.getState().setLoadingError('Something broke');
      await flushAsyncStorage();

      const store2 = await importFreshStore();
      await flushAsyncStorage();

      expect(store2.getState().isLoadingTrack).toBe(false);
      expect(store2.getState().loadingError).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Combined round-trip
  // -----------------------------------------------------------------------

  describe('full round-trip', () => {
    it('persists multiple fields and restores them in a single cycle', async () => {
      const store1 = await importFreshStore();

      // Set diverse state.
      store1.getState().setTheme('light');
      store1.getState().setAudioSampleRate(44100);
      store1.getState().setVolume(0.6);
      store1.getState().setDefaultLoopCount(3);
      store1.getState().addTracks([
        {
          id: 'trk1',
          filename: 'overworld.spc',
          title: 'Overworld',
          durationMs: 200_000,
        },
      ]);
      store1.getState().setActiveIndex(0);
      store1.getState().setActiveTrackId('trk1');
      store1.getState().setRepeatMode('one');

      // Also set non-persisted state.
      store1.getState().setPlaybackStatus('playing');
      store1.getState().setPosition(50_000);
      store1.getState().toggleMute(2);

      await flushAsyncStorage();

      // Verify the storage contains data.
      expect(storageData.has('spc-player-state')).toBe(true);

      // Rehydrate into a fresh store.
      const store2 = await importFreshStore();
      await flushAsyncStorage();

      const s = store2.getState();

      // Persisted fields.
      expect(s.theme).toBe('light');
      expect(s.audioSampleRate).toBe(44100);
      expect(s.volume).toBeCloseTo(0.6);
      expect(s.defaultLoopCount).toBe(3);
      expect(s.tracks).toHaveLength(1);
      expect(s.tracks[0].title).toBe('Overworld');
      expect(s.activeIndex).toBe(0);
      expect(s.activeTrackId).toBe('trk1');
      expect(s.repeatMode).toBe('one');

      // Non-persisted fields reset to defaults.
      expect(s.playbackStatus).toBe('stopped');
      expect(s.position).toBe(0);
      expect(s.voiceMuted).toEqual(Array(8).fill(false));
    });
  });
});
