import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioVisualizationData } from '../types';
import {
  colorIndexFromTitle,
  CoverArtRenderer,
  hashTitle,
} from './CoverArtRenderer';

// ── Helpers ───────────────────────────────────────────────────────────

function createData(
  overrides?: Partial<AudioVisualizationData>,
): AudioVisualizationData {
  return {
    voices: [],
    vuLeft: new Float32Array(8),
    vuRight: new Float32Array(8),
    stereoLeft: new Float32Array(8),
    stereoRight: new Float32Array(8),
    masterVuLeft: 0,
    masterVuRight: 0,
    generation: 0,
    positionSamples: 0,
    ...overrides,
  };
}

function createMockCtx(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D;
}

function createRenderer(
  width = 400,
  height = 300,
): { renderer: CoverArtRenderer; ctx: CanvasRenderingContext2D } {
  const renderer = new CoverArtRenderer();
  const ctx = createMockCtx();
  const canvas = {
    width: width * 2,
    height: height * 2,
  } as HTMLCanvasElement;
  renderer.init(canvas, ctx);
  renderer.resize(width, height, 2);
  return { renderer, ctx };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('CoverArtRenderer', () => {
  let originalGetAttribute: typeof document.documentElement.getAttribute;

  beforeEach(() => {
    originalGetAttribute = document.documentElement.getAttribute.bind(
      document.documentElement,
    );
  });

  afterEach(() => {
    // Restore original getAttribute if mocked
    if (document.documentElement.getAttribute !== originalGetAttribute) {
      document.documentElement.getAttribute = originalGetAttribute;
    }
  });

  describe('hashTitle', () => {
    it('returns a consistent hash for the same input', () => {
      expect(hashTitle('Chrono Trigger')).toBe(hashTitle('Chrono Trigger'));
    });

    it('returns different hashes for different inputs', () => {
      expect(hashTitle('Chrono Trigger')).not.toBe(
        hashTitle('Final Fantasy VI'),
      );
    });

    it('returns an unsigned 32-bit integer', () => {
      const h = hashTitle('test');
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    });
  });

  describe('colorIndexFromTitle', () => {
    it('returns an index between 0 and 7', () => {
      for (const title of ['A', 'Chrono Trigger', 'Final Fantasy VI', '']) {
        const idx = colorIndexFromTitle(title);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(7);
      }
    });
  });

  describe('init', () => {
    it('stores canvas and context references', () => {
      const renderer = new CoverArtRenderer();
      const ctx = createMockCtx();
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, ctx);

      // Drawing should work after init
      renderer.resize(400, 300, 2);
      renderer.draw(createData({ title: 'Test' }), 0);
      expect(ctx.clearRect).toHaveBeenCalled();
    });
  });

  describe('draw', () => {
    it('draws cartridge when title is provided', () => {
      const { renderer, ctx } = createRenderer();
      renderer.draw(createData({ title: 'Chrono Trigger' }), 0);

      // Should have drawn (clearRect + fill calls)
      expect(ctx.clearRect).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('draws placeholder when title is empty', () => {
      const { renderer, ctx } = createRenderer();
      renderer.draw(createData({ title: '' }), 0);

      expect(ctx.clearRect).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalledWith(
        'No Track Loaded',
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('draws placeholder when title is undefined', () => {
      const { renderer, ctx } = createRenderer();
      renderer.draw(createData(), 0);

      expect(ctx.fillText).toHaveBeenCalledWith(
        'No Track Loaded',
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('does not redraw when title is unchanged', () => {
      const { renderer, ctx } = createRenderer();
      const data = createData({ title: 'Chrono Trigger' });

      renderer.draw(data, 0);
      const callCount = vi.mocked(ctx.clearRect).mock.calls.length;

      renderer.draw(data, 0);
      expect(vi.mocked(ctx.clearRect).mock.calls.length).toBe(callCount);
    });

    it('redraws when title changes', () => {
      const { renderer, ctx } = createRenderer();

      renderer.draw(createData({ title: 'Chrono Trigger' }), 0);
      const callCount = vi.mocked(ctx.clearRect).mock.calls.length;

      renderer.draw(createData({ title: 'Final Fantasy VI' }), 0);
      expect(vi.mocked(ctx.clearRect).mock.calls.length).toBeGreaterThan(
        callCount,
      );
    });
  });

  describe('resize', () => {
    it('triggers redraw at new dimensions', () => {
      const { renderer, ctx } = createRenderer();

      renderer.draw(createData({ title: 'Test Game' }), 0);
      const callCount = vi.mocked(ctx.clearRect).mock.calls.length;

      renderer.resize(600, 400, 2);
      expect(vi.mocked(ctx.clearRect).mock.calls.length).toBeGreaterThan(
        callCount,
      );
    });

    it('does not draw before first draw call', () => {
      const renderer = new CoverArtRenderer();
      const ctx = createMockCtx();
      const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, ctx);

      renderer.resize(400, 300, 2);
      // lastTitle is null before first draw, so resize should not render
      expect(ctx.clearRect).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('cleans up references', () => {
      const { renderer, ctx } = createRenderer();

      renderer.draw(createData({ title: 'Test' }), 0);
      renderer.dispose();

      // After dispose, draw should be a no-op (no ctx)
      vi.mocked(ctx.clearRect).mockClear();
      renderer.draw(createData({ title: 'New Title' }), 0);
      expect(ctx.clearRect).not.toHaveBeenCalled();
    });
  });
});
