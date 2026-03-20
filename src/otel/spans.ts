/**
 * SPC Player span name constants and typed attribute interfaces.
 *
 * Follows OTel semantic conventions where they exist.
 * SPC-specific attributes are prefixed with `spc.`.
 *
 * @see .github/skills/otel/SKILL.md — Semantic conventions table
 */

// ---------------------------------------------------------------------------
// Span Names — use these constants instead of raw strings
// ---------------------------------------------------------------------------

/** Initial page load timing. */
export const SPAN_DOCUMENT_LOAD = 'document.load';

/** SPC file fetch + parse. */
export const SPAN_SPC_FILE_LOAD = 'spc.file.load';

/** Metadata extraction from SPC headers (ID666 / xid6). */
export const SPAN_SPC_METADATA_PARSE = 'spc.metadata.parse';

/** AudioContext and worklet initialization. */
export const SPAN_AUDIO_CONTEXT_INIT = 'audio.context.init';

/** WASM module fetch and instantiation. */
export const SPAN_WASM_INIT = 'wasm.init';

/** Playback session from play to stop/pause. */
export const SPAN_PLAYBACK_START = 'spc.playback.start';

/** Playback stop event. */
export const SPAN_PLAYBACK_STOP = 'spc.playback.stop';

/** Audio export operation (encode + save). */
export const SPAN_EXPORT = 'spc.export';

// ---------------------------------------------------------------------------
// Attribute Keys — typed constants for span attributes
// ---------------------------------------------------------------------------

/** Standard attribute keys for SPC Player domain. */
export const ATTR = {
  // File attributes
  FILE_NAME: 'file.name',
  FILE_SIZE: 'file.size',

  // SPC metadata
  SPC_GAME: 'spc.game',
  SPC_TITLE: 'spc.title',
  SPC_FORMAT: 'spc.format',
  SPC_CHANNELS_ACTIVE: 'spc.channels.active',

  // Audio attributes
  AUDIO_SAMPLE_RATE: 'audio.sample_rate',

  // WASM attributes
  WASM_MODULE_SIZE: 'wasm.module_size',

  // Export attributes
  EXPORT_FORMAT: 'export.format',
  EXPORT_DURATION_MS: 'export.duration_ms',
  EXPORT_SAMPLE_RATE: 'export.sample_rate',
  EXPORT_CHANNELS: 'export.channels',
} as const;
