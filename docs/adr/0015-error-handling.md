---
status: 'proposed'
date: 2026-03-18
---

> **Revision 2 (2026-03-19):** Added `ExportError` domain (`EXPORT_CANCELLED`, `EXPORT_OUT_OF_MEMORY`, `EXPORT_ENCODING_FAILED`, `EXPORT_CODEC_LOAD_FAILED`). Added `SPC_INVALID_DATA` to `SpcParseError`. Added `AUDIO_RENDER_OVERRUN_CRITICAL` and `AUDIO_PROTOCOL_VERSION_MISMATCH` to `AudioPipelineError`. Added `STORAGE_READ_FAILED` to `StorageError`. These additions resolve type ownership conflicts across the worker protocol, export pipeline, SPC parsing, and Zustand coordination documents.

# Hybrid Error Handling Strategy with Result Types, Error Boundaries, and Centralized Reporting

## Context and Problem Statement

SPC Player is a multi-threaded, WASM-powered PWA where errors originate in at least ten distinct domains — each with different failure modes, recoverability characteristics, and thread-boundary constraints. A Rust-compiled WASM module runs DSP emulation inside an AudioWorklet on the audio thread (ADR-0003, ADR-0007). The main thread orchestrates React rendering (ADR-0002), Zustand state management (ADR-0005), IndexedDB persistence via `idb` (ADR-0011), TanStack Router navigation (ADR-0013), and Web MIDI input. A Service Worker manages offline caching.

Without a unified error handling strategy, each AI agent implementing a module will independently choose between throwing exceptions, returning error codes, swallowing failures silently, or inventing ad-hoc error types. This produces:

- **Inconsistent user-facing messages** — some modules show raw Error.message strings, others show nothing, others show technical codes.
- **Lost errors** — caught and swallowed without logging or user notification.
- **Missing recovery paths** — errors that could be retried or recovered from (AudioContext suspension, IndexedDB quota exceeded) are treated as fatal.
- **Type-unsafe error handling** — mixing `string`, `Error`, `number`, and custom objects makes exhaustive handling impossible at compile time.
- **Untestable error paths** — without consistent patterns, error scenarios are difficult to unit test.

The application needs a single, documented strategy that every module follows — one that is specific enough for AI agents to implement without creative interpretation, yet flexible enough to handle the diversity of error sources.

The key questions are:

1. **What type system** should represent errors across the application?
2. **How should errors propagate** across thread boundaries (main thread ↔ AudioWorklet ↔ Service Worker)?
3. **How should errors be displayed** to users?
4. **What recovery strategies** apply to each error domain?
5. **How should errors be logged** for diagnostics?
6. **Where should React error boundaries** be placed in the component tree?

## Decision Drivers

- **Errors must never silently disappear** — every error must be either handled with a recovery action, displayed to the user, or logged. Bare `catch {}` blocks and `.catch(() => {})` are prohibited.
- **Users must see actionable, non-technical messages** — "Playback stopped unexpectedly. Tap to retry." not "RuntimeError: unreachable executed at wasm-function[42]:0x1a3b".
- **Audio playback should recover gracefully** — transient failures (AudioContext suspension, device disconnection, WASM trap in a non-critical path) should attempt recovery before presenting an error to the user.
- **WASM panics must not crash the entire application** — a WASM `unreachable` trap kills the AudioWorklet instance (ADR-0007), but the React UI and other application state must remain functional, and recovery (re-initializing the audio pipeline) must be possible.
- **TypeScript type safety for error handling** — error types must be discriminated unions or tagged types that TypeScript can narrow via control flow analysis, enabling exhaustive handling at compile time.
- **Consistent patterns for AI agent replication** — the chosen strategy must be specific enough that multiple AI agents independently writing different modules produce compatible error handling. No ambiguous guidance.
- **Testability of error paths** — error types and recovery logic must be unit-testable without requiring real browser APIs, WASM modules, or AudioContext instances.
- **Performance — no impact on the audio hot path** — error handling in the AudioWorklet's `process()` method must add zero overhead to the normal (non-error) path. No try/catch wrapping `process()`, no Result type unwrapping per frame, no allocation on the audio thread.
- **Serializable errors across thread boundaries** — errors crossing MessagePort (worklet → main, worker → main) must be structured-clone-compatible. `Error` objects are not structured-clone-compatible across all browsers.
- **Minimal error type surface** — the error taxonomy must be complete enough to categorize all failure modes but small enough to memorize. A 50-variant union is worse than a 10-variant union with metadata.

## Considered Options

- **Option 1: Result type pattern** — Rust-inspired `Result<T, E>` discriminated union for all fallible operations, with a custom `AppError` union type. All errors are values, never thrown.
- **Option 2: Exception-based with centralized handler** — native `throw`/`try-catch` for all errors, `window.onerror` + `window.onunhandledrejection` as global safety net, React error boundaries for component crashes.
- **Option 3: Hybrid approach** — Result types for expected/recoverable errors (parsing, validation, storage), exceptions for unexpected/unrecoverable errors (WASM traps, AudioWorklet crashes), centralized error reporting for all errors regardless of origin.
- **Option 4: Effect-based error handling** — functional effect system (e.g., `Effect-TS` or `neverthrow`) that models all operations as composable effects with typed error channels.

## Decision Outcome

Chosen option: **"Hybrid approach"** (Option 3), because it acknowledges the fundamental asymmetry between expected errors (which the code can handle) and unexpected errors (which the code cannot prevent) while providing type-safe patterns for both categories and a unified reporting layer that ensures no error is ever lost.

The core insight is that SPC Player's error domains fall into two natural categories with different optimal handling mechanisms:

**Expected errors** are failure modes that are part of normal operation — an SPC file with a corrupt header, IndexedDB quota exceeded, a MIDI device disconnected, AudioContext suspended by autoplay policy. These errors have defined recovery paths, and the code that calls the fallible operation is equipped to handle the failure. For these, **Result types** provide compile-time exhaustive handling, make the error path visible in function signatures, and prevent callers from ignoring failures.

**Unexpected errors** are failures the code does not anticipate at the call site — a WASM `unreachable` trap, an AudioWorklet `process()` method throwing an exception, a React component failing to render, an out-of-memory condition. These errors cannot be meaningfully handled by the immediate caller; they require system-level recovery (re-initializing the audio pipeline, showing an error boundary, reloading the page). For these, **exceptions and error boundaries** are the correct mechanism because they automatically propagate to the nearest handler without requiring every intermediate function to thread Result types.

The **centralized error reporter** bridges both categories: every error — whether a Result failure that cannot be recovered or an exception caught by a boundary — is reported to a single `reportError()` function that logs the error to the console, appends it to the in-memory error store, and optionally displays a user-facing notification (toast or action banner).

### Error Type Taxonomy

All application errors are represented by a discriminated union with a `code` discriminator, a user-facing `message`, and a mandatory structured `context` object:

```typescript
// — Base error shape —
// Every AppError variant carries these three fields. The `context` field
// is always present (may be an empty object) to provide structured
// diagnostic data for logging. It is never displayed to users.
//
// All `code` values use UPPER_SNAKE_CASE with a domain prefix
// (SPC_, AUDIO_, STORAGE_, MIDI_, NETWORK_, UI_) to prevent collisions,
// enable type narrowing, and ensure self-documenting log output.

type AppError =
  | SpcParseError
  | AudioPipelineError
  | StorageError
  | MidiError
  | NetworkError
  | UiError
  | ExportError;
```

#### SPC File Parsing Errors

Error codes align with the SPC parsing specification's error types. These represent hard failures where the file cannot be loaded for playback.

