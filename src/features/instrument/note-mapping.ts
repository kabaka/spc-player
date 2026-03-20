// ── Types ─────────────────────────────────────────────────────────────

export interface NoteMapping {
  readonly code: string;
  readonly noteOffset: number;
  readonly octaveOffset: number;
}

// ── Constants ─────────────────────────────────────────────────────────

export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 7;
export const MIN_VELOCITY = 1;
export const MAX_VELOCITY = 127;
export const VELOCITY_STEP = 16;
export const DEFAULT_OCTAVE = 4;
export const DEFAULT_VELOCITY = 100;

/**
 * Lower row: Z=C, S=C#, X=D, D=D#, C=E, V=F, G=F#, B=G, H=G#, N=A, J=A#, M=B
 * octaveOffset 0 = base octave
 */
export const LOWER_ROW_MAPPINGS: readonly NoteMapping[] = [
  { code: 'KeyZ', noteOffset: 0, octaveOffset: 0 },
  { code: 'KeyS', noteOffset: 1, octaveOffset: 0 },
  { code: 'KeyX', noteOffset: 2, octaveOffset: 0 },
  { code: 'KeyD', noteOffset: 3, octaveOffset: 0 },
  { code: 'KeyC', noteOffset: 4, octaveOffset: 0 },
  { code: 'KeyV', noteOffset: 5, octaveOffset: 0 },
  { code: 'KeyG', noteOffset: 6, octaveOffset: 0 },
  { code: 'KeyB', noteOffset: 7, octaveOffset: 0 },
  { code: 'KeyH', noteOffset: 8, octaveOffset: 0 },
  { code: 'KeyN', noteOffset: 9, octaveOffset: 0 },
  { code: 'KeyJ', noteOffset: 10, octaveOffset: 0 },
  { code: 'KeyM', noteOffset: 11, octaveOffset: 0 },
];

/**
 * Upper row: Q=C, 2=C#, W=D, 3=D#, E=E, R=F, 5=F#, T=G, 6=G#, Y=A, 7=A#, U=B, I=C(+1)
 * octaveOffset 1 = one octave above base
 * Digit1 and Digit4 are intentionally absent (no black key between E/F and B/C).
 */
export const UPPER_ROW_MAPPINGS: readonly NoteMapping[] = [
  { code: 'KeyQ', noteOffset: 0, octaveOffset: 1 },
  { code: 'Digit2', noteOffset: 1, octaveOffset: 1 },
  { code: 'KeyW', noteOffset: 2, octaveOffset: 1 },
  { code: 'Digit3', noteOffset: 3, octaveOffset: 1 },
  { code: 'KeyE', noteOffset: 4, octaveOffset: 1 },
  { code: 'KeyR', noteOffset: 5, octaveOffset: 1 },
  { code: 'Digit5', noteOffset: 6, octaveOffset: 1 },
  { code: 'KeyT', noteOffset: 7, octaveOffset: 1 },
  { code: 'Digit6', noteOffset: 8, octaveOffset: 1 },
  { code: 'KeyY', noteOffset: 9, octaveOffset: 1 },
  { code: 'Digit7', noteOffset: 10, octaveOffset: 1 },
  { code: 'KeyU', noteOffset: 11, octaveOffset: 1 },
  { code: 'KeyI', noteOffset: 0, octaveOffset: 2 },
];

/** Combined map from KeyboardEvent.code → NoteMapping */
export const ALL_NOTE_MAPPINGS: ReadonlyMap<string, NoteMapping> = new Map(
  [...LOWER_ROW_MAPPINGS, ...UPPER_ROW_MAPPINGS].map((m) => [m.code, m]),
);

export const OCTAVE_DOWN_CODE = 'Minus';
export const OCTAVE_UP_CODE = 'Equal';
export const VELOCITY_DOWN_CODE = 'BracketLeft';
export const VELOCITY_UP_CODE = 'BracketRight';

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

const SPOKEN_NOTE_NAMES = [
  'C',
  'C sharp',
  'D',
  'D sharp',
  'E',
  'F',
  'F sharp',
  'G',
  'G sharp',
  'A',
  'A sharp',
  'B',
] as const;

// ── Functions ─────────────────────────────────────────────────────────

/** Convert a KeyboardEvent.code + base octave → MIDI note number (0–127), or null. */
export function codeToMidiNote(
  code: string,
  baseOctave: number,
): number | null {
  const mapping = ALL_NOTE_MAPPINGS.get(code);
  if (!mapping) return null;

  const octave = baseOctave + mapping.octaveOffset;
  const midi = (octave + 1) * 12 + mapping.noteOffset;
  if (midi < 0 || midi > 127) return null;
  return midi;
}

/** Get the note name (e.g. "C4", "C#5") from a MIDI note number. */
export function midiNoteToName(midiNote: number): string {
  const name = NOTE_NAMES[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${name}${octave}`;
}

/** Get spoken note name (e.g. "C sharp 4") for aria-label. */
export function midiNoteToSpokenName(midiNote: number): string {
  const name = SPOKEN_NOTE_NAMES[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${name} ${octave}`;
}

/** Convert MIDI note to SPC DSP pitch value relative to a base note. */
export function midiNoteToPitch(midiNote: number, baseNote: number): number {
  const semitones = midiNote - baseNote;
  return Math.round(4096 * Math.pow(2, semitones / 12));
}

/** All codes claimed by instrument mode (notes + control keys). */
export function getClaimedCodes(): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const code of ALL_NOTE_MAPPINGS.keys()) {
    codes.add(code);
  }
  codes.add(OCTAVE_DOWN_CODE);
  codes.add(OCTAVE_UP_CODE);
  codes.add(VELOCITY_DOWN_CODE);
  codes.add(VELOCITY_UP_CODE);
  return codes;
}

/** Passthrough codes that instrument mode does NOT claim. */
export function getPassthroughCodes(): ReadonlySet<string> {
  return new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'Escape',
    'Tab',
  ]);
}

/** Clamp a base octave to the valid range. */
export function clampOctave(octave: number): number {
  return Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, octave));
}

/** Clamp velocity to valid range. */
export function clampVelocity(velocity: number): number {
  return Math.max(MIN_VELOCITY, Math.min(MAX_VELOCITY, velocity));
}
