import { useCallback, useRef, useState } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';

import { useAppStore } from '@/store/store';

import styles from './LoopMarkers.module.css';

// ── Helpers ──────────────────────────────────────────────────────────

const ARROW_STEP_SECONDS = 0.5;
const ARROW_SHIFT_STEP_SECONDS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pxToTime(
  clientX: number,
  rect: DOMRect,
  minTime: number,
  maxTime: number,
): number {
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return minTime + ratio * (maxTime - minTime);
}

// ── Props ────────────────────────────────────────────────────────────

interface LoopMarkersProps {
  /** Track duration in seconds (the slider's max value). */
  readonly maxTime: number;
}

// ── Component ────────────────────────────────────────────────────────

export function LoopMarkers({ maxTime }: LoopMarkersProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const loopRegion = useAppStore((s) => s.loopRegion);
  const setLoopStart = useAppStore((s) => s.setLoopStart);
  const setLoopEnd = useAppStore((s) => s.setLoopEnd);

  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  // ── Drag handling ──────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (handle: 'start' | 'end', e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(handle);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragging || !overlayRef.current || !loopRegion) return;

      const rect = overlayRef.current.getBoundingClientRect();
      const time = pxToTime(e.clientX, rect, 0, maxTime);

      if (dragging === 'start') {
        setLoopStart(clamp(time, 0, loopRegion.endTime));
      } else {
        setLoopEnd(clamp(time, loopRegion.startTime, maxTime));
      }
    },
    [dragging, maxTime, loopRegion, setLoopStart, setLoopEnd],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // ── Keyboard handling (arrow keys on handles) ─────────────────────

  const handleKeyDown = useCallback(
    (handle: 'start' | 'end', e: KeyboardEvent<HTMLDivElement>) => {
      if (!loopRegion) return;

      const step = e.shiftKey ? ARROW_SHIFT_STEP_SECONDS : ARROW_STEP_SECONDS;
      let delta = 0;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          delta = step;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          delta = -step;
          break;
        default:
          return;
      }

      e.preventDefault();

      if (handle === 'start') {
        setLoopStart(
          clamp(loopRegion.startTime + delta, 0, loopRegion.endTime),
        );
      } else {
        setLoopEnd(
          clamp(loopRegion.endTime + delta, loopRegion.startTime, maxTime),
        );
      }
    },
    [loopRegion, maxTime, setLoopStart, setLoopEnd],
  );

  // ── Bail if no region ──────────────────────────────────────────────

  if (!loopRegion || maxTime <= 0) return null;

  // ── Position calculations ──────────────────────────────────────────

  const startPercent = (loopRegion.startTime / maxTime) * 100;
  const endPercent = (loopRegion.endTime / maxTime) * 100;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Loop region highlight */}
      <div
        className={styles.region}
        data-active={loopRegion.active}
        style={{
          left: `${startPercent}%`,
          width: `${endPercent - startPercent}%`,
        }}
      />

      {/* Start handle */}
      <div
        className={styles.handle}
        role="slider"
        tabIndex={0}
        aria-label="Loop start marker"
        aria-valuemin={0}
        aria-valuemax={loopRegion.endTime}
        aria-valuenow={loopRegion.startTime}
        aria-valuetext={`${Math.floor(loopRegion.startTime)} seconds`}
        data-dragging={dragging === 'start'}
        style={{ left: `${startPercent}%` }}
        onPointerDown={(e) => handlePointerDown('start', e)}
        onKeyDown={(e) => handleKeyDown('start', e)}
      />

      {/* End handle */}
      <div
        className={styles.handle}
        role="slider"
        tabIndex={0}
        aria-label="Loop end marker"
        aria-valuemin={loopRegion.startTime}
        aria-valuemax={maxTime}
        aria-valuenow={loopRegion.endTime}
        aria-valuetext={`${Math.floor(loopRegion.endTime)} seconds`}
        data-dragging={dragging === 'end'}
        style={{ left: `${endPercent}%` }}
        onPointerDown={(e) => handlePointerDown('end', e)}
        onKeyDown={(e) => handleKeyDown('end', e)}
      />
    </div>
  );
}
