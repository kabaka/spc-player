---
status: "accepted"
date: 2026-03-18
---

# Use `idb` as the IndexedDB Wrapper Library

## Context and Problem Statement

SPC Player requires persistent client-side storage for user settings, playlists, recently played tracks, export preferences, and optionally cached SPC files ([requirements](../requirements.md)). The architecture identifies Storage (IDB) as a Platform Service ([architecture](../architecture.md)). ADR-0005 selects Zustand with `persist` middleware and specifies an IndexedDB storage adapter, but leaves the specific IndexedDB library undecided — mentioning both `idb-keyval` and "a thin custom wrapper around the raw IndexedDB API" as possibilities.

The project has two distinct IndexedDB access patterns:

1. **Key-value persistence for Zustand** — the `persist` middleware needs a simple async `getItem`/`setItem`/`removeItem` adapter to serialize and restore store slices (settings, playlists, playback preferences, export preferences). This is a single-key read/write per hydration/persist cycle.

2. **Structured storage for SPC file caching** — cached SPC files (~64 KB ArrayBuffers each) need their own object store with indexes on metadata fields (hash, game, artist) for deduplication and querying, storage quota awareness, and eviction under pressure. Recently played tracks need an ordered, bounded list. These patterns go beyond key-value semantics.

Which IndexedDB wrapper library — if any — should SPC Player adopt to serve both access patterns with minimal bundle cost, adequate query capability, type safety, and a migration path for future schema evolution?

## Decision Drivers

- **Bundle size** — SPC Player is a PWA with a constrained first-load budget (FCP < 1.5 s, TTI < 3 s). The WASM DSP binary contributes ~50–100 KB. Every kilobyte of JavaScript counts, especially before Service Worker caching is established.
- **Zustand `persist` middleware compatibility** — the adapter interface is `{ getItem, setItem, removeItem }` returning Promises. The chosen library must support this pattern trivially.
- **Binary data handling** — SPC files are `ArrayBuffer` objects (~64 KB each). The library must store and retrieve binary data without base64 encoding overhead.
- **Schema versioning and migrations** — the data model will evolve (new indexes, new stores, field renames). The library must support versioned upgrade callbacks that run automatically when the database version increments.
- **Transaction support** — atomic multi-record operations are needed for playlist reordering (moving multiple entries), file deletion with cascading playlist cleanup, and batch imports.
- **Query capability** — SPC file caching requires indexed lookups by hash (deduplication), game title, and artist. Recently played needs ordered retrieval. Pure key-value access is insufficient for these patterns.
- **TypeScript type safety** — the project uses TypeScript strict mode. The library should support typed schemas, typed stores, and typed indexes to catch misuse at compile time.
- **API ergonomics** — Promise-based APIs are expected. Callback-based or event-driven patterns add friction.
- **Worker and AudioWorklet compatibility** — IndexedDB is available in Workers and AudioWorklets. The library must not depend on DOM APIs.
- **AI agent code quality** — the library must be well-represented in LLM training data to produce correct, idiomatic patterns. Community adoption and documentation depth matter.
- **Maintenance status** — the library should be actively maintained or stable enough to not require ongoing maintenance.
- **Storage quota management** — the library should not interfere with `navigator.storage.estimate()` and `navigator.storage.persist()` calls. Quota management is application-level, not library-level.

## Considered Options

- **Option 1**: Raw IndexedDB API (no wrapper)
- **Option 2**: `idb` (by Jake Archibald) — thin Promise-based IndexedDB wrapper
- **Option 3**: `idb-keyval` (by Jake Archibald) — ultra-simple key-value store on IndexedDB
- **Option 4**: Dexie.js — full-featured IndexedDB wrapper with query API

## Decision Outcome

Chosen option: **"`idb`"**, because it is the only option that satisfies all decision drivers simultaneously. At ~1.2 KB gzipped, it adds negligible bundle overhead while wrapping the full IndexedDB API with Promises, typed schemas via `DBSchema`, versioned `upgrade` callbacks, transaction support, and shortcut methods for common operations. It serves both access patterns: a trivial `get`/`put`/`delete` adapter for Zustand's `persist` middleware, and full transactional object stores with indexes for SPC file caching and structured data.

