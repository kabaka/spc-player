import { getVoiceColor } from '@/utils/voice-colors';

import type { AudioVisualizationData, VisualizationRenderer } from '../types';

// ── Constants ─────────────────────────────────────────────────────────

const BG_COLOR = '#161622';
const GRID_COLOR = 'rgba(153, 153, 176, 0.2)'; // text-secondary at low opacity
const LABEL_COLOR = '#9999b0'; // --spc-color-text-secondary
const LABEL_FONT = '10px monospace';
const POINT_RADIUS = 3.5;
const MOBILE_POINT_RADIUS = 2.5;
const MOBILE_BREAKPOINT = 768;
const VOICE_COUNT = 8;

/** Number of historical correlation samples to retain. */
const CORRELATION_HISTORY_SIZE = 128;

// Correlation meter colors
const COLOR_GREEN = '#22c55e';
const COLOR_YELLOW = '#fbbf24';
const COLOR_RED = '#ef4444';
const NEEDLE_COLOR = '#ededf0';

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Compute stereo correlation from per-voice L/R VU levels.
 *
 * correlation = sum(L*R) / sqrt(sum(L²) * sum(R²))
 *
 * Returns 0 when both channels are silent (avoids NaN).
 */
export function computeCorrelation(
  vuLeft: Float32Array,
  vuRight: Float32Array,
): number {
  let sumLR = 0;
  let sumLL = 0;
  let sumRR = 0;

  const len = Math.min(vuLeft.length, vuRight.length);
  for (let i = 0; i < len; i++) {
    const l = vuLeft[i];
    const r = vuRight[i];
    sumLR += l * r;
    sumLL += l * l;
    sumRR += r * r;
  }

  const denom = Math.sqrt(sumLL * sumRR);
  if (denom < 1e-10) return 0;
  return sumLR / denom;
}

/**
 * Map a Lissajous point from L/R amplitudes to canvas pixel coordinates.
 *
 * X axis = left channel amplitude, Y axis = right channel amplitude (inverted so up = positive).
 * Values are in [0, 1] and mapped to fit within the available plot area.
 */
export function lissajousToCanvas(
  left: number,
  right: number,
  cx: number,
  cy: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: cx + left * scale,
    y: cy - right * scale, // invert Y so positive is up
  };
}

/**
 * Interpolate between red, yellow, green based on correlation value [-1, +1].
 */
function correlationColor(value: number): string {
  if (value >= 0.5) return COLOR_GREEN;
  if (value >= 0) return COLOR_YELLOW;
  return COLOR_RED;
}

// ── Renderer ──────────────────────────────────────────────────────────