```typescript
interface SpcParseError {
  readonly code:
    | 'SPC_INVALID_MAGIC' // Magic bytes don't match "SNES-SPC700 Sound File Data v0.30"
    | 'SPC_FILE_TOO_SMALL' // File smaller than minimum valid SPC size (65,920 bytes)
    | 'SPC_FILE_TOO_LARGE' // File exceeds maximum allowed size (safety limit)
    | 'SPC_CORRUPT_DATA' // SPC RAM or DSP register region fails validation
    | 'SPC_METADATA_DECODE_ERROR' // ID666 or xid6 tag data is malformed (fatal only when decode prevents playback)
    | 'SPC_INVALID_DATA'; // SPC data rejected by the DSP emulator (e.g., dsp_init returns error)
  readonly message: string; // User-facing, non-technical
  readonly context: {
    readonly offset?: number; // Byte offset where the error occurred
    readonly expected?: string; // What was expected
    readonly actual?: string; // What was found
    readonly fileName?: string; // Original file name if available
    readonly fileSize?: number; // Actual file size in bytes
  };
}
```

**Note on metadata warnings:** Metadata issues that do not prevent playback (ambiguous encoding, unparseable date, truncated tag) are _warnings_, not errors. Warnings are carried in the `SpcFile` value itself (via `SpcFile.warnings`), not in the `SpcParseError` union. A file with unreadable metadata but valid RAM/DSP data is still playable. The `SPC_METADATA_DECODE_ERROR` code is reserved for the rare case where metadata decoding catastrophically fails (e.g., xid6 parsing causes an out-of-bounds read that corrupts the parse state).

#### Audio Pipeline Errors

Covers WASM, AudioWorklet, Web Audio API, and audio codec failures.

```typescript
interface AudioPipelineError {
  readonly code:
    | 'AUDIO_WASM_TRAP' // WASM unreachable instruction (Rust panic)
    | 'AUDIO_WASM_INIT_FAILED' // WASM module instantiation failure
    | 'AUDIO_WASM_RENDER_ERROR' // dsp_render returned negative error code (controlled failure)
    | 'AUDIO_WASM_RENDER_OVERRUN' // 5+ consecutive render overruns — see escalation policy
    | 'AUDIO_WORKLET_CRASHED' // AudioWorklet process() threw or was terminated
    | 'AUDIO_CONTEXT_SUSPENDED' // AudioContext entered 'suspended' state (autoplay, tab background)
    | 'AUDIO_CONTEXT_CLOSED' // AudioContext was closed and cannot be reused
    | 'AUDIO_OUTPUT_CHANGED' // Audio output device changed (sink ID changed)
    | 'AUDIO_WORKLET_LOAD_FAILED' // addModule() failed for the worklet script
    | 'AUDIO_CODEC_ERROR' // Export encoder (FLAC/OGG/MP3) failure
    | 'AUDIO_RENDER_OVERRUN_CRITICAL' // 5+ consecutive render overruns — worklet requests tear-down and rebuild
    | 'AUDIO_PROTOCOL_VERSION_MISMATCH'; // Worker/worklet protocol version incompatible with main thread
  readonly message: string;
  readonly context: {
    readonly audioContextState?: AudioContextState;
    readonly wasmErrorCode?: number;
    readonly workletProcessorName?: string;
    readonly detail?: string;
    readonly consecutiveFailures?: number;
  };
}
```

**Render overrun escalation policy:** A single `AUDIO_WASM_RENDER_ERROR` (negative return code from `dsp_render`) is logged silently and the affected audio quantum outputs silence. The worklet maintains a counter of consecutive render failures. If the counter reaches **5 consecutive overruns**, the worklet sends a message with code `AUDIO_WASM_RENDER_OVERRUN`, and the main thread treats this as equivalent to a worklet crash — initiating the full tear-down and rebuild recovery sequence. The counter resets to zero on any successful render.

#### IndexedDB / Persistence Errors

```typescript
interface StorageError {
  readonly code:
    | 'STORAGE_QUOTA_EXCEEDED' // Storage quota full
    | 'STORAGE_VERSION_CONFLICT' // DB version mismatch (multiple tabs)
    | 'STORAGE_TRANSACTION_FAILED' // Transaction aborted
    | 'STORAGE_UNAVAILABLE' // IndexedDB not available (private browsing in some browsers)
    | 'STORAGE_CORRUPTED' // Stored data fails validation on read
    | 'STORAGE_READ_FAILED'; // Failed to read from IndexedDB (transaction error, missing data)
  readonly message: string;
  readonly context: {
    readonly storeName?: string;
    readonly quotaUsed?: number;
    readonly quotaTotal?: number;
    readonly key?: string;
    readonly detail?: string;
  };
}
```

#### Web MIDI Errors

```typescript
interface MidiError {
  readonly code:
    | 'MIDI_PERMISSION_DENIED' // User denied MIDI access
    | 'MIDI_NOT_SUPPORTED' // Browser doesn't support Web MIDI
    | 'MIDI_DEVICE_DISCONNECTED' // Active MIDI device was disconnected
    | 'MIDI_DEVICE_ERROR'; // MIDI device reported an error
  readonly message: string;
  readonly context: {
    readonly deviceName?: string;
    readonly deviceId?: string;
    readonly detail?: string;
  };
}
```

#### Network / Service Worker Errors

```typescript
interface NetworkError {
  readonly code:
    | 'NETWORK_FETCH_FAILED' // Service Worker fetch failure
    | 'NETWORK_SW_UPDATE_FAILED' // Service Worker update check failed
    | 'NETWORK_WASM_FETCH_FAILED'; // Failed to download WASM binary
  readonly message: string;
  readonly context: {
    readonly url?: string;
    readonly httpStatus?: number;
    readonly detail?: string;
  };
}
```

#### UI / React Errors

This domain captures errors originating in the React component tree or other main-thread UI code that are not attributable to any specific backend domain.

```typescript
interface UiError {
  readonly code:
    | 'UI_RENDER_ERROR' // React component threw during render (caught by error boundary)
    | 'UI_UNEXPECTED_ERROR'; // Truly unknown error caught by global safety nets
  readonly message: string;
  readonly context: {
    readonly componentName?: string; // For render errors: name of the failing component/view
    readonly detail?: string; // Raw error message for diagnostics
    readonly stack?: string; // Stack trace (dev builds only, stripped in production)
  };
}
```

**Rationale:** Without this domain, React render crashes were incorrectly classified as `AUDIO_WORKLET_CRASHED`, which triggered audio pipeline recovery when only a UI component failed. The `UI_RENDER_ERROR` code maps to a silent log (the error boundary already provides the user-facing fallback UI). `UI_UNEXPECTED_ERROR` is the catch-all for errors caught by `window.onerror` / `window.onunhandledrejection` that cannot be classified into any specific domain.

#### Export Pipeline Errors

Covers errors arising during offline audio export (rendering, encoding, and packaging).

```typescript
interface ExportError {
  readonly code:
    | 'EXPORT_CANCELLED' // User cancelled the export job
    | 'EXPORT_OUT_OF_MEMORY' // Export worker ran out of memory during rendering or encoding
    | 'EXPORT_ENCODING_FAILED' // Codec encoding failed (corrupt output, encoder internal error)
    | 'EXPORT_CODEC_LOAD_FAILED'; // Failed to load codec WASM module (network error, instantiation failure)
  readonly message: string;
  readonly context: {
    readonly jobId?: string;
    readonly format?: string;
    readonly detail?: string;
  };
}
```

**Design rationale for the full taxonomy:**

- The `code` field is a **string literal union**, not a numeric enum. String codes are self-documenting in logs, structured-clone-compatible, and easily narrowed by TypeScript's control flow analysis.
- Each error interface has a unique set of `code` values with a domain prefix (`SPC_`, `AUDIO_`, `STORAGE_`, `MIDI_`, `NETWORK_`, `UI_`). This makes the full `AppError` union discriminable by code prefix pattern and by exact code value.
- The `message` field is always a pre-composed, user-facing string in plain English. It is never a raw `Error.message` from a browser API. Error construction functions (see below) provide these messages.
- The `context` field carries structured diagnostic data for logging. It is always present (may be `{}`) and is never displayed to users. The type is `Record<string, unknown>` at the base level, with domain-specific typed fields in each interface for compile-time safety within a domain.

