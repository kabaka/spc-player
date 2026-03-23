import { VisuallyHidden } from 'radix-ui';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { audioEngine } from '@/audio/engine';
import type { SampleEntry } from '@/audio/worker-protocol';
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

const INSTRUMENT_VOICE = 0;

// ── Component ─────────────────────────────────────────────────────────

export function InstrumentView() {
  const selectorId = useId();

  const isInstrumentModeActive = useAppStore((s) => s.isInstrumentModeActive);
  const enterInstrumentMode = useAppStore((s) => s.enterInstrumentMode);
  const exitInstrumentMode = useAppStore((s) => s.exitInstrumentMode);
  const selectedSrcn = useAppStore((s) => s.selectedSrcn);
  const setSelectedSrcn = useAppStore((s) => s.setSelectedSrcn);
  const sampleCatalog = useAppStore((s) => s.sampleCatalog);
  const setSampleCatalog = useAppStore((s) => s.setSampleCatalog);
  const metadata = useAppStore((s) => s.metadata);

  const hasSpcLoaded = metadata !== null;

  // ── Slider state ──────────────────────────────────────────────────────────
  const [pitchShift, setPitchShift] = useState(0);
  const [gain, setGain] = useState(100);
  const [filterCutoff, setFilterCutoff] = useState(100);
  const [isActivating, setIsActivating] = useState(false);

  const handleNoteOn = useCallback(
    (midiNote: number, _velocity?: number) => {
      const adjustedMidi = midiNote + pitchShift;
      const pitch = midiNoteToPitch(adjustedMidi, 60);
      audioEngine.noteOn(INSTRUMENT_VOICE, pitch);
    },
    [pitchShift],
  );

  const handleNoteOff = useCallback((_midiNote: number) => {
    audioEngine.noteOff(INSTRUMENT_VOICE);
  }, []);

  const midi = useMidi({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff });

  const keyboard = useInstrumentKeyboard({
    onNoteOn: handleNoteOn,
    onNoteOff: handleNoteOff,
    isActive: isInstrumentModeActive,
  });

  // Exit instrument mode on unmount
  useEffect(() => {
    return () => {
      if (useAppStore.getState().isInstrumentModeActive) {
        useAppStore.getState().exitInstrumentMode();
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        audioEngine.exitInstrumentMode().catch(() => {});
      }
    };
  }, []);

  const handleActivate = useCallback(async () => {
    if (isActivating) return;
    setIsActivating(true);
    try {
      await audioEngine.enterInstrumentMode();
      enterInstrumentMode();
      const catalog = await audioEngine.requestSampleCatalog();
      setSampleCatalog(catalog);
      if (catalog.length > 0) {
        const firstSrcn = catalog[0].srcn;
        setSelectedSrcn(firstSrcn);
        audioEngine.setInstrumentSample(firstSrcn);
      }
    } finally {
      setIsActivating(false);
    }
  }, [isActivating, enterInstrumentMode, setSampleCatalog, setSelectedSrcn]);

  const handleDeactivate = useCallback(async () => {
    exitInstrumentMode();
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await audioEngine.exitInstrumentMode().catch(() => {});
  }, [exitInstrumentMode]);

  const handleSampleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const srcn = Number(e.target.value);
      setSelectedSrcn(srcn);
      audioEngine.setInstrumentSample(srcn);
    },
    [setSelectedSrcn],
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
        <h2 className={styles.sectionHeading}>Instrument</h2>

        <div className={styles.statusGroup}>
          {isInstrumentModeActive ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDeactivate}
              className={styles.modeToggleActive}
            >
              Exit Instrument Mode
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleActivate}
              disabled={!hasSpcLoaded || isActivating}
              className={styles.modeToggle}
            >
              {isActivating ? 'Activating…' : 'Enter Instrument Mode'}
            </Button>
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

      {!hasSpcLoaded && !isInstrumentModeActive && (
        <div className={styles.emptyState}>
          <p>Load an SPC file to use instrument mode.</p>
        </div>
      )}

      {hasSpcLoaded && !isInstrumentModeActive && (
        <div className={styles.emptyState}>
          <p>Enter instrument mode to play samples from the loaded SPC file.</p>
        </div>
      )}

      {isInstrumentModeActive && (
        <div className={styles.content}>
          <div className={styles.selectorGroup}>
            <Label htmlFor={selectorId}>Sample</Label>
            <select
              id={selectorId}
              value={selectedSrcn ?? ''}
              onChange={handleSampleChange}
              className={styles.sampleSelect}
              aria-label="Select sample"
            >
              {sampleCatalog.map((sample: SampleEntry) => (
                <option key={sample.srcn} value={sample.srcn}>
                  #{String(sample.srcn).padStart(3, '0')} — {sample.lengthBytes}{' '}
                  bytes
                  {sample.loops ? ' ♻ Loop' : ''}
                </option>
              ))}
            </select>
          </div>

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
      )}
    </main>
  );
}