The `idb-keyval` library is a natural companion — it can be used as the Zustand persist adapter for its minimal API surface — but alone it cannot serve the structured storage needs. Dexie.js provides more than is needed at ~8× the bundle cost (~10 KB vs ~1.2 KB gzipped). Raw IndexedDB is unnecessarily painful. `idb` occupies the sweet spot: it wraps the standard API without abstracting it away, so developers (and AI agents) working with `idb` are simultaneously learning IndexedDB itself.

### Zustand Persist Adapter Implementation

The Zustand `persist` middleware adapter is implemented using `idb` directly, without requiring `idb-keyval` as a separate dependency:

```typescript
import { openDB } from 'idb';
import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'spc-player';
const ZUSTAND_STORE = 'zustand-state';

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(ZUSTAND_STORE)) {
      db.createObjectStore(ZUSTAND_STORE);
    }
  },
});

export const idbStorage: StateStorage = {
  getItem: async (name: string) => {
    const db = await dbPromise;
    return (await db.get(ZUSTAND_STORE, name)) ?? null;
  },
  setItem: async (name: string, value: string) => {
    const db = await dbPromise;
    await db.put(ZUSTAND_STORE, value, name);
  },
  removeItem: async (name: string) => {
    const db = await dbPromise;
    await db.delete(ZUSTAND_STORE, name);
  },
};
```

### SPC File Cache Schema

```typescript
import { openDB, DBSchema } from 'idb';

interface SpcPlayerDB extends DBSchema {
  'zustand-state': {
    key: string;
    value: string;
  };
  files: {
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
```

### Consequences

- Good, because `idb` wraps the standard IndexedDB API with Promises without introducing new abstractions — the mental model maps 1:1 to IndexedDB concepts (object stores, indexes, transactions, cursors), reducing the learning curve and making MDN documentation directly applicable.
- Good, because ~1.2 KB gzipped is negligible relative to the application's bundle budget and smaller than every alternative except `idb-keyval`.
- Good, because `DBSchema` interface typing provides compile-time safety for store names, key types, value shapes, and index names — catching typos and type mismatches before runtime.
- Good, because versioned `upgrade` callbacks enable non-destructive schema migrations (adding stores, creating indexes, renaming fields) that run automatically when the database version increments.
- Good, because transaction support enables atomic multi-record operations for playlist reordering, cascading file deletion, and batch imports.
- Good, because shortcut methods (`db.get()`, `db.put()`, `db.delete()`, `db.getFromIndex()`, `db.getAllFromIndex()`) provide ergonomic single-operation access without manual transaction management, while full transactions remain available for multi-step operations.
- Good, because `idb` has no DOM dependencies and works in Web Workers, Service Workers, and SharedWorkers — enabling future use of IndexedDB from the Service Worker for cache management or background sync.
- Good, because `idb` is authored by Jake Archibald (Chrome DevRel, IndexedDB specification contributor) and is the most widely recommended IndexedDB wrapper in web development resources. It is extensively represented in LLM training data through Google developer documentation, MDN references, and community tutorials.
- Good, because using a single library for both key-value adapter and structured storage avoids the complexity and potential version conflicts of managing two IndexedDB wrappers (`idb` + `idb-keyval`) accessing the same database.
- Good, because ArrayBuffer storage is native to IndexedDB and `idb` passes it through without serialization overhead — SPC files are stored and retrieved as raw binary data.
- Bad, because `idb` requires more code than `idb-keyval` for simple get/set operations — the Zustand adapter (~20 lines) is more verbose than `idb-keyval`'s one-liner. This is a one-time cost with no ongoing maintenance burden.
- Bad, because `idb`'s upgrade callback must handle all schema versions sequentially (checking `oldVersion` and applying each migration), which becomes verbose as the version count grows. This is shared with raw IndexedDB and is inherent to the IndexedDB specification, not a library limitation.
- Bad, because `idb` exposes the full complexity of IndexedDB transactions — developers must understand transaction lifetimes (no awaiting non-IDB Promises within a transaction) and the auto-commit behavior. The transaction model is the same as raw IndexedDB; `idb` does not add guard rails.
- Bad, because `idb` is a thin wrapper, not a framework — there is no built-in query builder, no reactive queries, no automatic data validation. Application code must implement these patterns as needed.

