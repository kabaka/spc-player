import { getDb } from './db';

const MAX_RECENT_ENTRIES = 100;

/** Record a recently-played track. Fire-and-forget — never blocks playback. */
export const recordRecentPlay = async (fileHash: string): Promise<void> => {
  const db = await getDb();
  await db.add('recently-played', {
    fileHash,
    playedAt: Date.now(),
  });

  // Trim old entries beyond the limit
  const count = await db.count('recently-played');
  if (count > MAX_RECENT_ENTRIES) {
    const excess = count - MAX_RECENT_ENTRIES;
    const tx = db.transaction('recently-played', 'readwrite');
    const index = tx.store.index('by-played');
    let cursor = await index.openCursor();
    let deleted = 0;
    while (cursor && deleted < excess) {
      await cursor.delete();
      deleted++;
      cursor = await cursor.continue();
    }
    await tx.done;
  }
};
