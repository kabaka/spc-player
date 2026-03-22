import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { audioEngine } from '@/audio/engine';
import { useAppStore } from '@/store/store';
import type { CheckpointPreset } from '@/store/types';

import styles from './SeekPerformanceSettings.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const DSP_SAMPLE_RATE = 32_000;

const CHECKPOINT_PRESETS: Record<
  CheckpointPreset,
  { intervalSamples: number; maxCheckpoints: number }
> = {
  standard: { intervalSamples: 5 * DSP_SAMPLE_RATE, maxCheckpoints: 120 },
  fast: { intervalSamples: 2 * DSP_SAMPLE_RATE, maxCheckpoints: 300 },
};

const PRESET_OPTIONS: readonly {
  value: CheckpointPreset;
  label: string;
  description: string;
}[] = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'uses less memory',
  },
  {
    value: 'fast',
    label: 'Fast',
    description: 'faster backward seeks, uses more memory (desktop only)',
  },
];

// ── Mobile detection ──────────────────────────────────────────────────

const coarseMq =
  typeof window !== 'undefined'
    ? window.matchMedia('(pointer: coarse)')
    : undefined;

function subscribeToPointer(cb: () => void) {
  coarseMq?.addEventListener('change', cb);
  return () => coarseMq?.removeEventListener('change', cb);
}

function getIsMobile(): boolean {
  return coarseMq?.matches ?? false;
}

function getIsMobileServer(): boolean {
  return false;
}

// ── Component ─────────────────────────────────────────────────────────

export function SeekPerformanceSettings() {
  const checkpointPreset = useAppStore((s) => s.checkpointPreset);
  const setCheckpointPreset = useAppStore((s) => s.setCheckpointPreset);

  const isMobile = useSyncExternalStore(
    subscribeToPointer,
    getIsMobile,
    getIsMobileServer,
  );

  // Fall back to 'standard' if mobile and currently set to 'fast'
  useEffect(() => {
    if (isMobile && checkpointPreset === 'fast') {
      setCheckpointPreset('standard');
    }
  }, [isMobile, checkpointPreset, setCheckpointPreset]);

  // Send checkpoint config to the audio engine when preset changes
  useEffect(() => {
    const config = CHECKPOINT_PRESETS[checkpointPreset];
    audioEngine.setCheckpointConfig(
      config.intervalSamples,
      config.maxCheckpoints,
    );
  }, [checkpointPreset]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setCheckpointPreset(e.target.value as CheckpointPreset);
    },
    [setCheckpointPreset],
  );

  return (
    <fieldset className={styles.radioGroup}>
      <legend className={styles.visuallyHidden}>Seek Performance</legend>
      {PRESET_OPTIONS.map(({ value, label, description }) => {
        const isDisabled = value === 'fast' && isMobile;
        return (
          <label
            key={value}
            className={`${styles.option}${isDisabled ? ` ${styles.optionDisabled}` : ''}`}
          >
            <input
              type="radio"
              name="checkpointPreset"
              value={value}
              checked={checkpointPreset === value}
              onChange={handleChange}
              disabled={isDisabled}
            />
            <span>
              {label} — {description}
            </span>
          </label>
        );
      })}
      {isMobile && (
        <p className={styles.hint}>
          Fast mode is not available on touch devices due to higher memory
          usage.
        </p>
      )}
    </fieldset>
  );
}