### Confirmation

1. **Adapter integration test** — configure Zustand's `persist` middleware with the `idbStorage` adapter. Set state, close the store, rehydrate from a new store instance, and verify all persisted fields match. Confirm non-persisted fields (e.g., `mixer`) are absent from IndexedDB.
2. **Binary round-trip test** — store a known SPC file (`ArrayBuffer`) in the `files` store. Retrieve it by ID and verify byte-for-byte equality via `crypto.subtle.digest` comparison. Verify the stored size matches the original.
3. **Index query test** — store 10 files with varied `game` and `artist` fields. Use `db.getAllFromIndex('files', 'by-game', 'Chrono Trigger')` and verify only matching records are returned. Repeat for `by-artist` and `by-hash`.
4. **Schema migration test** — open the database at version 1 with the initial schema. Close it. Reopen at version 2 with an additional index. Verify the upgrade callback runs, the new index is created, and existing data is preserved.
5. **Transaction atomicity test** — start a `readwrite` transaction on the `files` store. Add two records. Deliberately throw an error before `tx.done`. Verify neither record was persisted (transaction rolled back).
6. **Bundle size verification** — add `idb` to the project dependencies and measure the production bundle delta. Verify the increase is ≤ 1.5 KB gzipped.
7. **Worker compatibility test** — import `idb` in a Web Worker script. Open the database and perform a `get`/`put` cycle. Verify it succeeds without DOM-related errors.

## Pros and Cons of the Options

### Raw IndexedDB API

The browser's built-in IndexedDB API without any wrapper library. Zero bundle cost. Full control over transactions, versioning, and error handling.

