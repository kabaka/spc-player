/**
 * Error factory functions — one per domain.
 * Maps error codes to user-facing messages per ADR-0015 Rule 5.
 */

import type {
  AudioPipelineError,
  ExportError,
  MidiError,
  NetworkError,
  SpcParseError,
  SpcParseWarning,
  SpcParseWarningCode,
  StorageError,
  UiError,
} from '../types/errors';

// ---------------------------------------------------------------------------
// SPC Parse Errors
// ---------------------------------------------------------------------------

export function spcParseError(
  code: SpcParseError['code'],
  context: SpcParseError['context'] = {},
): SpcParseError {
  const messages: Record<SpcParseError['code'], string> = {
    SPC_INVALID_MAGIC: 'This file is not a valid SPC audio file.',
    SPC_FILE_TOO_SMALL: 'This SPC file appears to be incomplete or damaged.',
    SPC_FILE_TOO_LARGE: 'This file is too large to be a valid SPC file.',
    SPC_CORRUPT_DATA: 'This SPC file contains invalid audio data.',
    SPC_METADATA_DECODE_ERROR: 'This SPC file has unreadable metadata.',
    SPC_INVALID_DATA: 'This SPC file was rejected by the audio engine.',
  };
  return { code, message: messages[code], context };
}

// ---------------------------------------------------------------------------
// Audio Pipeline Errors
// ---------------------------------------------------------------------------

export function audioPipelineError(
  code: AudioPipelineError['code'],
  context: AudioPipelineError['context'] = {},
): AudioPipelineError {
  const messages: Record<AudioPipelineError['code'], string> = {
    AUDIO_WASM_TRAP: 'Audio playback stopped unexpectedly. Tap to retry.',
    AUDIO_WASM_INIT_FAILED:
      'The audio engine failed to start. Your browser may not support this feature.',
    AUDIO_WASM_RENDER_ERROR: 'A brief audio glitch occurred.',
    AUDIO_WASM_RENDER_OVERRUN:
      'Audio playback stopped due to repeated errors. Tap to retry.',
    AUDIO_WORKLET_CRASHED: 'Audio playback stopped unexpectedly. Tap to retry.',
    AUDIO_CONTEXT_SUSPENDED: 'Audio is paused. Tap anywhere to resume.',
    AUDIO_CONTEXT_CLOSED: 'Audio output was lost. Reconnecting\u2026',
    AUDIO_OUTPUT_CHANGED: 'Audio output device changed.',
    AUDIO_WORKLET_LOAD_FAILED:
      'The audio engine failed to load. Your browser may not support this feature.',
    AUDIO_CODEC_ERROR: 'Audio export failed. Please try a different format.',
    AUDIO_RENDER_OVERRUN_CRITICAL:
      'Audio playback stopped due to repeated errors. Tap to retry.',
    AUDIO_PROTOCOL_VERSION_MISMATCH:
      'Audio engine version mismatch. Please reload the page.',
  };
  return { code, message: messages[code], context };
}

// ---------------------------------------------------------------------------
// Storage Errors
// ---------------------------------------------------------------------------

export function storageError(
  code: StorageError['code'],
  context: StorageError['context'] = {},
): StorageError {
  const messages: Record<StorageError['code'], string> = {
    STORAGE_QUOTA_EXCEEDED: 'Storage is full. Try removing some saved files.',
    STORAGE_VERSION_CONFLICT:
      'Another tab is using a different data version. Please close other tabs and reload.',
    STORAGE_TRANSACTION_FAILED:
      'A storage operation failed. Some changes may not be saved.',
    STORAGE_UNAVAILABLE:
      'Offline storage is not available. Your settings will not persist across sessions.',
    STORAGE_CORRUPTED: 'Stored data was corrupted and has been reset.',
    STORAGE_READ_FAILED:
      'Failed to read saved data. Some information may be unavailable.',
  };
  return { code, message: messages[code], context };
}

// ---------------------------------------------------------------------------
// Export Errors
// ---------------------------------------------------------------------------

export function exportError(
  code: ExportError['code'],
  context: ExportError['context'] = {},
): ExportError {
  const messages: Record<ExportError['code'], string> = {
    EXPORT_CANCELLED: 'Export was cancelled.',
    EXPORT_OUT_OF_MEMORY: 'Export failed due to insufficient memory.',
    EXPORT_ENCODING_FAILED:
      'Audio encoding failed. Please try a different format.',
    EXPORT_CODEC_LOAD_FAILED:
      'Failed to load the audio encoder. Check your connection and try again.',
  };
  return { code, message: messages[code], context };
}

// ---------------------------------------------------------------------------
// MIDI Errors
// ---------------------------------------------------------------------------

export function midiError(
  code: MidiError['code'],
  context: MidiError['context'] = {},
): MidiError {
  const messages: Record<MidiError['code'], string> = {
    MIDI_PERMISSION_DENIED:
      'MIDI access was denied. Enable it in your browser settings to use MIDI input.',
    MIDI_NOT_SUPPORTED: 'Your browser does not support MIDI input.',
    MIDI_DEVICE_DISCONNECTED: 'MIDI device disconnected.',
    MIDI_DEVICE_ERROR: 'MIDI device reported an error.',
  };
  return { code, message: messages[code], context };
}

// ---------------------------------------------------------------------------
// Network Errors
// ---------------------------------------------------------------------------

export function networkError(
  code: NetworkError['code'],
  context: NetworkError['context'] = {},
): NetworkError {
  const messages: Record<NetworkError['code'], string> = {
    NETWORK_FETCH_FAILED:
      'A network request failed. Some features may be unavailable.',
    NETWORK_SW_UPDATE_FAILED:
      'Could not check for updates. You are using a cached version.',
    NETWORK_WASM_FETCH_FAILED:
      'Failed to download the audio engine. Check your connection and try again.',
  };
  return { code, message: messages[code], context };
}

// ---------------------------------------------------------------------------
// UI Errors
// ---------------------------------------------------------------------------

export function uiError(
  code: UiError['code'],
  context: UiError['context'] = {},
): UiError {
  const messages: Record<UiError['code'], string> = {
    UI_RENDER_ERROR: 'This section encountered an error.',
    UI_UNEXPECTED_ERROR: 'An unexpected error occurred.',
  };
  return { code, message: messages[code], context };
}

// ---------------------------------------------------------------------------
// SPC Parse Warnings (non-fatal)
// ---------------------------------------------------------------------------

export function spcParseWarning(
  code: SpcParseWarningCode,
  field?: string,
): SpcParseWarning {
  const messages: Record<SpcParseWarningCode, string> = {
    SPC_TRUNCATED_FILE:
      'File is shorter than expected. Missing regions were filled with defaults.',
    SPC_AMBIGUOUS_FORMAT:
      'Could not reliably detect the metadata format. Some information may be incorrect.',
    SPC_ENCODING_FALLBACK:
      'Text encoding could not be determined. Some characters may display incorrectly.',
    SPC_UNPARSEABLE_DATE: 'The date in this file could not be read.',
    SPC_INVALID_DURATION: 'The song length in this file could not be read.',
    SPC_UNKNOWN_XID6_TAG:
      'This file contains unrecognized extended metadata tags.',
    SPC_XID6_TRUNCATED:
      'Extended metadata is incomplete. Some information may be missing.',
    SPC_MALFORMED_HEADER: 'The file header contains unexpected values.',
    SPC_MISSING_TAGS:
      'This file has no metadata. Song information is unavailable.',
  };
  return {
    code,
    message: messages[code],
    ...(field !== undefined ? { field } : {}),
  };
}
