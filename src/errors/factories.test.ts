import { describe, expect, it } from 'vitest';

import type { SpcParseWarningCode } from '../types/errors';
import {
  audioPipelineError,
  exportError,
  midiError,
  networkError,
  spcParseError,
  spcParseWarning,
  storageError,
  uiError,
} from './factories';

// ---------------------------------------------------------------------------
// SPC Parse Errors
// ---------------------------------------------------------------------------

describe('spcParseError', () => {
  const codes = [
    'SPC_INVALID_MAGIC',
    'SPC_FILE_TOO_SMALL',
    'SPC_FILE_TOO_LARGE',
    'SPC_CORRUPT_DATA',
    'SPC_METADATA_DECODE_ERROR',
    'SPC_INVALID_DATA',
  ] as const;

  it.each(codes)('returns error with code %s', (code) => {
    const err = spcParseError(code);
    expect(err.code).toBe(code);
    expect(err.message).toBeTypeOf('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('defaults context to empty object', () => {
    expect(spcParseError('SPC_INVALID_MAGIC').context).toEqual({});
  });

  it('passes through provided context', () => {
    const ctx = { offset: 0x100, fileName: 'boss.spc' };
    expect(spcParseError('SPC_CORRUPT_DATA', ctx).context).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// Audio Pipeline Errors
// ---------------------------------------------------------------------------

describe('audioPipelineError', () => {
  const codes = [
    'AUDIO_WASM_TRAP',
    'AUDIO_WASM_INIT_FAILED',
    'AUDIO_WASM_RENDER_ERROR',
    'AUDIO_WASM_RENDER_OVERRUN',
    'AUDIO_WORKLET_CRASHED',
    'AUDIO_CONTEXT_SUSPENDED',
    'AUDIO_CONTEXT_CLOSED',
    'AUDIO_OUTPUT_CHANGED',
    'AUDIO_WORKLET_LOAD_FAILED',
    'AUDIO_CODEC_ERROR',
    'AUDIO_RENDER_OVERRUN_CRITICAL',
    'AUDIO_PROTOCOL_VERSION_MISMATCH',
  ] as const;

  it.each(codes)('returns error with code %s', (code) => {
    const err = audioPipelineError(code);
    expect(err.code).toBe(code);
    expect(err.message).toBeTypeOf('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('defaults context to empty object', () => {
    expect(audioPipelineError('AUDIO_WASM_TRAP').context).toEqual({});
  });

  it('passes through provided context', () => {
    const ctx = { wasmErrorCode: 42, detail: 'trap' };
    expect(audioPipelineError('AUDIO_WASM_TRAP', ctx).context).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// Storage Errors
// ---------------------------------------------------------------------------

describe('storageError', () => {
  const codes = [
    'STORAGE_QUOTA_EXCEEDED',
    'STORAGE_VERSION_CONFLICT',
    'STORAGE_TRANSACTION_FAILED',
    'STORAGE_UNAVAILABLE',
    'STORAGE_CORRUPTED',
    'STORAGE_READ_FAILED',
  ] as const;

  it.each(codes)('returns error with code %s', (code) => {
    const err = storageError(code);
    expect(err.code).toBe(code);
    expect(err.message).toBeTypeOf('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('defaults context to empty object', () => {
    expect(storageError('STORAGE_QUOTA_EXCEEDED').context).toEqual({});
  });

  it('passes through provided context', () => {
    const ctx = { storeName: 'spc-files', quotaUsed: 500 };
    expect(storageError('STORAGE_QUOTA_EXCEEDED', ctx).context).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// Export Errors
// ---------------------------------------------------------------------------

describe('exportError', () => {
  const codes = [
    'EXPORT_CANCELLED',
    'EXPORT_OUT_OF_MEMORY',
    'EXPORT_ENCODING_FAILED',
    'EXPORT_CODEC_LOAD_FAILED',
  ] as const;

  it.each(codes)('returns error with code %s', (code) => {
    const err = exportError(code);
    expect(err.code).toBe(code);
    expect(err.message).toBeTypeOf('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('defaults context to empty object', () => {
    expect(exportError('EXPORT_CANCELLED').context).toEqual({});
  });

  it('passes through provided context', () => {
    const ctx = { jobId: 'j-1', format: 'wav' };
    expect(exportError('EXPORT_ENCODING_FAILED', ctx).context).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// MIDI Errors
// ---------------------------------------------------------------------------

describe('midiError', () => {
  const codes = [
    'MIDI_PERMISSION_DENIED',
    'MIDI_NOT_SUPPORTED',
    'MIDI_DEVICE_DISCONNECTED',
    'MIDI_DEVICE_ERROR',
  ] as const;

  it.each(codes)('returns error with code %s', (code) => {
    const err = midiError(code);
    expect(err.code).toBe(code);
    expect(err.message).toBeTypeOf('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('defaults context to empty object', () => {
    expect(midiError('MIDI_NOT_SUPPORTED').context).toEqual({});
  });

  it('passes through provided context', () => {
    const ctx = { deviceName: 'Keystation', deviceId: 'd-1' };
    expect(midiError('MIDI_DEVICE_ERROR', ctx).context).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// Network Errors
// ---------------------------------------------------------------------------

describe('networkError', () => {
  const codes = [
    'NETWORK_FETCH_FAILED',
    'NETWORK_SW_UPDATE_FAILED',
    'NETWORK_WASM_FETCH_FAILED',
  ] as const;

  it.each(codes)('returns error with code %s', (code) => {
    const err = networkError(code);
    expect(err.code).toBe(code);
    expect(err.message).toBeTypeOf('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('defaults context to empty object', () => {
    expect(networkError('NETWORK_FETCH_FAILED').context).toEqual({});
  });

  it('passes through provided context', () => {
    const ctx = { url: '/api/data', httpStatus: 503 };
    expect(networkError('NETWORK_FETCH_FAILED', ctx).context).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// UI Errors
// ---------------------------------------------------------------------------

describe('uiError', () => {
  const codes = ['UI_RENDER_ERROR', 'UI_UNEXPECTED_ERROR'] as const;

  it.each(codes)('returns error with code %s', (code) => {
    const err = uiError(code);
    expect(err.code).toBe(code);
    expect(err.message).toBeTypeOf('string');
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('defaults context to empty object', () => {
    expect(uiError('UI_RENDER_ERROR').context).toEqual({});
  });

  it('passes through provided context', () => {
    const ctx = { componentName: 'Player', stack: 'Error: ...' };
    expect(uiError('UI_RENDER_ERROR', ctx).context).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// SPC Parse Warnings
// ---------------------------------------------------------------------------

describe('spcParseWarning', () => {
  const codes: SpcParseWarningCode[] = [
    'SPC_TRUNCATED_FILE',
    'SPC_AMBIGUOUS_FORMAT',
    'SPC_ENCODING_FALLBACK',
    'SPC_UNPARSEABLE_DATE',
    'SPC_INVALID_DURATION',
    'SPC_UNKNOWN_XID6_TAG',
    'SPC_XID6_TRUNCATED',
    'SPC_MALFORMED_HEADER',
    'SPC_MISSING_TAGS',
  ];

  it.each(codes)('returns warning with code %s', (code) => {
    const w = spcParseWarning(code);
    expect(w.code).toBe(code);
    expect(w.message).toBeTypeOf('string');
    expect(w.message.length).toBeGreaterThan(0);
  });

  it('omits field property when field is not provided', () => {
    const w = spcParseWarning('SPC_TRUNCATED_FILE');
    expect(w).not.toHaveProperty('field');
  });

  it('includes field property when provided', () => {
    const w = spcParseWarning('SPC_UNPARSEABLE_DATE', 'dateField');
    expect(w.field).toBe('dateField');
  });
});
