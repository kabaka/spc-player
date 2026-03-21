import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { audioStateBuffer } from '@/audio/audio-state-buffer';
import { samplesToSeconds } from '@/core/track-duration';
import { formatTime, formatSpokenTime } from '@/utils/format-time';

import styles from './SeekBar.module.css';

import type { LoopRegion } from '@/store/types';

// ── Types ─────────────────────────────────────────────────────────────

export interface SeekBarProps {
  /** Total duration in seconds */
  totalSeconds: number;
  /** Current position in seconds (from Zustand, for aria-valuetext) */
  currentSeconds: number;
  /** Called when user seeks. Receives seconds. */
  onSeek: (seconds: number) => void;
  /** Loop region from store, if set */
  loopRegion?: LoopRegion | null;
  /** Called when A-B marker is adjusted */
  onLoopMarkerChange?: (marker: 'A' | 'B', seconds: number) => void;
  /** Whether the seek bar is disabled (no track loaded) */
  disabled?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────

const TRACK_HEIGHT_IDLE = 3;
const TRACK_HEIGHT_HOVER = 5;
const THUMB_SIZE = 12;
const THUMB_SIZE_DRAGGING = 16;
const ARROW_STEP = 5;
const PAGE_STEP = 15;
const MARKER_ARROW_STEP = 1;
const MARKER_SHIFT_STEP = 5;

// ── Helpers ───────────────────────────────────────────────────────────

function formatSeekValueText(elapsedSec: number, durationSec: number): string {
  return `${formatSpokenTime(elapsedSec)} of ${formatSpokenTime(durationSec)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getCanvasDimensions(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
  dpr: number;
} {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  return { width, height, dpr };
}

function fractionToSeconds(fraction: number, totalSeconds: number): number {
  return clamp(fraction * totalSeconds, 0, totalSeconds);
}

function pointerToFraction(clientX: number, container: HTMLElement): number {
  const rect = container.getBoundingClientRect();
  return clamp((clientX - rect.left) / rect.width, 0, 1);
}

// ── Canvas Renderer ───────────────────────────────────────────────────

function renderSeekCanvas(
  canvas: HTMLCanvasElement,
  fraction: number,
  state: 'idle' | 'hover' | 'focus' | 'dragging',
  loopRegion: LoopRegion | null,
  totalSeconds: number,
  accentColor: string,
  surfaceRaisedColor: string,
  accentSubtleColor: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height, dpr } = getCanvasDimensions(canvas);

  // Resize canvas backing store if needed
  const canvasW = Math.round(width * dpr);
  const canvasH = Math.round(height * dpr);
  if (canvas.width !== canvasW || canvas.height !== canvasH) {
    canvas.width = canvasW;
    canvas.height = canvasH;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const isActive = state !== 'idle';
  const trackH = isActive ? TRACK_HEIGHT_HOVER : TRACK_HEIGHT_IDLE;
  const trackY = (height - trackH) / 2;
  const playedWidth = fraction * width;

  // Loop region background (behind track)
  if (loopRegion?.active && totalSeconds > 0) {
    const loopStartX = (loopRegion.startTime / totalSeconds) * width;
    const loopEndX = (loopRegion.endTime / totalSeconds) * width;
    const regionWidth = loopEndX - loopStartX;

    ctx.fillStyle = accentSubtleColor;
    ctx.fillRect(loopStartX, trackY - 4, regionWidth, trackH + 8);

    // Dashed borders top and bottom
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(loopStartX, trackY - 4);
    ctx.lineTo(loopEndX, trackY - 4);
    ctx.moveTo(loopStartX, trackY + trackH + 4);
    ctx.lineTo(loopEndX, trackY + trackH + 4);
    ctx.stroke();
    ctx.restore();
  }

  // Remaining region (full track background)
  ctx.fillStyle = surfaceRaisedColor;
  ctx.beginPath();
  ctx.roundRect(0, trackY, width, trackH, trackH / 2);
  ctx.fill();

  // Played region
  if (playedWidth > 0) {
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(0, trackY, Math.max(playedWidth, trackH), trackH, trackH / 2);
    ctx.fill();
  }

  // Loop markers (vertical lines)
  if (loopRegion?.active && totalSeconds > 0) {
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.8;
    const markerWidth = 2;
    const markerHeight = 16;
    const markerY = (height - markerHeight) / 2;

    const startX = (loopRegion.startTime / totalSeconds) * width;
    ctx.fillRect(startX - markerWidth / 2, markerY, markerWidth, markerHeight);

    const endX = (loopRegion.endTime / totalSeconds) * width;
    ctx.fillRect(endX - markerWidth / 2, markerY, markerWidth, markerHeight);

    ctx.globalAlpha = 1;
  }

  // Thumb (only on hover/focus/drag)
  if (isActive) {
    const thumbR =
      (state === 'dragging' ? THUMB_SIZE_DRAGGING : THUMB_SIZE) / 2;
    const thumbX = clamp(playedWidth, thumbR, width - thumbR);
    const thumbY = height / 2;

    ctx.beginPath();
    ctx.arc(thumbX, thumbY, thumbR, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();

    // Subtle shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, thumbR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

// ── Component ─────────────────────────────────────────────────────────

export function SeekBar({
  totalSeconds,
  currentSeconds,
  onSeek,
  loopRegion = null,
  onLoopMarkerChange,
  disabled = false,
}: SeekBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);

  const [isHovering, setIsHovering] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipTime, setTooltipTime] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);

  // Stable refs for rAF access
  const isDraggingRef = useRef(false);
  const dragFractionRef = useRef(0);
  const isHoveringRef = useRef(false);
  const isFocusedRef = useRef(false);
  const totalSecondsRef = useRef(totalSeconds);
  const loopRegionRef = useRef(loopRegion);
  const lastRenderedGen = useRef(-1);

  isDraggingRef.current = isDragging;
  isHoveringRef.current = isHovering;
  isFocusedRef.current = isFocused;
  totalSecondsRef.current = totalSeconds;
  loopRegionRef.current = loopRegion;

  // ── Compute CSS colors once (read from computed styles) ─────────
  const colorsRef = useRef({
    accent: '#8b5cf6',
    surfaceRaised: '#282840',
    accentSubtle: 'rgba(139, 92, 246, 0.15)',
  });

  useEffect(() => {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    colorsRef.current = {
      accent:
        computed.getPropertyValue('--spc-color-accent').trim() || '#8b5cf6',
      surfaceRaised:
        computed.getPropertyValue('--spc-color-surface-raised').trim() ||
        '#282840',
      accentSubtle:
        computed.getPropertyValue('--spc-color-accent-subtle').trim() ||
        'rgba(139, 92, 246, 0.15)',
    };
  }, []);

  // ── Reduced motion detection ──────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;

    const handleChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // ── rAF render loop ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastReducedMotionRender = 0;
    const REDUCED_MOTION_INTERVAL = 250;

    const render = () => {
      const total = totalSecondsRef.current;
      const generation = audioStateBuffer.generation;
      const hovering = isHoveringRef.current;
      const focused = isFocusedRef.current;
      const dragging = isDraggingRef.current;

      // Only repaint when something changed
      const needsRepaint =
        generation !== lastRenderedGen.current ||
        hovering ||
        focused ||
        dragging;

      // Under reduced motion, throttle renders to ~4fps
      if (needsRepaint && reducedMotionRef.current) {
        const now = performance.now();
        if (now - lastReducedMotionRender < REDUCED_MOTION_INTERVAL) {
          rafIdRef.current = requestAnimationFrame(render);
          return;
        }
        lastReducedMotionRender = now;
      }

      if (needsRepaint) {
        lastRenderedGen.current = generation;

        let fraction: number;
        if (dragging) {
          fraction = dragFractionRef.current;
        } else if (total > 0) {
          const posSamples = audioStateBuffer.positionSamples;
          const posSec = samplesToSeconds(posSamples);
          fraction = clamp(posSec / total, 0, 1);
        } else {
          fraction = 0;
        }

        let state: 'idle' | 'hover' | 'focus' | 'dragging';
        if (dragging) state = 'dragging';
        else if (hovering) state = 'hover';
        else if (focused) state = 'focus';
        else state = 'idle';

        const colors = colorsRef.current;
        renderSeekCanvas(
          canvas,
          fraction,
          state,
          loopRegionRef.current,
          total,
          colors.accent,
          colors.surfaceRaised,
          colors.accentSubtle,
        );
      }

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, []);

  // ── Resize observer for canvas ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      // Force a repaint on next frame
      lastRenderedGen.current = -1;
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // ── Input handlers ──────────────────────────────────────────────

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (disabled || totalSeconds <= 0) return;

      let newSeconds: number | null = null;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          newSeconds = clamp(currentSeconds - ARROW_STEP, 0, totalSeconds);
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          newSeconds = clamp(currentSeconds + ARROW_STEP, 0, totalSeconds);
          e.preventDefault();
          break;
        case 'PageDown':
          newSeconds = clamp(currentSeconds - PAGE_STEP, 0, totalSeconds);
          e.preventDefault();
          break;
        case 'PageUp':
          newSeconds = clamp(currentSeconds + PAGE_STEP, 0, totalSeconds);
          e.preventDefault();
          break;
        case 'Home':
          newSeconds = 0;
          e.preventDefault();
          break;
        case 'End':
          newSeconds = totalSeconds;
          e.preventDefault();
          break;
        default:
          return;
      }

      if (newSeconds !== null) {
        onSeek(newSeconds);
        setTooltipTime(newSeconds);
        // Update tooltip position for keyboard-focused thumb
        if (containerRef.current) {
          const fraction = totalSeconds > 0 ? newSeconds / totalSeconds : 0;
          setTooltipX(
            fraction * containerRef.current.getBoundingClientRect().width,
          );
        }
      }
    },
    [disabled, currentSeconds, totalSeconds, onSeek],
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (containerRef.current && totalSeconds > 0) {
      const fraction = currentSeconds / totalSeconds;
      setTooltipX(
        fraction * containerRef.current.getBoundingClientRect().width,
      );
      setTooltipTime(currentSeconds);
    }
  }, [currentSeconds, totalSeconds]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  // ── Pointer handlers for seek ───────────────────────────────────

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || totalSeconds <= 0) return;
      // Ignore if a loop marker was the target
      const target = e.target as HTMLElement;
      if (target.dataset.loopMarker) return;

      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      container.setPointerCapture(e.pointerId);
      setIsDragging(true);

      const fraction = pointerToFraction(e.clientX, container);
      dragFractionRef.current = fraction;
      const seconds = fractionToSeconds(fraction, totalSeconds);
      onSeek(seconds);
      setTooltipTime(seconds);
      setTooltipX(e.clientX - container.getBoundingClientRect().left);
    },
    [disabled, totalSeconds, onSeek],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const fraction = pointerToFraction(e.clientX, container);
      const localX = e.clientX - container.getBoundingClientRect().left;

      if (isDragging) {
        dragFractionRef.current = fraction;
        const seconds = fractionToSeconds(fraction, totalSeconds);
        onSeek(seconds);
        setTooltipTime(seconds);
        setTooltipX(localX);
      } else {
        // Hover tooltip
        setTooltipTime(fractionToSeconds(fraction, totalSeconds));
        setTooltipX(localX);
      }
    },
    [isDragging, totalSeconds, onSeek],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const container = containerRef.current;
      if (container) {
        container.releasePointerCapture(e.pointerId);
      }
      setIsDragging(false);
    },
    [isDragging],
  );

  const handlePointerEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsHovering(false);
    if (!isDragging) {
      setTooltipTime(0);
    }
  }, [isDragging]);

  // ── Loop marker handlers ────────────────────────────────────────

  const handleMarkerKeyDown = useCallback(
    (marker: 'A' | 'B') => (e: KeyboardEvent<HTMLDivElement>) => {
      if (!loopRegion || !onLoopMarkerChange || totalSeconds <= 0) return;

      const currentTime =
        marker === 'A' ? loopRegion.startTime : loopRegion.endTime;
      const step = e.shiftKey ? MARKER_SHIFT_STEP : MARKER_ARROW_STEP;
      let newTime: number | null = null;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          newTime = clamp(currentTime - step, 0, totalSeconds);
          e.preventDefault();
          e.stopPropagation();
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          newTime = clamp(currentTime + step, 0, totalSeconds);
          e.preventDefault();
          e.stopPropagation();
          break;
        default:
          return;
      }

      if (newTime !== null) {
        if (marker === 'A') {
          newTime = Math.min(newTime, loopRegion.endTime);
        } else {
          newTime = Math.max(newTime, loopRegion.startTime);
        }
        onLoopMarkerChange(marker, newTime);
      }
    },
    [loopRegion, totalSeconds, onLoopMarkerChange],
  );

  const handleMarkerPointerDown = useCallback(
    (marker: 'A' | 'B') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onLoopMarkerChange || totalSeconds <= 0) return;
      e.preventDefault();
      e.stopPropagation();

      const markerEl = e.currentTarget;
      markerEl.setPointerCapture(e.pointerId);

      const onMove = (moveEvent: globalThis.PointerEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const fraction = pointerToFraction(moveEvent.clientX, container);
        let seconds = fractionToSeconds(fraction, totalSeconds);
        const region = loopRegionRef.current;
        if (region) {
          seconds =
            marker === 'A'
              ? Math.min(seconds, region.endTime)
              : Math.max(seconds, region.startTime);
        }
        onLoopMarkerChange(marker, seconds);
      };

      const onUp = () => {
        markerEl.removeEventListener('pointermove', onMove);
        markerEl.removeEventListener('pointerup', onUp);
      };

      markerEl.addEventListener('pointermove', onMove);
      markerEl.addEventListener('pointerup', onUp);
    },
    [totalSeconds, onLoopMarkerChange],
  );

  // ── Derived values ──────────────────────────────────────────────

  const showTooltip = isHovering || isFocused || isDragging;
  const flooredTotal = Math.floor(totalSeconds);
  const clampedCurrent = Math.min(currentSeconds, flooredTotal);

  // Tooltip position (clamped to container width)
  const tooltipStyle: React.CSSProperties = {
    transform: `translateX(calc(${tooltipX}px - 50%))`,
    left: 0,
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`${styles.seekBar}${isDragging ? ` ${styles.dragging}` : ''}`}
      role="group"
      aria-label="Seek"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        ref={canvasRef}
        className={styles.seekCanvas}
        aria-hidden="true"
        style={{ height: TRACK_HEIGHT_HOVER * 4 }}
      />

      <input
        ref={inputRef}
        type="range"
        className={styles.seekInput}
        min={0}
        max={flooredTotal}
        step={ARROW_STEP}
        value={clampedCurrent}
        disabled={disabled}
        aria-label="Seek position"
        aria-disabled={disabled || undefined}
        aria-valuemin={0}
        aria-valuemax={flooredTotal}
        aria-valuenow={clampedCurrent}
        aria-valuetext={formatSeekValueText(clampedCurrent, flooredTotal)}
        onKeyDown={handleInputKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(e) => {
          const newSeconds = Number(e.target.value);
          if (Number.isFinite(newSeconds)) {
            onSeek(newSeconds);
          }
        }}
      />

      {loopRegion?.active && totalSeconds > 0 && (
        <>
          {/* Loop region overlay */}
          <div
            className={styles.loopRegionOverlay}
            style={{
              left: `${(loopRegion.startTime / totalSeconds) * 100}%`,
              width: `${((loopRegion.endTime - loopRegion.startTime) / totalSeconds) * 100}%`,
            }}
          />

          {/* Marker A */}
          <div
            className={styles.loopMarker}
            role="slider"
            tabIndex={0}
            aria-label="Loop start marker"
            aria-valuemin={0}
            aria-valuemax={flooredTotal}
            aria-valuenow={Math.floor(loopRegion.startTime)}
            aria-valuetext={`Loop starts at ${formatSpokenTime(Math.floor(loopRegion.startTime))}`}
            data-loop-marker="A"
            style={{
              left: `${(loopRegion.startTime / totalSeconds) * 100}%`,
            }}
            onKeyDown={handleMarkerKeyDown('A')}
            onPointerDown={handleMarkerPointerDown('A')}
          />

          {/* Marker B */}
          <div
            className={styles.loopMarker}
            role="slider"
            tabIndex={0}
            aria-label="Loop end marker"
            aria-valuemin={0}
            aria-valuemax={flooredTotal}
            aria-valuenow={Math.floor(loopRegion.endTime)}
            aria-valuetext={`Loop ends at ${formatSpokenTime(Math.floor(loopRegion.endTime))}`}
            data-loop-marker="B"
            style={{
              left: `${(loopRegion.endTime / totalSeconds) * 100}%`,
            }}
            onKeyDown={handleMarkerKeyDown('B')}
            onPointerDown={handleMarkerPointerDown('B')}
          />
        </>
      )}

      <div
        ref={tooltipRef}
        className={`${styles.timeTooltip} ${showTooltip ? styles.timeTooltipVisible : ''}`}
        aria-hidden="true"
        style={tooltipStyle}
      >
        {formatTime(tooltipTime)}
      </div>
    </div>
  );
}
