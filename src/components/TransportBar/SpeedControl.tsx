import { Popover } from 'radix-ui';
import { useCallback } from 'react';

import { audioEngine } from '@/audio/engine';
import { useAppStore } from '@/store/store';

import styles from './SpeedControl.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

function formatSpeed(speed: number): string {
  return `${speed}×`;
}

// ── Component ─────────────────────────────────────────────────────────

export function SpeedControl() {
  const speed = useAppStore((s) => s.speed);
  const setSpeed = useAppStore((s) => s.setSpeed);

  const isNonDefault = Math.abs(speed - 1) > 0.001;

  const handleSpeedSelect = useCallback(
    (newSpeed: number) => {
      audioEngine.setSpeed(newSpeed);
      setSpeed(newSpeed);
    },
    [setSpeed],
  );

  const triggerClassName = [
    styles.trigger,
    isNonDefault && styles.triggerActive,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className={triggerClassName}
            aria-label={`Speed: ${formatSpeed(speed)}`}
          >
            {formatSpeed(speed)}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className={styles.popoverContent}
            side="top"
            sideOffset={8}
            align="center"
          >
            <Popover.Arrow className={styles.popoverArrow} />
            <p className={styles.popoverTitle}>Playback Speed</p>
            <div
              className={styles.speedGrid}
              role="group"
              aria-label="Speed options"
            >
              {SPEED_OPTIONS.map((option) => {
                const isActive = Math.abs(speed - option) < 0.001;
                return (
                  <button
                    key={option}
                    aria-pressed={isActive}
                    className={[
                      styles.speedOption,
                      isActive && styles.speedOptionActive,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleSpeedSelect(option)}
                  >
                    {formatSpeed(option)}
                  </button>
                );
              })}
            </div>
            <div className={styles.shortcutsFooter}>
              <div className={styles.shortcutRow}>
                <span>Speed up</span>
                <span>
                  <kbd className={styles.kbd}>Shift</kbd>{' '}
                  <kbd className={styles.kbd}>↑</kbd>
                </span>
              </div>
              <div className={styles.shortcutRow}>
                <span>Speed down</span>
                <span>
                  <kbd className={styles.kbd}>Shift</kbd>{' '}
                  <kbd className={styles.kbd}>↓</kbd>
                </span>
              </div>
              <div className={styles.shortcutRow}>
                <span>Reset</span>
                <span>
                  <kbd className={styles.kbd}>Shift</kbd>{' '}
                  <kbd className={styles.kbd}>⌫</kbd>
                </span>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* ARIA live region for speed change announcements */}
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {isNonDefault ? `Speed: ${formatSpeed(speed)}` : ''}
      </div>
    </>
  );
}