- Good, because zero additional bytes — no library dependency at all.
- Good, because direct access to every IndexedDB feature: transactions, cursors, key ranges, compound indexes, and version upgrades.
- Good, because no abstraction leaks — what you write is exactly what executes.
- Good, because available in all modern browsers (IE10+) and all worker contexts without polyfills.
- Neutral, because MDN documentation is comprehensive but the API is low-level and verbose, requiring significant boilerplate for common patterns.
- Bad, because the API is event-based (`onsuccess`, `onerror`, `onupgradeneeded`), not Promise-based. Every operation requires an `IDBRequest` event handler, leading to deeply nested or manually promisified code.
- Bad, because error handling is fragmented — errors propagate via `onerror` events, transaction `onabort` events, and request `onerror` events, all of which must be handled independently. Missing an error handler can silently swallow failures.
- Bad, because TypeScript typings for raw IndexedDB (`lib.dom.d.ts`) are generic — there is no way to express typed store names, typed values, or typed indexes at the type level without building a custom type layer (effectively reimplementing `idb`'s `DBSchema`).
- Bad, because AI agents produce inconsistent boilerplate around raw IndexedDB — the verbosity and event-based patterns lead to varied code patterns across invocations, increasing review burden and defect risk.
- Bad, because every project using raw IndexedDB eventually builds its own Promise wrapper, duplicating effort and introducing untested custom utility code.

### `idb` (by Jake Archibald)

A ~1.2 KB gzipped library that wraps the IndexedDB API with Promises and adds convenience methods. Mirrors the full IndexedDB API surface — stores, indexes, transactions, cursors — but replaces event handlers with `async`/`await`. Provides `DBSchema` for TypeScript type safety. Created and maintained by Jake Archibald, former Chrome DevRel and IndexedDB specification contributor.

- Good, because ~1.2 KB gzipped adds negligible bundle overhead — roughly the size of a small SVG icon.
- Good, because the API is a 1:1 Promise-based mirror of IndexedDB — every `IDBDatabase`, `IDBTransaction`, `IDBObjectStore`, `IDBIndex`, and `IDBCursor` method has a Promise-returning equivalent, so IndexedDB knowledge transfers directly.
- Good, because `DBSchema` interface typing enables compile-time validation of store names, key types, value types, and index names, catching errors that raw IndexedDB would surface only at runtime.
- Good, because shortcut methods (`db.get()`, `db.put()`, `db.delete()`, `db.getAll()`, `db.getFromIndex()`, `db.getAllFromIndex()`, `db.countFromIndex()`) reduce boilerplate for single-operation transactions to one-liners.
- Good, because full transaction support via `db.transaction()` enables multi-step atomic operations with proper `tx.done` completion tracking, identical to raw IndexedDB but with Promises.
- Good, because the `upgrade` callback in `openDB()` supports versioned migrations using `oldVersion`, `newVersion`, and full access to the database for creating/deleting stores and indexes — the standard IndexedDB upgrade mechanism with ergonomic improvements.
- Good, because cursor iteration is supported via async iterators (`for await (const cursor of store.iterate())`), enabling lazy traversal of large datasets without loading everything into memory.
- Good, because it is the de facto standard IndexedDB wrapper — recommended in Google's web.dev documentation, referenced in MDN articles, and used in thousands of production PWAs. AI agents produce highly consistent, correct `idb` code.
- Good, because no DOM dependencies — works in Web Workers, Service Workers, SharedWorkers, and any context with IndexedDB access.
- Good, because the library is mature and stable (first released 2016, actively maintained through 2024+) with minimal API churn.
- Neutral, because `idb` does not abstract away IndexedDB's transaction model — developers must understand that transactions auto-commit when all requests complete and that non-IDB async operations (e.g., `fetch`) within a transaction cause it to close prematurely. This is a correct reflection of IndexedDB behavior, not a library limitation.
- Bad, because the Zustand persist adapter requires ~20 lines of boilerplate to construct the `StateStorage` interface, whereas `idb-keyval` would provide a near-zero-code adapter. This is a one-time, trivial cost.
- Bad, because `idb` does not provide higher-level abstractions like query builders, live queries, or data validation — application code must implement these patterns when needed.
- Bad, because the versioned upgrade callback grows linearly with schema versions — each migration must be guarded by an `if (oldVersion < N)` block, accumulating over time. This is inherent to IndexedDB's versioning model, not specific to `idb`.

### `idb-keyval` (by Jake Archibald)

An ultra-simple ~600 byte (gzipped) key-value store built on IndexedDB. Provides `get`, `set`, `del`, `clear`, `keys`, `values`, `entries`, `getMany`, `setMany`, `delMany`, and `update` functions. Uses a single object store per database. No schema versioning, no indexes, no transactions beyond single-key operations. Created by Jake Archibald.

- Good, because ~600 bytes gzipped is the smallest possible IndexedDB abstraction — half the size of `idb`.
- Good, because the API (`get`, `set`, `del`) maps directly to Zustand's `persist` `StateStorage` interface with near-zero adapter code.
- Good, because it handles IndexedDB connection management internally — no `openDB`, no version management, no upgrade callbacks to write.
- Good, because `setMany`/`getMany`/`delMany` batch operations use a single transaction for efficiency.
- Good, because the `update` function provides atomic read-modify-write semantics, avoiding the race condition inherent in separate `get` → transform → `set` sequences.
- Good, because the API is small enough that AI agents produce virtually error-free code — there are fewer wrong ways to use it.
- Bad, because it supports only a single object store per `createStore()` call — multiple stores require multiple databases (separate `createStore` instances), which fragments the data and prevents cross-store transactions.
- Bad, because there is no schema versioning or upgrade mechanism — if the data model changes (new fields, renamed keys, structural changes), migration must be handled entirely in application code outside the library.
- Bad, because there are no indexes — querying by a secondary field (e.g., finding SPC files by game title) requires loading all records and filtering in JavaScript. This is unacceptable for collections with hundreds of entries.
- Bad, because it does not support transactions across multiple keys — there is no way to atomically update a playlist and its member files, or delete a file and remove it from all playlists, without building custom transaction logic around the underlying `IDBDatabase` instance (defeating the purpose of the wrapper).
- Bad, because there is no TypeScript schema typing beyond `IDBValidKey` for keys and `any` for values — no compile-time validation of stored data shapes.
- Bad, because the library's simplicity would force SPC Player to either (a) use `idb-keyval` for simple state and a second library for structured data, adding dependency complexity; or (b) implement raw IndexedDB patterns alongside `idb-keyval`, negating the benefit of the wrapper.

### Dexie.js

A full-featured IndexedDB wrapper (~29 KB minified, ~10 KB gzipped) with a fluent query API, declarative schema versioning, compound indexes, live queries (Dexie 3+), and a cloud sync add-on (Dexie Cloud). First released in 2014, actively maintained, 11k+ GitHub stars.

- Good, because declarative schema versioning (`db.version(N).stores({...}).upgrade(fn)`) is the most ergonomic migration system of any option — schema is defined as a string DSL (`'++id, name, &email'`), and Dexie automatically diffs schemas between versions to determine which stores/indexes to create or delete.
- Good, because the fluent query API (`db.files.where('game').equals('Chrono Trigger').toArray()`) provides readable, chainable queries without constructing `IDBKeyRange` objects manually.
- Good, because compound indexes and multi-entry indexes are supported without raw IndexedDB boilerplate.
- Good, because `Table.bulkAdd()`, `Table.bulkPut()`, and `Table.bulkDelete()` provide efficient batch operations.
- Good, because Dexie 3+ offers live queries via `liveQuery()` and `useLiveQuery()` (React hook) for reactive UI updates when database content changes — useful for playlist views and file browsers.
- Good, because the `Table.hook()` API enables middleware-like behavior (e.g., logging, validation) on CRUD operations.
- Good, because Dexie has strong TypeScript support with generic `Table<T>` types for typed CRUD operations.
- Good, because the library has deep documentation, a dedicated website (dexie.org), and substantial LLM training data representation.
- Neutral, because Dexie Cloud (sync add-on) is irrelevant for SPC Player (no backend), but its existence does not affect the core library.
- Bad, because ~10 KB gzipped is ~8× larger than `idb`'s ~1.2 KB gzipped — a non-trivial cost for a PWA's first-load budget, especially given that SPC Player's IndexedDB usage is relatively simple (a handful of stores with basic indexes, not complex relational queries).
- Bad, because Dexie introduces its own abstraction layer over IndexedDB — developers work with `Table`, `Collection`, and `WhereClause` objects rather than learning IndexedDB primitives. Knowledge gained working with Dexie does not transfer as directly to raw IndexedDB understanding as `idb`.
- Bad, because the schema DSL (`'++id, name, &email, [firstName+lastName]'`) is a custom string format that must be learned and is not type-checked at the schema definition level (typos in index names are runtime errors).
- Bad, because reactive live queries (`useLiveQuery`) overlap with Zustand's subscription model, creating two competing reactivity systems. SPC Player already has Zustand for reactive state; adding Dexie's reactivity introduces architectural ambiguity about which system owns which data.
- Bad, because Dexie's feature surface area (hooks, middleware, live queries, cloud sync, schema diffing) is substantially larger than needed — SPC Player needs get/put/delete, indexed lookups, transactions, and versioned migrations. Dexie provides all of this but also ships code for features that will never be used.
- Bad, because Dexie's query API, while powerful, encourages patterns that look like an ORM — `db.files.where('price').between(10, 20).and(item => item.active)` — which can mislead AI agents into treating IndexedDB like a relational database, generating inappropriate query patterns for IndexedDB's limited query capabilities.

## More Information

- [`idb` on GitHub](https://github.com/jakearchibald/idb) — full API documentation and TypeScript usage examples.
- [`idb-keyval` on GitHub](https://github.com/jakearchibald/idb-keyval) — API reference and custom store documentation.
- [Dexie.js documentation](https://dexie.org/docs/) — full API reference and versioning guide.
- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) — specification reference for the underlying API that `idb` wraps.
- Related ADRs:
  - [ADR-0005: State Management Architecture](0005-state-management-architecture.md) — declares Zustand with `persist` middleware and an IndexedDB storage adapter. This ADR resolves the adapter library choice left open in ADR-0005.
- The offline-storage skill (`/.github/skills/offline-storage/SKILL.md`) already recommends `idb` with the `openDB` pattern, schema design with auto-increment keys and indexes, and the storage quota management approach. This ADR formalizes that recommendation as an architectural decision.
- Future ADRs may address the SPC file cache eviction policy (LRU vs. LFU, eviction thresholds) and the import/export format for library backup and restore.
