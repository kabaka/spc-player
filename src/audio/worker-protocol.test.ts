import { describe, expect, it } from 'vitest';

import type { MainToWorklet, WorkletToMain } from './worker-protocol';
import { PROTOCOL_VERSION } from './worker-protocol';

describe('worker-protocol', () => {
  describe('PROTOCOL_VERSION', () => {
    it('is a positive integer', () => {
      expect(PROTOCOL_VERSION).toBeGreaterThan(0);
      expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    });
  });

  describe('MainToWorklet.NoteOn', () => {
    it('has the correct shape', () => {
      const msg: MainToWorklet.NoteOn = {
        type: 'note-on',
        voice: 3,
        pitch: 4096,
      };

      expect(msg.type).toBe('note-on');
      expect(msg.voice).toBe(3);
      expect(msg.pitch).toBe(4096);
    });

    it('voice range 0–7 is representable', () => {
      for (let v = 0; v < 8; v++) {
        const msg: MainToWorklet.NoteOn = {
          type: 'note-on',
          voice: v,
          pitch: 1000,
        };
        expect(msg.voice).toBe(v);
      }
    });
  });

  describe('MainToWorklet.NoteOff', () => {
    it('has the correct shape', () => {
      const msg: MainToWorklet.NoteOff = {
        type: 'note-off',
        voice: 5,
      };

      expect(msg.type).toBe('note-off');
      expect(msg.voice).toBe(5);
    });
  });

  describe('WorkletToMain.Telemetry echo fields', () => {
    it('accepts telemetry without echo data', () => {
      const msg: WorkletToMain.Telemetry = {
        type: 'telemetry',
        positionSamples: 32000,
        vuLeft: [0, 0, 0, 0, 0, 0, 0, 0],
        vuRight: [0, 0, 0, 0, 0, 0, 0, 0],
        masterVuLeft: 0.5,
        masterVuRight: 0.5,
        voices: [],
        generation: 1,
        segment: null,
      };

      expect(msg.echoBuffer).toBeUndefined();
      expect(msg.firCoefficients).toBeUndefined();
    });

    it('accepts telemetry with echo buffer and FIR data', () => {
      const echoBuffer = new ArrayBuffer(128);
      const firCoefficients = new ArrayBuffer(8);

      const msg: WorkletToMain.Telemetry = {
        type: 'telemetry',
        positionSamples: 64000,
        vuLeft: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        vuRight: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
        masterVuLeft: 0.6,
        masterVuRight: 0.4,
        voices: [],
        generation: 10,
        segment: null,
        echoBuffer,
        firCoefficients,
      };

      expect(msg.echoBuffer).toBe(echoBuffer);
      expect(msg.firCoefficients).toBe(firCoefficients);
      expect(msg.echoBuffer?.byteLength).toBe(128);
      expect(msg.firCoefficients?.byteLength).toBe(8);
    });
  });

  describe('message type discriminator exhaustiveness', () => {
    it('MainToWorklet includes note-on and note-off in the union', () => {
      // Type-level test: verify these message types are part of the union.
      // If the union is wrong, this file won't compile.
      const noteOn: MainToWorklet = { type: 'note-on', voice: 0, pitch: 4096 };
      const noteOff: MainToWorklet = { type: 'note-off', voice: 0 };

      expect(noteOn.type).toBe('note-on');
      expect(noteOff.type).toBe('note-off');
    });
  });
});
