import { beforeEach, describe, expect, it } from 'vitest';

import { createTestStore } from '../test-helpers';

describe('InstrumentSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  describe('initial state', () => {
    it('has null selectedSrcn', () => {
      expect(store.getState().selectedSrcn).toBeNull();
    });

    it('has empty sampleCatalog', () => {
      expect(store.getState().sampleCatalog).toEqual([]);
    });

    it('has isMidiConnected false', () => {
      expect(store.getState().isMidiConnected).toBe(false);
    });
  });

  describe('setSelectedSrcn', () => {
    it('sets the selected SRCN', () => {
      store.getState().setSelectedSrcn(3);
      expect(store.getState().selectedSrcn).toBe(3);
    });

    it('sets SRCN to 0', () => {
      store.getState().setSelectedSrcn(0);
      expect(store.getState().selectedSrcn).toBe(0);
    });

    it('clears the selected SRCN with null', () => {
      store.getState().setSelectedSrcn(5);
      store.getState().setSelectedSrcn(null);
      expect(store.getState().selectedSrcn).toBeNull();
    });

    it('overwrites a previous value', () => {
      store.getState().setSelectedSrcn(1);
      store.getState().setSelectedSrcn(7);
      expect(store.getState().selectedSrcn).toBe(7);
    });
  });

  describe('setSampleCatalog', () => {
    it('sets the sample catalog', () => {
      const catalog = [
        {
          srcn: 0,
          startAddress: 0,
          loopAddress: 0,
          lengthBytes: 128,
          blockCount: 4,
          loops: false,
        },
        {
          srcn: 1,
          startAddress: 128,
          loopAddress: 64,
          lengthBytes: 256,
          blockCount: 8,
          loops: true,
        },
      ];
      store.getState().setSampleCatalog(catalog);
      expect(store.getState().sampleCatalog).toEqual(catalog);
    });

    it('clears the catalog with empty array', () => {
      store
        .getState()
        .setSampleCatalog([
          {
            srcn: 0,
            startAddress: 0,
            loopAddress: 0,
            lengthBytes: 128,
            blockCount: 4,
            loops: false,
          },
        ]);
      store.getState().setSampleCatalog([]);
      expect(store.getState().sampleCatalog).toEqual([]);
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

  describe('clearInstrumentState', () => {
    it('resets selectedSrcn to null', () => {
      store.getState().setSelectedSrcn(4);
      store.getState().clearInstrumentState();
      expect(store.getState().selectedSrcn).toBeNull();
    });

    it('resets sampleCatalog to empty', () => {
      store
        .getState()
        .setSampleCatalog([
          {
            srcn: 0,
            startAddress: 0,
            loopAddress: 0,
            lengthBytes: 128,
            blockCount: 4,
            loops: false,
          },
        ]);
      store.getState().clearInstrumentState();
      expect(store.getState().sampleCatalog).toEqual([]);
    });

    it('resets isMidiConnected to false', () => {
      store.getState().setMidiConnected(true);
      store.getState().clearInstrumentState();
      expect(store.getState().isMidiConnected).toBe(false);
    });

    it('resets all fields at once', () => {
      store.getState().setSelectedSrcn(6);
      store
        .getState()
        .setSampleCatalog([
          {
            srcn: 0,
            startAddress: 0,
            loopAddress: 0,
            lengthBytes: 128,
            blockCount: 4,
            loops: false,
          },
        ]);
      store.getState().setMidiConnected(true);
      store.getState().clearInstrumentState();
      expect(store.getState().selectedSrcn).toBeNull();
      expect(store.getState().sampleCatalog).toEqual([]);
      expect(store.getState().isMidiConnected).toBe(false);
    });
  });
});
