/**
 * Unit tests for timing-overrides.ts — IndexedDB CRUD operations.
 *
 * Uses fake-indexeddb to run real IDB transactions in-memory.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions validate non-null before use */

import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDbInstance } from './db';
import {
  deleteTimingOverride,
  getTimingOverride,
  setTimingOverride,
} from './timing-overrides';

describe('timing-overrides', () => {
  beforeEach(() => {
    // Reset the singleton DB so each test gets a fresh database
    resetDbInstance();

    // Clear all databases in fake-indexeddb
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  it('returns null for non-existent trackId', async () => {
    const result = await getTimingOverride('nonexistent-hash');
    expect(result).toBeNull();
  });

  it('writes and reads back a timing override', async () => {
    await setTimingOverride('abc123', {
      loopCount: 3,
      durationSeconds: 120,
      fadeSeconds: 5,
    });

    const result = await getTimingOverride('abc123');
    expect(result).not.toBeNull();
    expect(result!.trackId).toBe('abc123');
    expect(result!.loopCount).toBe(3);
    expect(result!.durationSeconds).toBe(120);
    expect(result!.fadeSeconds).toBe(5);
    expect(result!.updatedAt).toBeGreaterThan(0);
  });

  it('supports null fields (use default)', async () => {
    await setTimingOverride('def456', {
      loopCount: null,
      durationSeconds: null,
      fadeSeconds: 10,
    });

    const result = await getTimingOverride('def456');
    expect(result).not.toBeNull();
    expect(result!.loopCount).toBeNull();
    expect(result!.durationSeconds).toBeNull();
    expect(result!.fadeSeconds).toBe(10);
  });

  it('updates (upserts) an existing override', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000);
    await setTimingOverride('abc123', {
      loopCount: 2,
      durationSeconds: 60,
      fadeSeconds: 3,
    });

    vi.spyOn(Date, 'now').mockReturnValueOnce(2000);
    await setTimingOverride('abc123', {
      loopCount: 5,
      durationSeconds: 180,
      fadeSeconds: 8,
    });

    const result = await getTimingOverride('abc123');
    expect(result).not.toBeNull();
    expect(result!.loopCount).toBe(5);
    expect(result!.durationSeconds).toBe(180);
    expect(result!.fadeSeconds).toBe(8);
    expect(result!.updatedAt).toBe(2000);
  });

  it('deletes an existing override', async () => {
    await setTimingOverride('abc123', {
      loopCount: 2,
      durationSeconds: null,
      fadeSeconds: null,
    });

    await deleteTimingOverride('abc123');

    const result = await getTimingOverride('abc123');
    expect(result).toBeNull();
  });

  it('delete is a no-op for non-existent trackId', async () => {
    // Should not throw
    await expect(
      deleteTimingOverride('does-not-exist'),
    ).resolves.toBeUndefined();
  });

  it('stores multiple overrides independently', async () => {
    await setTimingOverride('track-a', {
      loopCount: 1,
      durationSeconds: 60,
      fadeSeconds: 5,
    });
    await setTimingOverride('track-b', {
      loopCount: 3,
      durationSeconds: null,
      fadeSeconds: 10,
    });

    const a = await getTimingOverride('track-a');
    const b = await getTimingOverride('track-b');

    expect(a!.loopCount).toBe(1);
    expect(b!.loopCount).toBe(3);
  });
});
