import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

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

  describe('regression: negative VU values', () => {
    it('shows non-zero level for phase-inverted voice', () => {
      // Negative VU values represent phase-inverted DSP volumes
      audioStateBuffer.vuLeft[0] = -0.8;
      audioStateBuffer.vuRight[0] = -0.8;

      const { container } = render(
        <VuMeter voiceIndex={0} label="Voice 0 level" />,
      );

      flushRaf();

      const fill = container.querySelector('[aria-hidden="true"]');
      const level = fill?.getAttribute('style') ?? '';
      // With Math.abs, level should be 80%, not 0%
      expect(level).toContain('--vu-level');
      expect(level).not.toContain('--vu-level: 0%');
    });
  });
});
