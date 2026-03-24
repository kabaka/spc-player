import { VisuallyHidden } from 'radix-ui';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useId, useState } from 'react';

import { audioEngine } from '@/audio/engine';
import type { SampleEntry } from '@/audio/worker-protocol';
import { Button } from '@/components/Button/Button';
import { Label } from '@/components/Label/Label';
import { VisualizationStage } from '@/components/VisualizationStage/VisualizationStage';
import { useMidi } from '@/hooks/useMidi';
import { useShortcut } from '@/shortcuts/useShortcut';
import { useAppStore } from '@/store/store';

import { InstrumentControls } from './InstrumentControls';
import styles from './InstrumentView.module.css';
import { midiNoteToPitch } from './note-mapping';
import { useInstrumentKeyboard } from './useInstrumentKeyboard';
import { VirtualKeyboard } from './VirtualKeyboard';

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
  const pitchShift = useAppStore((s) => s.pitchShift);
  const setPitchShift = useAppStore((s) => s.setPitchShift);
  const gain = useAppStore((s) => s.gain);
  const setGain = useAppStore((s) => s.setGain);

  const hasSpcLoaded = metadata !== null;

  const [isActivating, setIsActivating] = useState(false);

  const handleNoteOn = useCallback(
    (midiNote: number, _velocity?: number) => {
      const adjustedMidi = midiNote + pitchShift;
      const pitch = midiNoteToPitch(adjustedMidi, 60);
      audioEngine.instrumentNoteOn(midiNote, pitch);
    },
    [pitchShift],
  );

  const handleNoteOff = useCallback((midiNote: number) => {
    audioEngine.instrumentNoteOff(midiNote);
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

  const handleGainChange = useCallback(
    (value: number) => {
      setGain(value);
      audioEngine.setInstrumentGainValue(value);
    },
    [setGain],
  );

  const handlePitchShiftChange = useCallback(
    (value: number) => {
      setPitchShift(value);
      audioEngine.setInstrumentPitchOffset(value);
    },
    [setPitchShift],
  );

  // Sample navigation shortcuts
  useShortcut('instrument.previousSample', () => {
    const { sampleCatalog, selectedSrcn } = useAppStore.getState();
    if (sampleCatalog.length === 0) return;
    const currentIndex = sampleCatalog.findIndex(
      (s) => s.srcn === selectedSrcn,
    );
    const nextIndex =
      currentIndex <= 0 ? sampleCatalog.length - 1 : currentIndex - 1;
    const newSrcn = sampleCatalog[nextIndex].srcn;
    setSelectedSrcn(newSrcn);
    audioEngine.setInstrumentSample(newSrcn);
  });

  useShortcut('instrument.nextSample', () => {
    const { sampleCatalog, selectedSrcn } = useAppStore.getState();
    if (sampleCatalog.length === 0) return;
    const currentIndex = sampleCatalog.findIndex(
      (s) => s.srcn === selectedSrcn,
    );
    const nextIndex =
      currentIndex >= sampleCatalog.length - 1 ? 0 : currentIndex + 1;
    const newSrcn = sampleCatalog[nextIndex].srcn;
    setSelectedSrcn(newSrcn);
    audioEngine.setInstrumentSample(newSrcn);
  });

  return (
    <main aria-label="Instrument" className={styles.view}>
      <VisuallyHidden.Root>
        <h1>Instrument</h1>
      </VisuallyHidden.Root>

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
          <div className={styles.visualizationSection}>
            <VisualizationStage
              lockedMode="piano-roll"
              className={styles.fillStage}
            />
          </div>

          <div className={styles.header}>
            <h2 className={styles.sectionHeading}>Instrument</h2>

            <div className={styles.statusGroup}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeactivate}
                className={styles.modeToggleActive}
              >
                Exit Instrument Mode
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

          <div className={styles.inlineControls}>
            <InstrumentControls
              pitchShift={pitchShift}
              gain={gain}
              onPitchShiftChange={handlePitchShiftChange}
              onGainChange={handleGainChange}
            />
          </div>

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
        </div>
      )}

      {!isInstrumentModeActive && (
        <div className={styles.header}>
          <h2 className={styles.sectionHeading}>Instrument</h2>
          <div className={styles.statusGroup}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleActivate}
              disabled={!hasSpcLoaded || isActivating}
              className={styles.modeToggle}
            >
              {isActivating ? 'Activating…' : 'Enter Instrument Mode'}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
