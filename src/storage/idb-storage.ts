import type { StateStorage } from 'zustand/middleware';
import { getDb } from './db';

const STORE_NAME = 'zustand-state' as const;

export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const db = await getDb();
    return (await db.get(STORE_NAME, name)) ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const db = await getDb();
    await db.put(STORE_NAME, value, name);
  },
  removeItem: async (name: string): Promise<void> => {
    const db = await getDb();
    await db.delete(STORE_NAME, name);
  },
};
