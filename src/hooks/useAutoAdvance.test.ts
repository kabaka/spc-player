import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockSetOnPlaybackEnded = vi.fn();

vi.mock('@/audio/engine', () => ({
  audioEngine: {
    setOnPlaybackEnded: mockSetOnPlaybackEnded,
  },
}));

vi.mock('@/store/store', () => ({
  useAppStore: Object.assign(() => ({}), {
    getState: () => ({ nextTrack: vi.fn() }),
  }),
}));

describe('useAutoAdvance', () => {
  it('registers a playback-ended callback on mount', async () => {
    const { useAutoAdvance } = await import('./useAutoAdvance');
    renderHook(() => useAutoAdvance());

    expect(mockSetOnPlaybackEnded).toHaveBeenCalledWith(expect.any(Function));
  });

  it('clears the callback on unmount', async () => {
    const { useAutoAdvance } = await import('./useAutoAdvance');
    const { unmount } = renderHook(() => useAutoAdvance());

    mockSetOnPlaybackEnded.mockClear();
    unmount();

    expect(mockSetOnPlaybackEnded).toHaveBeenCalledWith(null);
  });
});
