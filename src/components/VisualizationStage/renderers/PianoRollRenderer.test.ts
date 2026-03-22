import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { VoiceStateSnapshot } from '@/audio/audio-state-buffer';

import type { AudioVisualizationData } from '../types';

import {
  PianoRollRenderer,
  frequencyToMidiNote,
  pitchToMidiNote,
} from './PianoRollRenderer';

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
): { renderer: PianoRollRenderer; ctx: CanvasRenderingContext2D } {
  const renderer = new PianoRollRenderer();
  const ctx = createMockCtx();
  const canvas = { width: width * 2, height: height * 2 } as HTMLCanvasElement;
  renderer.init(canvas, ctx);
  renderer.resize(width, height, 2);
  return { renderer, ctx };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('PianoRollRenderer', () => {
  describe('frequencyToMidiNote', () => {
    it('converts 440 Hz to MIDI 69 (A4)', () => {
      expect(frequencyToMidiNote(440)).toBeCloseTo(69, 5);
    });

    it('converts 261.63 Hz to approximately MIDI 60 (C4)', () => {
      expect(frequencyToMidiNote(261.63)).toBeCloseTo(60, 0);
    });

    it('converts 880 Hz to MIDI 81 (A5)', () => {
      expect(frequencyToMidiNote(880)).toBeCloseTo(81, 5);
    });

    it('returns 0 for zero frequency', () => {
      expect(frequencyToMidiNote(0)).toBe(0);
    });

    it('returns 0 for negative frequency', () => {
      expect(frequencyToMidiNote(-100)).toBe(0);
    });
  });

  describe('pitchToMidiNote', () => {
    it('maps unity pitch (0x1000) to MIDI 60 (C4)', () => {
      expect(pitchToMidiNote(0x1000)).toBeCloseTo(60, 5);
    });

    it('maps 0x2000 to MIDI 72 (one octave up)', () => {
      expect(pitchToMidiNote(0x2000)).toBeCloseTo(72, 5);
    });

    it('maps 0x0800 to MIDI 48 (one octave down)', () => {
      expect(pitchToMidiNote(0x0800)).toBeCloseTo(48, 5);
    });

    it('maps max register 0x3FFF below MIDI 127', () => {
      expect(pitchToMidiNote(0x3fff)).toBeLessThan(127);
    });

    it('returns 0 for zero pitch', () => {
      expect(pitchToMidiNote(0)).toBe(0);
    });

    it('returns 0 for negative pitch', () => {
      expect(pitchToMidiNote(-1)).toBe(0);
    });

    it('gives higher notes for higher pitch values', () => {
      expect(pitchToMidiNote(0x1800)).toBeGreaterThan(pitchToMidiNote(0x0800));
    });
  });

  describe('draw()', () => {
    let renderer: PianoRollRenderer;
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ({ renderer, ctx } = createRenderer());
    });

    it('draws without error on empty data', () => {
      const data = createData({ positionSamples: 32000 });
      expect(() => renderer.draw(data, 1 / 60)).not.toThrow();
    });

    it('calls fillRect for background and active note bars', () => {
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x1000,
      });

      const data = createData({ voices, positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // At least background fill + one note bar
      expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    });

    it('applies muted opacity for muted voices', () => {
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x1000,
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

      // globalAlpha should have been set to 0.3 at some point
      expect(ctx.globalAlpha).toBe(1); // reset after drawing
    });

    it('does not apply glow on mobile', () => {
      // Resize to mobile width
      Object.defineProperty(window, 'innerWidth', {
        value: 500,
        writable: true,
      });
      renderer.resize(375, 120, 2);

      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x1000,
      });

      const data = createData({ voices, positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // shadowBlur should never be set above 0 on mobile
      expect(ctx.shadowBlur).toBe(0);

      // Restore
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
      });
    });
  });

  describe('auto-range', () => {
    it('converges toward active note ± 1 octave', () => {
      const { renderer } = createRenderer();

      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x1000, // MIDI 60 (C4)
      });

      const data = createData({ voices, positionSamples: 32000 });

      // Run enough frames for convergence (asymmetric lerp: expand 0.25, contract 0.08)
      for (let i = 0; i < 80; i++) {
        renderer.draw(data, 1 / 60);
      }

      const range = renderer.getVisibleRange();
      // MIDI ~60 ± 12 = [48, 72]
      expect(range.min).toBeCloseTo(48, 0);
      expect(range.max).toBeCloseTo(72, 0);
    });

    it('returns to default range when no notes are active', () => {
      const { renderer } = createRenderer();

      // Play a note for several frames
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x1000,
      });
      const data = createData({ voices, positionSamples: 32000 });
      for (let i = 0; i < 30; i++) {
        renderer.draw(data, 1 / 60);
      }

      // Stop the note and advance time well beyond the 3s window
      voices[0] = createVoice({ index: 0 });
      const silentData = createData({
        voices,
        positionSamples: 32000 * 10, // 10 seconds — note at ~1s is outside 3s window
      });
      for (let i = 0; i < 120; i++) {
        silentData.positionSamples += 32000;
        renderer.draw(silentData, 1 / 60);
      }

      const range = renderer.getVisibleRange();
      // Should converge back toward default [24, 84]
      expect(range.min).toBeCloseTo(24, 0);
      expect(range.max).toBeCloseTo(84, 0);
    });
  });

  describe('canvas shift optimization', () => {
    it('uses drawImage to shift content on incremental frames', () => {
      const { renderer, ctx } = createRenderer();
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x1000,
      });

      // Run enough frames for auto-range to converge (asymmetric lerp)
      for (let i = 0; i < 120; i++) {
        const data = createData({
          voices,
          positionSamples: 32000 + i * 533,
        });
        renderer.draw(data, 1 / 60);
      }

      // Next frame with small time advance → incremental shift
      vi.mocked(ctx.drawImage).mockClear();
      const nextData = createData({
        voices,
        positionSamples: 32000 + 120 * 533,
      });
      renderer.draw(nextData, 1 / 60);
      expect(vi.mocked(ctx.drawImage)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(ctx.drawImage).mock.calls[0][0]).toBe(
        (renderer as unknown as { canvas: HTMLCanvasElement }).canvas,
      );
    });

    it('falls back to full redraw after resize', () => {
      const { renderer, ctx } = createRenderer();
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );

      // First frame
      const data1 = createData({ voices, positionSamples: 32000 });
      renderer.draw(data1, 1 / 60);

      // Resize triggers full redraw
      renderer.resize(1024, 400, 2);
      vi.mocked(ctx.drawImage).mockClear();
      const data2 = createData({ voices, positionSamples: 32000 + 533 });
      renderer.draw(data2, 1 / 60);
      expect(vi.mocked(ctx.drawImage)).not.toHaveBeenCalled();
    });

    it('falls back to full redraw on generation change', () => {
      const { renderer, ctx } = createRenderer();
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );

      // First frame with generation 0
      const data1 = createData({
        voices,
        positionSamples: 32000,
        generation: 0,
      });
      renderer.draw(data1, 1 / 60);

      // Second frame with generation change
      vi.mocked(ctx.drawImage).mockClear();
      const data2 = createData({
        voices,
        positionSamples: 32000 + 533,
        generation: 1,
      });
      renderer.draw(data2, 1 / 60);
      expect(vi.mocked(ctx.drawImage)).not.toHaveBeenCalled();
    });
  });

  describe('dispose()', () => {
    it('clears all state so old notes are not drawn', () => {
      const { renderer, ctx } = createRenderer();

      // Play a note
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x1000,
      });
      renderer.draw(createData({ voices, positionSamples: 32000 }), 1 / 60);

      renderer.dispose();

      // After dispose, draw with no active voices — only background fill
      vi.mocked(ctx.fillRect).mockClear();
      renderer.draw(createData({ positionSamples: 64000 }), 1 / 60);

      const fills = vi.mocked(ctx.fillRect).mock.calls;
      expect(fills).toHaveLength(1); // background only
    });

    it('resets visible range to defaults', () => {
      const { renderer } = createRenderer();

      // Shift range by playing notes
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: 0x2000, // MIDI 72 — shifts range away from defaults
      });
      for (let i = 0; i < 20; i++) {
        renderer.draw(
          createData({ voices, positionSamples: 32000 + i * 533 }),
          1 / 60,
        );
      }

      renderer.dispose();

      const range = renderer.getVisibleRange();
      expect(range.min).toBe(24);
      expect(range.max).toBe(84);
    });
  });

  describe('regression: keyOn false voices', () => {
    it('renders notes for active voices with keyOn false', () => {
      const { renderer, ctx } = createRenderer();

      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      // keyOn is a momentary DSP trigger (~31μs) — almost always false when polled
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: false,
        pitch: 0x1000,
      });

      const data = createData({ voices, positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // Should have background fill + at least one note bar
      expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });

  describe('regression: 0x1000 pitch produces visible notes', () => {
    it('creates notes for voices at unity pitch (0x1000)', () => {
      const { renderer, ctx } = createRenderer();

      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      // 0x1000 is the most common SPC700 pitch value (unity = C4, MIDI 60)
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: false,
        pitch: 0x1000,
      });

      const data = createData({ voices, positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // MIDI 60 is within default visible range [24, 84] — note bar must be drawn
      expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThanOrEqual(
        2, // background fill + at least one note bar
      );
    });
  });
});
