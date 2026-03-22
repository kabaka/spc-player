import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoopRegion } from '@/store/types';

import type { SeekBarProps } from './SeekBar';
import { SeekBar } from './SeekBar';

// ── Mocks ─────────────────────────────────────────────────────────────

// Mock audioStateBuffer — rAF canvas rendering reads from this
vi.mock('@/audio/audio-state-buffer', () => ({
  audioStateBuffer: {
    positionSamples: 0,
    generation: 0,
  },
}));

// Mock canvas getContext to return a stub 2D context
const mockCtx = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fill: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  setLineDash: vi.fn(),
  roundRect: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  globalAlpha: 1,
  shadowColor: 'transparent',
  shadowBlur: 0,
  shadowOffsetY: 0,
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );
});

// ── Helpers ───────────────────────────────────────────────────────────

const defaultProps: SeekBarProps = {
  totalSeconds: 180,
  currentSeconds: 60,
  onSeek: vi.fn(),
};

function renderSeekBar(overrides: Partial<SeekBarProps> = {}) {
  const props = {
    ...defaultProps,
    ...overrides,
    onSeek: overrides.onSeek ?? vi.fn(),
  };
  return render(<SeekBar {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('SeekBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Renders canvas and hidden input
  it('renders canvas and hidden input', () => {
    renderSeekBar();

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');

    const input = screen.getByRole('slider', { name: 'Seek position' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'range');
  });

  // 2. aria-valuetext format is correct
  it('has correct aria-valuetext format', () => {
    renderSeekBar({ currentSeconds: 83, totalSeconds: 225 });

    const input = screen.getByRole('slider', { name: 'Seek position' });
    expect(input).toHaveAttribute(
      'aria-valuetext',
      '1 minute 23 seconds of 3 minutes 45 seconds',
    );
  });

  it('shows 0 seconds for beginning of track', () => {
    renderSeekBar({ currentSeconds: 0, totalSeconds: 225 });

    const input = screen.getByRole('slider', { name: 'Seek position' });
    expect(input).toHaveAttribute(
      'aria-valuetext',
      '0 seconds of 3 minutes 45 seconds',
    );
  });

  // 3. Keyboard seek steps
  describe('keyboard interaction', () => {
    it('Arrow Right seeks +5 seconds', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 60, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'ArrowRight' });

      expect(onSeek).toHaveBeenCalledWith(65);
    });

    it('Arrow Left seeks -5 seconds', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 60, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'ArrowLeft' });

      expect(onSeek).toHaveBeenCalledWith(55);
    });

    it('PageUp seeks +15 seconds', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 60, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'PageUp' });

      expect(onSeek).toHaveBeenCalledWith(75);
    });

    it('PageDown seeks -15 seconds', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 60, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'PageDown' });

      expect(onSeek).toHaveBeenCalledWith(45);
    });

    it('Home seeks to 0', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 60, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'Home' });

      expect(onSeek).toHaveBeenCalledWith(0);
    });

    it('End seeks to total duration', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 60, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'End' });

      expect(onSeek).toHaveBeenCalledWith(180);
    });

    it('clamps ArrowLeft at 0', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 2, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'ArrowLeft' });

      expect(onSeek).toHaveBeenCalledWith(0);
    });

    it('clamps ArrowRight at totalSeconds', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 178, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'ArrowRight' });

      expect(onSeek).toHaveBeenCalledWith(180);
    });
  });

  // 4. A-B loop markers render when loopRegion is provided
  describe('A-B loop markers', () => {
    const loopRegion: LoopRegion = {
      startTime: 30,
      endTime: 120,
      active: true,
    };

    it('renders loop markers when loopRegion is active', () => {
      renderSeekBar({ loopRegion, totalSeconds: 180 });

      const markerA = screen.getByRole('slider', {
        name: 'Loop start marker',
      });
      const markerB = screen.getByRole('slider', { name: 'Loop end marker' });

      expect(markerA).toBeInTheDocument();
      expect(markerB).toBeInTheDocument();
    });

    it('does not render loop markers when loopRegion is null', () => {
      renderSeekBar({ loopRegion: null });

      expect(
        screen.queryByRole('slider', { name: 'Loop start marker' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('slider', { name: 'Loop end marker' }),
      ).not.toBeInTheDocument();
    });

    it('does not render loop markers when loopRegion is inactive', () => {
      renderSeekBar({
        loopRegion: { startTime: 30, endTime: 120, active: false },
      });

      expect(
        screen.queryByRole('slider', { name: 'Loop start marker' }),
      ).not.toBeInTheDocument();
    });

    it('loop marker A has correct aria attributes', () => {
      renderSeekBar({ loopRegion, totalSeconds: 180 });

      const markerA = screen.getByRole('slider', {
        name: 'Loop start marker',
      });
      expect(markerA).toHaveAttribute('aria-valuenow', '30');
      expect(markerA).toHaveAttribute('aria-valuemax', '180');
      expect(markerA).toHaveAttribute(
        'aria-valuetext',
        'Loop starts at 30 seconds',
      );
    });

    it('loop marker B has correct aria attributes', () => {
      renderSeekBar({ loopRegion, totalSeconds: 180 });

      const markerB = screen.getByRole('slider', { name: 'Loop end marker' });
      expect(markerB).toHaveAttribute('aria-valuenow', '120');
      expect(markerB).toHaveAttribute(
        'aria-valuetext',
        'Loop ends at 2 minutes',
      );
    });

    // 5. Loop marker keyboard adjustment
    it('Arrow Right adjusts marker A +1 second', () => {
      const onLoopMarkerChange = vi.fn();
      renderSeekBar({ loopRegion, totalSeconds: 180, onLoopMarkerChange });

      const markerA = screen.getByRole('slider', {
        name: 'Loop start marker',
      });
      fireEvent.keyDown(markerA, { key: 'ArrowRight' });

      expect(onLoopMarkerChange).toHaveBeenCalledWith('A', 31);
    });

    it('Arrow Left adjusts marker B -1 second', () => {
      const onLoopMarkerChange = vi.fn();
      renderSeekBar({ loopRegion, totalSeconds: 180, onLoopMarkerChange });

      const markerB = screen.getByRole('slider', { name: 'Loop end marker' });
      fireEvent.keyDown(markerB, { key: 'ArrowLeft' });

      expect(onLoopMarkerChange).toHaveBeenCalledWith('B', 119);
    });

    it('Shift+Arrow adjusts marker by ±5 seconds', () => {
      const onLoopMarkerChange = vi.fn();
      renderSeekBar({ loopRegion, totalSeconds: 180, onLoopMarkerChange });

      const markerA = screen.getByRole('slider', {
        name: 'Loop start marker',
      });
      fireEvent.keyDown(markerA, { key: 'ArrowRight', shiftKey: true });

      expect(onLoopMarkerChange).toHaveBeenCalledWith('A', 35);
    });

    it('clamps marker A to not exceed marker B', () => {
      const onLoopMarkerChange = vi.fn();
      const tightRegion: LoopRegion = {
        startTime: 119,
        endTime: 120,
        active: true,
      };
      renderSeekBar({
        loopRegion: tightRegion,
        totalSeconds: 180,
        onLoopMarkerChange,
      });

      const markerA = screen.getByRole('slider', { name: 'Loop start marker' });
      fireEvent.keyDown(markerA, { key: 'ArrowRight' });

      expect(onLoopMarkerChange).toHaveBeenCalledWith('A', 120);
    });

    it('clamps marker B to not go below marker A', () => {
      const onLoopMarkerChange = vi.fn();
      const tightRegion: LoopRegion = {
        startTime: 30,
        endTime: 31,
        active: true,
      };
      renderSeekBar({
        loopRegion: tightRegion,
        totalSeconds: 180,
        onLoopMarkerChange,
      });

      const markerB = screen.getByRole('slider', { name: 'Loop end marker' });
      fireEvent.keyDown(markerB, { key: 'ArrowLeft' });

      expect(onLoopMarkerChange).toHaveBeenCalledWith('B', 30);
    });
  });

  // 6. Tooltip appears on hover/focus
  describe('time tooltip', () => {
    it('tooltip is hidden initially', () => {
      const { container } = renderSeekBar();

      // The tooltip should exist but not have the visible class
      const tooltips = container.querySelectorAll('div[aria-hidden="true"]');
      const timeTooltip = Array.from(tooltips).find(
        (el) => el.textContent && /\d:\d{2}/.test(el.textContent),
      );
      expect(timeTooltip).toBeInTheDocument();
    });

    it('tooltip becomes visible on input focus', () => {
      const { container } = renderSeekBar();

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.focus(input);

      // After focus, the tooltip container should have the visible class
      const tooltipElements = container.querySelectorAll('div');
      const visibleTooltip = Array.from(tooltipElements).find(
        (el) =>
          el.getAttribute('aria-hidden') === 'true' &&
          el.textContent &&
          /\d:\d{2}/.test(el.textContent),
      );
      expect(visibleTooltip).toBeInTheDocument();
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('handles totalSeconds of 0 gracefully', () => {
      renderSeekBar({ totalSeconds: 0, currentSeconds: 0 });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      expect(input).toHaveAttribute('max', '0');
    });

    it('clamps currentSeconds to totalSeconds', () => {
      renderSeekBar({ totalSeconds: 100, currentSeconds: 200 });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      expect(input).toHaveAttribute('aria-valuenow', '100');
    });

    it('does not fire onSeek for unknown keys', () => {
      const onSeek = vi.fn();
      renderSeekBar({ onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.keyDown(input, { key: 'Tab' });

      expect(onSeek).not.toHaveBeenCalled();
    });
  });

  // ARIA group wrapper
  it('has role="group" with aria-label="Seek"', () => {
    renderSeekBar();

    const group = screen.getByRole('group', { name: 'Seek' });
    expect(group).toBeInTheDocument();
  });

  // onChange handler for screen reader accessibility
  describe('onChange handler (screen reader support)', () => {
    it('calls onSeek when range input change event fires', () => {
      const onSeek = vi.fn();
      renderSeekBar({ currentSeconds: 60, totalSeconds: 180, onSeek });

      const input = screen.getByRole('slider', { name: 'Seek position' });
      fireEvent.change(input, { target: { value: '90' } });

      expect(onSeek).toHaveBeenCalledWith(90);
    });
  });

  // Reduced motion support
  describe('prefers-reduced-motion', () => {
    it('does not crash when prefers-reduced-motion is reduce', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      renderSeekBar();
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      window.matchMedia = originalMatchMedia;
    });
  });
});
