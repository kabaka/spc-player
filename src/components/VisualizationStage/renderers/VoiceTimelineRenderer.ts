import type { HighContrastColors } from '@/utils/high-contrast';
import { getHighContrast } from '@/utils/high-contrast';
import { VOICE_COLORS } from '@/utils/voice-colors';

import type { AudioVisualizationData, VisualizationRenderer } from '../types';

// ── Constants ─────────────────────────────────────────────────────────

const SNES_SAMPLE_RATE = 32000;
const VOICE_COUNT = 8;
const DESKTOP_TIME_WINDOW_S = 5;
const MOBILE_TIME_WINDOW_S = 3;
const MOBILE_BREAKPOINT_PX = 768;
const MUTED_ALPHA = 0.3;
const GRID_ALPHA = 0.06;
const LABEL_MARGIN_PX = 28;
const LABEL_FONT = '10px monospace';
const LABEL_ALPHA = 0.4;
const LANE_GAP_PX = 1;
const BG_COLOR = '#161622';
const MIN_BAR_ALPHA = 0.15;

// ── ActivityEntry ─────────────────────────────────────────────────────

export interface ActivityEntry {
  voiceIndex: number;
  startTime: number;
  endTime: number | null;
}

// ── Renderer ──────────────────────────────────────────────────────────