### Result Type

Expected errors use a lightweight discriminated-union Result type:

```typescript
type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// Construction helpers
function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

**Why a custom Result type instead of `neverthrow` or `Effect-TS`:** The Result type is 6 lines of code with zero dependencies. `neverthrow` (~2 kB) and `Effect-TS` (~30+ kB) add chainable `.map()`, `.andThen()`, and `.orElse()` methods, but these encourage deep chaining patterns that are harder for AI agents to generate consistently and harder to debug (stack traces show library internals). The plain union is narrowed with a simple `if (result.ok)` check that every AI agent and every TypeScript developer understands. If chaining becomes a genuine pain point in practice, migration to `neverthrow` is a compatible extension — the type shapes are identical.

**Domain-specific Result extensions:** The SPC parsing layer defines `SpcParseResult` as `Result<SpcFile, SpcParseError>`. Parsing warnings are carried in the `SpcFile` value itself (via `SpcFile.warnings`), not on the Result type. This keeps the generic `Result<T, E>` shape unchanged and avoids a `warnings` field on the success variant that other domains don't need.

**Where Result types are used:**

- SPC file parsing functions
- IndexedDB read/write operations
- MIDI device connection attempts
- Audio pipeline initialization (non-hot-path)
- Audio export encoding

**Where Result types are NOT used:**

- The AudioWorklet `process()` method — zero overhead on the hot path
- React component render methods — React expects throw-based errors for error boundaries
- Global event handlers (`window.onerror`, `unhandledrejection`) — these receive exceptions

### Error Propagation Across Thread Boundaries

The application has three execution contexts that communicate via MessagePort:

```
Main Thread (React, Zustand, Router)
  ↕ MessagePort
AudioWorklet Thread (DSP rendering)

Main Thread
  ↕ ServiceWorker controller
Service Worker (caching, offline)
```

**AudioWorklet → Main Thread:**

Errors originating in the AudioWorklet cannot be thrown across the thread boundary. They must be serialized as structured-clone-compatible messages via `MessagePort.postMessage()`. The worker message protocol (ADR-0003) includes an error message type. **This ADR is the canonical source for error codes**; the worker protocol adopts the `AudioPipelineError['code']` union directly:

```typescript
// Message from AudioWorklet to main thread (error variant).
// The worklet sends only the code and technical context.
// The main thread maps codes to user-facing messages via factory functions.
type WorkletToMainError = {
  type: 'error';
  code: AudioPipelineError['code'];
  context?: Record<string, unknown>;
};
```

**Design note on worklet error messages:** The worklet sends only error codes and technical context — it does **not** compose user-facing message strings. The main thread's message handler calls the appropriate error factory function to construct the full `AppError` (including the `message` field) before passing it to `reportError()`. This avoids duplicating UX copy in the isolated worklet script and keeps all user-facing text in one place.

The worklet sends error messages for recoverable conditions (e.g., `dsp_render` returned a negative error code). For unrecoverable conditions (WASM trap in `process()`), the worklet cannot send a message because `process()` terminates immediately. Detection of worklet death relies on the main thread monitoring:

1. **`AudioWorkletNode.onprocessorerror`** — fires when the worklet's `process()` method throws. This is the primary detection mechanism for WASM traps (which surface as `RuntimeError` exceptions in the worklet context).
2. **Silence detection** — if the AudioWorkletNode stops producing output (all-zero buffers) while the playback state is `playing`, the main thread infers a worklet failure after a configurable timeout (~500ms). This is a secondary detection mechanism for edge cases where `onprocessorerror` does not fire.
3. **Heartbeat timeout** — the worklet sends periodic position/VU messages via MessagePort. If no message arrives for >1 second while playback is active, the main thread infers a worklet failure. This catches message port disconnection.

```typescript
// Main thread: AudioWorklet error detection
workletNode.onprocessorerror = (event) => {
  reportError(
    audioPipelineError('AUDIO_WORKLET_CRASHED', {
      detail: String(event),
    }),
  );
  // Trigger recovery: tear down audio graph, re-initialize
  useAppStore.getState().recoverAudioPipeline();
};

workletNode.port.onmessage = (event) => {
  const msg = event.data as WorkletToMain;
  if (msg.type === 'error') {
    // Main thread constructs the full AppError from the worklet's code + context
    reportError(audioPipelineError(msg.code, msg.context ?? {}));
  }
  // ... handle other message types
};
```

**WASM trap behavior (per ADR-0007):** Rust panics compile to the WASM `unreachable` instruction with `panic = "abort"`. This causes a `RuntimeError` to be thrown from the WASM call site. In the AudioWorklet, this means `process()` throws, triggering `onprocessorerror`. The WASM instance is permanently corrupted after a trap — all subsequent calls to any export will also trap. Recovery requires creating a new `WebAssembly.Instance` from the cached `WebAssembly.Module`.

**WASM trap recoverability:** WASM traps in the AudioWorklet are **recoverable** via worklet node recreation. The main thread caches the compiled `WebAssembly.Module` from initial startup, so recovery does not require re-fetching or re-compiling the WASM binary. Recovery is attempted automatically up to **3 times**. After 3 consecutive recovery failures, the application gives up and displays a persistent error banner. See the recovery table below.

**AudioWorklet `process()` error handling:**

The `process()` method itself must NOT use try/catch. Per the Web Audio specification, `process()` has a strict real-time budget (~2.67ms at 48 kHz / 128 frames). More importantly, there is nothing useful to do in a catch block inside `process()` — a WASM trap indicates the instance is dead, and recovery requires main-thread coordination. The `onprocessorerror` callback is the intended mechanism.

However, the worklet's `MessagePort.onmessage` handler (which processes control messages like play/pause/load) DOES use try/catch, because these operations are not on the audio hot path and can produce recoverable errors:

```typescript
// Inside AudioWorklet processor — message handler (not the hot path)
port.onmessage = (event) => {
  try {
    handleMessage(event.data);
  } catch (err) {
    port.postMessage({
      type: 'error',
      code: 'AUDIO_WASM_INIT_FAILED',
      context: { detail: err instanceof Error ? err.message : String(err) },
    });
  }
};
```

**Service Worker → Main Thread:**

The Service Worker communicates with the main thread via the `ServiceWorkerContainer` events and `postMessage`. Errors in the Service Worker (cache failures, network errors during update checks) are reported to the main thread via `postMessage` with the same structured error format:

```typescript
type SwToMainError = {
  type: 'sw-error';
  code: NetworkError['code'];
  context?: Record<string, unknown>;
};
```

### The `reportError()` Function

`reportError()` is the single entry point for all error visibility in the application. It performs three actions in order:

1. **Logs** the error to the console via `logError()` (always).
2. **Appends** the error to the in-memory error store (ring buffer, always).
3. **Displays** a user-facing notification (toast or action banner) unless suppressed by `{ silent: true }`.

```typescript
/**
 * Central error reporting function. Every error in the application —
 * whether from a Result failure, an exception caught by a boundary,
 * or a global safety net — passes through this function.
 *
 * @param error - The structured AppError to report.
 * @param options.silent - If true, logs and stores the error but does
 *   not show any user-facing notification. Use for errors that are
 *   already handled visually (e.g., error boundary fallbacks) or for
 *   routine conditions logged for diagnostics only.
 */
