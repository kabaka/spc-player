/**
 * Unit tests for spc-storage.ts — IndexedDB CRUD for SPC files.
 *
 * Uses fake-indexeddb to run real IDB transactions in-memory.
 */

import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { resetDbInstance } from './db';
import type { StoredSpcFile } from './spc-storage';
import {
  deleteSpcFromStorage,
  loadSpcFromStorage,
  saveSpcToStorage,
} from './spc-storage';

const makeSpcFile = (
  overrides: Partial<StoredSpcFile> = {},
): StoredSpcFile => ({
  hash: overrides.hash ?? 'abc123',
  name: overrides.name ?? 'test.spc',
  data: overrides.data ?? new ArrayBuffer(256),
  game: overrides.game ?? 'Super Game',
  artist: overrides.artist ?? 'Composer',
  addedAt: overrides.addedAt ?? Date.now(),
  size: overrides.size ?? 256,
});

describe('spc-storage', () => {
  beforeEach(() => {
    resetDbInstance();
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  describe('saveSpcToStorage', () => {
    it('saves a file and returns its ID', async () => {
      const id = await saveSpcToStorage(makeSpcFile());
      expect(id).toBeGreaterThan(0);
    });

    it('deduplicates by hash and returns existing ID', async () => {
      const file = makeSpcFile({ hash: 'dup-hash' });
      const id1 = await saveSpcToStorage(file);
      const id2 = await saveSpcToStorage(
        makeSpcFile({ hash: 'dup-hash', name: 'other.spc' }),
      );
      expect(id2).toBe(id1);
    });

    it('stores different hashes independently', async () => {
      const id1 = await saveSpcToStorage(makeSpcFile({ hash: 'hash-a' }));
      const id2 = await saveSpcToStorage(makeSpcFile({ hash: 'hash-b' }));
      expect(id1).not.toBe(id2);
    });
  });

  describe('loadSpcFromStorage', () => {
    it('returns null for non-existent hash', async () => {
      const result = await loadSpcFromStorage('nonexistent');
      expect(result).toBeNull();
    });

    it('returns the ArrayBuffer for an existing file', async () => {
      const data = new ArrayBuffer(128);
      new Uint8Array(data).set([0x53, 0x4e, 0x45, 0x53]); // "SNES"
      await saveSpcToStorage(makeSpcFile({ hash: 'load-test', data }));

      const loaded = await loadSpcFromStorage('load-test');
      expect(loaded).not.toBeNull();
      expect(new Uint8Array(loaded as ArrayBuffer).slice(0, 4)).toEqual(
        new Uint8Array([0x53, 0x4e, 0x45, 0x53]),
      );
    });
  });

  describe('deleteSpcFromStorage', () => {
    it('deletes an existing file by hash', async () => {
      await saveSpcToStorage(makeSpcFile({ hash: 'del-test' }));
      await deleteSpcFromStorage('del-test');

      const result = await loadSpcFromStorage('del-test');
      expect(result).toBeNull();
    });

    it('is a no-op for a non-existent hash', async () => {
      await expect(
        deleteSpcFromStorage('does-not-exist'),
      ).resolves.toBeUndefined();
    });

    it('does not affect other stored files', async () => {
      await saveSpcToStorage(makeSpcFile({ hash: 'keep-me' }));
      await saveSpcToStorage(makeSpcFile({ hash: 'remove-me' }));
      await deleteSpcFromStorage('remove-me');

      const kept = await loadSpcFromStorage('keep-me');
      expect(kept).not.toBeNull();
    });
  });
});
