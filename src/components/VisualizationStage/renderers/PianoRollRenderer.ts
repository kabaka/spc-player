import type { HighContrastColors } from '@/utils/high-contrast';
import { getHighContrast } from '@/utils/high-contrast';
import { VOICE_COLORS } from '@/utils/voice-colors';

import type { AudioVisualizationData, VisualizationRenderer } from '../types';

// ── Constants ─────────────────────────────────────────────────────────

const SNES_SAMPLE_RATE = 32000;
const VOICE_COUNT = 8;
const DESKTOP_TIME_WINDOW_S = 3;
const MOBILE_TIME_WINDOW_S = 2;
const MOBILE_BREAKPOINT_PX = 768;
const NOTE_GAP_PX = 1;
const MUTED_ALPHA = 0.3;
const INACTIVE_NOTE_ALPHA = 0.7;
const AUTO_RANGE_EXPAND_LERP = 0.25;
const AUTO_RANGE_CONTRACT_LERP = 0.08;
const AUTO_RANGE_PAD = 4;
const MIN_VISIBLE_SPAN = 24;
const MAX_VISIBLE_SPAN = 96;
const DEFAULT_MIN_NOTE = 24;
const DEFAULT_MAX_NOTE = 84;
const GRID_ALPHA = 0.06;
const LABEL_MARGIN_PX = 32;
const LABEL_FONT = '10px monospace';
const LABEL_ALPHA = 0.4;
const BG_COLOR = '#161622';

// ── Pitch conversion (exported for testing) ───────────────────────────

/**
 * Convert frequency in Hz to a MIDI note number (continuous).
 * Returns 0 for non-positive frequencies.
 */
export function frequencyToMidiNote(frequency: number): number {
  if (frequency <= 0) return 0;
  return 12 * Math.log2(frequency / 440) + 69;
}

/**
 * Map SPC700 VxPITCH register to relative MIDI note.
 * 0x1000 (unity playback rate) → C4 (MIDI 60).
 * Relative pitch relationships are exact; absolute note names
 * are approximate since the BRR sample's recorded pitch is unknown.
 */
export function pitchToMidiNote(rawPitch: number): number {
  if (rawPitch <= 0) return 0;
  return 12 * Math.log2(rawPitch / 0x1000) + 60;
}

// ── Note name helper ──────────────────────────────────────────────────

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