function reportError(error: AppError, options?: { silent?: boolean }): void {
  // 1. Always log to console (structured format)
  logError(error);

  // 2. Always append to in-memory error store
  appendToErrorStore(error);

  // 3. Display to user unless explicitly silent
  if (options?.silent) return;

  switch (error.code) {
    // — Action banners: require user intervention —
    case 'AUDIO_CONTEXT_SUSPENDED':
      showActionBanner({
        message: error.message,
        action: { label: 'Resume', onClick: () => resumeAudioContext() },
      });
      break;
    case 'AUDIO_WORKLET_CRASHED':
    case 'AUDIO_WASM_TRAP':
    case 'AUDIO_WASM_RENDER_OVERRUN':
    case 'AUDIO_RENDER_OVERRUN_CRITICAL':
      showActionBanner({
        message: error.message,
        action: { label: 'Retry', onClick: () => recoverAudioPipeline() },
      });
      break;

    case 'AUDIO_PROTOCOL_VERSION_MISMATCH':
      showActionBanner({
        message: error.message,
        action: { label: 'Reload', onClick: () => location.reload() },
      });
      break;

    // — Toasts: informational, auto-dismiss —
    case 'MIDI_DEVICE_DISCONNECTED':
    case 'NETWORK_SW_UPDATE_FAILED':
    case 'STORAGE_QUOTA_EXCEEDED':
    case 'AUDIO_OUTPUT_CHANGED':
      showToast({
        message: error.message,
        severity: 'warning',
        autoDismissMs: 5000,
      });
      break;

    // — Toasts: SPC parse errors (file is unusable) —
    case 'SPC_INVALID_MAGIC':
    case 'SPC_FILE_TOO_SMALL':
    case 'SPC_FILE_TOO_LARGE':
    case 'SPC_CORRUPT_DATA':
    case 'SPC_METADATA_DECODE_ERROR':
    case 'SPC_INVALID_DATA':
      showToast({
        message: error.message,
        severity: 'error',
        autoDismissMs: 8000,
      });
      break;

    // — Silent: error boundary already displays fallback UI —
    case 'UI_RENDER_ERROR':
      // No additional notification — error boundary provides the visual fallback.
      break;

    // — All remaining codes: toast with error severity —
    case 'AUDIO_WASM_INIT_FAILED':
    case 'AUDIO_WASM_RENDER_ERROR':
    case 'AUDIO_CONTEXT_CLOSED':
    case 'AUDIO_WORKLET_LOAD_FAILED':
    case 'AUDIO_CODEC_ERROR':
    case 'STORAGE_VERSION_CONFLICT':
    case 'STORAGE_TRANSACTION_FAILED':
    case 'STORAGE_UNAVAILABLE':
    case 'STORAGE_CORRUPTED':
    case 'STORAGE_READ_FAILED':
    case 'MIDI_PERMISSION_DENIED':
    case 'MIDI_NOT_SUPPORTED':
    case 'MIDI_DEVICE_ERROR':
    case 'NETWORK_FETCH_FAILED':
    case 'NETWORK_WASM_FETCH_FAILED':
    case 'UI_UNEXPECTED_ERROR':
    case 'EXPORT_OUT_OF_MEMORY':
    case 'EXPORT_ENCODING_FAILED':
    case 'EXPORT_CODEC_LOAD_FAILED':
      showToast({
        message: error.message,
        severity: 'error',
        autoDismissMs: 5000,
      });
      break;

    // — Export cancellation: silent (user initiated) —
    case 'EXPORT_CANCELLED':
      // No notification — user explicitly cancelled.
      break;

    // — Exhaustiveness check: TypeScript will error here if a code is missing —
    default: {
      const _exhaustive: never = error;
      showToast({
        message: (_exhaustive as AppError).message,
        severity: 'error',
        autoDismissMs: 5000,
      });
    }
  }
}
```

**Exhaustiveness:** The switch covers every `AppError['code']` value explicitly. The `default` branch uses a `never` assignment to trigger a TypeScript compile error if any code is missing. At runtime, the `default` branch acts as a safety net for any code that passes type checking but is somehow not handled (e.g., during migration when a new code is added to the union but not yet to the switch). This satisfies the "verify that TypeScript compiles the exhaustive switch" confirmation criterion while still providing runtime safety.

### User-Facing Error Display

Errors are displayed to users through three distinct UI patterns, selected based on severity and recoverability:

| Display Pattern             | When Used                                                            | Dismissal                                                    | Examples                                                                            |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Toast notification**      | Recoverable errors that don't interrupt core functionality           | Auto-dismiss after configured duration, or manual dismiss    | MIDI device disconnected, export format warning, storage nearing quota              |
| **Action banner**           | Recoverable errors that require user action to resolve               | Persists until resolved or dismissed                         | AudioContext suspended (needs tap to resume), audio pipeline crashed (tap to retry) |
| **Error boundary fallback** | Unrecoverable errors in a UI region; partial page remains functional | Provides "Try Again" button that remounts the failed subtree | React component crash in mixer panel, metadata viewer crash                         |

**No modal dialogs for errors.** Modals interrupt the user's flow and require an explicit dismiss action. Audio playback errors should never block the user from navigating or accessing other features.

**Toast notification implementation:**

A centralized toast system managed by a Zustand slice (or a lightweight context — the toast system is the one exception where a separate context is justified, as toast state has no cross-slice interactions with the app store):

```typescript
interface ToastState {
  readonly toasts: ReadonlyArray<{
    readonly id: string;
    readonly message: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly action?: { label: string; onClick: () => void };
    readonly autoDismissMs: number;
  }>;
  showToast(toast: Omit<ToastState['toasts'][number], 'id'>): void;
  dismissToast(id: string): void;
}
```

### Recovery Strategies by Error Domain

| Error Domain            | Error Code                   | Recoverable | Recovery Strategy                                                                                                                                                                    | Automatic?                                             | Retry Limit     |
| ----------------------- | ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------- |
| **WASM / AudioWorklet** | `AUDIO_WASM_TRAP`            | Yes         | Tear down AudioWorkletNode → re-instantiate WASM from cached Module → re-initialize worklet → reload SPC data → resume playback position                                             | Automatic attempt, surface banner if retries exhausted | 3               |
|                         | `AUDIO_WORKLET_CRASHED`      | Yes         | Same as WASM trap recovery                                                                                                                                                           | Automatic attempt                                      | 3               |
|                         | `AUDIO_WASM_RENDER_OVERRUN`  | Yes         | Same as WASM trap recovery (triggered after 5 consecutive render failures)                                                                                                           | Automatic                                              | 3               |
|                         | `AUDIO_WASM_INIT_FAILED`     | Yes         | Re-try WASM instantiation. If repeated failure, display "browser unsupported" banner                                                                                                 | Automatic                                              | 2               |
|                         | `AUDIO_WASM_RENDER_ERROR`    | Yes         | Log error, output silence for affected quantum, increment consecutive failure counter. If counter ≥ 5, escalate to `AUDIO_WASM_RENDER_OVERRUN`                                       | Automatic                                              | N/A (escalates) |
|                         | `AUDIO_WORKLET_LOAD_FAILED`  | Yes         | Retry `addModule()`. If fails, show "browser unsupported" banner                                                                                                                     | Automatic                                              | 2               |
| **Web Audio API**       | `AUDIO_CONTEXT_SUSPENDED`    | Yes         | Call `audioContext.resume()` on next user gesture. Display action banner                                                                                                             | Semi-automatic — needs user tap                        | N/A             |
|                         | `AUDIO_CONTEXT_CLOSED`       | Yes         | Create new AudioContext → re-initialize audio graph. Note: new context may start suspended if not within a user gesture; follow same autoplay handling as initial startup            | Automatic                                              | 1               |
|                         | `AUDIO_OUTPUT_CHANGED`       | Yes         | Reconnect to new output device via `AudioContext.setSinkId()` where supported (Chrome 110+). On unsupported browsers, do nothing (system mixer handles routing). Log for diagnostics | Automatic                                              | N/A             |
|                         | `AUDIO_CODEC_ERROR`          | No          | Show toast with export failure message. User can retry export manually                                                                                                               | N/A                                                    | N/A             |
| **SPC Parsing**         | `SPC_INVALID_MAGIC`          | No          | File is not an SPC — show toast, remove from queue if queued                                                                                                                         | N/A                                                    | N/A             |
|                         | `SPC_FILE_TOO_SMALL`         | No          | File is incomplete — show toast                                                                                                                                                      | N/A                                                    | N/A             |
|                         | `SPC_FILE_TOO_LARGE`         | No          | File exceeds safety limit — show toast                                                                                                                                               | N/A                                                    | N/A             |
|                         | `SPC_CORRUPT_DATA`           | No          | RAM/DSP data is invalid — show toast                                                                                                                                                 | N/A                                                    | N/A             |
|                         | `SPC_METADATA_DECODE_ERROR`  | No          | Metadata decode caused fatal parse failure — show toast                                                                                                                              | N/A                                                    | N/A             |
| **IndexedDB**           | `STORAGE_QUOTA_EXCEEDED`     | Yes         | 1. Prompt user to clear cached SPC files. 2. Attempt without caching. 3. Degrade to in-memory operation                                                                              | Interactive                                            | N/A             |
|                         | `STORAGE_VERSION_CONFLICT`   | Yes         | Close other tabs and reload, or delete and recreate the database                                                                                                                     | Interactive                                            | N/A             |
|                         | `STORAGE_TRANSACTION_FAILED` | Yes         | Retry transaction. If repeated, log and continue without persistence                                                                                                                 | Automatic                                              | 1               |
|                         | `STORAGE_UNAVAILABLE`        | Yes         | Degrade gracefully — all features work, settings reset on refresh. Show once-per-session info toast                                                                                  | Automatic degradation                                  | N/A             |
|                         | `STORAGE_CORRUPTED`          | Yes         | Delete corrupted entry, continue with defaults                                                                                                                                       | Automatic                                              | N/A             |
| **Web MIDI**            | `MIDI_PERMISSION_DENIED`     | No          | Disable MIDI features, show toast explaining how to re-enable in browser settings                                                                                                    | N/A                                                    | N/A             |
|                         | `MIDI_NOT_SUPPORTED`         | No          | Disable MIDI features, hide MIDI UI                                                                                                                                                  | N/A                                                    | N/A             |
|                         | `MIDI_DEVICE_DISCONNECTED`   | Yes         | Remove device from active input list, show toast. Automatically reconnect if device reappears (via `onstatechange`)                                                                  | Semi-automatic                                         | N/A             |
|                         | `MIDI_DEVICE_ERROR`          | Yes         | Log error, attempt to re-open MIDI port                                                                                                                                              | Automatic                                              | 1               |
| **Network**             | `NETWORK_WASM_FETCH_FAILED`  | Yes         | Retry with exponential backoff. Check Service Worker cache. Show offline banner if all fail                                                                                          | Automatic                                              | 3               |
|                         | `NETWORK_SW_UPDATE_FAILED`   | Yes         | Log warning. Continue with cached version. Retry on next page load                                                                                                                   | Automatic                                              | N/A             |
|                         | `NETWORK_FETCH_FAILED`       | Yes         | Show toast. Continue with cached content if available                                                                                                                                | Automatic                                              | N/A             |
| **UI**                  | `UI_RENDER_ERROR`            | Yes         | Error boundary displays fallback with "Try Again" button that remounts the subtree                                                                                                   | Automatic (boundary catches)                           | N/A             |
|                         | `UI_UNEXPECTED_ERROR`        | No          | Log error, show toast. No automatic recovery for truly unknown errors                                                                                                                | N/A                                                    | N/A             |

**Audio pipeline recovery sequence (detailed):**

The most complex recovery is recovering from a WASM trap, AudioWorklet crash, or render overrun escalation. The sequence:

1. Store the current playback position from the Zustand `playback` slice.
2. Increment the recovery attempt counter (scoped to the current playback session).
3. If recovery attempt counter > 3, abandon recovery: show persistent error banner "Audio engine could not recover. Please reload the page." and return.
4. Disconnect the crashed `AudioWorkletNode` from the audio graph.
5. Close and discard the crashed `AudioWorkletNode` (it cannot be reused).
6. Create a new `AudioWorkletNode` via `new AudioWorkletNode(audioContext, 'spc-processor', options)`.
7. Re-send the cached WASM bytes (`ArrayBuffer`, retained in main-thread memory from initial `fetch()`) to the new worklet via `postMessage`. The bytes are cloned (not transferred), so the main thread retains its copy for future recovery.
8. Re-send the current SPC data to the new worklet.
9. Seek to the stored playback position.
10. Resume playback if the user was previously playing.
11. If any step in 6–10 fails, show the action banner: "Audio engine could not recover. Tap to reload the page."
12. If recovery succeeds, reset the recovery attempt counter to 0, and show a brief toast: "Audio recovered."

### Logging and Diagnostics

All errors are logged via a centralized `logError()` function that provides structured, consistent diagnostic output:

```typescript
function logError(error: AppError): void {
  const entry: ErrorLogEntry = {
    timestamp: Date.now(),
    code: error.code,
    message: error.message,
    context: error.context,
    url: globalThis.location?.href,
    userAgent: globalThis.navigator?.userAgent,
  };

  // Development: structured console output
  console.error(`[${error.code}]`, error.message, error.context);

  // Append to in-memory ring buffer (see appendToErrorStore)
}

