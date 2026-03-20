/**
 * Storage quota handling — detect and report quota exceeded errors.
 *
 * @see docs/adr/0015-error-handling.md — StorageError codes
 */

import { reportError } from '@/errors/report';
import { storageError } from '@/errors/factories';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Check if an error is a quota exceeded error from IndexedDB or Storage API.
 * Covers both DOMException (name: 'QuotaExceededError') and the older
 * numeric code (22).
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.code === DOMException.QUOTA_EXCEEDED_ERR
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle a quota exceeded error by reporting it through the error system.
 * Shows a toast notification explaining the situation and suggesting cleanup.
 */
export function handleQuotaExceeded(context?: {
  storeName?: string;
  key?: string;
}): void {
  const quotaInfo = getStorageQuota();

  reportError(
    storageError('STORAGE_QUOTA_EXCEEDED', {
      ...context,
      ...(quotaInfo
        ? { quotaUsed: quotaInfo.usage, quotaTotal: quotaInfo.quota }
        : {}),
    }),
  );
}

// ---------------------------------------------------------------------------
// Quota estimation (best-effort)
// ---------------------------------------------------------------------------

interface QuotaEstimate {
  readonly usage: number;
  readonly quota: number;
}

let cachedQuota: QuotaEstimate | null = null;

function getStorageQuota(): QuotaEstimate | null {
  return cachedQuota;
}

/**
 * Refresh the cached storage quota estimate.
 * Uses the Storage Manager API (navigator.storage.estimate).
 * Returns null in environments that don't support it.
 */
export async function refreshStorageQuota(): Promise<QuotaEstimate | null> {
  if (!navigator.storage?.estimate) return null;

  try {
    const estimate = await navigator.storage.estimate();
    cachedQuota = {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
    return cachedQuota;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wrapper for IndexedDB operations
// ---------------------------------------------------------------------------

/**
 * Wrap an async IndexedDB operation to catch and handle quota errors.
 * On quota exceeded, calls handleQuotaExceeded and re-throws.
 */
export async function withQuotaHandling<T>(
  operation: () => Promise<T>,
  context?: { storeName?: string; key?: string },
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isQuotaExceededError(error)) {
      handleQuotaExceeded(context);
    }
    throw error;
  }
}
