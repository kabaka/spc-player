import { extractXid6Art } from '@/core/xid6-art';
import { fetchRetroArchCoverArt } from '@/features/cover-art/cover-art-fetcher';
import { getCoverArt } from '@/features/cover-art/cover-art-storage';
import { loadSpcFromStorage } from '@/storage/spc-storage';
import { useAppStore } from '@/store/store';
import type { HighContrastColors } from '@/utils/high-contrast';
import { getHighContrast } from '@/utils/high-contrast';
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
 * Renders cover art on the shared VisualizationStage canvas.
 *
 * Art source priority:
 * 1. User-provided art (IndexedDB)
 * 2. xid6 embedded art (extracted from SPC data)
 * 3. RetroArch thumbnails (external, opt-in)
 * 4. Procedurally generated SNES cartridge placeholder
 */
export class CoverArtRenderer implements VisualizationRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastTitle: string | null = null;
  private lastCoverArtVersion = -1;

  /** Resolved cover art image, or null if using placeholder. */
  private resolvedImage: ImageBitmap | null = null;
  /** Whether an async resolution is in progress. */
  private isResolving = false;
  /** Title that the current resolution is for (to discard stale results). */
  private resolveForTitle: string | null = null;

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(data: AudioVisualizationData, _deltaTime: number): void {
    const title = data.title ?? '';
    const coverArtVersion = useAppStore.getState().coverArt.version;

    // Re-resolve when title changes or cover art version bumps (user upload)
    if (
      title !== this.lastTitle ||
      coverArtVersion !== this.lastCoverArtVersion
    ) {
      this.lastTitle = title;
      this.lastCoverArtVersion = coverArtVersion;
      this.resolvedImage?.close();
      this.resolvedImage = null;
      this.resolveForTitle = null;

      if (title) {
        this.startArtResolution(title);
      }

      this.render(title);
    }
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    if (this.lastTitle !== null) {
      this.render(this.lastTitle);
    }
  }

  dispose(): void {
    this.resolvedImage?.close();
    this.resolvedImage = null;
    this.canvas = null;
    this.ctx = null;
    this.lastTitle = null;
    this.resolveForTitle = null;
    this.isResolving = false;
  }

  // ── Art resolution pipeline ────────────────────────────────────

  private startArtResolution(title: string): void {
    this.isResolving = true;
    this.resolveForTitle = title;

    this.resolveArt(title)
      .then((image) => {
        // Discard if title changed while resolving
        if (this.resolveForTitle !== title) {
          image?.close();
          return;
        }
        this.isResolving = false;
        if (image) {
          this.resolvedImage = image;
          // Re-render with the resolved image
          this.render(title);
        }
      })
      .catch(() => {
        this.isResolving = false;
      });
  }

  private async resolveArt(title: string): Promise<ImageBitmap | null> {
    // 1. User-provided art (highest priority)
    const userArt = await getCoverArt(title);
    if (userArt) return this.createImageBitmap(userArt);

    // 2. xid6 embedded art
    const xid6Art = await this.extractEmbeddedArt();
    if (xid6Art) return this.createImageBitmap(xid6Art);

    // 3. RetroArch thumbnails (external, opt-in)
    const state = useAppStore.getState();
    const enabled = state.coverArt.externalFetchEnabled;
    const retroArt = await fetchRetroArchCoverArt(title, enabled);
    if (retroArt) return this.createImageBitmap(retroArt);

    return null;
  }

  private async extractEmbeddedArt(): Promise<Uint8Array | null> {
    const state = useAppStore.getState();
    const trackId = state.activeTrackId;
    if (!trackId) return null;

    const spcBuffer = await loadSpcFromStorage(trackId);
    if (!spcBuffer) return null;

    return extractXid6Art(new Uint8Array(spcBuffer));
  }

  private async createImageBitmap(
    data: Uint8Array,
  ): Promise<ImageBitmap | null> {
    try {
      const blob = new Blob([data.buffer as ArrayBuffer]);
      return await globalThis.createImageBitmap(blob);
    } catch {
      return null;
    }
  }

  // ── Rendering ──────────────────────────────────────────────────

  private render(title: string): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.width;
    const h = this.height;
    const hc = getHighContrast();

    ctx.clearRect(0, 0, w, h);

    if (!title) {
      ctx.fillStyle = hc?.background ?? '#161622';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = hc?.text ?? '#9999b0';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Track Loaded', w / 2, h / 2);
      return;
    }

    if (this.resolvedImage) {
      this.drawContainedImage(ctx, this.resolvedImage, w, h, hc);
      return;
    }

    if (hc) {
      this.drawCartridgeHighContrast(ctx, w, h, title, hc);
    } else {
      const isDark = this.detectTheme();
      this.drawCartridge(ctx, w, h, title, isDark);
    }

    // Show loading indicator if resolving
    if (this.isResolving) {
      ctx.fillStyle = hc
        ? hc.text
        : this.detectTheme()
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(0, 0, 0, 0.3)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Loading art…', w / 2, h - 8);
    }
  }

  /**
   * Draw an image scaled to fit (contain) within the canvas,
   * centered both horizontally and vertically.
   */
  private drawContainedImage(
    ctx: CanvasRenderingContext2D,
    image: ImageBitmap,
    canvasW: number,
    canvasH: number,
    hc?: HighContrastColors | null,
  ): void {
    const imgW = image.width;
    const imgH = image.height;
    const scale = Math.min(canvasW / imgW, canvasH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const x = (canvasW - drawW) / 2;
    const y = (canvasH - drawH) / 2;

    // Dark background behind the image
    ctx.fillStyle = hc?.background ?? '#161622';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.drawImage(image, x, y, drawW, drawH);
  }

  private detectTheme(): boolean {
    if (document.documentElement.classList.contains('light')) return false;
    if (document.documentElement.classList.contains('dark')) return true;
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

  /**
   * Simplified cartridge placeholder for high contrast mode.
   * Uses only system colors to guarantee visibility.
   */
  private drawCartridgeHighContrast(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    title: string,
    hc: HighContrastColors,
  ): void {
    const dpr = this.dpr;

    // Background
    ctx.fillStyle = hc.background;
    ctx.fillRect(0, 0, w, h);

    const pad = Math.round(w * 0.08);
    const bodyX = pad;
    const bodyY = pad;
    const bodyW = w - pad * 2;
    const bodyH = h - pad * 2;
    const bodyR = Math.round(w * 0.04);

    // Cartridge body — outlined
    roundedRect(ctx, bodyX, bodyY, bodyW, bodyH, bodyR);
    ctx.strokeStyle = hc.buttonText;
    ctx.lineWidth = Math.max(2, dpr);
    ctx.stroke();

    // Label area (upper 55%)
    const labelPad = Math.round(bodyW * 0.08);
    const labelX = bodyX + labelPad;
    const labelY = bodyY + labelPad;
    const labelW = bodyW - labelPad * 2;
    const labelH = Math.round(bodyH * 0.55);
    const labelR = Math.round(w * 0.02);

    roundedRect(ctx, labelX, labelY, labelW, labelH, labelR);
    ctx.strokeStyle = hc.text;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();

    // Title text
    if (title) {
      ctx.fillStyle = hc.text;
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
    ctx.fillStyle = hc.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      'SUPER NINTENDO',
      bodyX + bodyW / 2,
      labelY + labelH + Math.round(bodyH * 0.04),
    );
  }
}
