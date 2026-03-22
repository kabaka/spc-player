import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  computeLogBins,
  updatePeaks,
  SpectrumRenderer,
} from './SpectrumRenderer';

// ── computeLogBins ────────────────────────────────────────────────────

describe('computeLogBins', () => {
  it('returns the requested number of bins', () => {
    const fftData = new Uint8Array(512).fill(128);
    const result = computeLogBins(fftData, 32, 1024, 48_000);
    expect(result).toHaveLength(32);
  });

  it('maps low-frequency energy to early bins', () => {
    const fftData = new Uint8Array(512).fill(0);
    // Bin 1 ≈ 46.875 Hz at 48 kHz / 1024 fftSize → falls in visual bin 1
    // (visual bin 0 covers only DC ~20–30 Hz range on log scale)
    fftData[1] = 200;
    fftData[2] = 200;

    const result = computeLogBins(fftData, 16, 1024, 48_000);
    // Energy should appear in an early visual bin
    expect(result[1]).toBeGreaterThan(0);
    // High-frequency bins should be silent
    expect(result[15]).toBe(0);
  });

  it('returns all zeros for silent FFT data', () => {
    const fftData = new Uint8Array(512).fill(0);
    const result = computeLogBins(fftData, 16, 1024, 48_000);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('returns full-scale for maxed FFT data', () => {
    const fftData = new Uint8Array(512).fill(255);
    const result = computeLogBins(fftData, 8, 1024, 48_000);
    expect(result.every((v) => v === 255)).toBe(true);
  });

  it('averages multiple FFT bins within a single visual bar', () => {
    const fftData = new Uint8Array(128).fill(0);
    // With fftSize=256 at 48kHz, bin 1 = 187.5 Hz, bin 2 = 375 Hz
    // Both map to visual bar 1 on the log scale (bar 0 covers DC only)
    fftData[1] = 100;
    fftData[2] = 200;

    const result = computeLogBins(fftData, 4, 256, 48_000);
    // Visual bar 1 should contain the average of the contributing bins
    expect(result[1]).toBeGreaterThan(0);
    expect(result[1]).toBeLessThanOrEqual(200);
  });

  it('handles smaller fftSize (256)', () => {
    const fftData = new Uint8Array(128).fill(100);
    const result = computeLogBins(fftData, 8, 256, 48_000);
    expect(result).toHaveLength(8);
    expect(result.every((v) => v === 100)).toBe(true);
  });
});

// ── updatePeaks ───────────────────────────────────────────────────────

describe('updatePeaks', () => {
  it('initializes peaks from values on first call', () => {
    const peaks: number[] = [];
    const values = [100, 200, 50];
    updatePeaks(peaks, values, 0.016, 11);
    expect(peaks).toEqual([100, 200, 50]);
  });

  it('raises peaks when current value exceeds stored peak', () => {
    const peaks = [100, 200, 50];
    const values = [150, 100, 75];
    updatePeaks(peaks, values, 0.016, 11);
    expect(peaks[0]).toBe(150);
    expect(peaks[2]).toBe(75);
  });

  it('decays peaks when current value is lower', () => {
    const peaks = [200, 200, 200];
    const values = [0, 0, 0];
    // 1 second at 11 values/sec decay → -11
    updatePeaks(peaks, values, 1.0, 11);
    expect(peaks[0]).toBe(189);
    expect(peaks[1]).toBe(189);
    expect(peaks[2]).toBe(189);
  });

  it('clamps peaks at zero', () => {
    const peaks = [5, 3, 1];
    const values = [0, 0, 0];
    // Large deltaTime ensures decay exceeds the current peak
    updatePeaks(peaks, values, 10.0, 11);
    expect(peaks.every((v) => v === 0)).toBe(true);
  });

  it('trims peaks array when values array shrinks', () => {
    const peaks = [100, 200, 300, 400];
    const values = [50, 50];
    updatePeaks(peaks, values, 0.016, 11);
    expect(peaks).toHaveLength(2);
  });

  it('extends peaks array when values array grows', () => {
    const peaks = [100];
    const values = [100, 200, 50];
    updatePeaks(peaks, values, 0.016, 11);
    expect(peaks).toHaveLength(3);
    expect(peaks[1]).toBe(200);
    expect(peaks[2]).toBe(50);
  });
});

// ── SpectrumRenderer lifecycle ────────────────────────────────────────

describe('SpectrumRenderer', () => {
  function mockCanvasContext(): CanvasRenderingContext2D {
    return {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillText: vi.fn(),
      set fillStyle(_v: string | CanvasGradient) {
        /* noop */
      },
      set strokeStyle(_v: string) {
        /* noop */
      },
      set lineWidth(_v: number) {
        /* noop */
      },
      set font(_v: string) {
        /* noop */
      },
      set textAlign(_v: CanvasTextAlign) {
        /* noop */
      },
      set textBaseline(_v: CanvasTextBaseline) {
        /* noop */
      },
    } as unknown as CanvasRenderingContext2D;
  }

  function baseData(
    overrides: Partial<Parameters<SpectrumRenderer['draw']>[0]> = {},
  ): Parameters<SpectrumRenderer['draw']>[0] {
    return {
      voices: [],
      vuLeft: new Float32Array(),
      vuRight: new Float32Array(),
      masterVuLeft: 0,
      masterVuRight: 0,
      generation: 0,
      positionSamples: 0,
      ...overrides,
    };
  }

  let renderer: SpectrumRenderer;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    renderer = new SpectrumRenderer();
    ctx = mockCanvasContext();
    const canvas = document.createElement('canvas');
    // Mock getComputedStyle for color reading
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => {
        if (prop === '--spc-color-accent') return '#8b5cf6';
        if (prop === '--spc-color-text') return '#ededf0';
        return '';
      },
    } as CSSStyleDeclaration);
    renderer.init(canvas, ctx);
    renderer.resize(800, 300, 1);
  });

  it('does not throw when analyserData is undefined', () => {
    expect(() => renderer.draw(baseData(), 0.016)).not.toThrow();
  });

  it('does not throw when analyserData is empty', () => {
    const data = baseData({ analyserData: new Uint8Array(0) });
    expect(() => renderer.draw(data, 0.016)).not.toThrow();
  });

  it('draws bars mode without errors', () => {
    const data = baseData({
      analyserData: new Uint8Array(512).fill(128),
      spectrumSettings: { mode: 'bars', fftSize: 1024, smoothing: 0.8 },
    });
    expect(() => renderer.draw(data, 0.016)).not.toThrow();
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('draws line mode without errors', () => {
    const data = baseData({
      analyserData: new Uint8Array(512).fill(128),
      spectrumSettings: { mode: 'line', fftSize: 1024, smoothing: 0.8 },
    });
    expect(() => renderer.draw(data, 0.016)).not.toThrow();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws filled mode without errors', () => {
    const data = baseData({
      analyserData: new Uint8Array(512).fill(128),
      spectrumSettings: { mode: 'filled', fftSize: 1024, smoothing: 0.8 },
    });
    expect(() => renderer.draw(data, 0.016)).not.toThrow();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('does not draw peaks on mobile', () => {
    renderer.resize(375, 120, 2); // Mobile width
    const data = baseData({
      analyserData: new Uint8Array(512).fill(128),
      spectrumSettings: { mode: 'bars', fftSize: 1024, smoothing: 0.8 },
    });
    // First draw sets peaks, second should show decay
    renderer.draw(data, 0.016);
    const strokeCountAfterFirst = (ctx.stroke as ReturnType<typeof vi.fn>).mock
      .calls.length;
    // Draw again with zeros — on mobile, no peak lines should be drawn
    const data2 = baseData({
      analyserData: new Uint8Array(512).fill(0),
      spectrumSettings: { mode: 'bars', fftSize: 1024, smoothing: 0.8 },
    });
    renderer.draw(data2, 0.016);
    // Stroke calls should only be from the grid (vertical frequency lines)
    // and not from peak indicators
    const strokeCountAfterSecond = (ctx.stroke as ReturnType<typeof vi.fn>).mock
      .calls.length;
    // Grid draws the same number of strokes both times
    expect(strokeCountAfterSecond - strokeCountAfterFirst).toBeLessThanOrEqual(
      // Grid: up to DB_GRID_STEPS-1 horizontal + 3 vertical = max ~9 lines
      10,
    );
  });

  it('disposes cleanly', () => {
    renderer.dispose();
    // After dispose, draw should not throw (ctx is null → early return)
    const data = baseData({
      analyserData: new Uint8Array(512).fill(128),
    });
    expect(() => renderer.draw(data, 0.016)).not.toThrow();
  });
});
