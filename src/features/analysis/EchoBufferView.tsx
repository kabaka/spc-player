import { useCallback, useEffect, useRef } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';

import styles from './EchoBufferView.module.css';

// ── Constants ─────────────────────────────────────────────────────────

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 200;
const FIR_TAP_COUNT = 8;
/** 1 fps throttle interval for prefers-reduced-motion */
const REDUCED_MOTION_INTERVAL_MS = 1000;

// ── Helpers ───────────────────────────────────────────────────────────

function formatFirCoefficient(value: number): string {
  const signed = value > 127 ? value - 256 : value;
  return `${signed}/128`;
}

// ── Component ─────────────────────────────────────────────────────────

export function EchoBufferView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const generationRef = useRef(0);
  const reducedMotion = useRef(false);
  const cachedColors = useRef({ grid: '', waveL: '', waveR: '' });

  // Track prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = mq.matches;

    const handleChange = (e: MediaQueryListEvent) => {
      reducedMotion.current = e.matches;
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Cache CSS custom property colors once on mount and on theme change
  useEffect(() => {
    function readColors() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const style = getComputedStyle(canvas);
      cachedColors.current = {
        grid:
          style.getPropertyValue('--spc-color-border') ||
          'rgba(255,255,255,0.1)',
        waveL: style.getPropertyValue('--spc-color-accent') || '#6366f1',
        waveR: style.getPropertyValue('--spc-color-echo-right') || '#22D3EE',
      };
    }

    // Read after first paint
    requestAnimationFrame(readColors);

    // Re-read when color-scheme changes (theme toggle)
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', readColors);
    return () => mq.removeEventListener('change', readColors);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2;

    ctx.clearRect(0, 0, w, h);

    const {
      grid: gridColor,
      waveL: waveColorL,
      waveR: waveColorR,
    } = cachedColors.current;

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Read echo buffer data from audio state buffer
    const echoData = audioStateBuffer.echoBuffer;
    if (!echoData || echoData.length === 0) {
      ctx.fillStyle = gridColor;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No echo data available', w / 2, midY);
      return;
    }

    // Draw left channel
    const samplesPerPixel = Math.max(1, Math.floor(echoData.length / 2 / w));
    ctx.strokeStyle = waveColorL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = x * samplesPerPixel * 2;
      const sample = idx < echoData.length ? echoData[idx] / 32768 : 0;
      const y = midY - sample * (midY - 4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw right channel
    ctx.strokeStyle = waveColorR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = x * samplesPerPixel * 2 + 1;
      const sample = idx < echoData.length ? echoData[idx] / 32768 : 0;
      const y = midY - sample * (midY - 4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);

  useEffect(() => {
    // Don't start the animation loop if there's no echo data
    if (!audioStateBuffer.echoBuffer) return;

    let lastReducedMotionDraw = 0;

    const tick = () => {
      const gen = audioStateBuffer.generation;
      if (gen !== generationRef.current) {
        generationRef.current = gen;

        if (reducedMotion.current) {
          const now = performance.now();
          if (now - lastReducedMotionDraw >= REDUCED_MOTION_INTERVAL_MS) {
            lastReducedMotionDraw = now;
            draw();
          }
        } else {
          draw();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Read FIR coefficients from audio state buffer
  const firCoefficients = audioStateBuffer.firCoefficients ?? new Uint8Array(8);
  const hasEchoData = audioStateBuffer.echoBuffer !== null;
  const hasFirData = hasEchoData && firCoefficients.some((v) => v !== 0);

  return (
    <div className={styles.container}>
      <div
        role="img"
        aria-label="Echo buffer waveform visualization showing left and right channels"
        className={styles.canvasWrapper}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-hidden="true"
          className={styles.canvas}
        />
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendDotL} aria-hidden="true" />
          Left channel
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDotR} aria-hidden="true" />
          Right channel
        </span>
      </div>

      <section
        aria-label="FIR filter coefficients"
        className={styles.firSection}
      >
        <h3 className={styles.firHeading}>FIR Filter Coefficients</h3>
        {!hasFirData && (
          <p className={styles.firUnavailable}>Not available during playback</p>
        )}
        <dl className={styles.firList}>
          {Array.from({ length: FIR_TAP_COUNT }, (_, i) => (
            <div key={i} className={styles.firItem}>
              <dt className={styles.firLabel}>Tap {i}</dt>
              <dd className={styles.firValue}>
                {formatFirCoefficient(firCoefficients[i] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
