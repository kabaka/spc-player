import { beforeEach, describe, expect, it } from 'vitest';

import { createTestStore } from '../test-helpers';

describe('VisualizationSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('defaults to piano-roll mode', () => {
      expect(store.getState().activeMode).toBe('piano-roll');
    });

    it('has correct piano roll defaults', () => {
      expect(store.getState().pianoRoll).toEqual({
        scrollSpeed: 100,
        noteScale: 'chromatic',
        showVoiceLabels: true,
      });
    });

    it('has correct spectrum defaults', () => {
      expect(store.getState().spectrum).toEqual({
        mode: 'bars',
        fftSize: 1024,
        smoothing: 0.8,
      });
    });

    it('has correct stereo field defaults', () => {
      expect(store.getState().stereoField).toEqual({
        mode: 'lissajous',
        decay: 0.95,
      });
    });

    it('has correct cover art defaults', () => {
      expect(store.getState().coverArt).toEqual({
        externalFetchEnabled: false,
        version: 0,
      });
    });
  });

  describe('setActiveMode', () => {
    it('sets spectrum mode', () => {
      store.getState().setActiveMode('spectrum');
      expect(store.getState().activeMode).toBe('spectrum');
    });

    it('sets stereo-field mode', () => {
      store.getState().setActiveMode('stereo-field');
      expect(store.getState().activeMode).toBe('stereo-field');
    });

    it('sets cover-art mode', () => {
      store.getState().setActiveMode('cover-art');
      expect(store.getState().activeMode).toBe('cover-art');
    });

    it('sets piano-roll mode', () => {
      store.getState().setActiveMode('spectrum');
      store.getState().setActiveMode('piano-roll');
      expect(store.getState().activeMode).toBe('piano-roll');
    });
  });

  describe('setPianoRollSettings', () => {
    it('updates scrollSpeed while preserving other fields', () => {
      store.getState().setPianoRollSettings({ scrollSpeed: 200 });
      const { pianoRoll } = store.getState();
      expect(pianoRoll.scrollSpeed).toBe(200);
      expect(pianoRoll.noteScale).toBe('chromatic');
      expect(pianoRoll.showVoiceLabels).toBe(true);
    });

    it('updates noteScale', () => {
      store.getState().setPianoRollSettings({ noteScale: 'octave' });
      expect(store.getState().pianoRoll.noteScale).toBe('octave');
    });

    it('updates showVoiceLabels', () => {
      store.getState().setPianoRollSettings({ showVoiceLabels: false });
      expect(store.getState().pianoRoll.showVoiceLabels).toBe(false);
    });
  });

  describe('setSpectrumSettings', () => {
    it('updates mode while preserving other fields', () => {
      store.getState().setSpectrumSettings({ mode: 'line' });
      const { spectrum } = store.getState();
      expect(spectrum.mode).toBe('line');
      expect(spectrum.fftSize).toBe(1024);
      expect(spectrum.smoothing).toBe(0.8);
    });

    it('updates fftSize', () => {
      store.getState().setSpectrumSettings({ fftSize: 512 });
      expect(store.getState().spectrum.fftSize).toBe(512);
    });

    it('updates smoothing', () => {
      store.getState().setSpectrumSettings({ smoothing: 0.5 });
      expect(store.getState().spectrum.smoothing).toBe(0.5);
    });
  });

  describe('setStereoFieldSettings', () => {
    it('updates mode while preserving other fields', () => {
      store.getState().setStereoFieldSettings({ mode: 'correlation' });
      const { stereoField } = store.getState();
      expect(stereoField.mode).toBe('correlation');
      expect(stereoField.decay).toBe(0.95);
    });

    it('updates decay', () => {
      store.getState().setStereoFieldSettings({ decay: 0.8 });
      expect(store.getState().stereoField.decay).toBe(0.8);
    });
  });

  describe('setCoverArtSettings', () => {
    it('enables external fetch', () => {
      store.getState().setCoverArtSettings({ externalFetchEnabled: true });
      expect(store.getState().coverArt.externalFetchEnabled).toBe(true);
    });

    it('disables external fetch', () => {
      store.getState().setCoverArtSettings({ externalFetchEnabled: true });
      store.getState().setCoverArtSettings({ externalFetchEnabled: false });
      expect(store.getState().coverArt.externalFetchEnabled).toBe(false);
    });
  });
});
