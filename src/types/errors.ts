/**
 * Application error taxonomy — discriminated union with string literal codes.
 * See ADR-0015 for design rationale and exhaustive code listing.
 */

// ---------------------------------------------------------------------------
// AppError union
// ---------------------------------------------------------------------------

export type AppError =
  | SpcParseError
  | AudioPipelineError
  | StorageError
  | ExportError
  | MidiError
  | NetworkError
  | UiError;

// ---------------------------------------------------------------------------
// SPC File Parsing Errors
// ---------------------------------------------------------------------------

export interface SpcParseError {
  readonly code:
    | 'SPC_INVALID_MAGIC'
    | 'SPC_FILE_TOO_SMALL'
    | 'SPC_FILE_TOO_LARGE'
    | 'SPC_CORRUPT_DATA'
    | 'SPC_METADATA_DECODE_ERROR'
    | 'SPC_INVALID_DATA';
  readonly message: string;
  readonly context: {
    readonly offset?: number;
    readonly expected?: string;
    readonly actual?: string;
    readonly fileName?: string;
    readonly fileSize?: number;
  };
}

// ---------------------------------------------------------------------------
// Audio Pipeline Errors
// ---------------------------------------------------------------------------

export interface AudioPipelineError {
  readonly code:
    | 'AUDIO_WASM_TRAP'
    | 'AUDIO_WASM_INIT_FAILED'
    | 'AUDIO_WASM_RENDER_ERROR'
    | 'AUDIO_WASM_RENDER_OVERRUN'
    | 'AUDIO_WORKLET_CRASHED'
    | 'AUDIO_CONTEXT_SUSPENDED'
    | 'AUDIO_CONTEXT_CLOSED'
    | 'AUDIO_OUTPUT_CHANGED'
    | 'AUDIO_WORKLET_LOAD_FAILED'
    | 'AUDIO_CODEC_ERROR'
    | 'AUDIO_RENDER_OVERRUN_CRITICAL'
    | 'AUDIO_PROTOCOL_VERSION_MISMATCH';
  readonly message: string;
  readonly context: {
    readonly audioContextState?: AudioContextState;
    readonly wasmErrorCode?: number;
    readonly workletProcessorName?: string;
    readonly detail?: string;
    readonly consecutiveFailures?: number;
  };
}

// ---------------------------------------------------------------------------
// Storage Errors
// ---------------------------------------------------------------------------

export interface StorageError {
  readonly code:
    | 'STORAGE_QUOTA_EXCEEDED'
    | 'STORAGE_VERSION_CONFLICT'
    | 'STORAGE_TRANSACTION_FAILED'
    | 'STORAGE_UNAVAILABLE'
    | 'STORAGE_CORRUPTED'
    | 'STORAGE_READ_FAILED';
  readonly message: string;
  readonly context: {
    readonly storeName?: string;
    readonly quotaUsed?: number;
    readonly quotaTotal?: number;
    readonly key?: string;
    readonly detail?: string;
  };
}

// ---------------------------------------------------------------------------
// Export Errors
// ---------------------------------------------------------------------------

export interface ExportError {
  readonly code:
    | 'EXPORT_CANCELLED'
    | 'EXPORT_OUT_OF_MEMORY'
    | 'EXPORT_ENCODING_FAILED'
    | 'EXPORT_CODEC_LOAD_FAILED';
  readonly message: string;
  readonly context: {
    readonly jobId?: string;
    readonly format?: string;
    readonly detail?: string;
  };
}

// ---------------------------------------------------------------------------
// MIDI Errors
// ---------------------------------------------------------------------------

export interface MidiError {
  readonly code:
    | 'MIDI_PERMISSION_DENIED'
    | 'MIDI_NOT_SUPPORTED'
    | 'MIDI_DEVICE_DISCONNECTED'
    | 'MIDI_DEVICE_ERROR';
  readonly message: string;
  readonly context: {
    readonly deviceName?: string;
    readonly deviceId?: string;
    readonly detail?: string;
  };
}

// ---------------------------------------------------------------------------
// Network Errors
// ---------------------------------------------------------------------------

export interface NetworkError {
  readonly code:
    | 'NETWORK_FETCH_FAILED'
    | 'NETWORK_SW_UPDATE_FAILED'
    | 'NETWORK_WASM_FETCH_FAILED';
  readonly message: string;
  readonly context: {
    readonly url?: string;
    readonly httpStatus?: number;
    readonly detail?: string;
  };
}

// ---------------------------------------------------------------------------
// UI Errors
// ---------------------------------------------------------------------------

export interface UiError {
  readonly code: 'UI_RENDER_ERROR' | 'UI_UNEXPECTED_ERROR';
  readonly message: string;
  readonly context: {
    readonly componentName?: string;
    readonly detail?: string;
    readonly stack?: string;
  };
}

// ---------------------------------------------------------------------------
// SPC Parse Warnings (non-fatal, carried in SpcFile.warnings)
// ---------------------------------------------------------------------------

export type SpcParseWarningCode =
  | 'SPC_TRUNCATED_FILE'
  | 'SPC_AMBIGUOUS_FORMAT'
  | 'SPC_ENCODING_FALLBACK'
  | 'SPC_UNPARSEABLE_DATE'
  | 'SPC_INVALID_DURATION'
  | 'SPC_UNKNOWN_XID6_TAG'
  | 'SPC_XID6_TRUNCATED'
  | 'SPC_MALFORMED_HEADER'
  | 'SPC_MISSING_TAGS';

export interface SpcParseWarning {
  readonly code: SpcParseWarningCode;
  readonly message: string;
  readonly field?: string;
}
