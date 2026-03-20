import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  isQuotaExceededError,
  handleQuotaExceeded,
  withQuotaHandling,
  refreshStorageQuota,
} from './quota-handler';

// Mock reportError so we can verify calls without side effects
vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}));

import { reportError } from '@/errors/report';

describe('isQuotaExceededError', () => {
  it('returns true for QuotaExceededError DOMException', () => {
    const err = new DOMException('quota', 'QuotaExceededError');
    expect(isQuotaExceededError(err)).toBe(true);
  });

  it('returns false for other DOMException types', () => {
    const err = new DOMException('other', 'NotFoundError');
    expect(isQuotaExceededError(err)).toBe(false);
  });

  it('returns false for regular Error', () => {
    expect(isQuotaExceededError(new Error('nope'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isQuotaExceededError('string')).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
  });
});

describe('handleQuotaExceeded', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
  });

  it('calls reportError with STORAGE_QUOTA_EXCEEDED', () => {
    handleQuotaExceeded({ storeName: 'spc-files' });

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'STORAGE_QUOTA_EXCEEDED',
        context: expect.objectContaining({ storeName: 'spc-files' }),
      }),
    );
  });
});

describe('withQuotaHandling', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
  });

  it('passes through successful operations', async () => {
    const result = await withQuotaHandling(async () => 42);
    expect(result).toBe(42);
  });

  it('handles quota errors and re-throws', async () => {
    const quotaError = new DOMException('quota', 'QuotaExceededError');

    await expect(
      withQuotaHandling(async () => {
        throw quotaError;
      }),
    ).rejects.toBe(quotaError);

    expect(reportError).toHaveBeenCalledOnce();
  });

  it('re-throws non-quota errors without calling handleQuotaExceeded', async () => {
    const otherError = new Error('other');

    await expect(
      withQuotaHandling(async () => {
        throw otherError;
      }),
    ).rejects.toThrow(otherError);

    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('refreshStorageQuota', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when Storage Manager API is unavailable', async () => {
    const originalStorage = navigator.storage;
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: undefined },
      writable: true,
      configurable: true,
    });

    const result = await refreshStorageQuota();
    expect(result).toBeNull();

    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      writable: true,
      configurable: true,
    });
  });
});
