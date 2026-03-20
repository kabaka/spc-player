import { useEffect, useRef } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';
import {
  setupCanvas,
  getCssColor,
  getVoiceColors,
} from '@/utils/canvas-renderer';

import styles from './SpectrumAnalyzer.module.css';

/** Gap between bars in CSS pixels. */
const BAR_GAP = 3;

/** Number of DSP voices (S-DSP has 8). */
const VOICE_COUNT = 8;

/**
 * Canvas-based frequency spectrum analyzer using per-voice VU levels.
 *
 * Displays 8 vertical bars — one per S-DSP voice channel — each colored
 * with the corresponding voice channel design token. Reads directly from
 * `audioStateBuffer` at 60fps via requestAnimationFrame.
 */
export function SpectrumAnalyzer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastGenerationRef = useRef(-1);

  useEffect(() => {
    const containerEl = containerRef.current;
    const canvasRaw = canvasRef.current;
    if (!containerEl || !canvasRaw) return;
    // Bind to non-nullable locals for use in nested closures
    const container: HTMLElement = containerEl;
    const canvasEl: HTMLCanvasElement = canvasRaw;

    let voiceColors = getVoiceColors(container);
    let bgColor = getCssColor(container, '--spc-color-waveform-bg', '#161622');
    let animationId = 0;

    // ── Reduced motion detection ─────────────────────────────────
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = motionQuery.matches;

    const onMotionChange = (e: MediaQueryListEvent) => {
      reduceMotion = e.matches;
      if (!reduceMotion) {
        animationId = requestAnimationFrame(render);
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    // ── Theme change detection (re-read colors) ──────────────────
    const themeObserver = new MutationObserver(() => {
      voiceColors = getVoiceColors(container);
      bgColor = getCssColor(container, '--spc-color-waveform-bg', '#161622');
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // ── Resize handling ──────────────────────────────────────────
    let dims = setupCanvas(canvasEl, container);
    const resizeObserver = new ResizeObserver(() => {
      dims = setupCanvas(canvasEl, container);
      renderFrame();
    });
    resizeObserver.observe(container);

    // ── Rendering ────────────────────────────────────────────────
    function renderFrame(): void {
      if (!dims) return;
      const { ctx, width, height } = dims;

      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // Calculate bar dimensions
      const totalGap = BAR_GAP * (VOICE_COUNT - 1);
      const barWidth = (width - totalGap) / VOICE_COUNT;

      // Bottom padding for visual breathing room
      const bottomPad = 4;
      const maxBarHeight = height - bottomPad;

      for (let i = 0; i < VOICE_COUNT; i++) {
        // Average left+right VU for this voice
        const vuLeft = audioStateBuffer.vuLeft[i] ?? 0;
        const vuRight = audioStateBuffer.vuRight[i] ?? 0;
        const level = (vuLeft + vuRight) / 2;

        const barHeight = Math.max(level * maxBarHeight, 1);
        const x = i * (barWidth + BAR_GAP);
        const y = height - barHeight;

        // Draw bar with gradient from voice color (full at bottom) to transparent top
        const gradient = ctx.createLinearGradient(x, y, x, height);
        gradient.addColorStop(0, voiceColors[i] + '88'); // semi-transparent at top
        gradient.addColorStop(1, voiceColors[i]); // full at bottom

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Rounded top corners
        const radius = Math.min(2, barWidth / 4);
        ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();
      }
    }

    function render(): void {
      const gen = audioStateBuffer.generation;
      if (gen !== lastGenerationRef.current) {
        lastGenerationRef.current = gen;
        renderFrame();
      }

      if (!reduceMotion) {
        animationId = requestAnimationFrame(render);
      }
    }

    // Start the loop (or render a single static frame if reduced motion)
    if (reduceMotion) {
      renderFrame();
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
      aria-label="Frequency spectrum visualization"
      className={styles.container}
    >
      <canvas ref={canvasRef} aria-hidden="true" className={styles.canvas} />
    </div>
  );
}
