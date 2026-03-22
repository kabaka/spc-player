/**
 * CRUD operations for per-file timing overrides in IndexedDB.
 * Follows patterns established in spc-storage.ts.
 */

import type { PerFileTimingOverride } from '../types/timing';
import { getDb } from './db';

/**
 * Retrieve a per-file timing override from IndexedDB.
 *
 * @param trackId - SHA-256 hash of the SPC file content.
 * @returns The override record, or null if no override exists for this track.
 */
export async function getTimingOverride(
  trackId: string,
): Promise<PerFileTimingOverride | null> {
  const db = await getDb();
  const record = await db.get('timing-overrides', trackId);
  return record ?? null;
}

/**
 * Save or update a per-file timing override in IndexedDB.
 * Uses put() — inserts if absent, replaces if present.
 *
 * @param trackId - SHA-256 hash of the SPC file content.
 * @param override - Timing fields. Null means "use default."
 */
export async function setTimingOverride(
  trackId: string,
  override: Omit<PerFileTimingOverride, 'trackId' | 'updatedAt'>,
): Promise<void> {
  const db = await getDb();
  await db.put('timing-overrides', {
    trackId,
    loopCount: override.loopCount,
    durationSeconds: override.durationSeconds,
    fadeSeconds: override.fadeSeconds,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a per-file timing override from IndexedDB.
 * No-op if no override exists for this trackId.
 *
 * @param trackId - SHA-256 hash of the SPC file content.
 */
export async function deleteTimingOverride(trackId: string): Promise<void> {
  const db = await getDb();
  await db.delete('timing-overrides', trackId);
}
