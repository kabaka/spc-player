import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { audioStateBuffer } from '@/audio/audio-state-buffer';

import { VuMeter } from './VuMeter';

// ── Helpers ───────────────────────────────────────────────────────────

function flushRaf(): void {
  vi.advanceTimersByTime(16);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('VuMeter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Stub requestAnimationFrame to use fake timers
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => {
        return window.setTimeout(() => cb(performance.now()), 16);
      },
    );
  });

  afterEach(() => {
    audioStateBuffer.vuLeft.fill(0);
    audioStateBuffer.vuRight.fill(0);
    audioStateBuffer.masterVuLeft = 0;
    audioStateBuffer.masterVuRight = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('unsigned VU values', () => {
    it('shows 100% level when envelope is full', () => {
      audioStateBuffer.vuLeft[0] = 1.0;
      audioStateBuffer.vuRight[0] = 1.0;

      const { container } = render(
        <VuMeter voiceIndex={0} label="Voice 0 level" />,
      );

      flushRaf();

      const fill = container.querySelector('[aria-hidden="true"]');
      const level = fill?.getAttribute('style') ?? '';
      expect(level).toContain('--vu-level: 100%');
    });

    it('shows 50% level for half-amplitude envelope', () => {
      audioStateBuffer.vuLeft[0] = 0.5;
      audioStateBuffer.vuRight[0] = 0.5;

      const { container } = render(
        <VuMeter voiceIndex={0} label="Voice 0 level" />,
      );

      flushRaf();

      const fill = container.querySelector('[aria-hidden="true"]');
      const level = fill?.getAttribute('style') ?? '';
      expect(level).toContain('--vu-level: 50%');
    });
  });
});