function appendToErrorStore(error: AppError): void {
  const entry: ErrorLogEntry = {
    timestamp: Date.now(),
    code: error.code,
    message: error.message,
    context: error.context,
  };
  errorRingBuffer.push(entry);
}
```

**In-memory error ring buffer:** A circular buffer storing the last 100 errors, implemented with an index-based approach (not `Array.shift()`) for O(1) insertion:

```typescript
const ERROR_BUFFER_CAPACITY = 100;
const errorEntries: ErrorLogEntry[] = new Array(ERROR_BUFFER_CAPACITY);
let nextIndex = 0;
let entryCount = 0;

function push(entry: ErrorLogEntry): void {
  errorEntries[nextIndex % ERROR_BUFFER_CAPACITY] = entry;
  nextIndex++;
  entryCount = Math.min(entryCount + 1, ERROR_BUFFER_CAPACITY);
}
```

**Debug access:** The ring buffer is exposed as `window.__spcErrors` behind `import.meta.env.DEV` only. Production builds do not expose this global. The ring buffer provides diagnostic context for bug reports without requiring an external error reporting service.

```typescript
if (import.meta.env.DEV) {
  (window as Record<string, unknown>).__spcErrors = {
    get entries() {
      return getRecentErrors();
    },
    get count() {
      return entryCount;
    },
  };
}
```

**No external error reporting service.** SPC Player has no backend. Error telemetry is limited to:

1. **Console output** — always, for developer diagnostics.
2. **In-memory ring buffer** — last 100 errors, accessible via debug panel in dev builds.
3. **Optional future extension** — if a client-side analytics service (e.g., Sentry's client-only mode) is added, the `logError()` function is the single integration point.

**No `console.error()` calls outside of `logError()`.** All error console output goes through the centralized logger for consistent formatting.

### Global Safety Nets

Two global handlers catch errors that escape all other handling. These are **safety nets**, not primary error handling. In a correctly implemented application, they should rarely fire. Their presence ensures the "errors must never silently disappear" invariant is upheld even when individual modules have bugs in their error handling.

```typescript
// Catches unhandled thrown errors (sync)
window.addEventListener('error', (event) => {
  reportError(
    uiError('UI_UNEXPECTED_ERROR', {
      detail: event.message,
      stack: import.meta.env.DEV ? event.error?.stack : undefined,
    }),
  );
});

