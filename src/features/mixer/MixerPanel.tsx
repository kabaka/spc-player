import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppStore } from '@/store/store';
import { audioEngine } from '@/audio/engine';

import { VuMeter } from './VuMeter';
import styles from './MixerPanel.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const VOICE_COUNT = 8;

const VOICE_STYLE_CLASSES = [
  styles.voice0,
  styles.voice1,
  styles.voice2,
  styles.voice3,
  styles.voice4,
  styles.voice5,
  styles.voice6,
  styles.voice7,
] as const;

// ── Helpers ───────────────────────────────────────────────────────────

/** Compute voice mask bitmask from muted/soloed state. Bit N=1 → voice N active. */
function computeVoiceMask(
  voiceMuted: readonly boolean[],
  voiceSolo: readonly boolean[],
): number {
  const hasSolo = voiceSolo.some(Boolean);

  let mask = 0;
  for (let i = 0; i < VOICE_COUNT; i++) {
    if (hasSolo) {
      // Solo mode: only soloed voices are active
      if (voiceSolo[i]) {
        mask |= 1 << i;
      }
    } else {
      // Normal mode: un-muted voices are active
      if (!voiceMuted[i]) {
        mask |= 1 << i;
      }
    }
  }
  return mask;
}

// ── Component ─────────────────────────────────────────────────────────

export function MixerPanel() {
  const voiceMuted = useAppStore((s) => s.voiceMuted);
  const voiceSolo = useAppStore((s) => s.voiceSolo);
  const toggleMute = useAppStore((s) => s.toggleMute);
  const toggleSolo = useAppStore((s) => s.toggleSolo);
  const resetMixer = useAppStore((s) => s.resetMixer);

  // Track previous mask to avoid redundant calls
  const prevMaskRef = useRef<number>(0xff);

  // Sync voice mask to audio engine when mute/solo state changes
  useEffect(() => {
    const mask = computeVoiceMask(voiceMuted, voiceSolo);
    if (mask !== prevMaskRef.current) {
      prevMaskRef.current = mask;
      audioEngine.setVoiceMask(mask);
    }
  }, [voiceMuted, voiceSolo]);

  const [announcement, setAnnouncement] = useState('');

  const handleMute = useCallback(
    (index: number) => {
      toggleMute(index);
      const wasMuted = voiceMuted[index];
      setAnnouncement(`Channel ${index + 1} ${wasMuted ? 'unmuted' : 'muted'}`);
    },
    [toggleMute, voiceMuted],
  );

  const handleSolo = useCallback(
    (index: number) => {
      toggleSolo(index);
      const wasSoloed = voiceSolo[index];
      setAnnouncement(`Channel ${index + 1} ${wasSoloed ? 'unsolo' : 'solo'}`);
    },
    [toggleSolo, voiceSolo],
  );

  const handleReset = useCallback(() => {
    resetMixer();
  }, [resetMixer]);

  const hasSolo = voiceSolo.some(Boolean);
  const hasAnyMuteOrSolo = hasSolo || voiceMuted.some(Boolean);

  return (
    <div role="group" aria-label="Voice mixer" className={styles.mixer}>
      {Array.from({ length: VOICE_COUNT }, (_, i) => {
        const isMuted = voiceMuted[i];
        const isSoloed = voiceSolo[i];

        return (
          <div
            key={i}
            role="group"
            aria-label={`Channel ${i + 1}`}
            className={`${styles.strip} ${VOICE_STYLE_CLASSES[i]}`}
          >
            <span className={styles.voiceLabel}>{i + 1}</span>

            <VuMeter voiceIndex={i} label={`Channel ${i + 1} level`} />

            <div className={styles.toggleGroup}>
              <button
                className={`${styles.toggle} ${isMuted ? styles.muteActive : ''}`}
                aria-label={`Mute channel ${i + 1}`}
                aria-pressed={!!isMuted}
                onClick={() => handleMute(i)}
              >
                M
              </button>
              <button
                className={`${styles.toggle} ${isSoloed ? styles.soloActive : ''}`}
                aria-label={`Solo channel ${i + 1}`}
                aria-pressed={!!isSoloed}
                onClick={() => handleSolo(i)}
              >
                S
              </button>
            </div>
          </div>
        );
      })}

      <button
        className={styles.resetButton}
        onClick={handleReset}
        disabled={!hasAnyMuteOrSolo}
        aria-label="Unmute all voices"
      >
        Unmute All
      </button>

      <div className={styles.visuallyHidden} aria-live="polite" role="status">
        {announcement}
      </div>
    </div>
  );
}
