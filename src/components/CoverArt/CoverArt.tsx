import { useCallback, useEffect, useRef } from 'react';

import { VOICE_COLORS } from '@/utils/voice-colors';

import styles from './CoverArt.module.css';

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
  return hash >>> 0; // ensure unsigned
}

/** Map a game title to a voice color index (0–7). */
export function colorIndexFromTitle(title: string): number {
  return hashTitle(title) % VOICE_COLORS.length;
}

/**
 * Darken a hex color by mixing it toward black.
 * `amount` is 0 (no change) to 1 (fully black).
 */
function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

/**
 * Lighten a hex color by mixing it toward white.
 * `amount` is 0 (no change) to 1 (fully white).
 */
function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f + 255 * amount)}, ${Math.round(g * f + 255 * amount)}, ${Math.round(b * f + 255 * amount)})`;
}

/** Draw a rounded rectangle path. */
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

/**
 * Draw the SNES cartridge placeholder on the given canvas.
 * Pure function — no side effects beyond drawing.
 */
function drawCartridge(
  canvas: HTMLCanvasElement,
  title: string,
  isDark: boolean,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const dpr = w / (canvas.clientWidth || w);

  ctx.clearRect(0, 0, w, h);

  const colorIdx = colorIndexFromTitle(title);
  const primaryColor = VOICE_COLORS[colorIdx];

  // Cartridge body dimensions (inset from canvas edges)
  const pad = Math.round(w * 0.08);
  const bodyX = pad;
  const bodyY = pad;
  const bodyW = w - pad * 2;
  const bodyH = h - pad * 2;
  const bodyR = Math.round(w * 0.04);

  // -- Cartridge body --
  const bodyColor = isDark
    ? darkenHex(primaryColor, 0.65)
    : lightenHex(primaryColor, 0.75);
  roundedRect(ctx, bodyX, bodyY, bodyW, bodyH, bodyR);
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = isDark
    ? darkenHex(primaryColor, 0.4)
    : lightenHex(primaryColor, 0.5);
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();

  // -- Label area (upper 60%) --
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

  // Label border
  ctx.strokeStyle = isDark
    ? darkenHex(primaryColor, 0.2)
    : lightenHex(primaryColor, 0.25);
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();

  // -- Connector pins at bottom --
  const pinAreaY = bodyY + bodyH - Math.round(bodyH * 0.1);
  const pinH = Math.round(bodyH * 0.04);
  const pinCount = 8;
  const pinGap = Math.round(labelW / (pinCount * 2 + 1));
  const pinW = pinGap;
  const pinsStartX = labelX + pinGap;

  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)';
  for (let i = 0; i < pinCount; i++) {
    const px = pinsStartX + i * pinGap * 2;
    ctx.fillRect(px, pinAreaY, pinW, pinH);
  }

  // -- Title text --
  if (title) {
    const textColor = isDark
      ? lightenHex(primaryColor, 0.6)
      : darkenHex(primaryColor, 0.55);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Auto-size font to fit label area with padding
    const maxTextW = labelW - labelPad * 2;
    const maxTextH = labelH - labelPad * 2;
    const _lines = wrapText(ctx, title, maxTextW, Math.round(maxTextH * 0.35));

    // Calculate font size that fits
    let fontSize = Math.round(maxTextH * 0.35);
    const minFontSize = Math.round(6 * dpr);
    ctx.font = `${fontSize}px monospace`;

    // Shrink until all lines fit
    while (fontSize > minFontSize) {
      ctx.font = `${fontSize}px monospace`;
      const wrapped = wrapText(ctx, title, maxTextW, fontSize);
      const totalTextH = wrapped.length * fontSize * 1.3;
      const widthFits = wrapped.every(
        (line) => ctx.measureText(line).width <= maxTextW,
      );
      if (widthFits && totalTextH <= maxTextH) {
        break;
      }
      fontSize -= Math.max(1, Math.round(dpr));
    }

    const finalLines = wrapText(ctx, title, maxTextW, fontSize);
    const lineHeight = fontSize * 1.3;
    const totalH = finalLines.length * lineHeight;
    const startY = labelY + labelH / 2 - totalH / 2 + lineHeight / 2;

    for (let i = 0; i < finalLines.length; i++) {
      ctx.fillText(finalLines[i], labelX + labelW / 2, startY + i * lineHeight);
    }
  }

  // -- Small "SUPER NINTENDO" text below label --
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

/** Word-wrap text into lines that fit within maxWidth. */
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

export interface CoverArtProps {
  /** The game title to display on the placeholder cartridge. */
  gameTitle: string;
  /** Canvas width in CSS pixels. @default 240 */
  width?: number;
  /** Canvas height in CSS pixels. @default 240 */
  height?: number;
  /** Additional CSS class for the container. */
  className?: string;
}

export function CoverArt({
  gameTitle,
  width = 240,
  height = 240,
  className,
}: CoverArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const isDark =
      window.matchMedia('(prefers-color-scheme: dark)').matches ||
      document.documentElement.getAttribute('data-theme') !== 'light';

    drawCartridge(canvas, gameTitle, isDark);
  }, [gameTitle, width, height]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Re-render on theme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => redraw();
    mql.addEventListener('change', onChange);

    // Also watch for data-theme attribute changes on <html>
    const observer = new MutationObserver(redraw);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      mql.removeEventListener('change', onChange);
      observer.disconnect();
    };
  }, [redraw]);

  const containerClass = className
    ? `${styles.container} ${className}`
    : styles.container;

  return (
    <div
      className={containerClass}
      role="img"
      aria-label={`Cover art for ${gameTitle}`}
      data-width={width}
      data-height={height}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  );
}
