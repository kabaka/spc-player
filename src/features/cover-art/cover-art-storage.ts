import { getDb } from '@/storage/db';

const STORE_NAME = 'cover-art' as const;

/**
 * Store cover art image data in IndexedDB for a game title.
 * Overwrites any existing art for the same game title.
 */
export async function storeCoverArt(
  gameTitle: string,
  imageData: Uint8Array,
  source: 'user' | 'retroarch' = 'user',
): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, {
    gameTitle,
    imageData: (imageData.buffer as ArrayBuffer).slice(
      imageData.byteOffset,
      imageData.byteOffset + imageData.byteLength,
    ) as ArrayBuffer,
    source,
    cachedAt: Date.now(),
  });
}

/**
 * Retrieve cover art image data from IndexedDB for a game title.
 * Returns null if not found.
 */
export async function getCoverArt(
  gameTitle: string,
): Promise<Uint8Array | null> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, gameTitle);
  if (!record) return null;
  return new Uint8Array(record.imageData);
}

/**
 * Delete cover art image data from IndexedDB for a game title.
 */
export async function deleteCoverArt(gameTitle: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, gameTitle);
}
