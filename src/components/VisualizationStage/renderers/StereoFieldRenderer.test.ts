import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { VoiceStateSnapshot } from '@/audio/audio-state-buffer';
import type { AudioVisualizationData } from '../types';

import {
  StereoFieldRenderer,
  computeCorrelation,
  lissajousToCanvas,
} from './StereoFieldRenderer';

// ── Test Helpers ──────────────────────────────────────────────────────

function createVoice(index: number): VoiceStateSnapshot {
  return {
    index,
    envelopePhase: 'silent',
    envelopeLevel: 0,
    pitch: 0,
    sampleSource: 0,
    keyOn: false,
    active: false,
  };
}

function createData(
  overrides: Partial<AudioVisualizationData> = {},
): AudioVisualizationData {
  return {
    voices: Array.from({ length: 8 }, (_, i) => createVoice(i)),
    vuLeft: new Float32Array(8),
    vuRight: new Float32Array(8),
    stereoLeft: new Float32Array(8),
    stereoRight: new Float32Array(8),
    masterVuLeft: 0,
    masterVuRight: 0,
    generation: 1,
    positionSamples: 0,
    ...overrides,
  };
}

function createMockCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  const trailCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    getContext: vi.fn().mockReturnValue(trailCtx),
    width: 0,
    height: 0,
  } as unknown as HTMLCanvasElement;

  return { canvas, ctx };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('computeCorrelation', () => {
  it('returns 1 for identical L/R signals', () => {
    const l = new Float32Array([0.5, 0.3, 0.8, 0.1, 0, 0, 0, 0]);
    const r = new Float32Array([0.5, 0.3, 0.8, 0.1, 0, 0, 0, 0]);
    expect(computeCorrelation(l, r)).toBeCloseTo(1, 5);
  });

  it('returns -1 for perfectly inverted L/R signals', () => {
    const l = new Float32Array([0.5, 0.3, 0.8, 0.1, 0, 0, 0, 0]);
    const r = new Float32Array([-0.5, -0.3, -0.8, -0.1, 0, 0, 0, 0]);
    expect(computeCorrelation(l, r)).toBeCloseTo(-1, 5);
  });

  it('returns 0 for fully silent signals', () => {
    const l = new Float32Array(8);
    const r = new Float32Array(8);
    expect(computeCorrelation(l, r)).toBe(0);
  });

  it('returns 0 when one channel is silent', () => {
    const l = new Float32Array([0.5, 0.3, 0.8, 0, 0, 0, 0, 0]);
    const r = new Float32Array(8);
    expect(computeCorrelation(l, r)).toBe(0);
  });

  it('handles orthogonal signals', () => {
    // L active on voices 0-3, R active on voices 4-7 → uncorrelated
    const l = new Float32Array([1, 1, 1, 1, 0, 0, 0, 0]);
    const r = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(computeCorrelation(l, r)).toBeCloseTo(0, 5);
  });
});

describe('lissajousToCanvas', () => {
  it('maps (0, 0) to the center', () => {
    const { x, y } = lissajousToCanvas(0, 0, 200, 200, 100);
    expect(x).toBe(200);
    expect(y).toBe(200);
  });

  it('maps positive left to the right of center', () => {
    const { x, y } = lissajousToCanvas(0.5, 0, 200, 200, 100);
    expect(x).toBe(250); // cx + 0.5 * 100
    expect(y).toBe(200); // cy - 0 * 100
  });

  it('maps positive right upward (inverted Y)', () => {
    const { x, y } = lissajousToCanvas(0, 0.5, 200, 200, 100);
    expect(x).toBe(200);
    expect(y).toBe(150); // cy - 0.5 * 100
  });

  it('maps equal L/R to the diagonal', () => {
    const { x, y } = lissajousToCanvas(1, 1, 200, 200, 100);
    expect(x).toBe(300);
    expect(y).toBe(100);
  });
});

