import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoiceStateSnapshot } from '@/audio/audio-state-buffer';

import type { AudioVisualizationData } from '../types';
import { VoiceTimelineRenderer } from './VoiceTimelineRenderer';

// ── Helpers ───────────────────────────────────────────────────────────

function createVoice(
  overrides?: Partial<VoiceStateSnapshot>,
): VoiceStateSnapshot {
  return {
    index: 0,
    envelopePhase: 'silent',
    envelopeLevel: 0,
    pitch: 0,
    sampleSource: 0,
    keyOn: false,
    active: false,
    ...overrides,
  };
}

function createData(
  overrides?: Partial<AudioVisualizationData>,
): AudioVisualizationData {
  return {
    voices: Array.from({ length: 8 }, (_, i) => createVoice({ index: i })),
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
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    shadowColor: 'transparent',
    shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
}

function createRenderer(
  width = 800,
  height = 300,
): { renderer: VoiceTimelineRenderer; ctx: CanvasRenderingContext2D } {
  const renderer = new VoiceTimelineRenderer();
  const ctx = createMockCtx();
  const canvas = { width: width * 2, height: height * 2 } as HTMLCanvasElement;
  renderer.init(canvas, ctx);
  renderer.resize(width, height, 2);
  return { renderer, ctx };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('VoiceTimelineRenderer', () => {
  describe('draw()', () => {
    let renderer: VoiceTimelineRenderer;
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ({ renderer, ctx } = createRenderer());
    });

    it('draws without error on empty data', () => {
      const data = createData({ positionSamples: 32000 });
      expect(() => renderer.draw(data, 1 / 60)).not.toThrow();
    });

    it('fills background on draw', () => {
      const data = createData({ positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      expect(vi.mocked(ctx.fillRect)).toHaveBeenCalled();
    });

    it('draws bars for active voices', () => {
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        envelopeLevel: 0.8,
      });

      const data = createData({ voices, positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // Background fill + grid + at least one voice bar
      expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    });

    it('draws voice labels on desktop', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
      });
      renderer.resize(800, 300, 2);

      const data = createData({ positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // Should draw V1 through V8 labels
      const fillTextCalls = vi.mocked(ctx.fillText).mock.calls;
      const labelCalls = fillTextCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('V'),
      );
      expect(labelCalls.length).toBe(8);
      expect(labelCalls[0][0]).toBe('V1');
      expect(labelCalls[7][0]).toBe('V8');
    });

    it('skips labels on mobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 500,
        writable: true,
      });
      renderer.resize(375, 120, 2);

      const data = createData({ positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      const fillTextCalls = vi.mocked(ctx.fillText).mock.calls;
      const labelCalls = fillTextCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('V'),
      );
      expect(labelCalls.length).toBe(0);

      // Restore
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
      });
    });

    it('applies muted opacity for muted voices', () => {
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        envelopeLevel: 1,
      });

      const mutedVoices = [
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ];
      const data = createData({ voices, positionSamples: 32000, mutedVoices });
      renderer.draw(data, 1 / 60);

      // globalAlpha should be reset to 1 after drawing
      expect(ctx.globalAlpha).toBe(1);
    });

    it('draws grid lines at 1-second intervals', () => {
      const data = createData({ positionSamples: 32000 * 3 });
      renderer.draw(data, 1 / 60);

      // Should have drawn vertical grid lines (stroke calls)
      expect(vi.mocked(ctx.stroke)).toHaveBeenCalled();
    });

    it('draws lane dividers between voices', () => {
      const data = createData({ positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // 7 lane divider lines (between 8 voices) + vertical time lines
      const moveToCalls = vi.mocked(ctx.moveTo).mock.calls;
      expect(moveToCalls.length).toBeGreaterThanOrEqual(7);
    });

    it('tracks activity over multiple frames', () => {
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );

      // Voice 2 active for several frames
      voices[2] = createVoice({
        index: 2,
        active: true,
        keyOn: true,
        envelopeLevel: 0.5,
      });

      for (let frame = 0; frame < 10; frame++) {
        const data = createData({
          voices,
          positionSamples: 32000 + frame * 3200,
        });
        renderer.draw(data, 1 / 60);
      }

      // Voice goes silent
      voices[2] = createVoice({ index: 2 });
      const data = createData({
        voices,
        positionSamples: 32000 + 10 * 3200,
      });

      // Should draw the completed bar without error
      expect(() => renderer.draw(data, 1 / 60)).not.toThrow();
    });

    it('uses incremental draw when possible', () => {
      const data1 = createData({ positionSamples: 32000 });
      renderer.draw(data1, 1 / 60);

      // Second draw should attempt incremental (drawImage shift)
      const data2 = createData({ positionSamples: 33600 });
      renderer.draw(data2, 1 / 60);

      expect(vi.mocked(ctx.drawImage)).toHaveBeenCalled();
    });

    it('does full redraw on generation change', () => {
      const data1 = createData({ positionSamples: 32000, generation: 0 });
      renderer.draw(data1, 1 / 60);

      vi.mocked(ctx.clearRect).mockClear();

      const data2 = createData({ positionSamples: 32000, generation: 1 });
      renderer.draw(data2, 1 / 60);

      // Full redraw clears the entire canvas
      expect(vi.mocked(ctx.clearRect)).toHaveBeenCalledWith(0, 0, 800, 300);
    });

    it('clears history on playback restart (position jump backward)', () => {
      // Play forward
      const data1 = createData({ positionSamples: 32000 * 5 });
      renderer.draw(data1, 1 / 60);

      // Jump backward simulating restart
      const data2 = createData({ positionSamples: 0 });
      expect(() => renderer.draw(data2, 1 / 60)).not.toThrow();
    });
  });

  describe('dispose()', () => {
    it('resets state without error', () => {
      const { renderer } = createRenderer();

      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({ index: 0, active: true, keyOn: true });
      const data = createData({ voices, positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      expect(() => renderer.dispose()).not.toThrow();
    });

    it('allows reinitialization after dispose', () => {
      const { renderer, ctx } = createRenderer();

      renderer.dispose();

      const canvas = { width: 1600, height: 600 } as HTMLCanvasElement;
      renderer.init(canvas, ctx);
      renderer.resize(800, 300, 2);

      const data = createData({ positionSamples: 32000 });
      expect(() => renderer.draw(data, 1 / 60)).not.toThrow();
    });
  });

  describe('resize()', () => {
    it('sets mobile mode when window is narrow', () => {
      const { renderer, ctx } = createRenderer();

      Object.defineProperty(window, 'innerWidth', {
        value: 500,
        writable: true,
      });
      renderer.resize(375, 120, 2);

      const data = createData({ positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // No labels on mobile — only grid-related fillText
      const fillTextCalls = vi.mocked(ctx.fillText).mock.calls;
      const labelCalls = fillTextCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('V'),
      );
      expect(labelCalls.length).toBe(0);

      // Restore
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
      });
    });

    it('forces full redraw after resize', () => {
      const { renderer, ctx } = createRenderer();

      const data1 = createData({ positionSamples: 32000 });
      renderer.draw(data1, 1 / 60);

      renderer.resize(600, 200, 2);
      vi.mocked(ctx.clearRect).mockClear();

      const data2 = createData({ positionSamples: 33600 });
      renderer.draw(data2, 1 / 60);

      // Should do full redraw (clearRect for full canvas), not incremental
      expect(vi.mocked(ctx.clearRect)).toHaveBeenCalledWith(0, 0, 600, 200);
    });
  });
});
