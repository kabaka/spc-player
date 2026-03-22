import { beforeEach, describe, expect, it } from 'vitest';

import { createTestStore } from '../test-helpers';

describe('MixerSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has all 8 voices unmuted', () => {
      expect(store.getState().voiceMuted).toEqual(Array(8).fill(false));
      expect(store.getState().voiceMuted).toHaveLength(8);
    });

    it('has no voices soloed', () => {
      expect(store.getState().voiceSolo).toEqual(Array(8).fill(false));
      expect(store.getState().voiceSolo).toHaveLength(8);
    });
  });

  describe('toggleMute', () => {
    it('mutes a voice', () => {
      store.getState().toggleMute(2);
      expect(store.getState().voiceMuted[2]).toBe(true);
    });

    it('unmutes a previously muted voice', () => {
      store.getState().toggleMute(2);
      store.getState().toggleMute(2);
      expect(store.getState().voiceMuted[2]).toBe(false);
    });

    it('does not affect other voices', () => {
      store.getState().toggleMute(3);
      expect(store.getState().voiceMuted[0]).toBe(false);
      expect(store.getState().voiceMuted[1]).toBe(false);
      expect(store.getState().voiceMuted[2]).toBe(false);
      expect(store.getState().voiceMuted[4]).toBe(false);
    });

    it('allows multiple voices to be muted', () => {
      store.getState().toggleMute(0);
      store.getState().toggleMute(7);
      expect(store.getState().voiceMuted[0]).toBe(true);
      expect(store.getState().voiceMuted[7]).toBe(true);
      expect(store.getState().voiceMuted[3]).toBe(false);
    });

    it('expands array for out-of-range index (no bounds guard)', () => {
      store.getState().toggleMute(99);
      // Current implementation does not guard bounds — array grows via JS semantics.
      // Verify it doesn't throw; the array will contain sparse entries.
      expect(store.getState().voiceMuted[99]).toBe(true);
    });
  });

  describe('toggleSolo', () => {
    it('solos a voice', () => {
      store.getState().toggleSolo(3);
      expect(store.getState().voiceSolo[3]).toBe(true);
    });

    it('un-solos a previously soloed voice', () => {
      store.getState().toggleSolo(3);
      store.getState().toggleSolo(3);
      expect(store.getState().voiceSolo[3]).toBe(false);
    });

    it('does not affect other voices', () => {
      store.getState().toggleSolo(5);
      expect(store.getState().voiceSolo[0]).toBe(false);
      expect(store.getState().voiceSolo[4]).toBe(false);
      expect(store.getState().voiceSolo[6]).toBe(false);
    });

    it('does not affect mute state', () => {
      store.getState().toggleMute(2);
      store.getState().toggleSolo(2);
      expect(store.getState().voiceMuted[2]).toBe(true);
      expect(store.getState().voiceSolo[2]).toBe(true);
    });
  });

  describe('resetMixer', () => {
    it('clears all mute and solo states', () => {
      store.getState().toggleMute(0);
      store.getState().toggleMute(3);
      store.getState().toggleMute(7);
      store.getState().toggleSolo(1);
      store.getState().toggleSolo(5);

      store.getState().resetMixer();

      expect(store.getState().voiceMuted).toEqual(Array(8).fill(false));
      expect(store.getState().voiceSolo).toEqual(Array(8).fill(false));
    });

    it('is a no-op when already reset', () => {
      store.getState().resetMixer();
      expect(store.getState().voiceMuted).toEqual(Array(8).fill(false));
      expect(store.getState().voiceSolo).toEqual(Array(8).fill(false));
    });
  });
});
