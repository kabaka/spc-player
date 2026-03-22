import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  recoverAudioContext,
  recoverAudioPipeline,
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
    isSoundTouchActive: vi.fn().mockReturnValue(false),
    getTempo: vi.fn().mockReturnValue(1.0),
    getPitch: vi.fn().mockReturnValue(1.0),
    setTempo: vi.fn().mockResolvedValue(undefined),
    setPitch: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}));

vi.mock('@/components/Toast/toast-store', () => ({
  showToast: vi.fn(),
}));

import { showToast } from '@/components/Toast/toast-store';

import { audioEngine } from './engine';

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

  it('restores SoundTouch tempo/pitch after recovery', async () => {
    const snapshot = new ArrayBuffer(100);
    vi.mocked(audioEngine.requestSnapshot).mockResolvedValue(snapshot);
    vi.mocked(audioEngine.destroy).mockResolvedValue();
    vi.mocked(audioEngine.init).mockResolvedValue();
    vi.mocked(audioEngine.isSoundTouchActive).mockReturnValue(true);
    vi.mocked(audioEngine.getTempo).mockReturnValue(1.5);
    vi.mocked(audioEngine.getPitch).mockReturnValue(0.8);

    const result = await recoverAudioPipeline();

    expect(result).toBe(true);
    expect(audioEngine.setTempo).toHaveBeenCalledWith(1.5);
    expect(audioEngine.setPitch).toHaveBeenCalledWith(0.8);
  });

  it('recovers gracefully when SoundTouch fails to reload', async () => {
    const snapshot = new ArrayBuffer(100);
    vi.mocked(audioEngine.requestSnapshot).mockResolvedValue(snapshot);
    vi.mocked(audioEngine.destroy).mockResolvedValue();
    vi.mocked(audioEngine.init).mockResolvedValue();
    vi.mocked(audioEngine.isSoundTouchActive).mockReturnValue(true);
    vi.mocked(audioEngine.getTempo).mockReturnValue(2.0);
    vi.mocked(audioEngine.getPitch).mockReturnValue(1.0);
    vi.mocked(audioEngine.setTempo).mockRejectedValue(
      new Error('SoundTouch unavailable'),
    );

    const result = await recoverAudioPipeline();

    // Should still succeed — SoundTouch failure is gracefully handled
    expect(result).toBe(true);
    expect(showToast).toHaveBeenCalledWith(
      'success',
      'Audio playback recovered.',
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