function midiNoteToLabel(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[note % 12]}${octave}`;
}

// ── NoteEntry ─────────────────────────────────────────────────────────

export interface NoteEntry {
  voiceIndex: number;
  midiNote: number;
  startTime: number;
  endTime: number | null;
}

// ── Renderer ──────────────────────────────────────────────────────────

export class PianoRollRenderer implements VisualizationRenderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private isMobile = false;

  private noteHistory: NoteEntry[][] = Array.from(
    { length: VOICE_COUNT },
    () => [],
  );
  private activeNotes: (NoteEntry | null)[] = new Array<NoteEntry | null>(
    VOICE_COUNT,
  ).fill(null);

  private visibleMinNote = DEFAULT_MIN_NOTE;
  private visibleMaxNote = DEFAULT_MAX_NOTE;
  private targetMinNote = DEFAULT_MIN_NOTE;
  private targetMaxNote = DEFAULT_MAX_NOTE;

  private lastPositionTime = 0;

  // Canvas shift optimization state
  private lastDrawTime = -1;
  private lastGeneration = -1;
  private lastVisibleMinNote = DEFAULT_MIN_NOTE;
  private lastVisibleMaxNote = DEFAULT_MAX_NOTE;
  private needsFullRedraw = true;
  private hcColors: HighContrastColors | null = null;

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(data: AudioVisualizationData, deltaTime: number): void {
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

    this.updateNotes(data, currentTime);
    this.purgeOldNotes(currentTime - timeWindow);
    this.updateAutoRange(deltaTime);

    const noteRange = this.visibleMaxNote - this.visibleMinNote;
    if (noteRange <= 0) return;
    const semitoneH = this.height / noteRange;
    const viewStart = currentTime - timeWindow;
    const pixelsPerSecond = drawWidth / timeWindow;

    // Detect range change — auto-range lerp invalidates the canvas
    const rangeShifted =
      Math.abs(this.visibleMinNote - this.lastVisibleMinNote) > 0.01 ||
      Math.abs(this.visibleMaxNote - this.lastVisibleMaxNote) > 0.01;

    const timeDelta = currentTime - this.lastDrawTime;
    const scrollPixels = timeDelta * pixelsPerSecond;

    const canShift =
      !this.needsFullRedraw &&
      !rangeShifted &&
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
        noteRange,
        semitoneH,
        showLabels,
        scrollPixels,
        pixelsPerSecond,
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
        noteRange,
        semitoneH,
        showLabels,
      );
    }

    this.lastPositionTime = currentTime;
    this.lastDrawTime = currentTime;
    this.lastVisibleMinNote = this.visibleMinNote;
    this.lastVisibleMaxNote = this.visibleMaxNote;
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
    this.noteHistory = Array.from({ length: VOICE_COUNT }, () => []);
    this.activeNotes = new Array<NoteEntry | null>(VOICE_COUNT).fill(null);
    this.visibleMinNote = DEFAULT_MIN_NOTE;
    this.visibleMaxNote = DEFAULT_MAX_NOTE;
    this.targetMinNote = DEFAULT_MIN_NOTE;
    this.targetMaxNote = DEFAULT_MAX_NOTE;
    this.lastPositionTime = 0;
    this.lastDrawTime = -1;
    this.lastGeneration = -1;
    this.lastVisibleMinNote = DEFAULT_MIN_NOTE;
    this.lastVisibleMaxNote = DEFAULT_MAX_NOTE;
    this.needsFullRedraw = true;
  }

  /** Current visible pitch range (exposed for testing/debugging). */
  getVisibleRange(): { min: number; max: number } {
    return { min: this.visibleMinNote, max: this.visibleMaxNote };
  }

  // ── Note tracking ───────────────────────────────────────────────

  private updateNotes(data: AudioVisualizationData, currentTime: number): void {
    for (let i = 0; i < VOICE_COUNT; i++) {
      const voice = data.voices[i];
      // keyOn is a momentary DSP trigger (~31μs), not a sustained state indicator
      const isPlaying = voice?.active && voice.pitch > 0;

      if (isPlaying) {
        const midiNote = Math.round(pitchToMidiNote(voice.pitch));
        if (midiNote < 0 || midiNote > 127) {
          this.closeNote(i, currentTime);
          continue;
        }

        const active = this.activeNotes[i];
        if (!active || active.midiNote !== midiNote) {
          this.closeNote(i, currentTime);
          this.activeNotes[i] = {
            voiceIndex: i,
            midiNote,
            startTime: currentTime,
            endTime: null,
          };
        }
      } else {
        this.closeNote(i, currentTime);
      }
    }
  }

  private closeNote(voiceIndex: number, time: number): void {
    const note = this.activeNotes[voiceIndex];
    if (note) {
      note.endTime = time;
      this.noteHistory[voiceIndex].push(note);
      this.activeNotes[voiceIndex] = null;
    }
  }

  // ── Auto-range ──────────────────────────────────────────────────

  private updateAutoRange(deltaTime: number): void {
    let min = 127;
    let max = 0;
    let found = false;

    for (let i = 0; i < VOICE_COUNT; i++) {
      const active = this.activeNotes[i];
      if (active) {
        min = Math.min(min, active.midiNote);
        max = Math.max(max, active.midiNote);
        found = true;
      }
      for (const n of this.noteHistory[i]) {
        min = Math.min(min, n.midiNote);
        max = Math.max(max, n.midiNote);
        found = true;
      }
    }

    if (found) {
      const mid = (min + max) / 2;
      const rawSpan = max - min + AUTO_RANGE_PAD * 2;
      const clampedSpan = Math.max(
        MIN_VISIBLE_SPAN,
        Math.min(MAX_VISIBLE_SPAN, rawSpan),
      );
      this.targetMinNote = mid - clampedSpan / 2;
      this.targetMaxNote = mid + clampedSpan / 2;
    } else {
      this.targetMinNote = DEFAULT_MIN_NOTE;
      this.targetMaxNote = DEFAULT_MAX_NOTE;
    }

    this.targetMinNote = Math.max(0, this.targetMinNote);
    this.targetMaxNote = Math.min(127, this.targetMaxNote);

    // Smooth animation toward target — expand faster, contract slower
    // Frame-rate independent lerp: ensures consistent animation speed
    const minDelta = this.targetMinNote - this.visibleMinNote;
    const maxDelta = this.targetMaxNote - this.visibleMaxNote;
    const minBaseLerp =
      minDelta < 0 ? AUTO_RANGE_EXPAND_LERP : AUTO_RANGE_CONTRACT_LERP;
    const maxBaseLerp =
      maxDelta > 0 ? AUTO_RANGE_EXPAND_LERP : AUTO_RANGE_CONTRACT_LERP;
    const minLerp = 1 - Math.pow(1 - minBaseLerp, deltaTime * 60);
    const maxLerp = 1 - Math.pow(1 - maxBaseLerp, deltaTime * 60);
    this.visibleMinNote += minDelta * minLerp;
    this.visibleMaxNote += maxDelta * maxLerp;
  }

  private purgeOldNotes(cutoff: number): void {
    for (let i = 0; i < VOICE_COUNT; i++) {
      const arr = this.noteHistory[i];
      let write = 0;
      for (const note of arr) {
        const end = note.endTime;
        if (end === null || end > cutoff) {
          arr[write++] = note;
        }
      }
      arr.length = write;
    }
  }

  private clearHistory(): void {
    for (let i = 0; i < VOICE_COUNT; i++) {
      this.noteHistory[i] = [];
      this.activeNotes[i] = null;
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
    noteRange: number,
    semitoneH: number,
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
      noteRange,
      semitoneH,
      showLabels,
    );

    this.drawAllNotes(
      ctx,
      data,
      left,
      drawW,
      viewStart,
      timeWindow,
      currentTime,
      noteRange,
      semitoneH,
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
    noteRange: number,
    semitoneH: number,
    showLabels: boolean,
    scrollPixels: number,
    _pixelsPerSecond: number,
  ): void {
    // Save/restore so drawImage operates in device pixels correctly
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

    // Also clear the label margin so grid labels can be redrawn cleanly
    if (showLabels && left > 0) {
      ctx.clearRect(0, 0, left, this.height);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, left, this.height);
    }

    // Redraw grid (lines are thin; redrawing is cheap)
    this.drawGrid(
      ctx,
      left,
      drawW,
      viewStart,
      timeWindow,
      noteRange,
      semitoneH,
      showLabels,
    );

    // Draw only notes that overlap the new strip
    const stripTimeStart = viewStart + ((stripX - left) / drawW) * timeWindow;
    const stripTimeEnd = viewStart + timeWindow;

    this.drawNotesInTimeRange(
      ctx,
      data,
      left,
      drawW,
      viewStart,
      timeWindow,
      currentTime,
      noteRange,
      semitoneH,
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
    noteRange: number,
    semitoneH: number,
    showLabels: boolean,
  ): void {
    const hc = this.hcColors;
    ctx.strokeStyle = hc ? hc.buttonText : `rgba(255, 255, 255, ${GRID_ALPHA})`;
    ctx.lineWidth = 1;

    // Horizontal lines at octave boundaries (C notes)
    const firstC = Math.ceil(this.visibleMinNote / 12) * 12;
    for (let note = firstC; note <= this.visibleMaxNote; note += 12) {
      const y = this.noteToY(note, noteRange) + semitoneH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();

      if (showLabels && left > 0) {
        ctx.fillStyle = hc ? hc.text : `rgba(255, 255, 255, ${LABEL_ALPHA})`;
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(midiNoteToLabel(note), left - 4, y - semitoneH / 2);
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

  // ── Note drawing ────────────────────────────────────────────────

  private drawAllNotes(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    noteRange: number,
    semitoneH: number,
  ): void {
    const mutedVoices = data.mutedVoices;

    for (let i = 0; i < VOICE_COUNT; i++) {
      const color = VOICE_COLORS[i];
      const muted = mutedVoices?.[i] ?? false;

      for (const note of this.noteHistory[i]) {
        this.drawNoteBar(
          ctx,
          note,
          color,
          muted,
          false,
          left,
          drawW,
          viewStart,
          timeWindow,
          currentTime,
          noteRange,
          semitoneH,
        );
      }

      const active = this.activeNotes[i];
      if (active) {
        this.drawNoteBar(
          ctx,
          active,
          color,
          muted,
          true,
          left,
          drawW,
          viewStart,
          timeWindow,
          currentTime,
          noteRange,
          semitoneH,
        );
      }
    }
  }

  private drawNoteBar(
    ctx: CanvasRenderingContext2D,
    note: NoteEntry,
    color: string,
    muted: boolean,
    isActive: boolean,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    noteRange: number,
    semitoneH: number,
  ): void {
    const end = note.endTime ?? currentTime;
    const viewEnd = viewStart + timeWindow;
    if (end < viewStart || note.startTime > viewEnd) return;

    const x1 =
      left + Math.max(0, ((note.startTime - viewStart) / timeWindow) * drawW);
    const x2 = left + Math.min(drawW, ((end - viewStart) / timeWindow) * drawW);
    const w = Math.max(x2 - x1, isActive ? 2 : 0);
    if (w < 0.5) return;

    const y = this.noteToY(note.midiNote, noteRange);
    const h = Math.max(1, semitoneH - NOTE_GAP_PX);

    ctx.globalAlpha = muted ? MUTED_ALPHA : isActive ? 1 : INACTIVE_NOTE_ALPHA;

    const hc = this.hcColors;
    const fillColor = hc ? (isActive ? hc.highlight : hc.text) : color;

    // Glow for active notes (desktop only) — semi-transparent expanded rect
    if (isActive && !this.isMobile && !hc) {
      const glowAlpha = muted ? MUTED_ALPHA * 0.25 : 0.25;
      ctx.globalAlpha = glowAlpha;
      ctx.fillStyle = fillColor;
      ctx.fillRect(x1 - 1, y - 1, w + 2, h + 2);
      ctx.globalAlpha = muted ? MUTED_ALPHA : 1;
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(x1, y, w, h);

    // In high contrast mode, add a border for clarity
    if (hc && w >= 3 && h >= 3) {
      ctx.strokeStyle = hc.buttonText;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y, w, h);
    }

    ctx.globalAlpha = 1;
  }

  private drawNotesInTimeRange(
    ctx: CanvasRenderingContext2D,
    data: AudioVisualizationData,
    left: number,
    drawW: number,
    viewStart: number,
    timeWindow: number,
    currentTime: number,
    noteRange: number,
    semitoneH: number,
    stripStart: number,
    stripEnd: number,
  ): void {
    const mutedVoices = data.mutedVoices;

    for (let i = 0; i < VOICE_COUNT; i++) {
      const color = VOICE_COLORS[i];
      const muted = mutedVoices?.[i] ?? false;

      for (const note of this.noteHistory[i]) {
        const end = note.endTime ?? currentTime;
        if (end < stripStart || note.startTime > stripEnd) continue;
        this.drawNoteBar(
          ctx,
          note,
          color,
          muted,
          false,
          left,
          drawW,
          viewStart,
          timeWindow,
          currentTime,
          noteRange,
          semitoneH,
        );
      }

      const active = this.activeNotes[i];
      if (active) {
        const end = active.endTime ?? currentTime;
        if (!(end < stripStart || active.startTime > stripEnd)) {
          this.drawNoteBar(
            ctx,
            active,
            color,
            muted,
            true,
            left,
            drawW,
            viewStart,
            timeWindow,
            currentTime,
            noteRange,
            semitoneH,
          );
        }
      }
    }
  }

  private noteToY(midiNote: number, noteRange: number): number {
    // Higher notes at top (lower y), lower notes at bottom (higher y)
    return this.height * (1 - (midiNote - this.visibleMinNote + 1) / noteRange);
  }
}