describe('StereoFieldRenderer', () => {
  let renderer: StereoFieldRenderer;
  let mockCanvas: HTMLCanvasElement;
  let mockCtx: CanvasRenderingContext2D;

  // Stub matchMedia for reduced-motion detection
  const matchMediaOriginal = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { canvas, ctx } = createMockCanvas();
    mockCanvas = canvas;
    mockCtx = ctx;
    renderer = new StereoFieldRenderer();
    renderer.init(mockCanvas, mockCtx);
    renderer.resize(400, 400, 1);
  });

  afterEach(() => {
    renderer.dispose();
    window.matchMedia = matchMediaOriginal;
  });

  it('draws without errors in lissajous mode', () => {
    const stereoLeft = new Float32Array([0.5, 0.3, 0, 0, 0, 0, 0, 0]);
    const stereoRight = new Float32Array([0.4, 0.6, 0, 0, 0, 0, 0, 0]);
    const vuLeft = new Float32Array([0.5, 0.3, 0, 0, 0, 0, 0, 0]);
    const vuRight = new Float32Array([0.4, 0.6, 0, 0, 0, 0, 0, 0]);
    const data = createData({
      stereoLeft,
      stereoRight,
      vuLeft,
      vuRight,
      stereoFieldSettings: { mode: 'lissajous', decay: 0.95 },
    });

    expect(() => renderer.draw(data, 0.016)).not.toThrow();
  });

  it('draws without errors in correlation mode', () => {
    const stereoLeft = new Float32Array([0.5, 0.3, 0.2, 0, 0, 0, 0, 0]);
    const stereoRight = new Float32Array([0.5, 0.3, 0.2, 0, 0, 0, 0, 0]);
    const vuLeft = new Float32Array([0.5, 0.3, 0.2, 0, 0, 0, 0, 0]);
    const vuRight = new Float32Array([0.5, 0.3, 0.2, 0, 0, 0, 0, 0]);
    const data = createData({
      stereoLeft,
      stereoRight,
      vuLeft,
      vuRight,
      stereoFieldSettings: { mode: 'correlation', decay: 0.95 },
    });

    expect(() => renderer.draw(data, 0.016)).not.toThrow();
  });

  it('switches modes via settings', () => {
    const stereoLeft = new Float32Array([0.5, 0, 0, 0, 0, 0, 0, 0]);
    const stereoRight = new Float32Array([0.3, 0, 0, 0, 0, 0, 0, 0]);
    const vuLeft = new Float32Array([0.5, 0, 0, 0, 0, 0, 0, 0]);
    const vuRight = new Float32Array([0.3, 0, 0, 0, 0, 0, 0, 0]);

    // Draw in lissajous mode
    const lissajousData = createData({
      stereoLeft,
      stereoRight,
      vuLeft,
      vuRight,
      stereoFieldSettings: { mode: 'lissajous', decay: 0.95 },
    });
    expect(() => renderer.draw(lissajousData, 0.016)).not.toThrow();

    // Switch to correlation mode
    const correlationData = createData({
      stereoLeft,
      stereoRight,
      vuLeft,
      vuRight,
      stereoFieldSettings: { mode: 'correlation', decay: 0.95 },
    });
    expect(() => renderer.draw(correlationData, 0.016)).not.toThrow();
  });

  it('dispose cleans up resources', () => {
    renderer.dispose();

    // After dispose, draw should be a no-op (ctx is null)
    const data = createData({
      stereoFieldSettings: { mode: 'lissajous', decay: 0.95 },
    });
    expect(() => renderer.draw(data, 0.016)).not.toThrow();
  });

  it('handles reduced motion', () => {
    // Create renderer with reduced motion enabled
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const rmRenderer = new StereoFieldRenderer();
    const { canvas, ctx } = createMockCanvas();
    rmRenderer.init(canvas, ctx);
    rmRenderer.resize(400, 400, 1);

    const stereoLeft = new Float32Array([0.5, 0.3, 0, 0, 0, 0, 0, 0]);
    const stereoRight = new Float32Array([0.4, 0.6, 0, 0, 0, 0, 0, 0]);
    const data = createData({
      stereoLeft,
      stereoRight,
      vuLeft: new Float32Array([0.5, 0.3, 0, 0, 0, 0, 0, 0]),
      vuRight: new Float32Array([0.4, 0.6, 0, 0, 0, 0, 0, 0]),
      stereoFieldSettings: { mode: 'lissajous', decay: 0.95 },
    });

    expect(() => rmRenderer.draw(data, 0.016)).not.toThrow();
    rmRenderer.dispose();
  });

  it('accumulates correlation history across frames', () => {
    const data1 = createData({
      stereoLeft: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      stereoRight: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      vuLeft: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      vuRight: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      stereoFieldSettings: { mode: 'correlation', decay: 0.95 },
    });
    const data2 = createData({
      stereoLeft: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      stereoRight: new Float32Array([-1, 0, 0, 0, 0, 0, 0, 0]),
      vuLeft: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      vuRight: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      stereoFieldSettings: { mode: 'correlation', decay: 0.95 },
    });

    // Multiple draws should accumulate history without error
    renderer.draw(data1, 0.016);
    renderer.draw(data2, 0.016);
    renderer.draw(data1, 0.016);

    expect(() => renderer.draw(data2, 0.016)).not.toThrow();
  });

  describe('stereoLeft/stereoRight for Lissajous and correlation', () => {
    it('renders Lissajous dot in correct quadrant for phase-inverted right channel', () => {
      // Positive left, negative right (phase inversion)
      const { x, y } = lissajousToCanvas(0.5, -0.5, 200, 200, 100);
      // x = cx + left * scale = 200 + 50 = 250 (right of center)
      expect(x).toBe(250);
      // y = cy - right * scale = 200 - (-50) = 250 (below center)
      expect(y).toBe(250);
    });

    it('uses stereoLeft/stereoRight (signed) for Lissajous dot placement', () => {
      const stereoLeft = new Float32Array([-0.5, 0, 0, 0, 0, 0, 0, 0]);
      const stereoRight = new Float32Array([-0.5, 0, 0, 0, 0, 0, 0, 0]);
      const vuLeft = new Float32Array([0.5, 0, 0, 0, 0, 0, 0, 0]);
      const vuRight = new Float32Array([0.5, 0, 0, 0, 0, 0, 0, 0]);
      const data = createData({
        stereoLeft,
        stereoRight,
        vuLeft,
        vuRight,
        stereoFieldSettings: { mode: 'lissajous', decay: 0.95 },
      });

      renderer.draw(data, 0.016);

      // arc is called once per non-silent voice dot
      expect(vi.mocked(mockCtx.arc).mock.calls.length).toBeGreaterThanOrEqual(
        1,
      );
    });

    it('computes negative correlation for anti-phase stereo signals', () => {
      const l = new Float32Array([0.5, 0.3, 0, 0, 0, 0, 0, 0]);
      const r = new Float32Array([-0.5, -0.3, 0, 0, 0, 0, 0, 0]);
      expect(computeCorrelation(l, r)).toBeCloseTo(-1, 5);
    });
  });
});
