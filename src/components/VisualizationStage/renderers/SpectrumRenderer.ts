import type { AudioVisualizationData, VisualizationRenderer } from '../types';
import { getCssColor } from '@/utils/canvas-renderer';

// ── Constants ─────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;
const BAR_WIDTH = 4;
const BAR_GAP = 1;
const MOBILE_BAR_WIDTH = 6;
const MOBILE_BAR_GAP = 2;
const LINE_WIDTH = 2;
const LABEL_FONT_SIZE = 10;

const GRID_FREQUENCIES = [100, 1_000, 10_000];
const GRID_FREQUENCY_LABELS = ['100Hz', '1kHz', '10kHz'];
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20_000;

/**
 * Must match the AudioContext sample rate used in AudioEngine.
 * @see src/audio/engine.ts TARGET_SAMPLE_RATE
 */
const SAMPLE_RATE = 48_000;

/**
 * Peak decay rate in byte-values per second.
 * AnalyserNode maps 70 dB range across 0–255.
 * 3 dB/sec → 3 × (255 / 70) ≈ 10.93 values/sec.
 */
const PEAK_DECAY_RATE = (255 * 3) / 70;

/** Number of horizontal dB grid lines (70 dB / 10 dB steps). */
const DB_GRID_STEPS = 7;

// ── Margins ───────────────────────────────────────────────────────────

interface PlotMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const MARGINS: PlotMargins = { left: 30, right: 10, top: 10, bottom: 25 };

// ── Pure helper functions (exported for testing) ──────────────────────

/**
 * Aggregate linear FFT bins into logarithmically-spaced visual bars.
 *
 * Each visual bar covers a frequency range that grows exponentially,
 * giving a perceptually uniform distribution across the spectrum.
 */
export function computeLogBins(
  fftData: Uint8Array,
  binCount: number,
  fftSize: number,
  sampleRate: number,
): number[] {
  return computeLogBinsInto(
    fftData,
    binCount,
    fftSize,
    sampleRate,
    new Array<number>(binCount),
  );
}

/**
 * Same as computeLogBins, but writes into a pre-allocated output array
 * to avoid per-frame allocation.
 */
