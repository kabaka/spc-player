import { useEffect, useRef } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';
import {
  getWaveformColors,
  setupCanvas,
  type WaveformColors,
} from '@/utils/canvas-renderer';

import styles from './WaveformDisplay.module.css';

/** Number of samples kept in the rolling waveform history. */
const HISTORY_LENGTH = 256;

/**
 * Canvas-based oscilloscope waveform showing recent audio output.
 *
 * Reads VU data directly from the `audioStateBuffer` singleton at 60fps
 * via requestAnimationFrame. Does not trigger React re-renders.
 */
export function WaveformDisplay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef(new Float32Array(HISTORY_LENGTH));
  const writeIndexRef = useRef(0);
  const lastGenerationRef = useRef(-1);

  useEffect(() => {
    const containerEl = containerRef.current;
    const canvasRaw = canvasRef.current;
    if (!containerEl || !canvasRaw) return;
    // Bind to non-nullable locals for use in nested closures
    const container: HTMLElement = containerEl;
    const canvasEl: HTMLCanvasElement = canvasRaw;

    let colors: WaveformColors = getWaveformColors(container);
    let animationId = 0;

    // ── Reduced motion detection ─────────────────────────────────
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionQuery.matches;

    const onMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      if (!reduceMotion) {
        // Restart animation loop when motion is re-enabled
        animationId = requestAnimationFrame(render);
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    // ── Theme change detection (re-read colors) ──────────────────
    const themeObserver = new MutationObserver(() => {
      colors = getWaveformColors(container);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // ── Resize handling ──────────────────────────────────────────
    let dims = setupCanvas(canvasEl, container);
    const resizeObserver = new ResizeObserver(() => {
      dims = setupCanvas(canvasEl, container);
      renderFrame(colors);
    });
    resizeObserver.observe(container);

    // ── Rendering ────────────────────────────────────────────────
    const history = historyRef.current;

    function sampleAudio(): void {
      const gen = audioStateBuffer.generation;
      if (gen === lastGenerationRef.current) return;
      lastGenerationRef.current = gen;

      // Combine left+right master VU into a single amplitude value
      const amplitude =
        (audioStateBuffer.masterVuLeft + audioStateBuffer.masterVuRight) / 2;
      const idx = writeIndexRef.current % HISTORY_LENGTH;
      history[idx] = amplitude;
      writeIndexRef.current = idx + 1;
    }

    function renderFrame(c: WaveformColors): void {
      if (!dims) return;
      const { ctx, width, height } = dims;

      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, width, height);

      const midY = height / 2;

      // Draw waveform line
      ctx.beginPath();
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const writeIdx = writeIndexRef.current;
      const step = width / (HISTORY_LENGTH - 1);

      for (let i = 0; i < HISTORY_LENGTH; i++) {
        // Read from oldest to newest
        const sampleIdx = (writeIdx + i) % HISTORY_LENGTH;
        const amplitude = history[sampleIdx];
        // Map amplitude (0..1) to vertical displacement
        const y = midY - amplitude * midY * 0.85;
        const x = i * step;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw filled area under the waveform
      ctx.lineTo((HISTORY_LENGTH - 1) * step, midY);
      ctx.lineTo(0, midY);
      ctx.closePath();
      ctx.fillStyle = c.fill;
      ctx.fill();

      // Center reference line
      ctx.beginPath();
      ctx.strokeStyle = c.stroke;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 1;
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function render(): void {
      sampleAudio();
      renderFrame(colors);

      if (!reduceMotion) {
        animationId = requestAnimationFrame(render);
      }
    }

    // Start the loop (or render a single static frame if reduced motion)
    if (reduceMotion) {
      renderFrame(colors);
    } else {
      animationId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animationId);
      motionQuery.removeEventListener('change', onMotionChange);
      themeObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Audio waveform visualization"
      className={styles.container}
    >
      <canvas ref={canvasRef} aria-hidden="true" className={styles.canvas} />
    </div>
  );
}
