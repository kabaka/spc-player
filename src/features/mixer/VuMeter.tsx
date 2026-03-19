import { useEffect, useRef } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';

import styles from './VuMeter.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const ARIA_THROTTLE_MS = 250;

// ── Types ─────────────────────────────────────────────────────────────

export interface VuMeterProps {
  /** 0-7 for per-voice, -1 for master */
  voiceIndex: number;
  /** Accessible label, e.g. "Voice 0 level" */
  label: string;
  /** Bar orientation. Default: 'vertical' */
  orientation?: 'vertical' | 'horizontal';
}

// ── Helpers ───────────────────────────────────────────────────────────

function getValueText(rounded: number): string {
  if (rounded === 0) return 'silent';
  if (rounded >= 100) return 'clipping';
  return `${rounded} percent`;
}

function readLevel(voiceIndex: number): number {
  if (voiceIndex === -1) {
    // Master: average of left and right
    const l = audioStateBuffer.masterVuLeft;
    const r = audioStateBuffer.masterVuRight;
    return ((l + r) / 2) * 100;
  }
  // Per-voice: average left and right channels
  const l = audioStateBuffer.vuLeft[voiceIndex] ?? 0;
  const r = audioStateBuffer.vuRight[voiceIndex] ?? 0;
  return ((l + r) / 2) * 100;
}

// ── Component ─────────────────────────────────────────────────────────

export function VuMeter({
  voiceIndex,
  label,
  orientation = 'vertical',
}: VuMeterProps) {
  const meterRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastAriaUpdate = useRef(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = mq.matches;

    const handleChange = (e: MediaQueryListEvent) => {
      reducedMotion.current = e.matches;
    };
    mq.addEventListener('change', handleChange);

    return () => {
      mq.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    const meter = meterRef.current;
    const fill = fillRef.current;
    if (!meter || !fill) return;

    // Capture non-null refs for the rAF closure
    const meterEl = meter;
    const fillEl = fill;
    let lastReducedMotionUpdate = 0;

    function tick() {
      const now = performance.now();
      const level = readLevel(voiceIndex);
      const clampedLevel = Math.min(100, Math.max(0, level));

      // If reduced motion, only update at 4Hz
      if (reducedMotion.current) {
        if (now - lastReducedMotionUpdate >= ARIA_THROTTLE_MS) {
          lastReducedMotionUpdate = now;
          fillEl.style.setProperty('--vu-level', `${clampedLevel}%`);
        }
      } else {
        // Visual update — every frame
        fillEl.style.setProperty('--vu-level', `${clampedLevel}%`);
      }

      // ARIA update — throttled to ≤ 4Hz
      if (now - lastAriaUpdate.current >= ARIA_THROTTLE_MS) {
        lastAriaUpdate.current = now;
        const rounded = Math.round(clampedLevel);
        meterEl.setAttribute('aria-valuenow', String(rounded));
        meterEl.setAttribute('aria-valuetext', getValueText(rounded));
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [voiceIndex]);

  return (
    <div
      ref={meterRef}
      className={styles.meter}
      role="meter"
      aria-roledescription="level meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      aria-valuetext="silent"
      data-orientation={orientation}
    >
      <div ref={fillRef} className={styles.fill} aria-hidden="true" />
    </div>
  );
}
