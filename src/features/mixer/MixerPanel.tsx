import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { useAppStore } from '@/store/store';
import { audioEngine } from '@/audio/engine';

import { VuMeter } from './VuMeter';
import styles from './MixerPanel.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const VOICE_COUNT = 8;
const COL_COUNT = 3;

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
      if (voiceSolo[i]) {
        mask |= 1 << i;
      }
    } else {
      if (!voiceMuted[i]) {
        mask |= 1 << i;
      }
    }
  }
  return mask;
}

// ── Component ─────────────────────────────────────────────────────────

export const MixerPanel = memo(function MixerPanel() {
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

  // ── Grid keyboard navigation ──────────────────────────────────────

  const [activeCell, setActiveCell] = useState<[number, number]>([0, 1]);
  const cellRefs = useRef<(HTMLElement | null)[][]>(
    Array.from({ length: VOICE_COUNT }, () =>
      new Array<HTMLElement | null>(COL_COUNT).fill(null),
    ),
  );
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    if (isNavigatingRef.current) {
      const [row, col] = activeCell;
      cellRefs.current[row]?.[col]?.focus();
      isNavigatingRef.current = false;
    }
  }, [activeCell]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const [row, col] = activeCell;
      let newRow = row;
      let newCol = col;
      let handled = true;

      switch (e.key) {
        case 'ArrowRight':
          newCol = Math.min(col + 1, COL_COUNT - 1);
          break;
        case 'ArrowLeft':
          newCol = Math.max(col - 1, 0);
          break;
        case 'ArrowDown':
          newRow = Math.min(row + 1, VOICE_COUNT - 1);
          break;
        case 'ArrowUp':
          newRow = Math.max(row - 1, 0);
          break;
        case 'Home':
          if (e.ctrlKey || e.metaKey) {
            newRow = 0;
            newCol = 0;
          } else {
            newCol = 0;
          }
          break;
        case 'End':
          if (e.ctrlKey || e.metaKey) {
            newRow = VOICE_COUNT - 1;
            newCol = COL_COUNT - 1;
          } else {
            newCol = COL_COUNT - 1;
          }
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        if (newRow !== row || newCol !== col) {
          isNavigatingRef.current = true;
          setActiveCell([newRow, newCol]);
        }
      }
    },
    [activeCell],
  );

  const handleCellFocus = useCallback((row: number, col: number) => {
    setActiveCell([row, col]);
  }, []);

  const getTabIndex = useCallback(
    (row: number, col: number): 0 | -1 =>
      row === activeCell[0] && col === activeCell[1] ? 0 : -1,
    [activeCell],
  );

  // ── Mute/Solo handlers ────────────────────────────────────────────

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
    <div className={styles.mixer}>
      <div
        role="grid"
        aria-label="Channel mixer"
        aria-rowcount={VOICE_COUNT}
        aria-colcount={COL_COUNT}
        onKeyDown={handleGridKeyDown}
        className={styles.grid}
      >
        {Array.from({ length: VOICE_COUNT }, (_, i) => {
          const isMuted = voiceMuted[i];
          const isSoloed = voiceSolo[i];

          return (
            <div
              key={i}
              role="row"
              aria-rowindex={i + 1}
              className={`${styles.strip} ${VOICE_STYLE_CLASSES[i]}`}
            >
              <div
                role="rowheader"
                aria-label={`Channel ${i + 1}`}
                tabIndex={getTabIndex(i, 0)}
                onFocus={() => handleCellFocus(i, 0)}
                ref={(el) => {
                  cellRefs.current[i][0] = el;
                }}
                className={styles.headerCell}
              >
                <span className={styles.voiceLabel}>{i + 1}</span>
                <VuMeter
                  voiceIndex={i}
                  label={`Channel ${i + 1} level`}
                  orientation="horizontal"
                />
              </div>

              <div role="gridcell">
                <button
                  tabIndex={getTabIndex(i, 1)}
                  onFocus={() => handleCellFocus(i, 1)}
                  ref={(el) => {
                    cellRefs.current[i][1] = el;
                  }}
                  className={`${styles.toggle} ${isMuted ? styles.muteActive : ''}`}
                  aria-label={`Mute channel ${i + 1}`}
                  aria-pressed={!!isMuted}
                  onClick={() => handleMute(i)}
                >
                  M
                </button>
              </div>

              <div role="gridcell">
                <button
                  tabIndex={getTabIndex(i, 2)}
                  onFocus={() => handleCellFocus(i, 2)}
                  ref={(el) => {
                    cellRefs.current[i][2] = el;
                  }}
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
      </div>

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
});
