/**
 * Unit tests for cover-art-storage.ts — IndexedDB CRUD for cover art.
 *
 * Uses fake-indexeddb to run real IDB transactions in-memory.
 */

import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { resetDbInstance } from '@/storage/db';

import {
  deleteCoverArt,
  getCoverArt,
  storeCoverArt,
} from './cover-art-storage';

describe('cover-art-storage', () => {
  beforeEach(() => {
    resetDbInstance();
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  it('returns null for non-existent game title', async () => {
    const result = await getCoverArt('Nonexistent Game');
    expect(result).toBeNull();
  });

  it('stores and retrieves cover art', async () => {
    const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    await storeCoverArt('Chrono Trigger', imageData);

    const result = await getCoverArt('Chrono Trigger');
    expect(result).not.toBeNull();
    const art = result as Uint8Array;
    expect(art.length).toBe(8);
    expect(art[0]).toBe(0x89);
    expect(art[1]).toBe(0x50);
  });

  it('overwrites existing art for the same game title', async () => {
    const first = new Uint8Array([1, 2, 3]);
    const second = new Uint8Array([4, 5, 6, 7]);

    await storeCoverArt('Super Mario World', first);
    await storeCoverArt('Super Mario World', second);

    const result = await getCoverArt('Super Mario World');
    expect(result).not.toBeNull();
    const art = result as Uint8Array;
    expect(art.length).toBe(4);
    expect(art[0]).toBe(4);
  });

  it('stores art with specified source', async () => {
    const imageData = new Uint8Array([1, 2, 3]);
    await storeCoverArt('Test Game', imageData, 'retroarch');

    const result = await getCoverArt('Test Game');
    expect(result).not.toBeNull();
  });

  it('deletes cover art', async () => {
    const imageData = new Uint8Array([1, 2, 3]);
    await storeCoverArt('Delete Me', imageData);

    await deleteCoverArt('Delete Me');
    const result = await getCoverArt('Delete Me');
    expect(result).toBeNull();
  });

  it('delete is silent for non-existent game title', async () => {
    await expect(deleteCoverArt('Nonexistent')).resolves.toBeUndefined();
  });

  it('isolates art between different game titles', async () => {
    await storeCoverArt('Game A', new Uint8Array([1, 1, 1]));
    await storeCoverArt('Game B', new Uint8Array([2, 2, 2]));

    const artA = await getCoverArt('Game A');
    const artB = await getCoverArt('Game B');
    const dataA = artA as Uint8Array;
    const dataB = artB as Uint8Array;
    expect(dataA[0]).toBe(1);
    expect(dataB[0]).toBe(2);
  });
});
