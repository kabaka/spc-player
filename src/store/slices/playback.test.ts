import { describe, it, expect, beforeEach } from 'vitest';

import { createTestStore } from '../test-helpers';
import type { TrackDuration } from '../types';

describe('PlaybackSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has stopped status', () => {
      expect(store.getState().playbackStatus).toBe('stopped');
    });

    it('has null activeTrackId', () => {
      expect(store.getState().activeTrackId).toBeNull();
    });

    it('has position 0', () => {
      expect(store.getState().position).toBe(0);
    });

    it('has speed 1', () => {
      expect(store.getState().speed).toBe(1);
    });

    it('has volume 0.8', () => {
      expect(store.getState().volume).toBe(0.8);
    });

    it('has loopCount 2', () => {
      expect(store.getState().loopCount).toBe(2);
    });

    it('has null trackDuration', () => {
      expect(store.getState().trackDuration).toBeNull();
    });

    it('has null loopRegion', () => {
      expect(store.getState().loopRegion).toBeNull();
    });
  });

  describe('setPlaybackStatus', () => {
    it('changes to playing', () => {
      store.getState().setPlaybackStatus('playing');
      expect(store.getState().playbackStatus).toBe('playing');
    });

    it('changes to paused', () => {
      store.getState().setPlaybackStatus('paused');
      expect(store.getState().playbackStatus).toBe('paused');
    });

    it('changes back to stopped', () => {
      store.getState().setPlaybackStatus('playing');
      store.getState().setPlaybackStatus('stopped');
      expect(store.getState().playbackStatus).toBe('stopped');
    });
  });

  describe('setVolume', () => {
    it('sets a normal value', () => {
      store.getState().setVolume(0.5);
      expect(store.getState().volume).toBe(0.5);
    });

    it('clamps below 0 to 0', () => {
      store.getState().setVolume(-0.1);
      expect(store.getState().volume).toBe(0);
    });

    it('clamps above 1 to 1', () => {
      store.getState().setVolume(1.5);
      expect(store.getState().volume).toBe(1);
    });

    it('allows exact 0', () => {
      store.getState().setVolume(0);
      expect(store.getState().volume).toBe(0);
    });

    it('allows exact 1', () => {
      store.getState().setVolume(1);
      expect(store.getState().volume).toBe(1);
    });
  });

  describe('setSpeed', () => {
    it('updates speed', () => {
      store.getState().setSpeed(2);
      expect(store.getState().speed).toBe(2);
    });

    it('allows fractional speed', () => {
      store.getState().setSpeed(0.5);
      expect(store.getState().speed).toBe(0.5);
    });
  });

  describe('setPosition', () => {
    it('updates position', () => {
      store.getState().setPosition(42.5);
      expect(store.getState().position).toBe(42.5);
    });
  });

  describe('setActiveTrackId', () => {
    it('sets an id', () => {
      store.getState().setActiveTrackId('track-1');
      expect(store.getState().activeTrackId).toBe('track-1');
    });

    it('clears with null', () => {
      store.getState().setActiveTrackId('track-1');
      store.getState().setActiveTrackId(null);
      expect(store.getState().activeTrackId).toBeNull();
    });
  });

  describe('setLoopCount', () => {
    it('sets numeric count', () => {
      store.getState().setLoopCount(5);
      expect(store.getState().loopCount).toBe(5);
    });

    it('sets infinite', () => {
      store.getState().setLoopCount('infinite');
      expect(store.getState().loopCount).toBe('infinite');
    });

    it('switches from infinite back to numeric', () => {
      store.getState().setLoopCount('infinite');
      store.getState().setLoopCount(3);
      expect(store.getState().loopCount).toBe(3);
    });
  });

  describe('setTrackDuration', () => {
    const duration: TrackDuration = {
      playSeconds: 120,
      fadeSeconds: 10,
      totalSeconds: 130,
      hasLoopData: true,
      timingSource: 'id666',
      structure: {
        introSeconds: 5,
        loopSeconds: 60,
        endSeconds: 65,
        loopCount: 2,
      },
    };

    it('sets duration', () => {
      store.getState().setTrackDuration(duration);
      expect(store.getState().trackDuration).toEqual(duration);
    });

    it('clears with null', () => {
      store.getState().setTrackDuration(duration);
      store.getState().setTrackDuration(null);
      expect(store.getState().trackDuration).toBeNull();
    });
  });

  describe('loop region', () => {
    it('setLoopStart creates region if none exists', () => {
      store.getState().setLoopStart(10);
      const region = store.getState().loopRegion;
      expect(region).not.toBeNull();
      if (region === null) throw new Error('expected non-null');
      expect(region.startTime).toBe(10);
      expect(region.endTime).toBe(10);
      expect(region.active).toBe(true);
    });

    it('setLoopStart preserves existing endTime and active', () => {
      store.getState().setLoopStart(5);
      store.getState().setLoopEnd(20);
      store.getState().toggleLoop(); // active -> false
      store.getState().setLoopStart(8);

      const region = store.getState().loopRegion;
      if (region === null) throw new Error('expected non-null');
      expect(region.startTime).toBe(8);
      expect(region.endTime).toBe(20);
      expect(region.active).toBe(false);
    });

    it('setLoopEnd creates region if none exists', () => {
      store.getState().setLoopEnd(30);
      const region = store.getState().loopRegion;
      expect(region).not.toBeNull();
      if (region === null) throw new Error('expected non-null');
      expect(region.startTime).toBe(0);
      expect(region.endTime).toBe(30);
      expect(region.active).toBe(true);
    });

    it('setLoopEnd updates end in existing region', () => {
      store.getState().setLoopStart(5);
      store.getState().setLoopEnd(25);
      const region = store.getState().loopRegion;
      if (region === null) throw new Error('expected non-null');
      expect(region.endTime).toBe(25);
    });

    it('toggleLoop flips active state', () => {
      store.getState().setLoopStart(0);
      let region = store.getState().loopRegion;
      if (region === null) throw new Error('expected non-null');
      expect(region.active).toBe(true);

      store.getState().toggleLoop();
      region = store.getState().loopRegion;
      if (region === null) throw new Error('expected non-null');
      expect(region.active).toBe(false);

      store.getState().toggleLoop();
      region = store.getState().loopRegion;
      if (region === null) throw new Error('expected non-null');
      expect(region.active).toBe(true);
    });

    it('toggleLoop does nothing when no region exists', () => {
      store.getState().toggleLoop();
      expect(store.getState().loopRegion).toBeNull();
    });

    it('clearLoop resets to null', () => {
      store.getState().setLoopStart(5);
      store.getState().setLoopEnd(15);
      store.getState().clearLoop();
      expect(store.getState().loopRegion).toBeNull();
    });
  });
});
