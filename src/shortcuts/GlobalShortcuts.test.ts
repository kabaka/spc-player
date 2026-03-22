import { beforeEach, describe, expect, it } from 'vitest';

import { samplesToSeconds } from '@/core/track-duration';
import { createTestStore } from '@/store/test-helpers';

describe('A-B loop unit conversion', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  it('converts 320000 samples to 10 seconds for loop start', () => {
    const samples = 320_000;
    const seconds = samplesToSeconds(samples);
    store.getState().setLoopStart(seconds);
    expect(store.getState().loopRegion?.startTime).toBe(10);
  });

  it('converts 320000 samples to 10 seconds for loop end', () => {
    const samples = 320_000;
    const seconds = samplesToSeconds(samples);
    store.getState().setLoopEnd(seconds);
    expect(store.getState().loopRegion?.endTime).toBe(10);
  });

  it('converts 0 samples to 0 seconds', () => {
    const seconds = samplesToSeconds(0);
    store.getState().setLoopStart(seconds);
    expect(store.getState().loopRegion?.startTime).toBe(0);
  });

  it('converts 64000 samples to 2 seconds', () => {
    const seconds = samplesToSeconds(64_000);
    store.getState().setLoopEnd(seconds);
    expect(store.getState().loopRegion?.endTime).toBe(2);
  });
});

describe('toggleInstrumentMode', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  it('starts inactive', () => {
    expect(store.getState().isInstrumentModeActive).toBe(false);
  });

  it('toggles to active', () => {
    store.getState().toggleInstrumentMode();
    expect(store.getState().isInstrumentModeActive).toBe(true);
  });

  it('toggles back to inactive', () => {
    store.getState().toggleInstrumentMode();
    store.getState().toggleInstrumentMode();
    expect(store.getState().isInstrumentModeActive).toBe(false);
  });
});
