/**
 * Unified encoder interface and export pipeline types.
 *
 * @see docs/design/export-pipeline.md §6 (codec integration), §8 (TypeScript types)
 * @see docs/adr/0006-audio-codec-libraries.md
 */

// ---------------------------------------------------------------------------
// Export Format & Mode
// ---------------------------------------------------------------------------

/**
 * Supported export audio formats.
 *
 * Note: The wire protocol (worker-protocol.ts) uses `'ogg-vorbis'` for the OGG
 * Vorbis format. The export worker's `getEncoder()` maps `'ogg-vorbis'` → `'ogg'`.
 */
export type ExportFormat = 'wav' | 'flac' | 'ogg' | 'mp3' | 'opus';

/** Export mode determines how audio is extracted. */
export type ExportMode = 'fullMix' | 'perTrack' | 'perInstrument' | 'batch';

// ---------------------------------------------------------------------------
// Metadata — re-exported from the canonical worker-protocol definition
// ---------------------------------------------------------------------------

import type { ExportMetadata } from '../../audio/worker-protocol';

export type { ExportMetadata };

// ---------------------------------------------------------------------------
// Encoder Interface (§6)
// ---------------------------------------------------------------------------

/** Configuration for initializing an encoder. */
export interface EncoderConfig {
  /** Target sample rate in Hz. */
  readonly sampleRate: number;
  /** Channel count. */
  readonly channels: 1 | 2;
  /** Bits per sample (v1: always 16). */
  readonly bitsPerSample: 16;
  /** Lossy quality setting (OGG: -1–10, MP3 VBR: 0–9). */
  readonly quality?: number;
  /** FLAC compression level (0–8). */
  readonly compression?: number;
  /** Metadata to embed in the output file. */
  readonly metadata?: ExportMetadata;
}

/** Streaming encoder interface shared by all codecs. */
export interface Encoder {
  /** Initialize the encoder with output parameters. May be async for WASM-based codecs. */
  init(config: EncoderConfig): void | Promise<void>;
  /** Feed a chunk of interleaved int16 PCM samples. */
  encode(samples: Int16Array): void;
  /** Finalize encoding and return the complete encoded file. May be async for WebCodecs-based codecs. */
  finalize(): Uint8Array | Promise<Uint8Array>;
  /** Release all resources. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Codec Options
// ---------------------------------------------------------------------------

/** Codec-specific export settings. */
export interface CodecOptions {
  /** FLAC compression level (0–8, default 5). */
  readonly flacCompression?: number;
  /** OGG Vorbis quality (-1 to 10, default 6). */
  readonly oggQuality?: number;
  /** MP3 VBR quality (0–9, lower = better, default 2). */
  readonly mp3Quality?: number;
}

// ---------------------------------------------------------------------------
// SPC File Reference
// ---------------------------------------------------------------------------

/** Reference to an SPC file for batch export. */
export type SpcFileRef =
  | { readonly type: 'indexeddb'; readonly key: string }
  | {
      readonly type: 'buffer';
      readonly data: ArrayBuffer;
      readonly filename: string;
    };

// ---------------------------------------------------------------------------
// Export Options
// ---------------------------------------------------------------------------

/** Full set of options for an export operation. */
export interface ExportOptions {
  /** Output format. */
  readonly format: ExportFormat;
  /** Target sample rate in Hz. */
  readonly sampleRate: 32000 | 44100 | 48000 | 96000;
  /** Export mode. */
  readonly mode: ExportMode;
  /**
   * Voice selection bitmask (bits 0–7 = voices 0–7).
   * fullMix: 0xFF, perTrack: per-voice bits, perInstrument: ignored, batch: 0xFF.
   */
  readonly voiceMask: number;
  /** Metadata derived from SPC ID666/xid6 tags. */
  readonly metadata: ExportMetadata;
  /** Duration to render in seconds (play length, excluding fade). */
  readonly durationSeconds: number;
  /** Fade-out duration in seconds. */
  readonly fadeDurationSeconds: number;
  /**
   * Loop count override. Only meaningful when xid6 timing is present.
   * null = use default resolution (per-file → xid6 → global default).
   */
  readonly loopCount: number | null;
  /** Codec-specific settings. */
  readonly codecOptions: CodecOptions;
  /** For batch mode: SPC file references. */
  readonly batchFiles?: readonly SpcFileRef[];
  /** For batch mode: ZIP or individual downloads. */
  readonly batchPackaging: 'zip' | 'individual';
}

// ---------------------------------------------------------------------------
// Export Job
// ---------------------------------------------------------------------------

/** Status of an export job through its lifecycle. */
export type ExportJobStatus =
  | 'queued'
  | 'rendering'
  | 'encoding'
  | 'metadata'
  | 'packaging'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** A single export job with its current state. */
export interface ExportJob {
  /** Unique job ID (crypto.randomUUID()). */
  readonly id: string;
  /** Current status. */
  readonly status: ExportJobStatus;
  /** Overall progress (0.0–1.0). */
  readonly progress: number;
  /** Export options for this job. */
  readonly options: ExportOptions;
  /** Human-readable description (e.g., "Chrono Trigger - Corridors of Time.flac"). */
  readonly label: string;
  /** Source filename (for display). */
  readonly sourceFilename: string;
  /** Error message if status is 'failed'. */
  readonly error?: string;
  /** Error code if status is 'failed' (UPPER_SNAKE_CASE per ADR-0015). */
  readonly errorCode?: string;
  /** Timestamp when job was created. */
  readonly createdAt: number;
  /** Timestamp when job completed/failed/cancelled. */
  readonly completedAt?: number;
  /** Encoded file size in bytes (set on completion). */
  readonly outputSize?: number;
}
