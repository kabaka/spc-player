import { useCallback, useId, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import { VisuallyHidden } from 'radix-ui';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { Label } from '@/components/Label/Label';
import { useMidi } from '@/hooks/useMidi';
import { useAppStore } from '@/store/store';
import { useShortcut } from '@/shortcuts/useShortcut';

import { VirtualKeyboard } from './VirtualKeyboard';
import { InstrumentControls } from './InstrumentControls';
import { AdsrDisplay } from './AdsrDisplay';
import { useInstrumentKeyboard } from './useInstrumentKeyboard';
import styles from './InstrumentView.module.css';

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

  const selectedVoice = activeInstrumentIndex ?? instrument ?? 0;

  const handleNoteOn = useCallback((_midiNote: number, _velocity?: number) => {
    // Note-on routing will be wired to the audio engine
    // when per-voice key-on WASM exports are available
  }, []);

  const handleNoteOff = useCallback((_midiNote: number) => {
    // Note-off routing placeholder
  }, []);

  const midi = useMidi({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff });

  const keyboard = useInstrumentKeyboard({
    onNoteOn: handleNoteOn,
    onNoteOff: handleNoteOff,
    isInstrumentView: true,
  });

  useShortcut('instrument.toggleKeyboard', keyboard.toggle, {
    scope: 'global',
  });

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
          {keyboard.isActive && (
            <span className={styles.modeBadge} aria-hidden="true">
              Keyboard Mode
            </span>
          )}
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
              pitchShift={0}
              gain={100}
              filterCutoff={100}
              onPitchShiftChange={() => {
                // TODO: wire to audio engine
              }}
              onGainChange={() => {
                // TODO: wire to audio engine
              }}
              onFilterCutoffChange={() => {
                // TODO: wire to audio engine
              }}
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
