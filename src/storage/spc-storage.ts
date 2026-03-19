import { getDb } from './db';

export interface StoredSpcFile {
  readonly id?: number;
  readonly hash: string;
  readonly name: string;
  readonly data: ArrayBuffer;
  readonly game: string;
  readonly artist: string;
  readonly addedAt: number;
  readonly size: number;
}

/** Save an SPC file to IndexedDB. Returns the auto-incremented ID. Deduplicates by hash. */
export const saveSpcToStorage = async (
  file: StoredSpcFile,
): Promise<number> => {
  const db = await getDb();
  const existing = await db.getFromIndex('spc-files', 'by-hash', file.hash);
  if (existing?.id != null) {
    return existing.id;
  }
  const id = await db.add('spc-files', {
    hash: file.hash,
    name: file.name,
    data: file.data,
    game: file.game,
    artist: file.artist,
    addedAt: file.addedAt,
    size: file.size,
  });
  return id;
};

/** Load an SPC file from IndexedDB by its hash. Returns null if not found. */
export const loadSpcFromStorage = async (
  hash: string,
): Promise<ArrayBuffer | null> => {
  const db = await getDb();
  const record = await db.getFromIndex('spc-files', 'by-hash', hash);
  return record?.data ?? null;
};

/** Delete an SPC file from IndexedDB by its hash. */
export const deleteSpcFromStorage = async (hash: string): Promise<void> => {
  const db = await getDb();
  const record = await db.getFromIndex('spc-files', 'by-hash', hash);
  if (record?.id != null) {
    await db.delete('spc-files', record.id);
  }
};
