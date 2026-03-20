import { useCallback, useId } from 'react';
import type { ChangeEvent } from 'react';

import { useAppStore } from '@/store/store';
import { Label } from '@/components/Label/Label';
import styles from './PlaybackSettings.module.css';

// ── Component ─────────────────────────────────────────────────────────

export function PlaybackSettings() {
  const loopCountId = useId();
  const playDurationId = useId();
  const fadeDurationId = useId();

  const defaultLoopCount = useAppStore((s) => s.defaultLoopCount);
  const defaultPlayDuration = useAppStore((s) => s.defaultPlayDuration);
  const defaultFadeDuration = useAppStore((s) => s.defaultFadeDuration);
  const setDefaultLoopCount = useAppStore((s) => s.setDefaultLoopCount);
  const setDefaultPlayDuration = useAppStore((s) => s.setDefaultPlayDuration);
  const setDefaultFadeDuration = useAppStore((s) => s.setDefaultFadeDuration);

  const handleLoopCountChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(0, Math.min(99, Number(e.target.value) || 0));
      setDefaultLoopCount(value);
    },
    [setDefaultLoopCount],
  );

  const handlePlayDurationChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(0, Number(e.target.value) || 0);
      setDefaultPlayDuration(value);
    },
    [setDefaultPlayDuration],
  );

  const handleFadeDurationChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Math.max(0, Number(e.target.value) || 0);
      setDefaultFadeDuration(value);
    },
    [setDefaultFadeDuration],
  );

  return (
    <div className={styles.container}>
      <div className={styles.field}>
        <Label htmlFor={loopCountId}>Default Loop Count</Label>
        <div className={styles.inputRow}>
          <input
            type="number"
            id={loopCountId}
            className={styles.numberInput}
            value={defaultLoopCount}
            onChange={handleLoopCountChange}
            min={0}
            max={99}
            aria-label="Default Loop Count"
          />
          <span className={styles.unit}>loops</span>
        </div>
      </div>

      <div className={styles.field}>
        <Label htmlFor={playDurationId}>Default Play Duration</Label>
        <div className={styles.inputRow}>
          <input
            type="number"
            id={playDurationId}
            className={styles.numberInput}
            value={defaultPlayDuration}
            onChange={handlePlayDurationChange}
            min={0}
            aria-label="Default Play Duration"
          />
          <span className={styles.unit}>seconds</span>
        </div>
      </div>

      <div className={styles.field}>
        <Label htmlFor={fadeDurationId}>Default Fade Duration</Label>
        <div className={styles.inputRow}>
          <input
            type="number"
            id={fadeDurationId}
            className={styles.numberInput}
            value={defaultFadeDuration}
            onChange={handleFadeDurationChange}
            min={0}
            aria-label="Default Fade Duration"
          />
          <span className={styles.unit}>seconds</span>
        </div>
      </div>
    </div>
  );
}
