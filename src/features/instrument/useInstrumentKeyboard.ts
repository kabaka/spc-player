import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ALL_NOTE_MAPPINGS,
  clampOctave,
  clampVelocity,
  codeToMidiNote,
  DEFAULT_OCTAVE,
  DEFAULT_VELOCITY,
  getPassthroughCodes,
  OCTAVE_DOWN_CODE,
  OCTAVE_UP_CODE,
  VELOCITY_DOWN_CODE,
  VELOCITY_STEP,
  VELOCITY_UP_CODE,
} from './note-mapping';

export interface UseInstrumentKeyboardOptions {
  onNoteOn: (midiNote: number, velocity: number) => void;
  onNoteOff: (midiNote: number) => void;
  isActive: boolean;
}

export interface UseInstrumentKeyboardReturn {
  readonly isActive: boolean;
  readonly deactivate: () => void;
  readonly baseOctave: number;
  readonly velocity: number;
  readonly activeNotes: ReadonlySet<number>;
}

const PASSTHROUGH_CODES = getPassthroughCodes();

export function useInstrumentKeyboard(
  options: UseInstrumentKeyboardOptions,
): UseInstrumentKeyboardReturn {
  const { onNoteOn, onNoteOff, isActive } = options;

  const [baseOctave, setBaseOctave] = useState(DEFAULT_OCTAVE);
  const [velocity, setVelocity] = useState(DEFAULT_VELOCITY);
  const [activeNotes, setActiveNotes] = useState<ReadonlySet<number>>(
    new Set(),
  );

  // Track which physical keys are currently pressed → MIDI notes
  const pressedKeysRef = useRef<Map<string, number>>(new Map());
  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);
  onNoteOnRef.current = onNoteOn;
  onNoteOffRef.current = onNoteOff;

  const deactivate = useCallback(() => {
    // Release all held notes
    const pressed = pressedKeysRef.current;
    for (const midiNote of pressed.values()) {
      onNoteOffRef.current(midiNote);
    }
    pressed.clear();
    setActiveNotes(new Set());
  }, []);

  // Release notes when instrument mode is deactivated externally
  useEffect(() => {
    if (!isActive) {
      deactivate();
    }
  }, [isActive, deactivate]);

  // Key event handlers
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Modifier combos bypass instrument mode
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const { code } = event;

      // Passthrough: let these fall through to global shortcuts
      if (PASSTHROUGH_CODES.has(code)) return;

      // Suppress key repeats for note keys
      if (event.repeat) return;

      // Octave controls
      if (code === OCTAVE_DOWN_CODE) {
        event.preventDefault();
        setBaseOctave((prev) => clampOctave(prev - 1));
        return;
      }
      if (code === OCTAVE_UP_CODE) {
        event.preventDefault();
        setBaseOctave((prev) => clampOctave(prev + 1));
        return;
      }

      // Velocity controls
      if (code === VELOCITY_DOWN_CODE) {
        event.preventDefault();
        setVelocity((prev) => clampVelocity(prev - VELOCITY_STEP));
        return;
      }
      if (code === VELOCITY_UP_CODE) {
        event.preventDefault();
        setVelocity((prev) => clampVelocity(prev + VELOCITY_STEP));
        return;
      }

      // Note keys
      if (ALL_NOTE_MAPPINGS.has(code)) {
        event.preventDefault();
        const midiNote = codeToMidiNote(code, baseOctave);
        if (midiNote === null) return;

        // Avoid retriggering if the key is already down
        if (pressedKeysRef.current.has(code)) return;

        pressedKeysRef.current.set(code, midiNote);
        onNoteOnRef.current(midiNote, velocity);
        setActiveNotes(new Set(pressedKeysRef.current.values()));
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const { code } = event;
      const midiNote = pressedKeysRef.current.get(code);
      if (midiNote !== undefined) {
        pressedKeysRef.current.delete(code);
        onNoteOffRef.current(midiNote);
        setActiveNotes(new Set(pressedKeysRef.current.values()));
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [isActive, baseOctave, velocity]);

  return {
    isActive,
    deactivate,
    baseOctave,
    velocity,
    activeNotes,
  };
}
