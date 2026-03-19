---
name: api-design
description: Internal API contract design, type-safe interfaces, and worker/WASM message protocols.
---

# API Design

Use this skill when defining interfaces between modules, worker message protocols, or WASM interop boundaries.

## Principles

- **Minimal surface**: expose only what consumers need.
- **Type-safe boundaries**: no `any` at API boundaries. Use discriminated unions for messages.
- **Immutable data**: prefer readonly types at boundaries.
- **Explicit errors**: use Result types or discriminated unions for expected failures.
- **Serializable messages**: worker/AudioWorklet messages must be structured-clone-safe.

## Worker Message Protocol

Messages between main thread and workers/AudioWorklet use a discriminated union:

```typescript
type MainToWorker =
  | { type: 'load'; spcData: ArrayBuffer }
  | { type: 'play'; startSample?: number }
  | { type: 'pause' }
  | { type: 'set-voice-mask'; mask: number }
  | { type: 'set-speed'; factor: number };

type WorkerToMain =
  | { type: 'ready' }
  | { type: 'position'; sample: number }
  | { type: 'error'; message: string; code: string }
  | { type: 'metadata'; tags: SpcMetadata };
```

- Every message has a `type` discriminator.
- Protocol versioning: include a `version` field in the initial handshake.
- Use `Transferable` for large buffers (ArrayBuffer) to avoid copies.

## WASM Interop

- Export only the functions JS needs to call.
- Use typed views (`Float32Array`, `Int16Array`) over WASM linear memory.
- Document memory layout: who allocates, who frees, what alignment.
- Keep the interop layer thin — logic lives in WASM or JS, not in the bridge.

## Storage API

- IndexedDB access goes through a typed service layer.
- Operations return `Promise<Result<T, StorageError>>` or equivalent.
- Schema version is explicit. Migrations run on open.
- Transactions are scoped to the minimum necessary stores.

## Rules

- Define interfaces before implementation.
- Changes to public APIs require review from the api-designer.
- Breaking changes to message protocols require a version bump and migration path.
