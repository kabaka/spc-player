import { describe, it, expect, beforeEach } from 'vitest';

import { createTestStore } from './test-helpers';

describe('Composed AppStore', () => {
  const createStore = createTestStore;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  describe('initial state', () => {
    it('has correct playback defaults', () => {
      const s = store.getState();
      expect(s.playbackStatus).toBe('stopped');
      expect(s.volume).toBe(0.8);
      expect(s.speed).toBe(1);
      expect(s.position).toBe(0);
      expect(s.loopCount).toBe(2);
      expect(s.activeTrackId).toBeNull();
      expect(s.trackDuration).toBeNull();
      expect(s.loopRegion).toBeNull();
    });

    it('has correct playlist defaults', () => {
      const s = store.getState();
      expect(s.tracks).toEqual([]);
      expect(s.activeIndex).toBe(-1);
      expect(s.shuffleMode).toBe(false);
      expect(s.repeatMode).toBe('off');
    });

    it('has correct mixer defaults', () => {
      const s = store.getState();
      expect(s.voiceMuted).toEqual(Array(8).fill(false));
      expect(s.voiceSolo).toEqual(Array(8).fill(false));
    });

    it('has correct metadata defaults', () => {
      expect(store.getState().metadata).toBeNull();
    });

    it('has correct settings defaults', () => {
      const s = store.getState();
      expect(s.theme).toBe('system');
      expect(s.audioSampleRate).toBe(48000);
      expect(s.resamplingQuality).toBe('standard');
      expect(s.keyboardMappings).toEqual({});
      expect(s.exportDefaults).toEqual({
        format: 'wav',
        sampleRate: 44100,
        loopCount: 2,
      });
      expect(s.defaultLoopCount).toBe(2);
      expect(s.defaultPlayDuration).toBe(180);
      expect(s.defaultFadeDuration).toBe(10);
    });

    it('has correct instrument defaults', () => {
      const s = store.getState();
      expect(s.activeInstrumentIndex).toBeNull();
      expect(s.isMidiConnected).toBe(false);
    });

    it('has correct UI defaults', () => {
      const s = store.getState();
      expect(s.isLoadingTrack).toBe(false);
      expect(s.loadingError).toBeNull();
    });

    it('has correct export defaults', () => {
      const s = store.getState();
      expect(s.jobs).toEqual([]);
      expect(s.isExporting).toBe(false);
      expect(s.queueSize).toBe(0);
      expect(s.batchProgress).toBeNull();
    });
  });

  describe('cross-slice isolation', () => {
    it('changing playback state does not alter playlist state', () => {
      const tracksBefore = store.getState().tracks;
      const indexBefore = store.getState().activeIndex;

      store.getState().setPlaybackStatus('playing');
      store.getState().setVolume(0.5);
      store.getState().setPosition(42);

      expect(store.getState().tracks).toBe(tracksBefore);
      expect(store.getState().activeIndex).toBe(indexBefore);
    });

    it('changing playlist state does not alter playback state', () => {
      store.getState().setPlaybackStatus('playing');
      store.getState().setVolume(0.7);
      const statusBefore = store.getState().playbackStatus;
      const volumeBefore = store.getState().volume;

      store
        .getState()
        .addTracks([
          { id: '1', filename: 'a.spc', title: 'A', durationMs: 1000 },
        ]);
      store.getState().setActiveIndex(0);

      expect(store.getState().playbackStatus).toBe(statusBefore);
      expect(store.getState().volume).toBe(volumeBefore);
    });
  });

  describe('orchestration/stopAndClear', () => {
    it('resets playback state', () => {
      const s = store.getState();
      s.setPlaybackStatus('playing');
      s.setPosition(99);
      s.setActiveTrackId('abc');
      s.setLoopStart(10);

      store.getState().stopAndClear();

      const after = store.getState();
      expect(after.playbackStatus).toBe('stopped');
      expect(after.position).toBe(0);
      expect(after.activeTrackId).toBeNull();
      expect(after.metadata).toBeNull();
      expect(after.loopRegion).toBeNull();
    });

    it('does not reset playlist or mixer state', () => {
      store
        .getState()
        .addTracks([
          { id: '1', filename: 'a.spc', title: 'A', durationMs: 1000 },
        ]);
      store.getState().setActiveIndex(0);
      store.getState().toggleMute(2);

      store.getState().stopAndClear();

      expect(store.getState().tracks).toHaveLength(1);
      expect(store.getState().activeIndex).toBe(0);
      expect(store.getState().voiceMuted[2]).toBe(true);
    });
  });
});