export class StereoFieldRenderer implements VisualizationRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private mode: 'lissajous' | 'correlation' = 'lissajous';
  private decay = 0.95;

  // Lissajous trail: offscreen canvas for decay compositing
  private trailCanvas: HTMLCanvasElement | null = null;
  private trailCtx: CanvasRenderingContext2D | null = null;

  // Correlation history ring buffer
  private correlationHistory = new Float32Array(CORRELATION_HISTORY_SIZE);
  private correlationIndex = 0;
  private correlationCount = 0;

  // Reduced-motion detection (read from prefers-reduced-motion via matchMedia)
  private reduceMotion = false;
  private motionQuery: MediaQueryList | null = null;
  private motionHandler: ((e: MediaQueryListEvent) => void) | null = null;

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    // Clean up any prior trail canvas to prevent leaks on double-init
    this.trailCanvas = null;
    this.trailCtx = null;

    this.canvas = canvas;
    this.ctx = ctx;

    // Detect reduced motion
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduceMotion = this.motionQuery.matches;
    this.motionHandler = (e: MediaQueryListEvent) => {
      this.reduceMotion = e.matches;
    };
    this.motionQuery.addEventListener('change', this.motionHandler);

    // Create offscreen trail canvas for Lissajous decay
    this.trailCanvas = document.createElement('canvas');
    const trailCtx = this.trailCanvas.getContext('2d');
    if (trailCtx) {
      this.trailCtx = trailCtx;
    }
  }

  draw(data: AudioVisualizationData, _deltaTime: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Read settings from data
    if (data.stereoFieldSettings) {
      this.mode = data.stereoFieldSettings.mode;
      this.decay = data.stereoFieldSettings.decay;
    }

    if (this.mode === 'lissajous') {
      this.drawLissajous(ctx, data);
    } else {
      this.drawCorrelation(ctx, data);
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    // Resize trail canvas to match
    if (this.trailCanvas) {
      this.trailCanvas.width = Math.round(width * dpr);
      this.trailCanvas.height = Math.round(height * dpr);
      if (this.trailCtx) {
        this.trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Clear trail on resize
        this.trailCtx.fillStyle = BG_COLOR;
        this.trailCtx.fillRect(0, 0, width, height);
      }
    }
  }

  dispose(): void {
    if (this.motionQuery && this.motionHandler) {
      this.motionQuery.removeEventListener('change', this.motionHandler);
    }
    this.motionQuery = null;
    this.motionHandler = null;
    this.trailCanvas = null;
    this.trailCtx = null;
    this.canvas = null;
    this.ctx = null;
    this.correlationHistory.fill(0);
    this.correlationIndex = 0;
    this.correlationCount = 0;
  }

  // ── Lissajous Mode ────────────────────────────────────────────────

  private drawLissajous(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
  ): void {
    const { width, height } = this;
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(cx, cy) * 0.8;

    const isMobile = width < MOBILE_BREAKPOINT;
    const pointRadius = isMobile ? MOBILE_POINT_RADIUS : POINT_RADIUS;

    if (this.reduceMotion) {
      // Static mode: clear and draw current positions only
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);
      this.drawLissajousGrid(ctx, cx, cy, scale);
      this.drawLissajousPoints(ctx, data, cx, cy, scale, pointRadius);
      return;
    }

    // Trail decay via offscreen canvas
    const trailCtx = this.trailCtx;
    if (trailCtx && this.trailCanvas) {
      // Fade existing content: overlay semi-transparent background
      const fadeAlpha = 1 - this.decay;
      trailCtx.fillStyle = `rgba(22, 22, 34, ${fadeAlpha})`;
      trailCtx.fillRect(0, 0, width, height);

      // Draw new points onto the trail canvas
      this.drawLissajousPoints(trailCtx, data, cx, cy, scale, pointRadius);

      // Composite: draw background, grid, then trail
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);
      this.drawLissajousGrid(ctx, cx, cy, scale);

      // Reset transform for raw pixel blit, then restore
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.trailCanvas, 0, 0);
      ctx.restore();
    } else {
      // Fallback: no trail canvas
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);
      this.drawLissajousGrid(ctx, cx, cy, scale);
      this.drawLissajousPoints(ctx, data, cx, cy, scale, pointRadius);
    }
  }

  private drawLissajousGrid(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scale: number,
  ): void {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(cx - scale, cy);
    ctx.lineTo(cx + scale, cy);
    ctx.stroke();

    // Vertical center line
    ctx.beginPath();
    ctx.moveTo(cx, cy - scale);
    ctx.lineTo(cx, cy + scale);
    ctx.stroke();

    // +45° diagonal (mono line: L = R)
    ctx.beginPath();
    ctx.moveTo(cx - scale, cy + scale);
    ctx.lineTo(cx + scale, cy - scale);
    ctx.stroke();

    // -45° diagonal (anti-phase: L = -R)
    ctx.beginPath();
    ctx.moveTo(cx - scale, cy - scale);
    ctx.lineTo(cx + scale, cy + scale);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('L', cx - scale, cy + 4);
    ctx.fillText('R', cx + scale, cy + 4);
    ctx.textBaseline = 'bottom';
    ctx.fillText('+', cx + 4, cy - scale);
    ctx.textBaseline = 'top';
    ctx.fillText('−', cx + 4, cy + scale);
  }

  private drawLissajousPoints(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
    cx: number,
    cy: number,
    scale: number,
    radius: number,
  ): void {
    const { vuLeft, vuRight } = data;
    const count = Math.min(vuLeft.length, vuRight.length, VOICE_COUNT);

    for (let i = 0; i < count; i++) {
      const l = vuLeft[i];
      const r = vuRight[i];

      // Skip silent voices
      if (l < 0.001 && r < 0.001) continue;

      const { x, y } = lissajousToCanvas(l, r, cx, cy, scale);

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = getVoiceColor(i);
      ctx.fill();
    }
  }

  // ── Correlation Mode ──────────────────────────────────────────────

  private drawCorrelation(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
  ): void {
    const { width, height } = this;

    // Compute correlation from VU data
    const correlation = computeCorrelation(data.vuLeft, data.vuRight);

    // Push to history ring buffer
    this.correlationHistory[this.correlationIndex] = correlation;
    this.correlationIndex =
      (this.correlationIndex + 1) % CORRELATION_HISTORY_SIZE;
    if (this.correlationCount < CORRELATION_HISTORY_SIZE) {
      this.correlationCount++;
    }

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height * 0.65;
    const arcRadius = Math.min(cx, cy) * 0.7;

    // Draw semicircular arc (from π to 0, i.e. left to right)
    this.drawCorrelationArc(ctx, cx, cy, arcRadius);

    // Draw history trail (unless reduced motion)
    if (!this.reduceMotion && this.correlationCount > 1) {
      this.drawCorrelationHistory(ctx, cx, cy, arcRadius);
    }

    // Draw needle at current value
    this.drawCorrelationNeedle(ctx, cx, cy, arcRadius, correlation);

    // Draw tick labels
    this.drawCorrelationLabels(ctx, cx, cy, arcRadius);
  }

  private drawCorrelationArc(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 0);
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tick marks at -1, -0.5, 0, 0.5, 1
    const ticks = [-1, -0.5, 0, 0.5, 1];
    for (const tick of ticks) {
      const angle = Math.PI * (1 - (tick + 1) / 2); // map [-1,1] to [π,0]
      const innerR = radius - 6;
      const outerR = radius + 6;
      ctx.beginPath();
      ctx.moveTo(
        cx + innerR * Math.cos(angle),
        cy - innerR * Math.abs(Math.sin(angle)),
      );
      ctx.lineTo(
        cx + outerR * Math.cos(angle),
        cy - outerR * Math.abs(Math.sin(angle)),
      );
      ctx.strokeStyle = LABEL_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawCorrelationNeedle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    value: number,
  ): void {
    const clamped = Math.max(-1, Math.min(1, value));
    const angle = Math.PI * (1 - (clamped + 1) / 2); // map [-1,1] to [π,0]

    const needleLen = radius * 0.9;
    const endX = cx + needleLen * Math.cos(angle);
    const endY = cy - needleLen * Math.abs(Math.sin(angle));

    // Needle line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = NEEDLE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Needle tip dot
    ctx.beginPath();
    ctx.arc(endX, endY, 4, 0, Math.PI * 2);
    ctx.fillStyle = correlationColor(clamped);
    ctx.fill();

    // Center pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = NEEDLE_COLOR;
    ctx.fill();
  }

  private drawCorrelationHistory(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    const histLen = radius * 0.85;

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;

    // Draw as individual small dots along the arc
    for (let i = 0; i < this.correlationCount; i++) {
      const idx =
        (this.correlationIndex - 1 - i + CORRELATION_HISTORY_SIZE) %
        CORRELATION_HISTORY_SIZE;
      const val = this.correlationHistory[idx];
      const clamped = Math.max(-1, Math.min(1, val));
      const angle = Math.PI * (1 - (clamped + 1) / 2);

      // Fade older samples
      const age = i / this.correlationCount;
      ctx.globalAlpha = 0.4 * (1 - age);

      const px = cx + histLen * Math.cos(angle);
      const py = cy - histLen * Math.abs(Math.sin(angle));

      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = correlationColor(clamped);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawCorrelationLabels(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ): void {
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = LABEL_FONT;

    const labelR = radius + 18;

    // -1 label (left side)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('−1', cx - labelR, cy);

    // 0 label (top)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('0', cx, cy - labelR);

    // +1 label (right side)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+1', cx + labelR, cy);
  }
}