// Catches unhandled Promise rejections
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault(); // Prevent default console error (we log it ourselves)
  reportError(
    uiError('UI_UNEXPECTED_ERROR', {
      detail:
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason),
      stack:
        import.meta.env.DEV && event.reason instanceof Error
          ? event.reason.stack
          : undefined,
    }),
  );
});
```

These handlers use `UI_UNEXPECTED_ERROR` — not a domain-specific code — because the error's origin is unknown at this point. If the error happens to be an `AppError` that was thrown but not caught, the handler could attempt to extract the code:

```typescript
function classifyUncaughtError(error: unknown): AppError {
  // If it's already a structured AppError (e.g., re-thrown from a catch block), use it directly
  if (isAppError(error)) return error;
  // Otherwise, classify as unexpected
  return uiError('UI_UNEXPECTED_ERROR', {
    detail: error instanceof Error ? error.message : String(error),
    stack:
      import.meta.env.DEV && error instanceof Error ? error.stack : undefined,
  });
}

function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'context' in value
  );
}
```

### React Error Boundary Placement

Error boundaries are placed at view-level granularity to isolate failures in one UI region without crashing the entire application:

```
<App>
  <GlobalErrorBoundary>          ← Last resort: full-page fallback with reload button
    <ToastProvider>
    <ActionBannerProvider>
    <Layout>
      <PlayerBar />              ← Always visible, no boundary (failure here = GlobalErrorBoundary)
      <ViewRouter>
        <PlayerViewBoundary>     ← Isolates player view failures
          <PlayerView />
        </PlayerViewBoundary>
        <PlaylistViewBoundary>   ← Isolates playlist view failures
          <PlaylistView />
        </PlaylistViewBoundary>
        <MixerViewBoundary>      ← Isolates mixer view failures
          <MixerView />
        </MixerViewBoundary>
        <InstrumentViewBoundary>
          <InstrumentView />
        </InstrumentViewBoundary>
        <SettingsViewBoundary>
          <SettingsView />
        </SettingsViewBoundary>
      </ViewRouter>
    </Layout>
  </GlobalErrorBoundary>
</App>
```

**Boundary placement rationale:**

- **Per-view boundaries** catch crashes in individual views without affecting the persistent player bar or navigation. A crash in the mixer panel shows a "Something went wrong" fallback in the mixer area while the rest of the app remains functional.
- **The player bar has no boundary** because it is always visible and contains the transport controls. A crash here is critical — it falls through to the global boundary.
- **The global boundary** catches everything else. Its fallback shows a full-page error message with a "Reload" button. This is the nuclear option that should rarely trigger.

**Error boundary fallback UI:**

Each view-level boundary renders a consistent fallback:

```tsx
function ViewErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  useEffect(() => {
    // Report the caught error through the centralized reporter.
    // Silent because the error boundary already provides the visual fallback.
    reportError(
      uiError('UI_RENDER_ERROR', {
        componentName: 'ViewErrorFallback', // Override with actual view name via boundary props
        detail: error.message,
      }),
      { silent: true },
    );
  }, [error]);

  return (
    <div role="alert" className={styles.errorFallback}>
      <p>Something went wrong in this view.</p>
      <button onClick={resetErrorBoundary}>Try Again</button>
    </div>
  );
}
```

The "Try Again" button calls `resetErrorBoundary`, which remounts the failed subtree. For transient errors (e.g., a component reading stale state after a race condition), remounting often succeeds. For persistent errors (e.g., a bug in render logic), the component will crash again and the boundary will re-display the fallback — this loop is acceptable because it is visible to the user and does not affect other views.

### Error Factory Functions

Every error domain has a factory function that maps error codes to user-facing messages and constructs the `AppError` object. Inline error message composition is prohibited.

```typescript
function spcParseError(
  code: SpcParseError['code'],
  context: SpcParseError['context'] = {},
): SpcParseError {
  const messages: Record<SpcParseError['code'], string> = {
    SPC_INVALID_MAGIC: 'This file is not a valid SPC audio file.',
    SPC_FILE_TOO_SMALL: 'This SPC file appears to be incomplete or damaged.',
    SPC_FILE_TOO_LARGE: 'This file is too large to be a valid SPC file.',
    SPC_CORRUPT_DATA: 'This SPC file contains invalid audio data.',
    SPC_METADATA_DECODE_ERROR: 'This SPC file has unreadable metadata.',
    SPC_INVALID_DATA: 'This SPC file was rejected by the audio engine.',
  };
  return { code, message: messages[code], context };
}

function audioPipelineError(
  code: AudioPipelineError['code'],
  context: AudioPipelineError['context'] = {},
): AudioPipelineError {
  const messages: Record<AudioPipelineError['code'], string> = {
    AUDIO_WASM_TRAP: 'Audio playback stopped unexpectedly. Tap to retry.',
    AUDIO_WASM_INIT_FAILED:
      'The audio engine failed to start. Your browser may not support this feature.',
    AUDIO_WASM_RENDER_ERROR: 'A brief audio glitch occurred.',
    AUDIO_WASM_RENDER_OVERRUN:
      'Audio playback stopped due to repeated errors. Tap to retry.',
    AUDIO_WORKLET_CRASHED: 'Audio playback stopped unexpectedly. Tap to retry.',
    AUDIO_CONTEXT_SUSPENDED: 'Audio is paused. Tap anywhere to resume.',
    AUDIO_CONTEXT_CLOSED: 'Audio output was lost. Reconnecting…',
    AUDIO_OUTPUT_CHANGED: 'Audio output device changed.',
    AUDIO_WORKLET_LOAD_FAILED:
      'The audio engine failed to load. Your browser may not support this feature.',
    AUDIO_CODEC_ERROR: 'Audio export failed. Please try a different format.',
    AUDIO_RENDER_OVERRUN_CRITICAL:
      'Audio playback stopped due to repeated errors. Tap to retry.',
    AUDIO_PROTOCOL_VERSION_MISMATCH:
      'Audio engine version mismatch. Please reload the page.',
  };
  return { code, message: messages[code], context };
}

function storageError(
  code: StorageError['code'],
  context: StorageError['context'] = {},
): StorageError {
  const messages: Record<StorageError['code'], string> = {
    STORAGE_QUOTA_EXCEEDED: 'Storage is full. Try removing some saved files.',
    STORAGE_VERSION_CONFLICT:
      'Another tab is using a different data version. Please close other tabs and reload.',
    STORAGE_TRANSACTION_FAILED:
      'A storage operation failed. Some changes may not be saved.',
    STORAGE_UNAVAILABLE:
      'Offline storage is not available. Your settings will not persist across sessions.',
    STORAGE_CORRUPTED: 'Stored data was corrupted and has been reset.',
    STORAGE_READ_FAILED:
      'Failed to read saved data. Some information may be unavailable.',
  };
  return { code, message: messages[code], context };
}

function midiError(
  code: MidiError['code'],
  context: MidiError['context'] = {},
): MidiError {
  const messages: Record<MidiError['code'], string> = {
    MIDI_PERMISSION_DENIED:
      'MIDI access was denied. Enable it in your browser settings to use MIDI input.',
    MIDI_NOT_SUPPORTED: 'Your browser does not support MIDI input.',
    MIDI_DEVICE_DISCONNECTED: 'MIDI device disconnected.',
    MIDI_DEVICE_ERROR: 'MIDI device reported an error.',
  };
  return { code, message: messages[code], context };
}

function networkError(
  code: NetworkError['code'],
  context: NetworkError['context'] = {},
): NetworkError {
  const messages: Record<NetworkError['code'], string> = {
    NETWORK_FETCH_FAILED:
      'A network request failed. Some features may be unavailable.',
    NETWORK_SW_UPDATE_FAILED:
      'Could not check for updates. You are using a cached version.',
    NETWORK_WASM_FETCH_FAILED:
      'Failed to download the audio engine. Check your connection and try again.',
  };
  return { code, message: messages[code], context };
}

