import { useCallback, useMemo } from 'react';

import { audioEngine } from '@/audio/engine';
import { useAppStore } from '@/store/store';

import { AdsrDisplay } from './AdsrDisplay';
import { InstrumentControls } from './InstrumentControls';
import styles from './InstrumentSidebarContent.module.css';

export function InstrumentSidebarContent() {
  const pitchShift = useAppStore((s) => s.pitchShift);
  const setPitchShift = useAppStore((s) => s.setPitchShift);
  const gain = useAppStore((s) => s.gain);
  const setGain = useAppStore((s) => s.setGain);

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
    <div className={styles.container}>
      <section aria-label="Instrument controls" className={styles.section}>
        <h2 className={styles.sectionHeading}>Controls</h2>
        <InstrumentControls
          pitchShift={pitchShift}
          gain={gain}
          onPitchShiftChange={handlePitchShiftChange}
          onGainChange={handleGainChange}
        />
      </section>

      <section aria-label="ADSR envelope" className={styles.section}>
        <h2 className={styles.sectionHeading}>ADSR Envelope</h2>
        <AdsrDisplay
          attack={adsrState.attack}
          decay={adsrState.decay}
          sustain={adsrState.sustain}
          release={adsrState.release}
        />
      </section>
    </div>
  );
}
