import { describe, it, expect, beforeEach } from 'vitest';

import { createTestStore, makeTrack } from '../test-helpers';

describe('PlaylistSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has empty tracks', () => {
      expect(store.getState().tracks).toEqual([]);
    });

    it('has activeIndex -1', () => {
      expect(store.getState().activeIndex).toBe(-1);
    });

    it('has shuffle off', () => {
      expect(store.getState().shuffleMode).toBe(false);
    });

    it('has repeat off', () => {
      expect(store.getState().repeatMode).toBe('off');
    });
  });

  describe('addTracks', () => {
    it('appends tracks to empty playlist', () => {
      const t1 = makeTrack({ id: 'a' });
      const t2 = makeTrack({ id: 'b' });
      store.getState().addTracks([t1, t2]);
      expect(store.getState().tracks).toEqual([t1, t2]);
    });

    it('appends to existing tracks', () => {
      const t1 = makeTrack({ id: 'a' });
      const t2 = makeTrack({ id: 'b' });
      store.getState().addTracks([t1]);
      store.getState().addTracks([t2]);
      expect(store.getState().tracks).toHaveLength(2);
      expect(store.getState().tracks[1]).toEqual(t2);
    });

    it('does nothing when adding empty array', () => {
      store.getState().addTracks([]);
      expect(store.getState().tracks).toEqual([]);
    });
  });

  describe('removeTrack', () => {
    it('removes track by id', () => {
      const t1 = makeTrack({ id: 'a' });
      const t2 = makeTrack({ id: 'b' });
      store.getState().addTracks([t1, t2]);
      store.getState().removeTrack('a');
      expect(store.getState().tracks).toEqual([t2]);
    });

    it('adjusts activeIndex when removing before active', () => {
      store
        .getState()
        .addTracks([
          makeTrack({ id: 'a' }),
          makeTrack({ id: 'b' }),
          makeTrack({ id: 'c' }),
        ]);
      store.getState().setActiveIndex(2);
      store.getState().removeTrack('a');
      expect(store.getState().activeIndex).toBe(1);
    });

    it('sets activeIndex to -1 when removing the active track', () => {
      store
        .getState()
        .addTracks([makeTrack({ id: 'a' }), makeTrack({ id: 'b' })]);
      store.getState().setActiveIndex(0);
      store.getState().removeTrack('a');
      expect(store.getState().activeIndex).toBe(-1);
    });

    it('does not change activeIndex when removing after active', () => {
      store
        .getState()
        .addTracks([
          makeTrack({ id: 'a' }),
          makeTrack({ id: 'b' }),
          makeTrack({ id: 'c' }),
        ]);
      store.getState().setActiveIndex(0);
      store.getState().removeTrack('c');
      expect(store.getState().activeIndex).toBe(0);
    });

    it('does nothing for non-existent id', () => {
      store.getState().addTracks([makeTrack({ id: 'a' })]);
      store.getState().removeTrack('nonexistent');
      expect(store.getState().tracks).toHaveLength(1);
    });

    it('handles removing from empty playlist', () => {
      store.getState().removeTrack('a');
      expect(store.getState().tracks).toEqual([]);
    });
  });

  describe('reorderTracks', () => {
    it('moves track forward', () => {
      const t1 = makeTrack({ id: 'a', title: 'A' });
      const t2 = makeTrack({ id: 'b', title: 'B' });
      const t3 = makeTrack({ id: 'c', title: 'C' });
      store.getState().addTracks([t1, t2, t3]);

      store.getState().reorderTracks(0, 2);
      const ids = store.getState().tracks.map((t) => t.id);
      expect(ids).toEqual(['b', 'c', 'a']);
    });

    it('moves track backward', () => {
      const t1 = makeTrack({ id: 'a' });
      const t2 = makeTrack({ id: 'b' });
      const t3 = makeTrack({ id: 'c' });
      store.getState().addTracks([t1, t2, t3]);

      store.getState().reorderTracks(2, 0);
      const ids = store.getState().tracks.map((t) => t.id);
      expect(ids).toEqual(['c', 'a', 'b']);
    });

    it('updates activeIndex when active track is moved', () => {
      store
        .getState()
        .addTracks([
          makeTrack({ id: 'a' }),
          makeTrack({ id: 'b' }),
          makeTrack({ id: 'c' }),
        ]);
      store.getState().setActiveIndex(0);

      store.getState().reorderTracks(0, 2);
      expect(store.getState().activeIndex).toBe(2);
    });

    it('adjusts activeIndex when track moves from before to after active', () => {
      store
        .getState()
        .addTracks([
          makeTrack({ id: 'a' }),
          makeTrack({ id: 'b' }),
          makeTrack({ id: 'c' }),
        ]);
      store.getState().setActiveIndex(1);

      store.getState().reorderTracks(0, 2);
      expect(store.getState().activeIndex).toBe(0);
    });

    it('adjusts activeIndex when track moves from after to before active', () => {
      store
        .getState()
        .addTracks([
          makeTrack({ id: 'a' }),
          makeTrack({ id: 'b' }),
          makeTrack({ id: 'c' }),
        ]);
      store.getState().setActiveIndex(1);

      store.getState().reorderTracks(2, 0);
      expect(store.getState().activeIndex).toBe(2);
    });

    it('does nothing for out-of-range fromIndex', () => {
      store.getState().addTracks([makeTrack({ id: 'a' })]);
      store.getState().reorderTracks(5, 0);
      expect(store.getState().tracks).toHaveLength(1);
    });
  });

  describe('setActiveIndex', () => {
    it('sets index', () => {
      store.getState().setActiveIndex(3);
      expect(store.getState().activeIndex).toBe(3);
    });
  });

  describe('clearPlaylist', () => {
    it('resets tracks and activeIndex', () => {
      store.getState().addTracks([makeTrack(), makeTrack()]);
      store.getState().setActiveIndex(1);
      store.getState().clearPlaylist();
      expect(store.getState().tracks).toEqual([]);
      expect(store.getState().activeIndex).toBe(-1);
    });
  });

  describe('setShuffleMode', () => {
    it('enables shuffle', () => {
      store.getState().setShuffleMode(true);
      expect(store.getState().shuffleMode).toBe(true);
    });

    it('disables shuffle', () => {
      store.getState().setShuffleMode(true);
      store.getState().setShuffleMode(false);
      expect(store.getState().shuffleMode).toBe(false);
    });
  });

  describe('setRepeatMode', () => {
    it('sets to one', () => {
      store.getState().setRepeatMode('one');
      expect(store.getState().repeatMode).toBe('one');
    });

    it('sets to all', () => {
      store.getState().setRepeatMode('all');
      expect(store.getState().repeatMode).toBe('all');
    });

    it('sets back to off', () => {
      store.getState().setRepeatMode('all');
      store.getState().setRepeatMode('off');
      expect(store.getState().repeatMode).toBe('off');
    });
  });
});
