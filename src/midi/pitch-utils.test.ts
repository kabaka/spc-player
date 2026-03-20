/**
 * Unit tests for pitch-utils.ts — MIDI note to DSP pitch conversion.
 */

import { describe, it, expect } from 'vitest';

import { midiNoteToPitch, midiVelocityToVolume } from './pitch-utils';

describe('midiNoteToPitch', () => {
  it('returns basePitch when midiNote equals baseNote', () => {
    expect(midiNoteToPitch(60, 60, 0x1000)).toBe(0x1000);
  });

  it('doubles pitch for one octave up', () => {
    const basePitch = 0x1000;
    const result = midiNoteToPitch(72, 60, basePitch);
    expect(result).toBe(basePitch * 2);
  });

  it('halves pitch for one octave down', () => {
    const basePitch = 0x1000;
    const result = midiNoteToPitch(48, 60, basePitch);
    expect(result).toBe(basePitch / 2);
  });

  it('returns correct pitch for one semitone up', () => {
    const basePitch = 4096;
    const expected = Math.round(basePitch * Math.pow(2, 1 / 12));
    expect(midiNoteToPitch(61, 60, basePitch)).toBe(expected);
  });

  it('clamps output to maximum 14-bit value (0x3FFF)', () => {
    // Very high note with high base pitch should clamp
    expect(midiNoteToPitch(127, 0, 0x2000)).toBe(0x3fff);
  });

  it('clamps output to minimum 0', () => {
    // basePitch 1 with extreme downward transposition rounds to 0
    expect(midiNoteToPitch(0, 127, 1)).toBe(0);
  });

  it('returns 0 when basePitch is 0', () => {
    expect(midiNoteToPitch(60, 60, 0)).toBe(0);
  });
});

describe('midiVelocityToVolume', () => {
  it('returns velocity for values in range', () => {
    expect(midiVelocityToVolume(64)).toBe(64);
    expect(midiVelocityToVolume(1)).toBe(1);
    expect(midiVelocityToVolume(127)).toBe(127);
  });

  it('clamps negative values to 0', () => {
    expect(midiVelocityToVolume(-5)).toBe(0);
  });

  it('clamps values above 127 to 127', () => {
    expect(midiVelocityToVolume(200)).toBe(127);
  });
});
