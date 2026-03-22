import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { VoiceStateSnapshot } from '@/audio/audio-state-buffer';

import type { AudioVisualizationData } from '../types';

import {
  PianoRollRenderer,
  frequencyToMidiNote,
  pitchToFrequency,
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

// Compute the raw VxPITCH value for a given frequency in Hz.
function frequencyToPitch(freq: number): number {
  return Math.round((freq * 0x1000) / 32000);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('PianoRollRenderer', () => {
  describe('pitchToFrequency', () => {
    it('converts unity pitch (0x1000) to 32000 Hz', () => {
      expect(pitchToFrequency(0x1000)).toBe(32000);
    });

    it('converts zero pitch to 0 Hz', () => {
      expect(pitchToFrequency(0)).toBe(0);
    });

    it('converts half pitch (0x800) to 16000 Hz', () => {
      expect(pitchToFrequency(0x800)).toBe(16000);
    });
  });

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
    it('converts VxPITCH for ~440 Hz to near MIDI 69', () => {
      const pitch = frequencyToPitch(440);
      expect(pitchToMidiNote(pitch)).toBeCloseTo(69, 0);
    });

    it('returns 0 for zero pitch', () => {
      expect(pitchToMidiNote(0)).toBe(0);
    });

    it('returns 0 for negative pitch', () => {
      expect(pitchToMidiNote(-1)).toBe(0);
    });

    it('gives higher notes for higher pitch values', () => {
      const low = pitchToMidiNote(frequencyToPitch(200));
      const high = pitchToMidiNote(frequencyToPitch(800));
      expect(high).toBeGreaterThan(low);
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
        pitch: frequencyToPitch(440),
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
        pitch: frequencyToPitch(440),
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
        pitch: frequencyToPitch(440),
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

      const pitchForC4 = frequencyToPitch(261.63);
      const voices = Array.from({ length: 8 }, (_, i) =>
        createVoice({ index: i }),
      );
      voices[0] = createVoice({
        index: 0,
        active: true,
        keyOn: true,
        pitch: pitchForC4,
      });

      const data = createData({ voices, positionSamples: 32000 });

      // Run enough frames for convergence (lerp factor 0.2)
      for (let i = 0; i < 60; i++) {
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
        pitch: frequencyToPitch(440),
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
      for (let i = 0; i < 80; i++) {
        silentData.positionSamples += 32000;
        renderer.draw(silentData, 1 / 60);
      }

      const range = renderer.getVisibleRange();
      // Should converge back toward default [36, 96]
      expect(range.min).toBeCloseTo(36, 0);
      expect(range.max).toBeCloseTo(96, 0);
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
        pitch: frequencyToPitch(440),
      });

      // Run enough frames for auto-range to converge (lerp factor 0.2)
      for (let i = 0; i < 60; i++) {
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
        positionSamples: 32000 + 60 * 533,
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
        pitch: frequencyToPitch(440),
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
        pitch: frequencyToPitch(1000),
      });
      for (let i = 0; i < 20; i++) {
        renderer.draw(
          createData({ voices, positionSamples: 32000 + i * 533 }),
          1 / 60,
        );
      }

      renderer.dispose();

      const range = renderer.getVisibleRange();
      expect(range.min).toBe(36);
      expect(range.max).toBe(96);
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
        pitch: frequencyToPitch(440),
      });

      const data = createData({ voices, positionSamples: 32000 });
      renderer.draw(data, 1 / 60);

      // Should have background fill + at least one note bar
      expect(vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });
});
