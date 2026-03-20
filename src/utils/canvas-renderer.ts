/**
 * Canvas rendering utilities for DPI-aware visualization components.
 *
 * Provides shared helpers for the waveform display and spectrum analyzer.
 */

export interface CanvasDimensions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
}

/**
 * Configure a canvas for high-DPI rendering.
 * Sets the canvas pixel dimensions to match its CSS size × devicePixelRatio,
 * and scales the context so drawing code can use CSS-pixel coordinates.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
): CanvasDimensions | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { ctx, width, height, dpr };
}

/**
 * Read a CSS custom property value from an element's computed style.
 * Returns the trimmed string value, or the provided fallback.
 */
export function getCssColor(
  element: Element,
  property: string,
  fallback = '#8B5CF6',
): string {
  const value = getComputedStyle(element).getPropertyValue(property).trim();
  return value || fallback;
}

/**
 * Read all waveform-related color tokens from CSS custom properties.
 */
export interface WaveformColors {
  stroke: string;
  fill: string;
  bg: string;
  cursor: string;
}

export function getWaveformColors(element: Element): WaveformColors {
  return {
    stroke: getCssColor(element, '--spc-color-waveform', '#8B5CF6'),
    fill: getCssColor(
      element,
      '--spc-color-waveform-fill',
      'rgba(139, 92, 246, 0.20)',
    ),
    bg: getCssColor(element, '--spc-color-waveform-bg', '#161622'),
    cursor: getCssColor(element, '--spc-color-waveform-cursor', '#EDEDF0'),
  };
}

/**
 * Read voice channel color tokens from CSS custom properties.
 */
export function getVoiceColors(element: Element): string[] {
  return Array.from({ length: 8 }, (_, i) =>
    getCssColor(element, `--spc-color-voice-${i}`, '#8B5CF6'),
  );
}
