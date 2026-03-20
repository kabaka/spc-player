import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  recoverAudioPipeline,
  recoverAudioContext,
  resetRecoveryAttempts,
} from './audio-recovery';

// Mock dependencies
vi.mock('./engine', () => ({
  audioEngine: {
    requestSnapshot: vi.fn(),
    destroy: vi.fn(),
    init: vi.fn(),
    restoreSnapshot: vi.fn(),
    play: vi.fn(),
  },
}));

vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}));

vi.mock('@/components/Toast/toast-store', () => ({
  showToast: vi.fn(),
}));

import { audioEngine } from './engine';
import { showToast } from '@/components/Toast/toast-store';

describe('recoverAudioPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRecoveryAttempts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recovers successfully with snapshot', async () => {
    const snapshot = new ArrayBuffer(100);
    vi.mocked(audioEngine.requestSnapshot).mockResolvedValue(snapshot);
    vi.mocked(audioEngine.destroy).mockResolvedValue();
    vi.mocked(audioEngine.init).mockResolvedValue();

    const result = await recoverAudioPipeline();

    expect(result).toBe(true);
    expect(audioEngine.destroy).toHaveBeenCalled();
    expect(audioEngine.init).toHaveBeenCalled();
    expect(audioEngine.restoreSnapshot).toHaveBeenCalledWith(snapshot);
    expect(showToast).toHaveBeenCalledWith(
      'success',
      'Audio playback recovered.',
    );
  });

  it('recovers without snapshot when snapshot fails', async () => {
    vi.mocked(audioEngine.requestSnapshot).mockRejectedValue(
      new Error('worklet dead'),
    );
    vi.mocked(audioEngine.destroy).mockResolvedValue();
    vi.mocked(audioEngine.init).mockResolvedValue();

    const result = await recoverAudioPipeline();

    expect(result).toBe(true);
    expect(audioEngine.restoreSnapshot).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'success',
      'Audio playback recovered.',
    );
  });

  it('fails and shows error toast when init fails', async () => {
    vi.mocked(audioEngine.requestSnapshot).mockRejectedValue(new Error('dead'));
    vi.mocked(audioEngine.destroy).mockResolvedValue();
    vi.mocked(audioEngine.init).mockRejectedValue(new Error('init failed'));

    const result = await recoverAudioPipeline();

    expect(result).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Audio recovery failed'),
    );
  });

  it('gives up after MAX_RECOVERY_ATTEMPTS', async () => {
    vi.mocked(audioEngine.requestSnapshot).mockRejectedValue(new Error());
    vi.mocked(audioEngine.destroy).mockResolvedValue();
    vi.mocked(audioEngine.init).mockRejectedValue(new Error('fail'));

    // Exhaust attempts
    for (let i = 0; i < 3; i++) {
      await recoverAudioPipeline();
    }
    vi.mocked(showToast).mockClear();

    // 4th attempt should immediately fail
    const result = await recoverAudioPipeline();
    expect(result).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('reload the page'),
    );
  });
});

describe('recoverAudioContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when play succeeds', async () => {
    vi.mocked(audioEngine.play).mockReturnValue(true);

    const result = await recoverAudioContext();
    expect(result).toBe(true);
  });

  it('returns false and shows warning when play returns false', async () => {
    vi.mocked(audioEngine.play).mockReturnValue(false);

    const result = await recoverAudioContext();
    expect(result).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('paused'),
    );
  });

  it('handles exceptions and shows error toast', async () => {
    vi.mocked(audioEngine.play).mockImplementation(() => {
      throw new Error('context closed');
    });

    const result = await recoverAudioContext();
    expect(result).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('reload'),
    );
  });
});
