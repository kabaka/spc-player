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
}

const DB_NAME = 'spc-player';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<SpcPlayerDB> | null = null;

export const getDb = async (): Promise<IDBPDatabase<SpcPlayerDB>> => {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SpcPlayerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
    },
  });

  return dbInstance;
};

export type { SpcPlayerDB };
