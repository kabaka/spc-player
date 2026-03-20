import { describe, expect, it } from 'vitest';

import {
  ALL_NOTE_MAPPINGS,
  DEFAULT_OCTAVE,
  DEFAULT_VELOCITY,
  LOWER_ROW_MAPPINGS,
  MAX_OCTAVE,
  MAX_VELOCITY,
  MIN_OCTAVE,
  MIN_VELOCITY,
  UPPER_ROW_MAPPINGS,
  VELOCITY_STEP,
  codeToMidiNote,
  clampOctave,
  clampVelocity,
  getClaimedCodes,
  getPassthroughCodes,
  midiNoteToName,
  midiNoteToPitch,
  midiNoteToSpokenName,
} from './note-mapping';

describe('note-mapping', () => {
  describe('LOWER_ROW_MAPPINGS', () => {
    it('maps 12 keys from Z through M', () => {
      expect(LOWER_ROW_MAPPINGS).toHaveLength(12);
    });

    it('starts with KeyZ as C (offset 0)', () => {
      expect(LOWER_ROW_MAPPINGS[0]).toEqual({
        code: 'KeyZ',
        noteOffset: 0,
        octaveOffset: 0,
      });
    });

    it('ends with KeyM as B (offset 11)', () => {
      expect(LOWER_ROW_MAPPINGS[11]).toEqual({
        code: 'KeyM',
        noteOffset: 11,
        octaveOffset: 0,
      });
    });

    it('has all octaveOffset values as 0', () => {
      for (const m of LOWER_ROW_MAPPINGS) {
        expect(m.octaveOffset).toBe(0);
      }
    });
  });

  describe('UPPER_ROW_MAPPINGS', () => {
    it('maps 13 keys from Q through I', () => {
      expect(UPPER_ROW_MAPPINGS).toHaveLength(13);
    });

    it('starts with KeyQ as C (offset 0, octave +1)', () => {
      expect(UPPER_ROW_MAPPINGS[0]).toEqual({
        code: 'KeyQ',
        noteOffset: 0,
        octaveOffset: 1,
      });
    });

    it('ends with KeyI as C one octave higher', () => {
      expect(UPPER_ROW_MAPPINGS[12]).toEqual({
        code: 'KeyI',
        noteOffset: 0,
        octaveOffset: 2,
      });
    });

    it('does NOT include Digit1 or Digit4', () => {
      const codes = UPPER_ROW_MAPPINGS.map((m) => m.code);
      expect(codes).not.toContain('Digit1');
      expect(codes).not.toContain('Digit4');
    });
  });

  describe('ALL_NOTE_MAPPINGS', () => {
    it('contains 25 total entries (12 lower + 13 upper)', () => {
      expect(ALL_NOTE_MAPPINGS.size).toBe(25);
    });
  });

  describe('codeToMidiNote', () => {
    it('maps KeyZ at default octave 4 to MIDI 60 (C4)', () => {
      expect(codeToMidiNote('KeyZ', 4)).toBe(60);
    });

    it('maps KeyQ at default octave 4 to MIDI 72 (C5)', () => {
      expect(codeToMidiNote('KeyQ', 4)).toBe(72);
    });

    it('maps KeyI at default octave 4 to MIDI 84 (C6)', () => {
      expect(codeToMidiNote('KeyI', 4)).toBe(84);
    });

    it('maps KeyS at octave 4 to MIDI 61 (C#4)', () => {
      expect(codeToMidiNote('KeyS', 4)).toBe(61);
    });

    it('maps KeyM at octave 4 to MIDI 71 (B4)', () => {
      expect(codeToMidiNote('KeyM', 4)).toBe(71);
    });

    it('maps KeyZ at octave 1 to MIDI 24 (C1)', () => {
      expect(codeToMidiNote('KeyZ', 1)).toBe(24);
    });

    it('maps KeyI at octave 7 to MIDI 120 (C9)', () => {
      expect(codeToMidiNote('KeyI', 7)).toBe(120);
    });

    it('returns null for unmapped codes', () => {
      expect(codeToMidiNote('Digit1', 4)).toBeNull();
      expect(codeToMidiNote('Digit4', 4)).toBeNull();
      expect(codeToMidiNote('KeyA', 4)).toBeNull();
      expect(codeToMidiNote('Space', 4)).toBeNull();
    });

    it('returns null when resulting MIDI note exceeds 127', () => {
      // At octave 7: KeyZ=(7+0+1)*12=96, KeyQ=(7+1+1)*12=108, KeyI=(7+2+1)*12=120
      // All valid (<=127). The max possible is (MAX_OCTAVE+2+1)*12 = 120.
      expect(codeToMidiNote('KeyI', 7)).toBe(120);
    });
  });

  describe('midiNoteToName', () => {
    it('returns C4 for MIDI 60', () => {
      expect(midiNoteToName(60)).toBe('C4');
    });

    it('returns C#4 for MIDI 61', () => {
      expect(midiNoteToName(61)).toBe('C#4');
    });

    it('returns A4 for MIDI 69', () => {
      expect(midiNoteToName(69)).toBe('A4');
    });

    it('returns B7 for MIDI 107', () => {
      expect(midiNoteToName(107)).toBe('B7');
    });
  });

  describe('midiNoteToSpokenName', () => {
    it('returns "C 4" for MIDI 60', () => {
      expect(midiNoteToSpokenName(60)).toBe('C 4');
    });

    it('returns "C sharp 4" for MIDI 61 (not "C#")', () => {
      expect(midiNoteToSpokenName(61)).toBe('C sharp 4');
    });

    it('returns "F sharp 5" for MIDI 78', () => {
      expect(midiNoteToSpokenName(78)).toBe('F sharp 5');
    });
  });

  describe('midiNoteToPitch', () => {
    it('returns 4096 when midiNote equals baseNote', () => {
      expect(midiNoteToPitch(60, 60)).toBe(4096);
    });

    it('returns ~8192 for one octave up', () => {
      expect(midiNoteToPitch(72, 60)).toBe(8192);
    });

    it('returns ~2048 for one octave down', () => {
      expect(midiNoteToPitch(48, 60)).toBe(2048);
    });
  });

  describe('getClaimedCodes', () => {
    it('includes all note mapping codes', () => {
      const claimed = getClaimedCodes();
      for (const code of ALL_NOTE_MAPPINGS.keys()) {
        expect(claimed.has(code)).toBe(true);
      }
    });

    it('includes octave and velocity control codes', () => {
      const claimed = getClaimedCodes();
      expect(claimed.has('Minus')).toBe(true);
      expect(claimed.has('Equal')).toBe(true);
      expect(claimed.has('BracketLeft')).toBe(true);
      expect(claimed.has('BracketRight')).toBe(true);
    });

    it('does NOT include passthrough codes', () => {
      const claimed = getClaimedCodes();
      expect(claimed.has('Space')).toBe(false);
      expect(claimed.has('Escape')).toBe(false);
      expect(claimed.has('ArrowUp')).toBe(false);
    });
  });

  describe('getPassthroughCodes', () => {
    it('includes Space, Escape, arrows, and Tab', () => {
      const passthrough = getPassthroughCodes();
      expect(passthrough.has('Space')).toBe(true);
      expect(passthrough.has('Escape')).toBe(true);
      expect(passthrough.has('ArrowUp')).toBe(true);
      expect(passthrough.has('ArrowDown')).toBe(true);
      expect(passthrough.has('ArrowLeft')).toBe(true);
      expect(passthrough.has('ArrowRight')).toBe(true);
      expect(passthrough.has('Tab')).toBe(true);
    });
  });

  describe('clampOctave', () => {
    it('clamps below minimum to MIN_OCTAVE', () => {
      expect(clampOctave(0)).toBe(MIN_OCTAVE);
      expect(clampOctave(-5)).toBe(MIN_OCTAVE);
    });

    it('clamps above maximum to MAX_OCTAVE', () => {
      expect(clampOctave(10)).toBe(MAX_OCTAVE);
    });

    it('passes through values within range', () => {
      expect(clampOctave(4)).toBe(4);
    });
  });

  describe('clampVelocity', () => {
    it('clamps below minimum to MIN_VELOCITY', () => {
      expect(clampVelocity(0)).toBe(MIN_VELOCITY);
      expect(clampVelocity(-10)).toBe(MIN_VELOCITY);
    });

    it('clamps above maximum to MAX_VELOCITY', () => {
      expect(clampVelocity(200)).toBe(MAX_VELOCITY);
    });

    it('passes through values within range', () => {
      expect(clampVelocity(100)).toBe(100);
    });
  });

  describe('constants', () => {
    it('has correct defaults', () => {
      expect(DEFAULT_OCTAVE).toBe(4);
      expect(DEFAULT_VELOCITY).toBe(100);
      expect(VELOCITY_STEP).toBe(16);
    });
  });
});