export function computeLogBinsInto(
  fftData: Uint8Array,
  binCount: number,
  fftSize: number,
  sampleRate: number,
  out: number[],
): number[] {
  const nyquist = sampleRate / 2;
  const maxFreq = Math.min(nyquist, MAX_FREQUENCY);
  const logMin = Math.log10(MIN_FREQUENCY);
  const logRange = Math.log10(maxFreq) - logMin;
  const numFftBins = fftSize / 2;

  for (let i = 0; i < binCount; i++) {
    const startFreq = 10 ** (logMin + (i / binCount) * logRange);
    const endFreq = 10 ** (logMin + ((i + 1) / binCount) * logRange);

    const startBin = Math.max(
      0,
      Math.floor((startFreq * fftSize) / sampleRate),
    );
    const endBin = Math.min(
      numFftBins - 1,
      Math.floor((endFreq * fftSize) / sampleRate),
    );

    if (startBin > endBin || startBin >= numFftBins) {
      out[i] = 0;
      continue;
    }

    let sum = 0;
    let count = 0;
    for (let bin = startBin; bin <= endBin; bin++) {
      sum += fftData[bin];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }

  return out;
}

/**
 * Update peak-hold values with decay. Peaks track the highest recent
 * value per bar and decay at the given rate (byte-values per second).
 */
export function updatePeaks(
  peaks: number[],
  values: number[],
  deltaTime: number,
  decayRate: number,
): void {
  for (let i = 0; i < values.length; i++) {
    if (i >= peaks.length) {
      peaks.push(values[i]);
    } else if (values[i] > peaks[i]) {
      peaks[i] = values[i];
    } else {
      peaks[i] = Math.max(0, peaks[i] - decayRate * deltaTime);
    }
  }
  // Trim if the values array shrank (e.g. mode or fftSize change)
  peaks.length = values.length;
}

// ── Renderer ──────────────────────────────────────────────────────────

export class SpectrumRenderer implements VisualizationRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private peaks: number[] = [];
  private isMobile = false;

  // Cached log bins array (reused across frames)
  private cachedLogBins: number[] = [];
  private cachedBinCount = 0;

  // Theme colors
  private accentColor = '#8b5cf6';
  private labelColor = 'rgba(237, 237, 240, 0.4)';
  private gridColor = 'rgba(255, 255, 255, 0.06)';
  private barGradient: CanvasGradient | null = null;
  private fillGradient: CanvasGradient | null = null;

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
    this.readThemeColors();
  }

  draw(data: AudioVisualizationData, deltaTime: number): void {
    const ctx = this.ctx;
    if (!ctx || !data.analyserData || data.analyserData.length === 0) return;

    const mode = data.spectrumSettings?.mode ?? 'bars';

    ctx.clearRect(0, 0, this.width, this.height);

    const fftData = data.analyserData;
    const fftSize = fftData.length * 2;

    const barWidth = this.isMobile ? MOBILE_BAR_WIDTH : BAR_WIDTH;
    const gap = this.isMobile ? MOBILE_BAR_GAP : BAR_GAP;
    const plotWidth = this.width - MARGINS.left - MARGINS.right;
    const plotHeight = this.height - MARGINS.top - MARGINS.bottom;

    if (plotWidth <= 0 || plotHeight <= 0) return;

    const binCount =
      mode === 'bars'
        ? Math.floor(plotWidth / (barWidth + gap))
        : Math.max(32, Math.floor(plotWidth / 4));

    if (this.cachedBinCount !== binCount) {
      this.cachedLogBins = new Array<number>(binCount);
      this.cachedBinCount = binCount;
    }
    const values = computeLogBinsInto(
      fftData,
      binCount,
      fftSize,
      SAMPLE_RATE,
      this.cachedLogBins,
    );

    // Peak hold (desktop only)
    if (!this.isMobile) {
      updatePeaks(this.peaks, values, deltaTime, PEAK_DECAY_RATE);
    }

    // Grid
    this.drawGrid(ctx, plotWidth, plotHeight);

    // Data
    switch (mode) {
      case 'bars':
        this.drawBars(ctx, values, plotWidth, plotHeight, barWidth, gap);
        break;
      case 'line':
        this.drawCurve(ctx, values, plotWidth, plotHeight, false);
        break;
      case 'filled':
        this.drawCurve(ctx, values, plotWidth, plotHeight, true);
        break;
    }

    // Peak indicators (desktop only)
    if (!this.isMobile && this.peaks.length > 0) {
      this.drawPeaks(
        ctx,
        plotWidth,
        plotHeight,
        mode === 'bars' ? barWidth : 0,
        mode === 'bars' ? gap : 0,
      );
    }
  }

  resize(width: number, height: number, _dpr: number): void {
    this.width = width;
    this.height = height;
    this.isMobile = width < MOBILE_BREAKPOINT;
    this.peaks = [];
    this.rebuildGradients();
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
    this.peaks = [];
    this.barGradient = null;
    this.fillGradient = null;
  }

  // ── Private helpers ───────────────────────────────────────────────

  private readThemeColors(): void {
    if (!this.canvas) return;
    this.accentColor = getCssColor(
      this.canvas,
      '--spc-color-accent',
      '#8b5cf6',
    );
    const textColor = getCssColor(this.canvas, '--spc-color-text', '#ededf0');

    // Light text → dark theme → white grid; dark text → light theme → black grid
    const isLight = isLightColor(textColor);
    this.gridColor = isLight
      ? 'rgba(255, 255, 255, 0.06)'
      : 'rgba(0, 0, 0, 0.06)';
    this.labelColor = isLight
      ? 'rgba(237, 237, 240, 0.4)'
      : 'rgba(14, 14, 22, 0.4)';
  }

  private rebuildGradients(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const plotHeight = this.height - MARGINS.top - MARGINS.bottom;
    if (plotHeight <= 0) return;

    // Bar gradient: muted at bottom → accent at top
    this.barGradient = ctx.createLinearGradient(
      0,
      MARGINS.top + plotHeight,
      0,
      MARGINS.top,
    );
    this.barGradient.addColorStop(0, hexToRgba(this.accentColor, 0.3));
    this.barGradient.addColorStop(1, this.accentColor);

    // Fill gradient: accent at top → transparent at bottom
    this.fillGradient = ctx.createLinearGradient(
      0,
      MARGINS.top,
      0,
      MARGINS.top + plotHeight,
    );
    this.fillGradient.addColorStop(0, hexToRgba(this.accentColor, 0.6));
    this.fillGradient.addColorStop(1, hexToRgba(this.accentColor, 0.0));
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    plotWidth: number,
    plotHeight: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1;

    // Horizontal dB grid lines
    for (let i = 1; i < DB_GRID_STEPS; i++) {
      const y = MARGINS.top + (i / DB_GRID_STEPS) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(MARGINS.left, y);
      ctx.lineTo(MARGINS.left + plotWidth, y);
      ctx.stroke();
    }

    // Vertical frequency lines + labels
    const logMin = Math.log10(MIN_FREQUENCY);
    const logRange =
      Math.log10(Math.min(SAMPLE_RATE / 2, MAX_FREQUENCY)) - logMin;

    ctx.font = `${LABEL_FONT_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = this.labelColor;

    for (let i = 0; i < GRID_FREQUENCIES.length; i++) {
      const x =
        MARGINS.left +
        ((Math.log10(GRID_FREQUENCIES[i]) - logMin) / logRange) * plotWidth;

      if (x >= MARGINS.left && x <= MARGINS.left + plotWidth) {
        ctx.beginPath();
        ctx.moveTo(x, MARGINS.top);
        ctx.lineTo(x, MARGINS.top + plotHeight);
        ctx.stroke();

        ctx.fillText(GRID_FREQUENCY_LABELS[i], x, MARGINS.top + plotHeight + 5);
      }
    }

    ctx.restore();
  }

  private drawBars(
    ctx: CanvasRenderingContext2D,
    values: number[],
    _plotWidth: number,
    plotHeight: number,
    barWidth: number,
    gap: number,
  ): void {
    ctx.save();
    ctx.fillStyle = this.barGradient ?? this.accentColor;

    for (let i = 0; i < values.length; i++) {
      const normalized = values[i] / 255;
      const barHeight = normalized * plotHeight;
      const x = MARGINS.left + i * (barWidth + gap);
      const y = MARGINS.top + plotHeight - barHeight;

      if (barHeight > 0) {
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    }

    ctx.restore();
  }

  private drawCurve(
    ctx: CanvasRenderingContext2D,
    values: number[],
    plotWidth: number,
    plotHeight: number,
    fill: boolean,
  ): void {
    if (values.length < 2) return;

    const stepX = plotWidth / (values.length - 1);

    const getY = (i: number): number =>
      MARGINS.top + plotHeight - (values[i] / 255) * plotHeight;
    const getX = (i: number): number => MARGINS.left + i * stepX;

    // Build smooth curve using quadratic bezier midpoint technique
    ctx.save();
    ctx.beginPath();

    const firstX = getX(0);
    const firstY = getY(0);
    ctx.moveTo(firstX, firstY);

    if (values.length === 2) {
      ctx.lineTo(getX(1), getY(1));
    } else {
      // Line to midpoint of first two points
      ctx.lineTo((firstX + getX(1)) / 2, (firstY + getY(1)) / 2);

      // Middle segments: quadratic bezier through data-point control points
      for (let i = 1; i < values.length - 1; i++) {
        const cx = getX(i);
        const cy = getY(i);
        const nextMidX = (cx + getX(i + 1)) / 2;
        const nextMidY = (cy + getY(i + 1)) / 2;
        ctx.quadraticCurveTo(cx, cy, nextMidX, nextMidY);
      }

      // Final segment to last point
      ctx.lineTo(getX(values.length - 1), getY(values.length - 1));
    }

    if (fill) {
      // Close the area under the curve
      const lastX = getX(values.length - 1);
      ctx.lineTo(lastX, MARGINS.top + plotHeight);
      ctx.lineTo(firstX, MARGINS.top + plotHeight);
      ctx.closePath();
      ctx.fillStyle = this.fillGradient ?? hexToRgba(this.accentColor, 0.3);
      ctx.fill();

      // Re-trace the curve to stroke on top of the fill
      ctx.beginPath();
      ctx.moveTo(firstX, firstY);
      if (values.length === 2) {
        ctx.lineTo(getX(1), getY(1));
      } else {
        ctx.lineTo((firstX + getX(1)) / 2, (firstY + getY(1)) / 2);
        for (let i = 1; i < values.length - 1; i++) {
          const cx = getX(i);
          const cy = getY(i);
          const nextMidX = (cx + getX(i + 1)) / 2;
          const nextMidY = (cy + getY(i + 1)) / 2;
          ctx.quadraticCurveTo(cx, cy, nextMidX, nextMidY);
        }
        ctx.lineTo(getX(values.length - 1), getY(values.length - 1));
      }
    }

    ctx.strokeStyle = this.accentColor;
    ctx.lineWidth = LINE_WIDTH;
    ctx.stroke();
    ctx.restore();
  }

  private drawPeaks(
    ctx: CanvasRenderingContext2D,
    plotWidth: number,
    plotHeight: number,
    barWidth: number,
    gap: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = this.accentColor;
    ctx.lineWidth = 1;

    if (barWidth > 0) {
      // Bars mode: horizontal line across each bar
      for (let i = 0; i < this.peaks.length; i++) {
        const normalized = this.peaks[i] / 255;
        if (normalized <= 0) continue;
        const peakY = MARGINS.top + plotHeight - normalized * plotHeight;
        const x = MARGINS.left + i * (barWidth + gap);
        ctx.beginPath();
        ctx.moveTo(x, peakY);
        ctx.lineTo(x + barWidth, peakY);
        ctx.stroke();
      }
    } else {
      // Line/filled mode: small horizontal ticks
      const stepX = plotWidth / (this.peaks.length - 1);
      for (let i = 0; i < this.peaks.length; i++) {
        const normalized = this.peaks[i] / 255;
        if (normalized <= 0) continue;
        const peakY = MARGINS.top + plotHeight - normalized * plotHeight;
        const x = MARGINS.left + i * stepX;
        ctx.beginPath();
        ctx.moveTo(x - 2, peakY);
        ctx.lineTo(x + 2, peakY);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

// ── Module-level utilities ────────────────────────────────────────────

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
