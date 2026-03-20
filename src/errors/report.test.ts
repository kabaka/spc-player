import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { AppError } from '../types/errors';
import type * as ReportModule from './report';

// Mock the toast store so reportError doesn't need a real Zustand store.
vi.mock('../components/Toast/toast-store', () => ({
  showToast: vi.fn(),
}));

import { showToast } from '../components/Toast/toast-store';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeError(code: AppError['code'], message = 'test'): AppError {
  return { code, message, context: {} } as AppError;
}

// ---------------------------------------------------------------------------
// logError
// ---------------------------------------------------------------------------

describe('logError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes code, message, and context to console.error', async () => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const { logError } = await import('./report');
    logError(makeError('UI_UNEXPECTED_ERROR', 'boom'));
    expect(console.error).toHaveBeenCalledWith(
      '[UI_UNEXPECTED_ERROR]',
      'boom',
      {},
    );
  });
});

// ---------------------------------------------------------------------------
// Ring buffer — getRecentErrors via reportError
// Each test gets a fresh module so the buffer starts empty.
// ---------------------------------------------------------------------------

describe('ring buffer (getRecentErrors)', () => {
  let mod: typeof ReportModule;

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.spyOn(console, 'info').mockImplementation(vi.fn());
    mod = await import('./report');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when no errors have been reported', () => {
    expect(mod.getRecentErrors()).toEqual([]);
  });

  it('stores a single entry with correct fields', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    mod.reportError(makeError('UI_UNEXPECTED_ERROR', 'err-0'));
    const entries = mod.getRecentErrors();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      timestamp: 1000,
      code: 'UI_UNEXPECTED_ERROR',
      message: 'err-0',
      context: {},
    });
  });

  it('preserves chronological order for partial fill', () => {
    let t = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => t++);
    for (let i = 0; i < 5; i++) {
      mod.reportError(makeError('UI_UNEXPECTED_ERROR', `err-${i}`));
    }
    const entries = mod.getRecentErrors();
    expect(entries).toHaveLength(5);
    expect(entries[0].message).toBe('err-0');
    expect(entries[4].message).toBe('err-4');
  });

  it('caps at buffer capacity of 100', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    for (let i = 0; i < 100; i++) {
      mod.reportError(makeError('UI_UNEXPECTED_ERROR', `err-${i}`));
    }
    const entries = mod.getRecentErrors();
    expect(entries).toHaveLength(100);
    expect(entries[0].message).toBe('err-0');
    expect(entries[99].message).toBe('err-99');
  });

  it('evicts oldest entries on wrap-around', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    for (let i = 0; i < 105; i++) {
      mod.reportError(makeError('UI_UNEXPECTED_ERROR', `err-${i}`));
    }
    const entries = mod.getRecentErrors();
    expect(entries).toHaveLength(100);
    expect(entries[0].message).toBe('err-5');
    expect(entries[99].message).toBe('err-104');
  });

  it('maintains chronological order after wrap-around', () => {
    let t = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => t++);
    for (let i = 0; i < 150; i++) {
      mod.reportError(makeError('UI_UNEXPECTED_ERROR', `err-${i}`));
    }
    const entries = mod.getRecentErrors();
    expect(entries).toHaveLength(100);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].timestamp).toBeGreaterThan(entries[i - 1].timestamp);
    }
  });
});

// ---------------------------------------------------------------------------
// reportError — branching and silent option
// ---------------------------------------------------------------------------

describe('reportError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.mocked(showToast).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Use a fresh module for these tests too since we share the describe
  let mod: typeof ReportModule;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('./report');
  });

  it('logs to console and stores in buffer', () => {
    mod.reportError(makeError('UI_UNEXPECTED_ERROR', 'test'));
    expect(console.error).toHaveBeenCalled();
    expect(mod.getRecentErrors()).toHaveLength(1);
  });

  it('skips UI notification when silent is true', () => {
    mod.reportError(makeError('UI_UNEXPECTED_ERROR', 'test'), { silent: true });
    expect(console.error).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  // -- Action banner codes (error toast, manual dismiss) --------------------

  const actionBannerCodes = [
    'AUDIO_CONTEXT_SUSPENDED',
    'AUDIO_WORKLET_CRASHED',
    'AUDIO_WASM_TRAP',
    'AUDIO_WASM_RENDER_OVERRUN',
    'AUDIO_RENDER_OVERRUN_CRITICAL',
    'AUDIO_PROTOCOL_VERSION_MISMATCH',
  ] as const;

  it.each(actionBannerCodes)('shows error toast for %s', (code) => {
    mod.reportError(makeError(code, 'banner msg'));
    expect(showToast).toHaveBeenCalledWith('error', 'banner msg');
  });

  // -- Warning toast codes ---------------------------------------------------

  const warningToastCodes = [
    'MIDI_DEVICE_DISCONNECTED',
    'NETWORK_SW_UPDATE_FAILED',
    'STORAGE_QUOTA_EXCEEDED',
    'AUDIO_OUTPUT_CHANGED',
  ] as const;

  it.each(warningToastCodes)('shows warning toast for %s', (code) => {
    mod.reportError(makeError(code, 'warn msg'));
    expect(showToast).toHaveBeenCalledWith('warning', 'warn msg');
  });

  // -- SPC parse error toast codes -------------------------------------------

  const spcParseErrorCodes = [
    'SPC_INVALID_MAGIC',
    'SPC_FILE_TOO_SMALL',
    'SPC_FILE_TOO_LARGE',
    'SPC_CORRUPT_DATA',
    'SPC_METADATA_DECODE_ERROR',
    'SPC_INVALID_DATA',
  ] as const;

  it.each(spcParseErrorCodes)('shows error toast for %s', (code) => {
    mod.reportError(makeError(code, 'spc msg'));
    expect(showToast).toHaveBeenCalledWith('error', 'spc msg');
  });

  // -- Silent codes (no toast) -----------------------------------------------

  it('does not show UI notification for UI_RENDER_ERROR', () => {
    mod.reportError(makeError('UI_RENDER_ERROR', 'render err'));
    expect(console.error).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('does not show UI notification for EXPORT_CANCELLED', () => {
    mod.reportError(makeError('EXPORT_CANCELLED', 'cancelled'));
    expect(console.error).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  // -- Remaining error toast codes -------------------------------------------

  const remainingErrorCodes = [
    'AUDIO_WASM_INIT_FAILED',
    'AUDIO_WASM_RENDER_ERROR',
    'AUDIO_CONTEXT_CLOSED',
    'AUDIO_WORKLET_LOAD_FAILED',
    'AUDIO_CODEC_ERROR',
    'STORAGE_VERSION_CONFLICT',
    'STORAGE_TRANSACTION_FAILED',
    'STORAGE_UNAVAILABLE',
    'STORAGE_CORRUPTED',
    'STORAGE_READ_FAILED',
    'MIDI_PERMISSION_DENIED',
    'MIDI_NOT_SUPPORTED',
    'MIDI_DEVICE_ERROR',
    'NETWORK_FETCH_FAILED',
    'NETWORK_WASM_FETCH_FAILED',
    'UI_UNEXPECTED_ERROR',
    'EXPORT_OUT_OF_MEMORY',
    'EXPORT_ENCODING_FAILED',
    'EXPORT_CODEC_LOAD_FAILED',
  ] as const;

  it.each(remainingErrorCodes)('shows error toast for %s', (code) => {
    mod.reportError(makeError(code, 'error msg'));
    expect(showToast).toHaveBeenCalledWith('error', 'error msg');
  });
});
