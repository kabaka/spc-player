---
name: offline-storage
description: IndexedDB patterns, storage quotas, and offline data persistence for SPC files and user data.
---

# Offline Storage

Use this skill when implementing file storage, playlists, preferences, or any persistent client-side data.

## IndexedDB Overview

IndexedDB is the primary storage mechanism for SPC Player. It stores:

- **SPC files**: binary data (ArrayBuffer).
- **Metadata**: parsed ID666/xid6 tags, file info.
- **Playlists**: user-created collections.
- **Preferences**: settings, UI state.

## Schema Design

```typescript
const DB_NAME = 'spc-player';
const DB_VERSION = 1;

// Object stores:
// 'files'     — key: auto-increment id, indexes: [hash, name, game, artist]
// 'playlists' — key: auto-increment id, indexes: [name]
// 'settings'  — key: string (setting name), value: any
```

- Use auto-increment keys for files and playlists.
- Create indexes on fields you need to query (game, artist).
- Store file hash (SHA-256) to detect duplicates.

## Wrapper Library

Use a lightweight wrapper like `idb` (by Jake Archibald) for a Promise-based API:

```typescript
import { openDB } from 'idb';

const db = await openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    const fileStore = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
    fileStore.createIndex('hash', 'hash', { unique: true });
    fileStore.createIndex('game', 'game');
    db.createObjectStore('settings');
  },
});

// Store a file
await db.put('files', { hash, name, data: arrayBuffer, game, artist, addedAt: Date.now() });

// Get by ID
const file = await db.get('files', id);

// Query by game
const files = await db.getAllFromIndex('files', 'game', 'Chrono Trigger');
```

## Storage Quotas

- Check available storage: `const { usage, quota } = await navigator.storage.estimate();`
- Request persistent storage: `await navigator.storage.persist();`
- Typical SPC file: 64 KB. Users could store thousands.
- Warn users when storage usage exceeds 80% of quota.
- Provide a storage management UI showing total usage and per-file sizes.

## Data Integrity

- Validate data on read — don't assume stored data is well-formed.
- Handle `QuotaExceededError` when writing.
- Handle version upgrades gracefully in the `upgrade` callback.
- Never delete user data without explicit confirmation.

## Import / Export

- Allow users to export their library as a zip file (SPC files + metadata JSON).
- Allow importing from a zip to restore a library.
- Use the File System Access API where available for better UX.

## Cleanup

- Provide a "clear all data" option in settings.
- When removing a file, also remove it from all playlists.
- Use transactions for multi-step operations to maintain consistency.
