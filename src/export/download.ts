/**
 * Download helpers for the export pipeline.
 *
 * @see docs/design/export-pipeline.md §7
 */

import type { ExportFormat, ExportMetadata } from './encoders/encoder-types';

// ---------------------------------------------------------------------------
// MIME Type Map
// ---------------------------------------------------------------------------

/** MIME types for each export format. */
export const MIME_TYPES: Readonly<Record<ExportFormat, string>> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
};

/** File extensions for each export format. */
const FORMAT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  wav: 'wav',
  flac: 'flac',
  ogg: 'ogg',
  mp3: 'mp3',
};

// ---------------------------------------------------------------------------
// Filename Sanitization
// ---------------------------------------------------------------------------

/**
 * Remove characters that are illegal in filenames across major operating systems.
 * Collapses whitespace, trims, and enforces a 200-character length limit.
 */
export function sanitizeFilename(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex -- intentional: strip control characters from filenames
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  );
}

// ---------------------------------------------------------------------------
// Filename Generation
// ---------------------------------------------------------------------------

/**
 * Generate a canonical filename from export metadata and parameters.
 *
 * Patterns:
 * - Full mix: `{game} - {title}.{ext}`
 * - Per-voice: `{game} - {title} - Voice {N} ({instrument}).{ext}`
 * - Per-sample: `{game} - {title} - Sample {NN} ({name}).{ext}`
 *
 * @param metadata   Export metadata from the SPC file.
 * @param format     Target export format.
 * @param voiceIndex 0-based voice index (for per-track exports).
 * @param instrumentName Instrument name (for per-track or per-sample exports).
 * @param sampleIndex 0-based sample index (for per-instrument sample exports).
 */
export function generateFilename(
  metadata: ExportMetadata,
  format: ExportFormat,
  voiceIndex?: number,
  instrumentName?: string,
  sampleIndex?: number,
): string {
  const ext = FORMAT_EXTENSIONS[format];
  const title = sanitizeFilename(metadata.title || 'Untitled');
  const game = sanitizeFilename(metadata.game || 'Unknown Game');

  if (sampleIndex !== undefined) {
    const name = instrumentName ? ` (${sanitizeFilename(instrumentName)})` : '';
    return `${game} - ${title} - Sample ${String(sampleIndex + 1).padStart(2, '0')}${name}.${ext}`;
  }

  if (voiceIndex !== undefined) {
    const name = instrumentName ? ` (${sanitizeFilename(instrumentName)})` : '';
    return `${game} - ${title} - Voice ${voiceIndex + 1}${name}.${ext}`;
  }

  return `${game} - ${title}.${ext}`;
}

// ---------------------------------------------------------------------------
// Blob Download
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of binary data as a file.
 *
 * Uses the Blob URL + anchor click pattern. The object URL is revoked after
 * 10 seconds — sufficient for the browser to initiate the download since
 * the blob data is already in memory.
 *
 * @see docs/design/export-pipeline.md §7 (rationale for 10s delay)
 */
export function downloadBlob(
  data: Uint8Array,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([data.slice()], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
