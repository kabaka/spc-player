import { beforeEach, describe, expect, it } from 'vitest';

import { createTestStore } from '../test-helpers';

describe('InstrumentSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has null activeInstrumentIndex', () => {
      expect(store.getState().activeInstrumentIndex).toBeNull();
    });

    it('has isMidiConnected false', () => {
      expect(store.getState().isMidiConnected).toBe(false);
    });
  });

  describe('setActiveInstrument', () => {
    it('sets the active instrument index', () => {
      store.getState().setActiveInstrument(3);
      expect(store.getState().activeInstrumentIndex).toBe(3);
    });

    it('sets index to 0', () => {
      store.getState().setActiveInstrument(0);
      expect(store.getState().activeInstrumentIndex).toBe(0);
    });

    it('clears the active instrument with null', () => {
      store.getState().setActiveInstrument(5);
      store.getState().setActiveInstrument(null);
      expect(store.getState().activeInstrumentIndex).toBeNull();
    });

    it('overwrites a previous value', () => {
      store.getState().setActiveInstrument(1);
      store.getState().setActiveInstrument(7);
      expect(store.getState().activeInstrumentIndex).toBe(7);
    });
  });

  describe('setMidiConnected', () => {
    it('sets connected to true', () => {
      store.getState().setMidiConnected(true);
      expect(store.getState().isMidiConnected).toBe(true);
    });

    it('sets connected back to false', () => {
      store.getState().setMidiConnected(true);
      store.getState().setMidiConnected(false);
      expect(store.getState().isMidiConnected).toBe(false);
    });
  });

  describe('resetInstrument', () => {
    it('resets activeInstrumentIndex to null', () => {
      store.getState().setActiveInstrument(4);
      store.getState().resetInstrument();
      expect(store.getState().activeInstrumentIndex).toBeNull();
    });

    it('resets isMidiConnected to false', () => {
      store.getState().setMidiConnected(true);
      store.getState().resetInstrument();
      expect(store.getState().isMidiConnected).toBe(false);
    });

    it('resets both fields at once', () => {
      store.getState().setActiveInstrument(6);
      store.getState().setMidiConnected(true);
      store.getState().resetInstrument();
      expect(store.getState().activeInstrumentIndex).toBeNull();
      expect(store.getState().isMidiConnected).toBe(false);
    });
  });
});