function uiError(
  code: UiError['code'],
  context: UiError['context'] = {},
): UiError {
  const messages: Record<UiError['code'], string> = {
    UI_RENDER_ERROR: 'This section encountered an error.',
    UI_UNEXPECTED_ERROR: 'An unexpected error occurred.',
  };
  return { code, message: messages[code], context };
}

function exportError(
  code: ExportError['code'],
  context: ExportError['context'] = {},
): ExportError {
  const messages: Record<ExportError['code'], string> = {
    EXPORT_CANCELLED: 'Export was cancelled.',
    EXPORT_OUT_OF_MEMORY: 'Export failed due to insufficient memory.',
    EXPORT_ENCODING_FAILED:
      'Audio encoding failed. Please try a different format.',
    EXPORT_CODEC_LOAD_FAILED:
      'Failed to load the audio encoder. Check your connection and try again.',
  };
  return { code, message: messages[code], context };
}
```

### Rules for AI Agents

To ensure consistency across independently-implemented modules, the following rules are mandatory:

1. **Every function that can fail returns `Result<T, E>` or throws — never both.** A function either always returns a Result (expected errors) or always throws (unexpected errors). No function uses both patterns.

2. **Result types are used for:**
   - SPC file parsing
   - IndexedDB operations
   - MIDI device connection
   - Audio pipeline initialization
   - Export codec operations
   - Any operation where the caller has a meaningful recovery action

3. **Thrown exceptions are used for:**
   - Programming errors (invariant violations that indicate bugs)
   - React render errors (error boundaries expect throws)
   - Re-raising after logging (catch → report → re-throw pattern for global handlers)

4. **Empty catch blocks are prohibited.** Every catch block must either:
   - Handle the error with a recovery action, OR
   - Call `reportError()` to log and notify, OR
   - Re-throw (after logging)

5. **Error messages use factory functions, not raw strings.** Call `spcParseError(code, context)`, `audioPipelineError(code, context)`, etc. Never compose error message strings inline.

6. **Thread-boundary errors use the message protocol.** Never try to throw across a MessagePort. Workers/worklets send `{ type: 'error', code, context }` messages (code only, no user-facing message string). The main thread maps codes to messages via factory functions.

7. **The `reportError()` function is the single entry point for error visibility.** It logs to console, appends to the error store, and optionally shows a notification. Even if an error is caught and recovered, if it is noteworthy (not a routine expected condition), call `reportError()` with `{ silent: true }` to log it without user notification.

8. **No `console.error()` calls outside of `logError()`.** All error console output goes through the centralized logger for consistent formatting.

9. **All error codes use `UPPER_SNAKE_CASE` with a domain prefix.** No kebab-case, no camelCase, no unprefixed codes. The error handling ADR is the canonical source for error code naming; all other documents (worker protocol, export pipeline, parsing spec) adopt this convention.

### Consequences

- Good, because the Result type makes expected error paths visible in function signatures — a function returning `Result<SpcFile, SpcParseError>` communicates its failure modes at the type level, enabling exhaustive handling via TypeScript type narrowing.
- Good, because the discriminated union `AppError` type with string literal `code` values enables switch-based exhaustive handling, and TypeScript's `never` type ensures incomplete case handling is a compile error.
- Good, because the centralized `reportError()` function provides a single point where every error in the application is logged, stored, and optionally displayed — regardless of origin. No error is ever silently lost.
- Good, because the hybrid approach avoids forcing Result types onto code paths where they add friction without benefit — React error boundaries need throws, and AudioWorklet `process()` cannot meaningfully handle Result types at 375 invocations per second.
- Good, because the error-to-display mapping is explicit and centralized — the `reportError()` function's switch statement documents exactly which errors produce toasts, which produce action banners, and which are silent, preventing inconsistent user notification across modules.
- Good, because the `UiError` domain correctly separates React render crashes from audio pipeline failures, preventing UI errors from triggering audio recovery.
- Good, because WASM trap recovery is documented as a bounded retry sequence (max 3 attempts), preventing infinite recovery loops while giving transient failures a chance to self-heal.
- Good, because the render overrun escalation policy (5 consecutive failures → tear down and rebuild) is explicitly documented in the taxonomy, making the threshold discoverable and testable.
- Good, because the audio pipeline recovery sequence is documented step-by-step with correct API names, enabling AI agents to implement recovery without ambiguity.
- Good, because the in-memory error ring buffer provides diagnostic context for bug reports without requiring an external error reporting service or backend infrastructure.
- Good, because view-level error boundaries isolate React component crashes to individual views, keeping the player bar and navigation functional when a non-critical view crashes.
- Good, because the rules for AI agents are prescriptive enough to produce consistent implementations — the distinction between Result-returning and throw-based functions is defined by error domain, not left to implementer judgment.
- Bad, because the hybrid approach requires developers (AI agents) to understand and correctly apply two error handling patterns — some functions return Result, others throw. The rules mitigate this by defining which domains use which pattern, but incorrect application is possible.
- Bad, because the custom Result type is a non-standard pattern in the TypeScript/React ecosystem. Libraries and third-party code use exceptions. The boundary between Result-returning internal code and exception-throwing library code requires explicit conversion at integration points (catch → Err, or unwrap → throw).
- Bad, because the `AppError` union must be extended whenever a new error condition is identified. New error codes require updating the type definitions, the `reportError()` switch statement, the error factory functions, and the recovery table. This is intentional (enforces explicit handling) but adds friction to adding new error types.
- Bad, because the audio pipeline recovery sequence involves significant complexity — tearing down and rebuilding the AudioWorklet, re-instantiating WASM, restoring playback position. Bugs in the recovery path itself could leave the application in a worse state than the original error.
- Bad, because the in-memory error buffer is lost on page reload. For long-running debugging sessions, errors from before the reload are unavailable. The ring buffer could be persisted to `sessionStorage`, but this adds complexity to the error logging fast path and risks recursive errors if the persistence layer itself is failing.
- Bad, because React's error boundary API (`componentDidCatch` / `static getDerivedStateFromError`) only catches errors during rendering, not in event handlers or async code. Event handler errors in view components must still be caught with try/catch and reported via `reportError()`.

### Confirmation

1. **Type safety** — Write a test that creates every `AppError` variant (all 6 domains) and passes each to `reportError()`. Verify that TypeScript compiles the exhaustive switch. Add a new error code to any domain and verify that the compiler produces errors at the `never` assignment in the default branch until the new code is handled.
2. **Result pattern usage** — Implement SPC parsing with `Result<SpcFile, SpcParseError>`. Write unit tests for every `SpcParseError` code (`SPC_INVALID_MAGIC`, `SPC_FILE_TOO_SMALL`, `SPC_FILE_TOO_LARGE`, `SPC_CORRUPT_DATA`, `SPC_METADATA_DECODE_ERROR`) by feeding the parser malformed binary data. Verify that no error is thrown — all failures are returned as `Err(...)`.
3. **WASM trap recovery** — In an integration test, trigger a WASM `unreachable` trap. Verify that `onprocessorerror` fires, `reportError()` is called with `AUDIO_WORKLET_CRASHED`, the action banner is displayed, and clicking "Retry" successfully re-initializes the audio pipeline. Verify that after 3 failed recovery attempts, the persistent error banner is shown instead of retrying.
4. **Render overrun escalation** — In an integration test, simulate 5 consecutive `AUDIO_WASM_RENDER_ERROR` results. Verify that the worklet sends `AUDIO_WASM_RENDER_OVERRUN` on the 5th failure and that the main thread initiates pipeline recovery.
5. **Error boundary isolation** — Render the mixer view with a component that throws on mount. Verify that the mixer's error boundary catches the error, `reportError()` is called with `UI_RENDER_ERROR` (silent), the fallback is displayed, and the player bar and other views remain functional. Click "Try Again" and verify the component remounts.
6. **Global safety net classification** — In an integration test, throw an unhandled error from a `setTimeout` callback. Verify that `window.onerror` catches it, `reportError()` is called with `UI_UNEXPECTED_ERROR` (not `AUDIO_WORKLET_CRASHED`), and the error appears in the ring buffer.
7. **No silent swallowing** — Search the codebase for `catch` blocks. Verify that every catch block contains a call to `reportError()`, a recovery action, or a re-throw. Automate this as a lint rule if possible.
8. **Thread-boundary serialization** — Verify that all `AppError` objects pass `structuredClone()` without throwing. Write a test that serializes and deserializes every error variant.
9. **Performance — hot path** — Profile the AudioWorklet `process()` method with and without any error handling additions. Verify that the non-error path adds zero measurable overhead (no try/catch in `process()`, no Result type checking per quantum).
10. **Factory function coverage** — Verify that every error code has exactly one factory function that produces it, and that no inline error construction exists outside of factory functions.

## Pros and Cons of the Options

### Option 1: Result Type Pattern (All Errors as Values)

A Rust-inspired approach where every fallible function returns `Result<T, E>`, and errors are never thrown. A custom `AppError` discriminated union represents all error types. Exceptions are caught only at system boundaries (WASM, browser APIs) and immediately converted to Result values.

- Good, because every error is visible in the function's return type — callers cannot accidentally ignore a failure because TypeScript requires them to check `result.ok` before accessing `result.value`.
- Good, because the entire error handling flow is synchronous, explicit, and traceable — no hidden exception propagation, no stack unwinding, no surprise catch blocks.
- Good, because Result types are structured-clone-compatible (plain objects), making thread-boundary serialization trivial.
- Good, because testing error paths is straightforward — call the function with invalid input, assert the returned error code.
- Neutral, because this pattern is well-established in Rust, Go, and Haskell communities but less common in the TypeScript/React ecosystem, where exceptions are the default.
- Bad, because **React error boundaries require thrown exceptions** — they do not work with Result types. Every React render path that can fail would need an explicit unwrap-or-throw adapter, adding boilerplate to every component.
- Bad, because **AudioWorklet `process()` cannot return a Result** — the Web Audio API calls `process()` and ignores the return value (it expects `boolean` for keep-alive semantics). Errors in `process()` must surface via side channels (MessagePort or `onprocessorerror`), regardless of the application's error pattern.
- Bad, because **every intermediate function must thread Result types**, even when it has no meaningful way to handle the error. A chain of 5 functions where only the top and bottom care about the error still requires all 5 to unwrap and re-wrap Results, or use a `.andThen()` combinator that adds library overhead.
- Bad, because **async Result types are awkward** — `Promise<Result<T, E>>` requires two levels of unwrapping (`await` then `if (!result.ok)`), and error handling cannot use `.catch()` on the Promise because the error is inside the resolved value.
- Bad, because **existing browser APIs and libraries throw exceptions**, requiring conversion at every library boundary.

### Option 2: Exception-Based with Centralized Handler

All errors are thrown as exceptions (native `Error` subclasses or custom error classes). A global error handler (`window.onerror`, `window.onunhandledrejection`) catches unhandled errors. React error boundaries catch component render errors. There is no Result type.

- Good, because it follows the standard JavaScript/TypeScript error handling pattern.
- Good, because **React error boundaries work natively**.
- Good, because **async error handling is natural** — `async`/`await` with try/catch.
- Good, because integration with browser APIs and libraries is zero-friction.
- Good, because the global error handler provides a safety net.
- Neutral, because `Error` subclasses can carry structured data, partially addressing categorization.
- Bad, because **error types are invisible in function signatures** — a function declared as `parseSpc(data: ArrayBuffer): SpcFile` gives no compile-time indication that it can fail.
- Bad, because **`Error` objects are not structured-clone-compatible** in all browsers — sending them across MessagePort is unreliable.
- Bad, because **catch blocks catch everything** — a `catch (err)` receives `unknown`, requiring verbose runtime checks.
- Bad, because **exceptions are not exhaustively checkable** — TypeScript cannot verify that a catch block handles all possible error types.
- Bad, because **try/catch flow control obscures the happy path** in deeply nested async chains.

### Option 3: Hybrid Approach (chosen)

Result types for expected/recoverable errors, exceptions for unexpected/unrecoverable errors, centralized `reportError()` for all errors.

- Good, because it matches expected errors to the mechanism that enforces handling (Result) and unexpected errors to the mechanism that propagates automatically (exceptions).
- Good, because React error boundaries, AudioWorklet `onprocessorerror`, and global handlers all work naturally with the exception side.
- Good, because `reportError()` unifies logging, storage, and display for both sides.
- Good, because the Result/throw boundary is defined per domain (not per function), reducing ambiguity.
- Neutral, because AI agents must learn two patterns, but the domain-based rule makes the choice mechanical.
- Bad, because the two-pattern system has a learning curve and conversion boilerplate at boundaries.
- Bad, because the `AppError` union must be maintained — new codes require updates in multiple places.

### Option 4: Effect-Based Error Handling

A functional effect system (`Effect-TS` or `neverthrow`) models all operations as composable effects with typed error channels.

- Good, because it provides the strongest compile-time error tracking — every function's error channel is visible in the type, and composition preserves error union types automatically.
- Good, because chaining operations with `.pipe()`, `.flatMap()`, and `.catchTag()` eliminates manual Result unwrapping boilerplate.
- Good, because `Effect-TS` includes built-in retry, timeout, and scheduling combinators that would simplify the audio pipeline recovery logic.
- Neutral, because the ecosystem is mature (`Effect-TS` v3.x is stable) but niche — fewer developers and AI agents are trained on it.
- Bad, because **bundle size is significant** — `Effect-TS` core is ~30+ kB min+gzip. For a PWA targeting offline-first with minimal payload, this is a material cost for an error handling infrastructure library.
- Bad, because **React integration is non-trivial** — mapping Effect computations to React component lifecycle, hooks, and error boundaries requires adapter layers that add complexity.
- Bad, because **AudioWorklet isolation** prevents importing the Effect runtime into the worklet scope — the worklet would still need a separate, simpler error mechanism.
- Bad, because **AI agent consistency is harder** — the functional composition patterns in Effect-TS are powerful but have many valid ways to express the same logic. Multiple AI agents independently writing Effect-based code would produce stylistically divergent (though functionally correct) implementations.

## More Information

### Related ADRs

- **ADR-0002** (UI Framework: React) — error boundaries are React-specific.
- **ADR-0003** (Audio Pipeline Architecture) — defines the thread model and AudioWorklet contract.
- **ADR-0005** (State Management: Zustand) — error state slices, toast state.
- **ADR-0007** (WASM Build Pipeline) — WASM trap behavior, `panic = "abort"`, instance corruption.
- **ADR-0011** (IndexedDB Wrapper: `idb`) — storage error sources.
- **ADR-0013** (Router: TanStack Router) — navigation error handling.

### Future Considerations

- \*\*`FileError` domain: File API failures (e.g., `File.arrayBuffer()` rejecting with `NotReadableError` when a file is deleted between selection and read) are not currently covered. If file drag-and-drop or directory handle operations become common, a `FileError` domain with `FILE_READ_FAILED` may be needed. For now, these are caught at the parsing boundary and reported as `SPC_CORRUPT_DATA` with descriptive context.
- **Error ring buffer persistence:** Persisting the ring buffer to `sessionStorage` would survive page reloads. This is deferred because writing to `sessionStorage` on every error adds latency to the error path and risks recursive errors if storage is the failing subsystem.
- **External error reporting:** If a client-side analytics service (e.g., Sentry's tunnel mode) is added, `logError()` is the single integration point. No other code needs to change.
