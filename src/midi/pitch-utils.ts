/**
 * Pitch and velocity mapping utilities for MIDI → S-DSP conversion.
 */

const SEMITONE_RATIO = Math.pow(2, 1 / 12);

/** Maximum 14-bit DSP pitch register value. */
const MAX_DSP_PITCH = 0x3fff;

/**
 * Convert a MIDI note number to an S-DSP pitch register value.
 *
 * @param midiNote - MIDI note number (0-127, 60 = middle C).
 * @param baseNote - MIDI note at the instrument's native sample pitch.
 * @param basePitch - DSP pitch register value at baseNote.
 * @returns DSP pitch register value, clamped to 14-bit range [0, 0x3FFF].
 */
export function midiNoteToPitch(
  midiNote: number,
  baseNote: number,
  basePitch: number,
): number {
  const ratio = Math.pow(SEMITONE_RATIO, midiNote - baseNote);
  return Math.round(Math.min(MAX_DSP_PITCH, Math.max(0, basePitch * ratio)));
}

/**
 * Map MIDI velocity (0-127) to DSP-appropriate volume (0-127).
 * Linear mapping for now; velocity curves can be added later.
 */
export function midiVelocityToVolume(velocity: number): number {
  return Math.min(127, Math.max(0, velocity));
}
