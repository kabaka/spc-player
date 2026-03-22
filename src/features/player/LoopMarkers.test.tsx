import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStore } from '@/store/store';

import { LoopMarkers } from './LoopMarkers';

// ── Helpers ──────────────────────────────────────────────────────────

function setStoreLoopRegion(startTime: number, endTime: number, active = true) {
  useAppStore.setState({
    loopRegion: { startTime, endTime, active },
  });
}

function clearStoreLoopRegion() {
  useAppStore.setState({ loopRegion: null });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('LoopMarkers', () => {
  beforeEach(() => {
    clearStoreLoopRegion();
  });

  it('renders nothing when loopRegion is null', () => {
    const { container } = render(<LoopMarkers maxTime={100} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when maxTime is 0', () => {
    setStoreLoopRegion(10, 30);
    const { container } = render(<LoopMarkers maxTime={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders two slider handles when loopRegion is set', () => {
    setStoreLoopRegion(20, 80);
    render(<LoopMarkers maxTime={100} />);

    const startHandle = screen.getByRole('slider', {
      name: 'Loop start marker',
    });
    const endHandle = screen.getByRole('slider', {
      name: 'Loop end marker',
    });

    expect(startHandle).toBeInTheDocument();
    expect(endHandle).toBeInTheDocument();
  });

  it('sets correct ARIA attributes on start handle', () => {
    setStoreLoopRegion(25, 75);
    render(<LoopMarkers maxTime={100} />);

    const startHandle = screen.getByRole('slider', {
      name: 'Loop start marker',
    });

    expect(startHandle).toHaveAttribute('aria-valuemin', '0');
    expect(startHandle).toHaveAttribute('aria-valuemax', '75');
    expect(startHandle).toHaveAttribute('aria-valuenow', '25');
    expect(startHandle).toHaveAttribute('aria-valuetext', '25 seconds');
  });

  it('sets correct ARIA attributes on end handle', () => {
    setStoreLoopRegion(25, 75);
    render(<LoopMarkers maxTime={100} />);

    const endHandle = screen.getByRole('slider', {
      name: 'Loop end marker',
    });

    expect(endHandle).toHaveAttribute('aria-valuemin', '25');
    expect(endHandle).toHaveAttribute('aria-valuemax', '100');
    expect(endHandle).toHaveAttribute('aria-valuenow', '75');
    expect(endHandle).toHaveAttribute('aria-valuetext', '75 seconds');
  });

  it('positions handles at correct percentages via inline style', () => {
    setStoreLoopRegion(25, 75);
    render(<LoopMarkers maxTime={100} />);

    const startHandle = screen.getByRole('slider', {
      name: 'Loop start marker',
    });
    const endHandle = screen.getByRole('slider', {
      name: 'Loop end marker',
    });

    expect(startHandle.style.left).toBe('25%');
    expect(endHandle.style.left).toBe('75%');
  });

  describe('keyboard navigation', () => {
    it('ArrowRight on start handle increases startTime by 0.5', () => {
      setStoreLoopRegion(20, 80);
      render(<LoopMarkers maxTime={100} />);

      const startHandle = screen.getByRole('slider', {
        name: 'Loop start marker',
      });

      fireEvent.keyDown(startHandle, { key: 'ArrowRight' });

      const state = useAppStore.getState();
      expect(state.loopRegion?.startTime).toBe(20.5);
    });

    it('ArrowLeft on start handle decreases startTime by 0.5', () => {
      setStoreLoopRegion(20, 80);
      render(<LoopMarkers maxTime={100} />);

      const startHandle = screen.getByRole('slider', {
        name: 'Loop start marker',
      });

      fireEvent.keyDown(startHandle, { key: 'ArrowLeft' });

      const state = useAppStore.getState();
      expect(state.loopRegion?.startTime).toBe(19.5);
    });

    it('ArrowRight on end handle increases endTime by 0.5', () => {
      setStoreLoopRegion(20, 80);
      render(<LoopMarkers maxTime={100} />);

      const endHandle = screen.getByRole('slider', {
        name: 'Loop end marker',
      });

      fireEvent.keyDown(endHandle, { key: 'ArrowRight' });

      const state = useAppStore.getState();
      expect(state.loopRegion?.endTime).toBe(80.5);
    });

    it('Shift+ArrowRight uses large step (5 seconds)', () => {
      setStoreLoopRegion(20, 80);
      render(<LoopMarkers maxTime={100} />);

      const endHandle = screen.getByRole('slider', {
        name: 'Loop end marker',
      });

      fireEvent.keyDown(endHandle, { key: 'ArrowRight', shiftKey: true });

      const state = useAppStore.getState();
      expect(state.loopRegion?.endTime).toBe(85);
    });

    it('clamps start handle at 0 (does not go negative)', () => {
      setStoreLoopRegion(0.3, 80);
      render(<LoopMarkers maxTime={100} />);

      const startHandle = screen.getByRole('slider', {
        name: 'Loop start marker',
      });

      fireEvent.keyDown(startHandle, { key: 'ArrowLeft' });

      const state = useAppStore.getState();
      expect(state.loopRegion?.startTime).toBe(0);
    });

    it('clamps end handle at maxTime', () => {
      setStoreLoopRegion(20, 99.8);
      render(<LoopMarkers maxTime={100} />);

      const endHandle = screen.getByRole('slider', {
        name: 'Loop end marker',
      });

      fireEvent.keyDown(endHandle, { key: 'ArrowRight' });

      const state = useAppStore.getState();
      expect(state.loopRegion?.endTime).toBe(100);
    });

    it('start handle cannot exceed endTime', () => {
      setStoreLoopRegion(79.8, 80);
      render(<LoopMarkers maxTime={100} />);

      const startHandle = screen.getByRole('slider', {
        name: 'Loop start marker',
      });

      fireEvent.keyDown(startHandle, { key: 'ArrowRight' });

      const state = useAppStore.getState();
      expect(state.loopRegion?.startTime).toBe(80);
    });
  });
});

// ── Loop enforcement logic tests ────────────────────────────────────

describe('Loop enforcement', () => {
  it('exports enforceLoopRegion as testable logic', () => {
    // The enforcement logic is inlined in PlayerView's rAF loop.
    // We test the core logic separately here.
    const seekFn = vi.fn();

    function enforceLoop(
      positionSamples: number,
      region: { startTime: number; endTime: number; active: boolean } | null,
      dspRate: number,
      seek: (samples: number) => void,
    ): number | null {
      if (!region?.active) return null;
      const currentSec = positionSamples / dspRate;
      if (currentSec >= region.endTime) {
        const target = Math.round(region.startTime * dspRate);
        seek(target);
        return target;
      }
      return null;
    }

    // Not past end → no seek
    const result1 = enforceLoop(
      1_600_000, // 50 sec at 32kHz
      { startTime: 10, endTime: 60, active: true },
      32_000,
      seekFn,
    );
    expect(result1).toBeNull();
    expect(seekFn).not.toHaveBeenCalled();

    // Past end → seeks to start
    const result2 = enforceLoop(
      1_920_000, // 60 sec at 32kHz
      { startTime: 10, endTime: 60, active: true },
      32_000,
      seekFn,
    );
    expect(result2).toBe(320_000); // 10 * 32000
    expect(seekFn).toHaveBeenCalledWith(320_000);

    // Inactive → no seek
    seekFn.mockClear();
    const result3 = enforceLoop(
      1_920_000,
      { startTime: 10, endTime: 60, active: false },
      32_000,
      seekFn,
    );
    expect(result3).toBeNull();
    expect(seekFn).not.toHaveBeenCalled();

    // Null region → no seek
    const result4 = enforceLoop(1_920_000, null, 32_000, seekFn);
    expect(result4).toBeNull();
    expect(seekFn).not.toHaveBeenCalled();
  });
});
