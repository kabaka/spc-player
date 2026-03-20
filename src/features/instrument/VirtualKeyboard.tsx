import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { midiNoteToName, midiNoteToSpokenName } from './note-mapping';

import styles from './VirtualKeyboard.module.css';

export interface VirtualKeyboardProps {
  baseOctave?: number;
  octaveCount?: number;
  activeNotes: ReadonlySet<number>;
  isInstrumentMode: boolean;
  onNoteOn: (midiNote: number) => void;
  onNoteOff: (midiNote: number) => void;
}

/** Note offsets within an octave and whether they are black keys. */
const OCTAVE_PATTERN: readonly { offset: number; isBlack: boolean }[] = [
  { offset: 0, isBlack: false }, // C
  { offset: 1, isBlack: true }, // C#
  { offset: 2, isBlack: false }, // D
  { offset: 3, isBlack: true }, // D#
  { offset: 4, isBlack: false }, // E
  { offset: 5, isBlack: false }, // F
  { offset: 6, isBlack: true }, // F#
  { offset: 7, isBlack: false }, // G
  { offset: 8, isBlack: true }, // G#
  { offset: 9, isBlack: false }, // A
  { offset: 10, isBlack: true }, // A#
  { offset: 11, isBlack: false }, // B
];

/** Two-row DAW keyboard hints: code-to-note-name for key label overlays. */
const KEY_HINTS: ReadonlyMap<number, string> = (() => {
  const map = new Map<number, string>();
  // Lower row offsets 0-11 (within base octave)
  const lower = ['Z', 'S', 'X', 'D', 'C', 'V', 'G', 'B', 'H', 'N', 'J', 'M'];
  for (let i = 0; i < lower.length; i++) {
    map.set(i, lower[i]);
  }
  // Upper row offsets 12-23 (one octave above base)
  const upper = ['Q', '2', 'W', '3', 'E', 'R', '5', 'T', '6', 'Y', '7', 'U'];
  for (let i = 0; i < upper.length; i++) {
    map.set(12 + i, upper[i]);
  }
  // KeyI = C two octaves up = offset 24
  map.set(24, 'I');
  return map;
})();

function buildKeys(
  baseOctave: number,
  octaveCount: number,
): { midi: number; isBlack: boolean }[] {
  const keys: { midi: number; isBlack: boolean }[] = [];
  for (let oct = 0; oct < octaveCount; oct++) {
    const octaveNumber = baseOctave + oct;
    for (const note of OCTAVE_PATTERN) {
      const midi = (octaveNumber + 1) * 12 + note.offset;
      if (midi > 127) break;
      keys.push({ midi, isBlack: note.isBlack });
    }
  }
  return keys;
}

export function VirtualKeyboard({
  baseOctave = 4,
  octaveCount = 2,
  activeNotes,
  isInstrumentMode,
  onNoteOn,
  onNoteOff,
}: VirtualKeyboardProps) {
  const keys = buildKeys(baseOctave, octaveCount);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const keyRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pressedByMouseRef = useRef<Set<number>>(new Set());
  const pressedByKeyRef = useRef<Set<number>>(new Set());

  const baseMidi = (baseOctave + 1) * 12;
  const firstNote = keys[0]?.midi ?? baseMidi;
  const lastNote = keys[keys.length - 1]?.midi ?? baseMidi;
  const firstName = midiNoteToName(firstNote);
  const lastName = midiNoteToName(lastNote);

  const focusKey = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(keys.length - 1, index));
      setFocusedIndex(clamped);
      keyRefs.current[clamped]?.focus();
    },
    [keys.length],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent, index: number) => {
      const { key } = event;
      let nextIndex = index;

      switch (key) {
        case 'ArrowRight':
          nextIndex = index < keys.length - 1 ? index + 1 : 0;
          event.preventDefault();
          break;
        case 'ArrowLeft':
          nextIndex = index > 0 ? index - 1 : keys.length - 1;
          event.preventDefault();
          break;
        case 'ArrowUp': {
          // Jump up one octave on the same note
          const target = index + 12;
          if (target < keys.length) {
            nextIndex = target;
          }
          event.preventDefault();
          break;
        }
        case 'ArrowDown': {
          // Jump down one octave
          const target = index - 12;
          if (target >= 0) {
            nextIndex = target;
          }
          event.preventDefault();
          break;
        }
        case 'Home':
          nextIndex = 0;
          event.preventDefault();
          break;
        case 'End':
          nextIndex = keys.length - 1;
          event.preventDefault();
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (!pressedByKeyRef.current.has(keys[index].midi)) {
            pressedByKeyRef.current.add(keys[index].midi);
            onNoteOn(keys[index].midi);
          }
          return;
        default:
          return;
      }

      if (nextIndex !== index) {
        focusKey(nextIndex);
      }
    },
    [focusKey, onNoteOn, keys],
  );

  const handleKeyUp = useCallback(
    (event: ReactKeyboardEvent, index: number) => {
      if (event.key === 'Enter' || event.key === ' ') {
        const midi = keys[index].midi;
        if (pressedByKeyRef.current.has(midi)) {
          pressedByKeyRef.current.delete(midi);
          onNoteOff(midi);
        }
      }
    },
    [keys, onNoteOff],
  );

  const handleMouseDown = useCallback(
    (midi: number) => {
      pressedByMouseRef.current.add(midi);
      onNoteOn(midi);
    },
    [onNoteOn],
  );

  const handleMouseUp = useCallback(
    (midi: number) => {
      if (pressedByMouseRef.current.has(midi)) {
        pressedByMouseRef.current.delete(midi);
        onNoteOff(midi);
      }
    },
    [onNoteOff],
  );

  const handleMouseLeave = useCallback(
    (midi: number) => {
      if (pressedByMouseRef.current.has(midi)) {
        pressedByMouseRef.current.delete(midi);
        onNoteOff(midi);
      }
    },
    [onNoteOff],
  );

  return (
    <div
      role="group"
      aria-label={`Virtual keyboard, ${octaveCount} octaves from ${firstName} to ${lastName}`}
      aria-roledescription="piano keyboard"
      className={styles.keyboard}
    >
      {keys.map((keyInfo, index) => {
        const { midi, isBlack } = keyInfo;
        const isPressed = activeNotes.has(midi);
        const noteName = midiNoteToName(midi);
        const spokenName = midiNoteToSpokenName(midi);
        const relativeOffset = midi - baseMidi;
        const hint = isInstrumentMode
          ? KEY_HINTS.get(relativeOffset)
          : undefined;

        return (
          <button
            key={midi}
            ref={(el) => {
              keyRefs.current[index] = el;
            }}
            className={[styles.key, isBlack ? styles.black : styles.white]
              .filter(Boolean)
              .join(' ')}
            aria-label={spokenName}
            aria-pressed={isPressed ? 'true' : 'false'}
            data-note={noteName}
            data-state={isPressed ? 'pressed' : undefined}
            tabIndex={index === focusedIndex ? 0 : -1}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onKeyUp={(e) => handleKeyUp(e, index)}
            onMouseDown={() => handleMouseDown(midi)}
            onMouseUp={() => handleMouseUp(midi)}
            onMouseLeave={() => handleMouseLeave(midi)}
            onTouchStart={(e) => {
              e.preventDefault();
              handleMouseDown(midi);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleMouseUp(midi);
            }}
            onFocus={() => setFocusedIndex(index)}
          >
            <span className={styles.noteName} aria-hidden="true">
              {noteName}
            </span>
            {hint && (
              <span className={styles.keyHint} aria-hidden="true">
                {hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
