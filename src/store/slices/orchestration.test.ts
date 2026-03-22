import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { createTestStore, makeTrack } from '../test-helpers';

// ---------------------------------------------------------------------------
// Mocks — must come before any import that transitively pulls these modules
// ---------------------------------------------------------------------------

vi.mock('@/audio/engine', () => ({
  audioEngine: {
    stop: vi.fn(),
    loadSpc: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockReturnValue(true),
    seek: vi.fn(),
    setPlaybackConfig: vi.fn(),
  },
}));

vi.mock('@/storage/spc-storage', () => ({
  saveSpcToStorage: vi.fn().mockResolvedValue(1),
  loadSpcFromStorage: vi.fn(),
}));

vi.mock('@/core/spc-parser', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest factory requires runtime import
  const original = await importOriginal<typeof import('@/core/spc-parser')>();
  return {
    ...original,
    parseSpcFile: vi.fn(),
  };
});

vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}));

// Import after mocks are set up
import { audioEngine } from '@/audio/engine';
import { parseSpcFile } from '@/core/spc-parser';
import type { SpcMetadata } from '@/core/spc-types';
import { loadSpcFromStorage } from '@/storage/spc-storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid SPC data buffer (just needs to be non-empty for the mock). */
const fakeSpcBuffer = new ArrayBuffer(256);

const fakeMetadata: SpcMetadata = {
  title: 'Test',
  gameTitle: 'Game',
  artist: 'Artist',
  dumperName: '',
  comments: '',
  dumpDate: null,
  emulatorUsed: '',
  songLengthSeconds: 120,
  fadeLengthMs: 10_000,
  xid6Timing: null,
  ostTitle: null,
  ostDisc: null,
  ostTrack: null,
  publisher: null,
  copyrightYear: null,
  id666Format: 'text',
};

function setupMocksForPlayback() {
  (loadSpcFromStorage as Mock).mockResolvedValue(fakeSpcBuffer);
  (parseSpcFile as Mock).mockReturnValue({
    ok: true,
    value: {
      ram: new Uint8Array(65_536),
      dspRegisters: new Uint8Array(128),
      iplRom: new Uint8Array(64),
      cpuRegisters: { pc: 0, a: 0, x: 0, y: 0, sp: 0, psw: 0 },
      metadata: fakeMetadata,
      defaultChannelDisables: 0,
      warnings: [],
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrchestrationSlice – playTrackAtIndex', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
    setupMocksForPlayback();
  });

  it('plays a track by index', async () => {
    const t1 = makeTrack({ id: 'track-a' });
    store.getState().addTracks([t1]);

    await store.getState().playTrackAtIndex(0);

    expect(store.getState().activeTrackId).toBe('track-a');
    expect(store.getState().playbackStatus).toBe('playing');
    expect(store.getState().isLoadingTrack).toBe(false);
  });

  it('does not self-abort when switching from one track to another', async () => {
    // Regression: playTrackAtIndex used to not set activeTrackId before the
    // async load, so the race-condition guard saw old_id !== new_id and aborted.
    const t1 = makeTrack({ id: 'track-a' });
    const t2 = makeTrack({ id: 'track-b' });
    store.getState().addTracks([t1, t2]);

    // Simulate: track-a is currently active
    store.setState({ activeTrackId: 'track-a', activeIndex: 0 });

    // Now request track-b (index 1) — this must NOT abort
    await store.getState().playTrackAtIndex(1);

    expect(store.getState().activeTrackId).toBe('track-b');
    expect(store.getState().playbackStatus).toBe('playing');
    expect(store.getState().isLoadingTrack).toBe(false);
    expect(store.getState().loadingError).toBeNull();
  });

  it('sets activeTrackId before the async load', async () => {
    const t1 = makeTrack({ id: 'track-a' });
    const t2 = makeTrack({ id: 'track-b' });
    store.getState().addTracks([t1, t2]);
    store.setState({ activeTrackId: 'track-a', activeIndex: 0 });

    // Intercept loadSpcFromStorage to inspect state mid-flight
    let midFlightActiveTrackId: string | null = null;
    (loadSpcFromStorage as Mock).mockImplementation(async () => {
      midFlightActiveTrackId = store.getState().activeTrackId;
      return fakeSpcBuffer;
    });

    await store.getState().playTrackAtIndex(1);

    // activeTrackId must already be 'track-b' DURING the load
    expect(midFlightActiveTrackId).toBe('track-b');
  });
});

describe('OrchestrationSlice – nextTrack', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
    setupMocksForPlayback();
  });

  it('advances to the next track', async () => {
    const t1 = makeTrack({ id: 'track-a' });
    const t2 = makeTrack({ id: 'track-b' });
    store.getState().addTracks([t1, t2]);
    store.setState({ activeTrackId: 'track-a', activeIndex: 0 });

    await store.getState().nextTrack();

    expect(store.getState().activeTrackId).toBe('track-b');
    expect(store.getState().activeIndex).toBe(1);
    expect(store.getState().playbackStatus).toBe('playing');
  });
});

describe('OrchestrationSlice – previousTrack', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createTestStore();
    setupMocksForPlayback();
  });

  it('goes to the previous track when position < 3s', async () => {
    const t1 = makeTrack({ id: 'track-a' });
    const t2 = makeTrack({ id: 'track-b' });
    store.getState().addTracks([t1, t2]);
    store.setState({ activeTrackId: 'track-b', activeIndex: 1, position: 0 });

    await store.getState().previousTrack();

    expect(store.getState().activeTrackId).toBe('track-a');
    expect(store.getState().activeIndex).toBe(0);
    expect(store.getState().playbackStatus).toBe('playing');
  });

  it('restarts current track when position > 3s', async () => {
    const t1 = makeTrack({ id: 'track-a' });
    const t2 = makeTrack({ id: 'track-b' });
    store.getState().addTracks([t1, t2]);
    // Position well past 3 seconds (32000 samples/sec * 4 seconds)
    store.setState({
      activeTrackId: 'track-b',
      activeIndex: 1,
      position: 32_000 * 4,
    });

    await store.getState().previousTrack();

    // Should restart, not go to previous
    expect(store.getState().activeTrackId).toBe('track-b');
    expect(store.getState().position).toBe(0);
    expect(audioEngine.seek).toHaveBeenCalledWith(0);
  });
});
