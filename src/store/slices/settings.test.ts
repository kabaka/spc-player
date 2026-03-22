import { beforeEach, describe, expect, it } from 'vitest';

import { createTestStore } from '../test-helpers';

describe('SettingsSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has system theme', () => {
      expect(store.getState().theme).toBe('system');
    });

    it('has 48000 sample rate', () => {
      expect(store.getState().audioSampleRate).toBe(48000);
    });

    it('has standard resampling quality', () => {
      expect(store.getState().resamplingQuality).toBe('standard');
    });

    it('has empty keyboard mappings', () => {
      expect(store.getState().keyboardMappings).toEqual({});
    });

    it('has wav/44100/2 export defaults', () => {
      expect(store.getState().exportDefaults).toEqual({
        format: 'wav',
        sampleRate: 44100,
        loopCount: 2,
      });
    });

    it('has defaultLoopCount 2', () => {
      expect(store.getState().defaultLoopCount).toBe(2);
    });

    it('has defaultPlayDuration 180', () => {
      expect(store.getState().defaultPlayDuration).toBe(180);
    });

    it('has defaultFadeDuration 10', () => {
      expect(store.getState().defaultFadeDuration).toBe(10);
    });
  });

  describe('setTheme', () => {
    it('sets light', () => {
      store.getState().setTheme('light');
      expect(store.getState().theme).toBe('light');
    });

    it('sets dark', () => {
      store.getState().setTheme('dark');
      expect(store.getState().theme).toBe('dark');
    });

    it('sets system', () => {
      store.getState().setTheme('dark');
      store.getState().setTheme('system');
      expect(store.getState().theme).toBe('system');
    });
  });

  describe('setAudioSampleRate', () => {
    it('sets 32000', () => {
      store.getState().setAudioSampleRate(32000);
      expect(store.getState().audioSampleRate).toBe(32000);
    });

    it('sets 96000', () => {
      store.getState().setAudioSampleRate(96000);
      expect(store.getState().audioSampleRate).toBe(96000);
    });
  });

  describe('setResamplingQuality', () => {
    it('sets high', () => {
      store.getState().setResamplingQuality('high');
      expect(store.getState().resamplingQuality).toBe('high');
    });

    it('sets custom', () => {
      store.getState().setResamplingQuality('custom');
      expect(store.getState().resamplingQuality).toBe('custom');
    });
  });

  describe('setKeyboardMapping', () => {
    it('adds a new mapping', () => {
      store.getState().setKeyboardMapping('play', 'Space');
      expect(store.getState().keyboardMappings).toEqual({ play: 'Space' });
    });

    it('updates an existing mapping', () => {
      store.getState().setKeyboardMapping('play', 'Space');
      store.getState().setKeyboardMapping('play', 'Enter');
      expect(store.getState().keyboardMappings.play).toBe('Enter');
    });

    it('preserves other mappings', () => {
      store.getState().setKeyboardMapping('play', 'Space');
      store.getState().setKeyboardMapping('stop', 'Escape');
      expect(store.getState().keyboardMappings).toEqual({
        play: 'Space',
        stop: 'Escape',
      });
    });
  });

  describe('setExportDefaults', () => {
    it('merges partial format update', () => {
      store.getState().setExportDefaults({ format: 'flac' });
      expect(store.getState().exportDefaults).toEqual({
        format: 'flac',
        sampleRate: 44100,
        loopCount: 2,
      });
    });

    it('merges partial sampleRate update', () => {
      store.getState().setExportDefaults({ sampleRate: 96000 });
      expect(store.getState().exportDefaults.sampleRate).toBe(96000);
      expect(store.getState().exportDefaults.format).toBe('wav');
    });

    it('merges multiple fields at once', () => {
      store.getState().setExportDefaults({ format: 'mp3', loopCount: 5 });
      expect(store.getState().exportDefaults).toEqual({
        format: 'mp3',
        sampleRate: 44100,
        loopCount: 5,
      });
    });
  });

  describe('setDefaultLoopCount', () => {
    it('updates loop count', () => {
      store.getState().setDefaultLoopCount(5);
      expect(store.getState().defaultLoopCount).toBe(5);
    });
  });

  describe('setDefaultPlayDuration', () => {
    it('updates play duration', () => {
      store.getState().setDefaultPlayDuration(240);
      expect(store.getState().defaultPlayDuration).toBe(240);
    });
  });

  describe('setDefaultFadeDuration', () => {
    it('updates fade duration', () => {
      store.getState().setDefaultFadeDuration(5);
      expect(store.getState().defaultFadeDuration).toBe(5);
    });
  });
});
