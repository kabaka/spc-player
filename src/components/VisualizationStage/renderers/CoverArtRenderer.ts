import { VOICE_COLORS } from '@/utils/voice-colors';

import type { AudioVisualizationData, VisualizationRenderer } from '../types';

// ── Helpers (extracted from CoverArt.tsx) ────────────────────────────

/**
 * Simple deterministic hash of a string to an unsigned 32-bit integer.
 * FNV-1a chosen for good distribution with short strings.
 */
export function hashTitle(title: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < title.length; i++) {
    hash ^= title.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

/** Map a game title to a voice color index (0–7). */
export function colorIndexFromTitle(title: string): number {
  return hashTitle(title) % VOICE_COLORS.length;
}

function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f + 255 * amount)}, ${Math.round(g * f + 255 * amount)}, ${Math.round(b * f + 255 * amount)})`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  ctx.font = `${fontSize}px monospace`;
  const words = text.split(/\s+/);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const test = current + ' ' + words[i];
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

// ── Renderer ─────────────────────────────────────────────────────────

/**
 * Renders a procedurally generated SNES cartridge placeholder on the
 * shared VisualizationStage canvas. Only redraws when the title or
 * canvas dimensions change.
 */
export class CoverArtRenderer implements VisualizationRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastTitle: string | null = null;

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(data: AudioVisualizationData, _deltaTime: number): void {
    const title = data.title ?? '';

    // Only redraw when title changes
    if (title === this.lastTitle) return;
    this.lastTitle = title;

    this.render(title);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    // Redraw at new size
    if (this.lastTitle !== null) {
      this.render(this.lastTitle);
    }
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
    this.lastTitle = null;
  }

  private render(title: string): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    if (!title) {
      // No title — draw a neutral placeholder
      ctx.fillStyle = '#161622';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9999b0';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Track Loaded', w / 2, h / 2);
      return;
    }

    const isDark = this.detectTheme();
    this.drawCartridge(ctx, w, h, title, isDark);
  }

  private detectTheme(): boolean {
    const themeAttr = document.documentElement.getAttribute('data-theme');
    if (themeAttr === 'light') return false;
    if (themeAttr === 'dark') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private drawCartridge(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    title: string,
    isDark: boolean,
  ): void {
    const dpr = this.dpr;
    const colorIdx = colorIndexFromTitle(title);
    const primaryColor = VOICE_COLORS[colorIdx];

    const pad = Math.round(w * 0.08);
    const bodyX = pad;
    const bodyY = pad;
    const bodyW = w - pad * 2;
    const bodyH = h - pad * 2;
    const bodyR = Math.round(w * 0.04);

    // Cartridge body
    const bodyColor = isDark
      ? darkenHex(primaryColor, 0.65)
      : lightenHex(primaryColor, 0.75);
    roundedRect(ctx, bodyX, bodyY, bodyW, bodyH, bodyR);
    ctx.fillStyle = bodyColor;
    ctx.fill();

    ctx.strokeStyle = isDark
      ? darkenHex(primaryColor, 0.4)
      : lightenHex(primaryColor, 0.5);
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();

    // Label area (upper 55%)
    const labelPad = Math.round(bodyW * 0.08);
    const labelX = bodyX + labelPad;
    const labelY = bodyY + labelPad;
    const labelW = bodyW - labelPad * 2;
    const labelH = Math.round(bodyH * 0.55);
    const labelR = Math.round(w * 0.02);

    const labelColor = isDark
      ? darkenHex(primaryColor, 0.35)
      : lightenHex(primaryColor, 0.45);
    roundedRect(ctx, labelX, labelY, labelW, labelH, labelR);
    ctx.fillStyle = labelColor;
    ctx.fill();

    ctx.strokeStyle = isDark
      ? darkenHex(primaryColor, 0.2)
      : lightenHex(primaryColor, 0.25);
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();

    // Connector pins at bottom
    const pinAreaY = bodyY + bodyH - Math.round(bodyH * 0.1);
    const pinH = Math.round(bodyH * 0.04);
    const pinCount = 8;
    const pinGap = Math.round(labelW / (pinCount * 2 + 1));
    const pinW = pinGap;
    const pinsStartX = labelX + pinGap;

    ctx.fillStyle = isDark
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.12)';
    for (let i = 0; i < pinCount; i++) {
      const px = pinsStartX + i * pinGap * 2;
      ctx.fillRect(px, pinAreaY, pinW, pinH);
    }

    // Title text
    if (title) {
      const textColor = isDark
        ? lightenHex(primaryColor, 0.6)
        : darkenHex(primaryColor, 0.55);

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const maxTextW = labelW - labelPad * 2;
      const maxTextH = labelH - labelPad * 2;
      let fontSize = Math.round(maxTextH * 0.35);
      const minFontSize = Math.round(6 * dpr);
      ctx.font = `${fontSize}px monospace`;

      while (fontSize > minFontSize) {
        ctx.font = `${fontSize}px monospace`;
        const wrapped = wrapText(ctx, title, maxTextW, fontSize);
        const totalTextH = wrapped.length * fontSize * 1.3;
        const widthFits = wrapped.every(
          (line) => ctx.measureText(line).width <= maxTextW,
        );
        if (widthFits && totalTextH <= maxTextH) break;
        fontSize -= Math.max(1, Math.round(dpr));
      }

      const finalLines = wrapText(ctx, title, maxTextW, fontSize);
      const lineHeight = fontSize * 1.3;
      const totalH = finalLines.length * lineHeight;
      const startY = labelY + labelH / 2 - totalH / 2 + lineHeight / 2;

      for (let i = 0; i < finalLines.length; i++) {
        ctx.fillText(
          finalLines[i],
          labelX + labelW / 2,
          startY + i * lineHeight,
        );
      }
    }

    // "SUPER NINTENDO" branding
    const brandFontSize = Math.max(Math.round(w * 0.035), Math.round(4 * dpr));
    ctx.font = `${brandFontSize}px monospace`;
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      'SUPER NINTENDO',
      bodyX + bodyW / 2,
      labelY + labelH + Math.round(bodyH * 0.04),
    );
  }
}
