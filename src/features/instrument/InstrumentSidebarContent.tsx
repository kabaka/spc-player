import { useCallback, useEffect, useState } from 'react';

import type { VoiceStateSnapshot } from '@/audio/audio-state-buffer';
import { audioStateBuffer } from '@/audio/audio-state-buffer';
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

  const [adsrState, setAdsrState] = useState({
    attack: 0,
    decay: 0,
    sustain: 0,
    release: 0,
  });
  const [currentPhase, setCurrentPhase] =
    useState<VoiceStateSnapshot['envelopePhase']>('silent');

  useEffect(() => {
    const interval = setInterval(() => {
      const regs = audioStateBuffer.dspRegisters;
      const voiceBase = 0 * 0x10; // voice 0 for instrument mode
      const adsr1 = regs[voiceBase + 0x05];
      const adsr2 = regs[voiceBase + 0x06];
      setAdsrState({
        attack: adsr1 & 0x0f,
        decay: (adsr1 >> 4) & 0x07,
        sustain: (adsr2 >> 5) & 0x07,
        release: adsr2 & 0x1f,
      });
      setCurrentPhase(audioStateBuffer.voices[0].envelopePhase);
    }, 60);
    return () => clearInterval(interval);
  }, []);

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
          currentPhase={currentPhase}
        />
      </section>
    </div>
  );
}
