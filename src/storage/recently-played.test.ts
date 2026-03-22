/**
 * Unit tests for recently-played.ts — IndexedDB recently-played tracking.
 *
 * Uses fake-indexeddb to run real IDB transactions in-memory.
 */

import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDbInstance } from './db';
import { getDb } from './db';
import { recordRecentPlay } from './recently-played';

describe('recently-played', () => {
  beforeEach(() => {
    resetDbInstance();
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
    vi.restoreAllMocks();
  });

  it('records a play entry', async () => {
    await recordRecentPlay('hash-1');

    const db = await getDb();
    const count = await db.count('recently-played');
    expect(count).toBe(1);
  });

  it('stores the correct fileHash and playedAt timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42_000);
    await recordRecentPlay('hash-ts');

    const db = await getDb();
    const tx = db.transaction('recently-played', 'readonly');
    const index = tx.store.index('by-played');
    const cursor = await index.openCursor();
    expect(cursor).not.toBeNull();
    const entry = cursor as NonNullable<typeof cursor>;
    expect(entry.value.fileHash).toBe('hash-ts');
    expect(entry.value.playedAt).toBe(42_000);
  });

  it('records multiple plays', async () => {
    await recordRecentPlay('hash-a');
    await recordRecentPlay('hash-b');
    await recordRecentPlay('hash-c');

    const db = await getDb();
    const count = await db.count('recently-played');
    expect(count).toBe(3);
  });

  it('trims entries beyond MAX_RECENT_ENTRIES (100)', async () => {
    // Insert 102 entries — should trim the 2 oldest
    for (let i = 0; i < 102; i++) {
      vi.spyOn(Date, 'now').mockReturnValueOnce(1000 + i);
      await recordRecentPlay(`hash-${i}`);
    }

    const db = await getDb();
    const count = await db.count('recently-played');
    expect(count).toBe(100);
  });

  it('trims the oldest entries first', async () => {
    // Insert entries with widely-spaced timestamps to avoid ordering ambiguity
    // from internal Date.now() calls. Only the first 100 use old timestamps;
    // the last 3 use very recent ones.
    for (let i = 0; i < 100; i++) {
      vi.spyOn(Date, 'now').mockReturnValueOnce(100 + i);
      await recordRecentPlay(`old-${i}`);
    }
    for (let i = 0; i < 3; i++) {
      vi.spyOn(Date, 'now').mockReturnValueOnce(999_000 + i);
      await recordRecentPlay(`new-${i}`);
    }

    const db = await getDb();
    const all = await db.getAll('recently-played');
    expect(all).toHaveLength(100);

    // The 3 newest entries must still be present
    const hashes = new Set(all.map((r) => r.fileHash));
    expect(hashes.has('new-0')).toBe(true);
    expect(hashes.has('new-1')).toBe(true);
    expect(hashes.has('new-2')).toBe(true);
  });

  it('does not trim when at exactly MAX_RECENT_ENTRIES', async () => {
    for (let i = 0; i < 100; i++) {
      vi.spyOn(Date, 'now').mockReturnValueOnce(1000 + i);
      await recordRecentPlay(`hash-${i}`);
    }

    const db = await getDb();
    const count = await db.count('recently-played');
    expect(count).toBe(100);
  });
});
