import { useNavigate, useSearch } from '@tanstack/react-router';
import { VisuallyHidden } from 'radix-ui';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { audioEngine } from '@/audio/engine';
import { Button } from '@/components/Button/Button';
import { Label } from '@/components/Label/Label';
import { useMidi } from '@/hooks/useMidi';
import { useAppStore } from '@/store/store';

import { AdsrDisplay } from './AdsrDisplay';
import { InstrumentControls } from './InstrumentControls';
import styles from './InstrumentView.module.css';
import { midiNoteToPitch } from './note-mapping';
import { useInstrumentKeyboard } from './useInstrumentKeyboard';
import { VirtualKeyboard } from './VirtualKeyboard';

// ── Constants ─────────────────────────────────────────────────────────

const VOICE_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  value: i,
  label: `Voice ${i}`,
}));

// ── Component ─────────────────────────────────────────────────────────

export function InstrumentView() {
  const selectorId = useId();
  const { instrument } = useSearch({ from: '/instrument' });
  const navigate = useNavigate();

  const activeInstrumentIndex = useAppStore((s) => s.activeInstrumentIndex);
  const setActiveInstrument = useAppStore((s) => s.setActiveInstrument);
  const isInstrumentModeActive = useAppStore((s) => s.isInstrumentModeActive);
  const toggleInstrumentMode = useAppStore((s) => s.toggleInstrumentMode);

  const selectedVoice = activeInstrumentIndex ?? instrument ?? 0;

  // ── Slider state ──────────────────────────────────────────────────────────
  const [pitchShift, setPitchShift] = useState(0);
  const [gain, setGain] = useState(100);
  const [filterCutoff, setFilterCutoff] = useState(100);

  const handleNoteOn = useCallback(
    (midiNote: number, _velocity?: number) => {
      const adjustedMidi = midiNote + pitchShift;
      const pitch = midiNoteToPitch(adjustedMidi, 60);
      audioEngine.noteOn(selectedVoice, pitch);
    },
    [selectedVoice, pitchShift],
  );

  const handleNoteOff = useCallback(
    (_midiNote: number) => {
      audioEngine.noteOff(selectedVoice);
    },
    [selectedVoice],
  );

  const midi = useMidi({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff });

  const keyboard = useInstrumentKeyboard({
    onNoteOn: handleNoteOn,
    onNoteOff: handleNoteOff,
    isActive: isInstrumentModeActive,
  });

  // Sync instrument mode to engine; deactivate on unmount
  useEffect(() => {
    audioEngine.setInstrumentMode(isInstrumentModeActive);
  }, [isInstrumentModeActive]);

  useEffect(() => {
    return () => {
      audioEngine.setInstrumentMode(false);
      if (useAppStore.getState().isInstrumentModeActive) {
        useAppStore.getState().toggleInstrumentMode();
      }
    };
  }, []);

  const handleVoiceChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const index = Number(e.target.value);
      setActiveInstrument(index);
      void navigate({
        to: '/instrument',
        search: (prev) => ({ ...prev, instrument: index }),
        replace: true,
      });
    },
    [setActiveInstrument, navigate],
  );

  // Placeholder ADSR values — these would come from reading DSP registers
  const adsrState = useMemo(
    () => ({
      attack: 10,
      decay: 5,
      sustain: 4,
      release: 20,
    }),
    [],
  );

  return (
    <main aria-label="Instrument" className={styles.view}>
      <VisuallyHidden.Root>
        <h1>Instrument</h1>
      </VisuallyHidden.Root>

      <div className={styles.header}>
        <div className={styles.selectorGroup}>
          <Label htmlFor={selectorId}>Voice</Label>
          <select
            id={selectorId}
            value={selectedVoice}
            onChange={handleVoiceChange}
            className={styles.voiceSelect}
            aria-label="Select voice"
          >
            {VOICE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.statusGroup}>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={isInstrumentModeActive}
            onClick={toggleInstrumentMode}
            className={
              isInstrumentModeActive
                ? styles.modeToggleActive
                : styles.modeToggle
            }
          >
            Keyboard Mode
          </Button>
          {midi.connectedDevices.length > 0 && (
            <span className={styles.midiBadge} aria-hidden="true">
              MIDI Connected
            </span>
          )}
        </div>

        <div aria-live="polite" className={styles.srOnly}>
          {midi.announcement ||
            (keyboard.isActive
              ? 'Instrument keyboard mode active. Use Z through M for lower octave, Q through U for upper octave.'
              : '')}
        </div>
      </div>

      <div className={styles.content}>
        <section
          aria-label="Virtual keyboard"
          className={styles.keyboardSection}
        >
          <VirtualKeyboard
            baseOctave={keyboard.baseOctave}
            octaveCount={2}
            activeNotes={keyboard.activeNotes}
            isInstrumentMode={keyboard.isActive}
            onNoteOn={handleNoteOn}
            onNoteOff={handleNoteOff}
          />
        </section>

        <div className={styles.sidePanel}>
          <section
            aria-label="Instrument controls"
            className={styles.controlsSection}
          >
            <h2 className={styles.sectionHeading}>Controls</h2>
            <InstrumentControls
              pitchShift={pitchShift}
              gain={gain}
              filterCutoff={filterCutoff}
              onPitchShiftChange={setPitchShift}
              onGainChange={setGain}
              onFilterCutoffChange={setFilterCutoff}
            />
          </section>

          <section aria-label="ADSR envelope" className={styles.adsrSection}>
            <h2 className={styles.sectionHeading}>ADSR Envelope</h2>
            <AdsrDisplay
              attack={adsrState.attack}
              decay={adsrState.decay}
              sustain={adsrState.sustain}
              release={adsrState.release}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
