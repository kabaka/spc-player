/**
 * Centralized error reporting — log, store, and notify.
 * See ADR-0015 §reportError for the canonical specification.
 */

import type { AppError } from '../types/errors';
import { showToast } from '../components/Toast/toast-store';
import type { ToastSeverity } from '../components/Toast/toast-store';

// ---------------------------------------------------------------------------
// Error log entry shape
// ---------------------------------------------------------------------------

export interface ErrorLogEntry {
  readonly timestamp: number;
  readonly code: AppError['code'];
  readonly message: string;
  readonly context: AppError['context'];
}

// ---------------------------------------------------------------------------
// In-memory ring buffer (O(1) insertion, last 100 errors)
// ---------------------------------------------------------------------------

const ERROR_BUFFER_CAPACITY = 100;
const errorEntries: (ErrorLogEntry | undefined)[] = new Array<
  ErrorLogEntry | undefined
>(ERROR_BUFFER_CAPACITY);
let nextIndex = 0;
let entryCount = 0;

function appendToErrorStore(error: AppError): void {
  const entry: ErrorLogEntry = {
    timestamp: Date.now(),
    code: error.code,
    message: error.message,
    context: error.context,
  };
  errorEntries[nextIndex % ERROR_BUFFER_CAPACITY] = entry;
  nextIndex++;
  entryCount = Math.min(entryCount + 1, ERROR_BUFFER_CAPACITY);
}

/** Returns stored errors in chronological order (oldest first). */
export function getRecentErrors(): readonly ErrorLogEntry[] {
  if (entryCount === 0) return [];
  const result: ErrorLogEntry[] = [];
  const start =
    entryCount < ERROR_BUFFER_CAPACITY ? 0 : nextIndex % ERROR_BUFFER_CAPACITY;
  for (let i = 0; i < entryCount; i++) {
    const entry = errorEntries[(start + i) % ERROR_BUFFER_CAPACITY];
    if (entry) result.push(entry);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Console logging
// ---------------------------------------------------------------------------

export function logError(error: AppError): void {
  console.error(`[${error.code}]`, error.message, error.context);
}

// ---------------------------------------------------------------------------
// reportError — single entry point for all error visibility
// ---------------------------------------------------------------------------

export function reportError(
  error: AppError,
  options?: { silent?: boolean },
): void {
  // 1. Always log to console
  logError(error);

  // 2. Always append to in-memory ring buffer
  appendToErrorStore(error);

  // 3. Display to user unless explicitly silent
  if (options?.silent) return;

  // Map error codes to toast severity per ADR-0015.
  // The switch is exhaustive so TypeScript catches missing codes.
  let severity: ToastSeverity | null = null;

  switch (error.code) {
    // — Action banners: require user intervention (error severity, manual dismiss) —
    case 'AUDIO_CONTEXT_SUSPENDED':
    case 'AUDIO_WORKLET_CRASHED':
    case 'AUDIO_WASM_TRAP':
    case 'AUDIO_WASM_RENDER_OVERRUN':
    case 'AUDIO_RENDER_OVERRUN_CRITICAL':
    case 'AUDIO_PROTOCOL_VERSION_MISMATCH':
      severity = 'error';
      break;

    // — Toasts: warnings, auto-dismiss —
    case 'MIDI_DEVICE_DISCONNECTED':
    case 'NETWORK_SW_UPDATE_FAILED':
    case 'STORAGE_QUOTA_EXCEEDED':
    case 'AUDIO_OUTPUT_CHANGED':
      severity = 'warning';
      break;

    // — Toasts: SPC parse errors —
    case 'SPC_INVALID_MAGIC':
    case 'SPC_FILE_TOO_SMALL':
    case 'SPC_FILE_TOO_LARGE':
    case 'SPC_CORRUPT_DATA':
    case 'SPC_METADATA_DECODE_ERROR':
    case 'SPC_INVALID_DATA':
      severity = 'error';
      break;

    // — Silent: error boundary already displays fallback UI —
    case 'UI_RENDER_ERROR':
      severity = null;
      break;

    // — Export cancellation: silent (user initiated) —
    case 'EXPORT_CANCELLED':
      severity = null;
      break;

    // — All remaining codes: toast with error severity —
    case 'AUDIO_WASM_INIT_FAILED':
    case 'AUDIO_WASM_RENDER_ERROR':
    case 'AUDIO_CONTEXT_CLOSED':
    case 'AUDIO_WORKLET_LOAD_FAILED':
    case 'AUDIO_CODEC_ERROR':
    case 'STORAGE_VERSION_CONFLICT':
    case 'STORAGE_TRANSACTION_FAILED':
    case 'STORAGE_UNAVAILABLE':
    case 'STORAGE_CORRUPTED':
    case 'STORAGE_READ_FAILED':
    case 'MIDI_PERMISSION_DENIED':
    case 'MIDI_NOT_SUPPORTED':
    case 'MIDI_DEVICE_ERROR':
    case 'NETWORK_FETCH_FAILED':
    case 'NETWORK_WASM_FETCH_FAILED':
    case 'UI_UNEXPECTED_ERROR':
    case 'EXPORT_OUT_OF_MEMORY':
    case 'EXPORT_ENCODING_FAILED':
    case 'EXPORT_CODEC_LOAD_FAILED':
      severity = 'error';
      break;

    // — Exhaustiveness check —
    default: {
      const _exhaustive: never = error;
      severity = 'error';
      void _exhaustive;
    }
  }

  if (severity !== null) {
    showToast(severity, error.message);
  }
}

// ---------------------------------------------------------------------------
// Dev-only debug access
// ---------------------------------------------------------------------------

if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__spcErrors = {
    get entries() {
      return getRecentErrors();
    },
    get count() {
      return entryCount;
    },
  };
}