export class VoiceTimelineRenderer implements VisualizationRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private isMobile = false;

  // Activity history per voice
  private activityHistory: ActivityEntry[][] = Array.from(
    { length: VOICE_COUNT },
    () => [],
  );
  private activeEntries: (ActivityEntry | null)[] =
    new Array<ActivityEntry | null>(VOICE_COUNT).fill(null);

  // Canvas shift optimization state
  private lastDrawTime = -1;
  private lastGeneration = -1;
  private lastPositionTime = 0;
  private needsFullRedraw = true;
  private hcColors: HighContrastColors | null = null;

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(data: AudioVisualizationData, _deltaTime: number): void {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) return;

    this.hcColors = getHighContrast();
    const currentTime = data.positionSamples / SNES_SAMPLE_RATE;
    const timeWindow = this.isMobile
      ? MOBILE_TIME_WINDOW_S
      : DESKTOP_TIME_WINDOW_S;
    const showLabels = !this.isMobile;
    const leftMargin = showLabels ? LABEL_MARGIN_PX : 0;
    const drawWidth = this.width - leftMargin;
    if (drawWidth <= 0) return;

    // Detect playback restart (position jumped backward significantly)
    if (currentTime < this.lastPositionTime - 0.5) {
      this.clearHistory();
      this.needsFullRedraw = true;
    }

    // Generation change means new track loaded
    if (data.generation !== this.lastGeneration) {
      this.needsFullRedraw = true;
      this.lastGeneration = data.generation;
    }

    this.updateActivity(data, currentTime);
    this.purgeOldEntries(currentTime - timeWindow);

    const viewStart = currentTime - timeWindow;
    const pixelsPerSecond = drawWidth / timeWindow;
    const laneHeight = this.height / VOICE_COUNT;

    const timeDelta = currentTime - this.lastDrawTime;
    const scrollPixels = timeDelta * pixelsPerSecond;

    const canShift =
      !this.needsFullRedraw &&
      this.lastDrawTime >= 0 &&
      scrollPixels > 0 &&
      scrollPixels < drawWidth;

    if (canShift) {
      this.drawIncremental(
        ctx,
        data,
        leftMargin,
        drawWidth,
        viewStart,
        timeWindow,
        currentTime,
        laneHeight,
        showLabels,
        scrollPixels,
      );
    } else {
      this.drawFull(
        ctx,
        data,
        leftMargin,
        drawWidth,
        viewStart,
        timeWindow,
        currentTime,
        laneHeight,
        showLabels,
      );
    }

    this.lastPositionTime = currentTime;
    this.lastDrawTime = currentTime;
    this.needsFullRedraw = false;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.isMobile =
      typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;
    this.needsFullRedraw = true;
  }

  dispose(): void {
    this.activityHistory = Array.from({ length: VOICE_COUNT }, () => []);
    this.activeEntries = new Array<ActivityEntry | null>(VOICE_COUNT).fill(
      null,
    );
    this.lastDrawTime = -1;
    this.lastGeneration = -1;
    this.lastPositionTime = 0;
    this.needsFullRedraw = true;
  }

  // ── Activity tracking ───────────────────────────────────────────

  private updateActivity(
    data: AudioVisualizationData,
    currentTime: number,
  ): void {
    for (let i = 0; i < VOICE_COUNT; i++) {
      const voice = data.voices[i];
      const isActive = voice?.active && voice.envelopeLevel > 0;

      if (isActive) {
        if (!this.activeEntries[i]) {
          this.activeEntries[i] = {
            voiceIndex: i,
            startTime: currentTime,
            endTime: null,
          };
        }
      } else {
        this.closeEntry(i, currentTime);
      }
    }
  }

  private closeEntry(voiceIndex: number, time: number): void {
    const entry = this.activeEntries[voiceIndex];
    if (entry) {
      entry.endTime = time;
      this.activityHistory[voiceIndex].push(entry);
      this.activeEntries[voiceIndex] = null;
    }
  }

  private purgeOldEntries(cutoff: number): void {
    for (let i = 0; i < VOICE_COUNT; i++) {
      const arr = this.activityHistory[i];
      let write = 0;
      for (const entry of arr) {
        const end = entry.endTime;
        if (end === null || end > cutoff) {
          arr[write++] = entry;
        }
      }
      arr.length = write;
    }
  }

  private clearHistory(): void {
    for (let i = 0; i < VOICE_COUNT; i++) {
      this.activityHistory[i] = [];
      this.activeEntries[i] = null;
    }
  }

  // ── Full / incremental draw ─────────────────────────────────────

  private drawFull(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    laneHeight: number,
    showLabels: boolean,
  ): void {
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.hcColors?.background ?? BG_COLOR;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawGrid(
      ctx,
      left,
      drawW,
      viewStart,
      timeWindow,
      laneHeight,
      showLabels,
    );
    this.drawAllBars(
      ctx,
      data,
      left,
      drawW,
      viewStart,
      timeWindow,
      currentTime,
      laneHeight,
    );
  }

  private drawIncremental(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    laneHeight: number,
    showLabels: boolean,
    scrollPixels: number,
  ): void {
    // Shift existing content left
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(
      this.canvas,
      Math.round(scrollPixels * this.dpr),
      0,
      Math.round((this.width - scrollPixels) * this.dpr),
      Math.round(this.height * this.dpr),
      0,
      0,
      Math.round((this.width - scrollPixels) * this.dpr),
      Math.round(this.height * this.dpr),
    );
    ctx.restore();

    // Clear the newly exposed strip (right edge)
    const stripX = this.width - scrollPixels;
    const bgColor = this.hcColors?.background ?? BG_COLOR;
    ctx.clearRect(stripX, 0, scrollPixels, this.height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(stripX, 0, scrollPixels, this.height);

    // Clear label margin for clean redraw
    if (showLabels && left > 0) {
      ctx.clearRect(0, 0, left, this.height);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, left, this.height);
    }

    this.drawGrid(
      ctx,
      left,
      drawW,
      viewStart,
      timeWindow,
      laneHeight,
      showLabels,
    );

    // Draw bars that overlap the new strip
    const stripTimeStart = viewStart + ((stripX - left) / drawW) * timeWindow;
    const stripTimeEnd = viewStart + timeWindow;
    this.drawBarsInTimeRange(
      ctx,
      data,
      left,
      drawW,
      viewStart,
      timeWindow,
      currentTime,
      laneHeight,
      stripTimeStart,
      stripTimeEnd,
    );
  }

  // ── Grid drawing ────────────────────────────────────────────────

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    laneHeight: number,
    showLabels: boolean,
  ): void {
    const hc = this.hcColors;
    ctx.strokeStyle = hc ? hc.buttonText : `rgba(255, 255, 255, ${GRID_ALPHA})`;
    ctx.lineWidth = 1;

    // Horizontal lane dividers
    for (let i = 1; i < VOICE_COUNT; i++) {
      const y = i * laneHeight;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // Voice labels
    if (showLabels && left > 0) {
      ctx.fillStyle = hc ? hc.text : `rgba(255, 255, 255, ${LABEL_ALPHA})`;
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < VOICE_COUNT; i++) {
        const y = i * laneHeight + laneHeight / 2;
        ctx.fillText(`V${i + 1}`, left - 4, y);
      }
    }

    // Vertical lines at 1-second intervals
    const firstSec = Math.ceil(viewStart);
    const endTime = viewStart + timeWindow;
    for (let t = firstSec; t <= endTime; t++) {
      const x = left + ((t - viewStart) / timeWindow) * drawW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
  }

  // ── Bar drawing ─────────────────────────────────────────────────

  private drawAllBars(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    laneHeight: number,
  ): void {
    const mutedVoices = data.mutedVoices;

    for (let i = 0; i < VOICE_COUNT; i++) {
      const color = VOICE_COLORS[i];
      const muted = mutedVoices?.[i] ?? false;
      const voice = data.voices[i];

      for (const entry of this.activityHistory[i]) {
        this.drawBar(
          ctx,
          entry,
          color,
          muted,
          1, // completed entries use full envelope
          i,
          left,
          drawW,
          viewStart,
          timeWindow,
          currentTime,
          laneHeight,
        );
      }

      const active = this.activeEntries[i];
      if (active) {
        const envelopeLevel = voice?.envelopeLevel ?? 1;
        this.drawBar(
          ctx,
          active,
          color,
          muted,
          envelopeLevel,
          i,
          left,
          drawW,
          viewStart,
          timeWindow,
          currentTime,
          laneHeight,
        );
      }
    }
  }

  private drawBarsInTimeRange(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    laneHeight: number,
    rangeStart: number,
    rangeEnd: number,
  ): void {
    const mutedVoices = data.mutedVoices;

    for (let i = 0; i < VOICE_COUNT; i++) {
      const color = VOICE_COLORS[i];
      const muted = mutedVoices?.[i] ?? false;
      const voice = data.voices[i];

      for (const entry of this.activityHistory[i]) {
        const end = entry.endTime ?? currentTime;
        if (end < rangeStart || entry.startTime > rangeEnd) continue;
        this.drawBar(
          ctx,
          entry,
          color,
          muted,
          1,
          i,
          left,
          drawW,
          viewStart,
          timeWindow,
          currentTime,
          laneHeight,
        );
      }

      const active = this.activeEntries[i];
      if (active) {
        const end = currentTime;
        if (end >= rangeStart && active.startTime <= rangeEnd) {
          const envelopeLevel = voice?.envelopeLevel ?? 1;
          this.drawBar(
            ctx,
            active,
            color,
            muted,
            envelopeLevel,
            i,
            left,
            drawW,
            viewStart,
            timeWindow,
            currentTime,
            laneHeight,
          );
        }
      }
    }
  }

  private drawBar(
    ctx: CanvasRenderingContext2D,
    entry: ActivityEntry,
    color: string,
    muted: boolean,
    envelopeLevel: number,
    voiceIndex: number,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    laneHeight: number,
  ): void {
    const end = entry.endTime ?? currentTime;
    const viewEnd = viewStart + timeWindow;
    if (end < viewStart || entry.startTime > viewEnd) return;

    const x1 =
      left + Math.max(0, ((entry.startTime - viewStart) / timeWindow) * drawW);
    const x2 = left + Math.min(drawW, ((end - viewStart) / timeWindow) * drawW);
    const w = Math.max(x2 - x1, 1);

    const laneY = voiceIndex * laneHeight + LANE_GAP_PX;
    const barHeight = laneHeight - LANE_GAP_PX * 2;
    if (barHeight <= 0) return;

    // Modulate alpha by envelope level
    const envelopeAlpha = MIN_BAR_ALPHA + (1 - MIN_BAR_ALPHA) * envelopeLevel;
    ctx.globalAlpha = muted ? MUTED_ALPHA : envelopeAlpha;
    ctx.fillStyle = this.hcColors?.highlight ?? color;
    ctx.fillRect(x1, laneY, w, barHeight);

    // In high contrast mode, add a border for clarity
    if (this.hcColors && w >= 3 && barHeight >= 3) {
      ctx.strokeStyle = this.hcColors.buttonText;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, laneY, w, barHeight);
    }

    ctx.globalAlpha = 1;
  }
}
