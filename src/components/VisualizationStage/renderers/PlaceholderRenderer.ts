import type { AudioVisualizationData, VisualizationRenderer } from '../types';

/**
 * A stub renderer that draws a centered label on the canvas.
 * Used as a placeholder until real renderers are implemented.
 */
export class PlaceholderRenderer implements VisualizationRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private label: string;
  private width = 0;
  private height = 0;

  constructor(label: string) {
    this.label = label;
  }

  init(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(_data: AudioVisualizationData, _deltaTime: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = '#161622';
    ctx.fillRect(0, 0, this.width, this.height);

    // Centered label
    ctx.fillStyle = '#9999b0';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.label, this.width / 2, this.height / 2);
  }

  resize(width: number, height: number, _dpr: number): void {
    this.width = width;
    this.height = height;
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
  }
}
