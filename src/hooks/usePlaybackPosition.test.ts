import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockSeek = vi.fn();

vi.mock('@/audio/engine', () => ({
  audioEngine: { seek: mockSeek },
}));

const mockAudioStateBuffer = { positionSamples: 0 };

vi.mock('@/audio/audio-state-buffer', () => ({
  audioStateBuffer: mockAudioStateBuffer,
}));

vi.mock('@/core/track-duration', () => ({
  DSP_SAMPLE_RATE: 32_000,
  samplesToSeconds: (samples: number) => samples / 32_000,
}));

// Store mock: tracks selectors by their string representation
let storeState: Record<string, unknown> = {};

vi.mock('@/store/store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(storeState),
}));

// ── rAF mock ──────────────────────────────────────────────────────────

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function installRafMock() {
  rafCallbacks = new Map();
  nextRafId = 1;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  });

  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id);
  });
}

/** Execute one pending rAF tick. */
function flushRaf() {
  const entries = [...rafCallbacks.entries()];
  rafCallbacks.clear();
  for (const [, cb] of entries) {
    cb(performance.now());
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('usePlaybackPosition', () => {
  const mockSetPosition = vi.fn();
  let nowValue: number;

  beforeEach(() => {
    installRafMock();
    mockAudioStateBuffer.positionSamples = 0;
    mockSetPosition.mockClear();
    mockSeek.mockClear();

    nowValue = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => nowValue);

    storeState = {
      playbackStatus: 'stopped',
      setPosition: mockSetPosition,
      loopRegion: null,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts rAF loop when playback status is playing', async () => {
    storeState.playbackStatus = 'playing';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    expect(rafCallbacks.size).toBe(1);
  });

  it('does not start rAF loop when status is stopped', async () => {
    storeState.playbackStatus = 'stopped';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    expect(rafCallbacks.size).toBe(0);
  });

  it('does not start rAF loop when status is paused', async () => {
    storeState.playbackStatus = 'paused';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    expect(rafCallbacks.size).toBe(0);
  });

  it('calls setPosition when position changes and 250ms have elapsed', async () => {
    storeState.playbackStatus = 'playing';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    mockAudioStateBuffer.positionSamples = 16_000;
    nowValue = 250;
    act(() => flushRaf());

    expect(mockSetPosition).toHaveBeenCalledWith(16_000);
  });

  it('does NOT call setPosition when position has not changed', async () => {
    storeState.playbackStatus = 'playing';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    // First tick — position changes, enough time elapsed
    mockAudioStateBuffer.positionSamples = 5000;
    nowValue = 250;
    act(() => flushRaf());
    mockSetPosition.mockClear();

    // Second tick — same position, should NOT call setPosition
    nowValue = 500;
    act(() => flushRaf());

    expect(mockSetPosition).not.toHaveBeenCalled();
  });

  it('throttles setPosition to ≤4 Hz (250ms interval)', async () => {
    storeState.playbackStatus = 'playing';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    // First tick at 100ms — position changes but not enough time elapsed
    mockAudioStateBuffer.positionSamples = 1000;
    nowValue = 100;
    act(() => flushRaf());

    expect(mockSetPosition).not.toHaveBeenCalled();

    // Second tick at 200ms — still under 250ms threshold
    mockAudioStateBuffer.positionSamples = 2000;
    nowValue = 200;
    act(() => flushRaf());

    expect(mockSetPosition).not.toHaveBeenCalled();

    // Third tick at 250ms — threshold reached, should sync
    mockAudioStateBuffer.positionSamples = 3000;
    nowValue = 250;
    act(() => flushRaf());

    expect(mockSetPosition).toHaveBeenCalledWith(3000);
    expect(mockSetPosition).toHaveBeenCalledTimes(1);
  });

  it('enforces A-B loop region by seeking back to startTime (immediate, not throttled)', async () => {
    storeState.playbackStatus = 'playing';
    storeState.loopRegion = {
      startTime: 5,
      endTime: 10,
      active: true,
    };
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    // Position past the loop end — even at time 0 the seek fires immediately
    mockAudioStateBuffer.positionSamples = 320_001;
    nowValue = 50;
    act(() => flushRaf());

    const expectedTarget = Math.round(5 * 32_000);
    expect(mockSeek).toHaveBeenCalledWith(expectedTarget);
    expect(mockSetPosition).toHaveBeenCalledWith(expectedTarget);
  });

  it('does not enforce loop when loopRegion is inactive', async () => {
    storeState.playbackStatus = 'playing';
    storeState.loopRegion = {
      startTime: 5,
      endTime: 10,
      active: false,
    };
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    renderHook(() => usePlaybackPosition());

    mockAudioStateBuffer.positionSamples = 320_001;
    nowValue = 250;
    act(() => flushRaf());

    expect(mockSeek).not.toHaveBeenCalled();
  });

  it('cleans up rAF on unmount', async () => {
    storeState.playbackStatus = 'playing';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    const { unmount } = renderHook(() => usePlaybackPosition());

    expect(rafCallbacks.size).toBe(1);

    unmount();

    expect(rafCallbacks.size).toBe(0);
  });

  it('stops rAF loop when playback status changes to non-playing', async () => {
    storeState.playbackStatus = 'playing';
    const { usePlaybackPosition } = await import('./usePlaybackPosition');

    const { rerender } = renderHook(() => usePlaybackPosition());

    expect(rafCallbacks.size).toBe(1);

    // Simulate status change
    storeState.playbackStatus = 'paused';
    rerender();

    // The cleanup from the previous effect should have cancelled the rAF.
    // New effect with 'paused' should not schedule a new one.
    expect(rafCallbacks.size).toBe(0);
  });
});
