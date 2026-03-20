import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

interface SpcPlayerDB extends DBSchema {
  'zustand-state': {
    key: string;
    value: string;
  };
  'spc-files': {
    key: number;
    value: {
      id?: number;
      hash: string;
      name: string;
      data: ArrayBuffer;
      game: string;
      artist: string;
      addedAt: number;
      size: number;
    };
    indexes: {
      'by-hash': string;
      'by-game': string;
      'by-artist': string;
      'by-added': number;
    };
  };
  'recently-played': {
    key: number;
    value: {
      id?: number;
      fileHash: string;
      playedAt: number;
    };
    indexes: {
      'by-played': number;
    };
  };
  'timing-overrides': {
    key: string;
    value: {
      trackId: string;
      loopCount: number | null;
      durationSeconds: number | null;
      fadeSeconds: number | null;
      updatedAt: number;
    };
  };
}

const DB_NAME = 'spc-player';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<SpcPlayerDB> | null = null;

export const getDb = async (): Promise<IDBPDatabase<SpcPlayerDB>> => {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SpcPlayerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v0 → v1: initial stores ──────────────────────────────
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('zustand-state')) {
          db.createObjectStore('zustand-state');
        }
        if (!db.objectStoreNames.contains('spc-files')) {
          const fileStore = db.createObjectStore('spc-files', {
            keyPath: 'id',
            autoIncrement: true,
          });
          fileStore.createIndex('by-hash', 'hash', { unique: true });
          fileStore.createIndex('by-game', 'game');
          fileStore.createIndex('by-artist', 'artist');
          fileStore.createIndex('by-added', 'addedAt');
        }
        if (!db.objectStoreNames.contains('recently-played')) {
          const rpStore = db.createObjectStore('recently-played', {
            keyPath: 'id',
            autoIncrement: true,
          });
          rpStore.createIndex('by-played', 'playedAt');
        }
      }

      // ── v1 → v2: timing overrides store ─────────────────────
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains('timing-overrides')) {
          db.createObjectStore('timing-overrides', {
            keyPath: 'trackId',
          });
        }
      }
    },
  });

  return dbInstance;
};

/** Reset the cached DB instance (for testing). */
export const resetDbInstance = (): void => {
  dbInstance = null;
};

export type { SpcPlayerDB };
