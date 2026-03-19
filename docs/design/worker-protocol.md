# Worker and AudioWorklet Message Protocol

**Status:** Draft (Revised)
**Date:** 2026-03-18
**Scope:** All cross-thread communication in SPC Player
**Revision notes:** Incorporates review feedback from WASM engineer, architect, and code reviewer. Error codes aligned with ADR-0015 (UPPER_SNAKE_CASE). Error message shape includes `context` field. WASM trap recovery updated. Render overrun escalation policy added. Export progress phases aligned with export pipeline (4-phase model). Revision 2 (2026-03-19): `WorkletErrorCode` and `ExportErrorCode` now reference ADR-0015 types directly — no locally-defined code unions. `ExportPhase` reduced to 4 phases (`'complete'` removed; the `Complete` message signals completion). Type Ownership Table added. Revision 3: Added `ExportWorkerToMain.Cancelled` message type for cooperative cancellation acknowledgement, aligning with the export pipeline design.

This document defines every message that crosses a thread boundary in SPC Player. It is the authoritative reference for the discriminated union types, transfer semantics, startup sequencing, WASM memory layout, and error propagation that together constitute the application's inter-thread protocol.

## References

- ADR-0003: Audio Pipeline Architecture (48 kHz, WASM resampling, dual-path)
- ADR-0005: State Management (Zustand + ref-based real-time channel)
- ADR-0006: Audio Codec Libraries (Emscripten WASM ports for export)
- ADR-0007: WASM Build Pipeline (raw exports, no wasm-bindgen, empty importObject)
- ADR-0008: WASM Source Language (Rust for all custom modules)
- ADR-0014: Resampling Quality Settings (presets + custom mode)
- ADR-0015: Error Handling Strategy (error taxonomy, recovery, `reportError()`)

### Type Ownership

This document references types defined elsewhere. The following table clarifies ownership:

| Type | Defined in | Referenced by |
|------|-----------|---------------|
| All error code unions (`SpcParseError`, `AudioPipelineError`, `ExportError`, etc.) | ADR-0015 | All other docs |
| Worker message types (`MainToWorklet`, `WorkletToMain`, `MainToExportWorker`, `ExportWorkerToMain`) | Worker Protocol (this doc) | Export Pipeline, Zustand Coordination |
| `SpcFile`, `SpcParseResult` | SPC Parsing | Zustand Coordination |
| `ExportJob`, `ExportOptions` | Export Pipeline | Zustand Coordination |

---

## 1. Thread Architecture

SPC Player uses three execution contexts. Each has strict boundaries on what it may access.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Thread                              │
│                                                                 │
│  React 19 UI · Zustand stores · AudioContext owner              │
│  AudioWorkletNode owner · MessagePort endpoints                 │
│  WASM module compilation (compileStreaming)                      │
│  User gesture handling · File I/O (IndexedDB via idb)           │
│  Export Worker lifecycle management                              │
│  audioStateBuffer (ref-based real-time channel, rAF consumers)  │
├─────────────────────────────────────────────────────────────────┤
│         │ MessagePort                    │ Worker.postMessage    │
│         │ (AudioWorkletNode.port)        │                       │
│         ▼                                ▼                       │
│  ┌──────────────────────┐   ┌────────────────────────────────┐  │
│  │  AudioWorklet Thread │   │       Export Worker Thread      │  │
│  │                      │   │                                 │  │
│  │  SpcProcessor class  │   │  Offline DSP rendering          │  │
│  │  WASM instance       │   │  WASM instance (separate)       │  │
│  │  (DSP + resampler)   │   │  Sinc resampler + dithering     │  │
│  │  Real-time render    │   │  Encoder WASM modules            │  │
│  │  Telemetry emission  │   │  (libFLAC, libvorbisenc, LAME)  │  │
│  │  No DOM, no fetch    │   │  Progress reporting              │  │
│  └──────────────────────┘   └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Main Thread

Owns the `AudioContext`, all React UI, Zustand stores, and IndexedDB access. Compiles the WASM module via `WebAssembly.compileStreaming()` and transfers the compiled `WebAssembly.Module` to the AudioWorklet and Export Worker. Receives real-time telemetry from the AudioWorklet via `MessagePort` and writes it to a module-scoped `audioStateBuffer` object (ADR-0005's ref-based channel). Never performs DSP computation.

### AudioWorklet Thread

Runs the `SpcProcessor` class registered via `AudioWorklet.addModule()`. Instantiates the WASM module in its own context. The `process()` method calls `dsp_render()` to fill the 128-frame output buffer. Emits telemetry (VU levels, voice state, DSP registers, playback position) back to the main thread via `this.port.postMessage()` at a throttled rate. Has no access to DOM, `fetch()`, `localStorage`, or IndexedDB.

### Export Worker Thread

A dedicated `Worker` for offline audio export. Instantiates its own WASM module instance, renders the full SPC at maximum speed (faster than real-time) using sinc resampling (ADR-0003), applies TPDF dithering, and encodes to the target format using the appropriate codec WASM module (ADR-0006). Reports progress to the main thread. Multiple exports are queued; only one renders at a time to avoid memory pressure. The Export Worker has `fetch()` access (for lazy-loading codec WASM modules) but no DOM access.

---

## 2. Message Types

All messages use discriminated unions keyed on a `type` string field. The protocol includes a version field in the initial handshake to enable future evolution.

### 2.1 Protocol Version

```typescript
const PROTOCOL_VERSION = 1;
```

The `init` message includes the protocol version. The receiving side checks compatibility and responds with `ready` (compatible) or `error` (incompatible). Version mismatches are fatal — the main thread must reload the worklet/worker script.

### 2.2 Main → AudioWorklet Messages

```typescript
/** Messages sent from the main thread to the AudioWorklet via node.port.postMessage(). */
type MainToWorklet =
  | MainToWorklet.Init
  | MainToWorklet.LoadSpc
  | MainToWorklet.Play
  | MainToWorklet.Pause
  | MainToWorklet.Stop
  | MainToWorklet.Seek
  | MainToWorklet.SetVoiceMask
  | MainToWorklet.SetSpeed
  | MainToWorklet.SetResamplerMode
  | MainToWorklet.SetInterpolationMode
  | MainToWorklet.SetTelemetryRate
  | MainToWorklet.RequestSnapshot
  | MainToWorklet.RestoreSnapshot;

namespace MainToWorklet {
  /** Initial handshake: transfers compiled WASM module and first SPC file. */
  interface Init {
    readonly type: 'init';
    readonly version: number;
    /** Compiled WebAssembly.Module — structured clone (not transferable). */
    readonly wasmModule: WebAssembly.Module;
    /** SPC file data. ArrayBuffer is transferred (zero-copy). */
    readonly spcData: ArrayBuffer;
    /** Detected AudioContext.sampleRate for resampler configuration. */
    readonly outputSampleRate: number;
    /** Initial resampler mode. 0 = linear, 1 = sinc. */
    readonly resamplerMode: number;
    /** Initial S-DSP interpolation mode. 0 = gaussian, 1 = linear, 2 = cubic, 3 = sinc. */
    readonly interpolationMode: number;
  }

  /** Load a new SPC file into an already-initialized worklet. */
  interface LoadSpc {
    readonly type: 'load-spc';
    /** SPC file data. ArrayBuffer is transferred. */
    readonly spcData: ArrayBuffer;
    /**
     * Behavior during active playback: the worklet pauses playback, loads the
     * new SPC, resets position to 0, and awaits a new 'play' message. It does
     * NOT automatically resume. The main thread should send 'play' after
     * receiving the updated 'playback-state' → 'stopped' notification.
     */
  }

  /** Begin or resume playback from current position. */
  interface Play {
    readonly type: 'play';
  }

  /** Pause playback. Retains position. */
  interface Pause {
    readonly type: 'pause';
  }

  /** Stop playback. Resets position to 0. */
  interface Stop {
    readonly type: 'stop';
  }

  /** Seek to a sample position in the SPC playback. */
  interface Seek {
    readonly type: 'seek';
    /** Target position in DSP output samples (at 32 kHz). */
    readonly samplePosition: number;
  }

  /**
   * Set which voices are enabled.
   * Bit N controls voice N (0–7). 1 = enabled, 0 = muted.
   * 0xFF = all voices enabled (default).
   */
  interface SetVoiceMask {
    readonly type: 'set-voice-mask';
    readonly mask: number;
  }

  /** Set playback speed multiplier. 1.0 = normal. Range: 0.25–4.0. */
  interface SetSpeed {
    readonly type: 'set-speed';
    readonly factor: number;
  }

  /** Change the output resampler algorithm at runtime (ADR-0014). */
  interface SetResamplerMode {
    readonly type: 'set-resampler-mode';
    /** 0 = linear, 1 = sinc (Lanczos-3). */
    readonly mode: number;
  }

  /** Change the S-DSP source sample interpolation mode at runtime (ADR-0014). */
  interface SetInterpolationMode {
    readonly type: 'set-interpolation-mode';
    /** 0 = gaussian, 1 = linear, 2 = cubic, 3 = sinc. */
    readonly mode: number;
  }

  /** Configure how often the worklet sends telemetry. */
  interface SetTelemetryRate {
    readonly type: 'set-telemetry-rate';
    /**
     * Number of render quanta between telemetry emissions.
     * 6 ≈ 60 Hz at 48 kHz (6 × 128/48000 ≈ 16ms).
     * 0 = disable telemetry.
     */
    readonly quantaInterval: number;
  }

  /**
   * Request a full emulation state snapshot for AudioContext recreation (ADR-0014).
   * The worklet responds with a 'snapshot' message containing the serialized state.
   */
  interface RequestSnapshot {
    readonly type: 'request-snapshot';
  }

  /**
   * Restore a previously captured emulation state snapshot.
   * Used after AudioContext recreation for sample rate changes (ADR-0014).
   */
  interface RestoreSnapshot {
    readonly type: 'restore-snapshot';
    /** Serialized emulation state. ArrayBuffer is transferred. */
    readonly snapshotData: ArrayBuffer;
    /** New output sample rate the resampler should target. */
    readonly outputSampleRate: number;
  }
}
```

### 2.3 AudioWorklet → Main Messages

```typescript
/** Messages sent from the AudioWorklet to the main thread via this.port.postMessage(). */
type WorkletToMain =
  | WorkletToMain.Ready
  | WorkletToMain.PlaybackState
  | WorkletToMain.Telemetry
  | WorkletToMain.Snapshot
  | WorkletToMain.PlaybackEnded
  | WorkletToMain.Error;

namespace WorkletToMain {
  /** Initialization complete. WASM instantiated, SPC loaded, ready to render. */
  interface Ready {
    readonly type: 'ready';
    readonly version: number;
  }

  /** Playback state transition notification. */
  interface PlaybackState {
    readonly type: 'playback-state';
    readonly state: 'playing' | 'paused' | 'stopped';
  }

  /**
   * Periodic telemetry bundle emitted at the configured rate (~60 Hz default).
   * Written to the main thread's audioStateBuffer (ref-based channel, ADR-0005).
   * Does NOT flow through Zustand — consumed by rAF visualization loops.
   */
  interface Telemetry {
    readonly type: 'telemetry';
    /** Current playback position in DSP output samples (32 kHz basis). */
    readonly positionSamples: number;
    /** Per-voice VU levels. 8 entries, range [0.0, 1.0]. Left channel. */
    readonly vuLeft: readonly [number, number, number, number, number, number, number, number];
    /** Per-voice VU levels. 8 entries, range [0.0, 1.0]. Right channel. */
    readonly vuRight: readonly [number, number, number, number, number, number, number, number];
    /** Master output level. Range [0.0, 1.0]. */
    readonly masterVuLeft: number;
    readonly masterVuRight: number;
    /** Per-voice state for the mixer/analysis UI. */
    readonly voices: readonly VoiceState[];
    /** Monotonically increasing counter for change detection by rAF consumers. */
    readonly generation: number;
  }

  /** Full emulation state snapshot, sent in response to 'request-snapshot'. */
  interface Snapshot {
    readonly type: 'snapshot';
    /** Serialized emulation state captured atomically within one render quantum. */
    readonly snapshotData: ArrayBuffer;
    /** Playback position at the moment of capture. */
    readonly positionSamples: number;
  }

  /** The SPC track has reached its end (duration exceeded or stop condition met). */
  interface PlaybackEnded {
    readonly type: 'playback-ended';
    /** Total samples rendered before ending. */
    readonly totalSamples: number;
  }

  /**
   * An error occurred in the worklet.
   *
   * The worklet sends only error codes and structured context — it does NOT
   * construct user-facing messages. The main thread maps codes to user-facing
   * strings via ADR-0015 error factory functions. This avoids duplicating UX
   * copy in the isolated worklet script.
   */
  interface Error {
    readonly type: 'error';
    readonly code: WorkletErrorCode;
    /** Technical description (for logging, not user display). */
    readonly message: string;
    /** Structured context for error reporting (ADR-0015 AppError.context). */
    readonly context: Record<string, unknown>;
  }
}

/** Per-voice state included in telemetry. */
interface VoiceState {
  /** Voice index 0–7. */
  readonly index: number;
  /** ADSR envelope phase. */
  readonly envelopePhase: 'attack' | 'decay' | 'sustain' | 'release' | 'silent';
  /** Current envelope level, 0–2047 (S-DSP 11-bit envelope). */
  readonly envelopeLevel: number;
  /** Current pitch register value (14-bit). */
  readonly pitch: number;
  /** BRR source sample index. */
  readonly sampleSource: number;
  /** Whether this voice is key-on. */
  readonly keyOn: boolean;
  /** Whether this voice is producing audible output. */
  readonly active: boolean;
}

/**
 * Worklet error codes — defined in ADR-0015.
 *
 * The worklet sends these codes as-is; the main thread maps them
 * to user-facing messages via ADR-0015 error factory functions.
 * Most worklet errors are AudioPipelineError codes. The worklet may
 * also send SPC_INVALID_DATA (from SpcParseError) when the DSP
 * emulator rejects loaded SPC data.
 */
type WorkletErrorCode = AudioPipelineError['code'] | 'SPC_INVALID_DATA';
```

### 2.4 Main → Export Worker Messages

```typescript
/** Messages sent from the main thread to the Export Worker. */
type MainToExportWorker =
  | MainToExportWorker.Init
  | MainToExportWorker.StartExport
  | MainToExportWorker.CancelExport;

namespace MainToExportWorker {
  /** Initialize the export worker with the DSP WASM module. */
  interface Init {
    readonly type: 'init';
    readonly version: number;
    /** Compiled WebAssembly.Module — structured clone (not transferable). */
    readonly wasmModule: WebAssembly.Module;
  }

  /** Begin an export job. */
  interface StartExport {
    readonly type: 'start-export';
    /** Unique identifier for this export job (for progress tracking / cancellation). */
    readonly jobId: string;
    /** SPC file data. ArrayBuffer is transferred. */
    readonly spcData: ArrayBuffer;
    /** Target format. */
    readonly format: 'wav' | 'flac' | 'ogg-vorbis' | 'mp3';
    /** Target sample rate for output. */
    readonly sampleRate: 32000 | 44100 | 48000 | 96000;
    /** Duration to render in DSP samples. null = render to detected end / fade-out. */
    readonly durationSamples: number | null;
    /** Fade-out duration in DSP samples. Applied at the end. 0 = no fade. */
    readonly fadeOutSamples: number;
    /** Voice mask for this export. 0xFF = full mix. Single bit = individual voice. */
    readonly voiceMask: number;
    /** Quality setting for lossy formats. Ignored for WAV/FLAC. */
    readonly quality: number;
    /** Bit depth for WAV output. 16 = apply TPDF dithering; 24 = truncate (dithering optional). */
    readonly bitDepth: 16 | 24;
    /** Metadata to embed in the output file. */
    readonly metadata: ExportMetadata;
  }

  /** Cancel a running or queued export job. */
  interface CancelExport {
    readonly type: 'cancel-export';
    readonly jobId: string;
  }
}

/** Metadata embedded in exported audio files. */
interface ExportMetadata {
  readonly title?: string;
  readonly artist?: string;
  readonly game?: string;
  readonly comment?: string;
  readonly dumper?: string;
  /** Year of the game or dump. */
  readonly year?: string;
}
```

### 2.5 Export Worker → Main Messages

```typescript
/** Messages sent from the Export Worker to the main thread. */
type ExportWorkerToMain =
  | ExportWorkerToMain.Ready
  | ExportWorkerToMain.Progress
  | ExportWorkerToMain.Complete
  | ExportWorkerToMain.Error
  | ExportWorkerToMain.Cancelled;

namespace ExportWorkerToMain {
  /** Worker initialized, WASM instantiated, ready to accept export jobs. */
  interface Ready {
    readonly type: 'ready';
    readonly version: number;
  }

  /**
   * Progress update for a running export job.
   *
   * Uses the 4-phase model, aligned with the export pipeline document:
   * - 'rendering': DSP emulation + sinc resampling + TPDF dithering
   * - 'encoding': Codec encoding the PCM buffer
   * - 'metadata': Tag embedding (ID3v2, Vorbis comments, RIFF INFO)
   * - 'packaging': Blob creation, ZIP append (batch), finalization
   *
   * Completion is signaled by the ExportWorkerToMain.Complete message,
   * not by a progress phase.
   */
  interface Progress {
    readonly type: 'progress';
    readonly jobId: string;
    readonly phase: ExportPhase;
    /** Fraction complete within current phase. Range [0.0, 1.0]. */
    readonly fraction: number;
    /** Overall fraction complete across all phases (weighted). Range [0.0, 1.0]. */
    readonly overallProgress: number;
  }

  /** Export job completed successfully. */
  interface Complete {
    readonly type: 'complete';
    readonly jobId: string;
    /** The encoded audio file. ArrayBuffer is transferred. */
    readonly fileData: ArrayBuffer;
    /** MIME type of the output file. */
    readonly mimeType: string;
    /** Suggested filename (without extension). */
    readonly suggestedName: string;
  }

  /**
   * An error occurred during export.
   *
   * Like worklet errors, the worker sends error codes and structured context.
   * The main thread maps codes to user-facing messages via error factories.
   */
  interface Error {
    readonly type: 'error';
    readonly jobId: string;
    readonly code: ExportErrorCode;
    /** Technical description (for logging, not user display). */
    readonly message: string;
    /** Structured context for error reporting (ADR-0015 AppError.context). */
    readonly context: Record<string, unknown>;
  }

  /** Export job was cancelled in response to a CancelExport request. */
  interface Cancelled {
    readonly type: 'cancelled';
    readonly jobId: string;
  }
}

/**
 * Export progress phases — the canonical 4-phase model.
 * Both the worker protocol and the export pipeline use this same set.
 * Completion is signaled by ExportWorkerToMain.Complete, not by a phase.
 */
type ExportPhase =
  | 'rendering'
  | 'encoding'
  | 'metadata'
  | 'packaging';

/**
 * Export worker error codes — defined in ADR-0015.
 *
 * The export worker sends these codes as-is; the main thread maps them
 * to user-facing messages via ADR-0015 error factory functions.
 */
type ExportErrorCode = ExportError['code'] | AudioPipelineError['code'] | 'SPC_INVALID_DATA';
```

---

## 3. Audio Startup Lifecycle

The startup sequence from user gesture to first audible output involves seven ordered steps. Each step must complete before the next begins.

```
User gesture (click/tap)
  │
  ├─① AudioContext creation + resume()
  │    AudioContext({ sampleRate: 48000 })
  │    await ctx.resume()                       ← unblocks autoplay
  │
  ├─② WASM module compilation (can overlap with ③ if cached)
  │    WebAssembly.compileStreaming(fetch(dspWasmUrl))
  │    Returns WebAssembly.Module
  │
  ├─③ AudioWorklet module registration
  │    await ctx.audioWorklet.addModule(workletScriptUrl)
  │
  ├─④ AudioWorkletNode creation + audio graph wiring
  │    new AudioWorkletNode(ctx, 'spc-processor', {
  │      numberOfInputs: 0,
  │      numberOfOutputs: 1,
  │      outputChannelCount: [2]
  │    })
  │    node → GainNode → AnalyserNode → ctx.destination
  │
  ├─⑤ MessagePort setup + Init message
  │    node.port.postMessage({
  │      type: 'init',
  │      version: PROTOCOL_VERSION,
  │      wasmModule,              ← WebAssembly.Module (structured clone)
  │      spcData: spcArrayBuffer, ← ArrayBuffer (transferred)
  │      outputSampleRate: ctx.sampleRate,
  │      resamplerMode: 0,
  │      interpolationMode: 0
  │    }, [spcArrayBuffer])
  │
  ├─⑥ Worklet-side initialization (inside SpcProcessor)
  │    WebAssembly.instantiate(wasmModule, {})  ← empty importObject
  │    wasm_alloc() → copy SPC data into WASM memory
  │    dsp_init(spcPtr, spcLen)
  │    dsp_set_resampler_mode(resamplerMode)
  │    dsp_set_interpolation_mode(interpolationMode)
  │    Cache outputPtr = dsp_get_output_ptr()
  │    Cache outputView = new Float32Array(wasmMemory, outputPtr, 256)
  │    Port sends: { type: 'ready', version }
  │
  │    NOTE: The init handler is async (uses `await WebAssembly.instantiate()`).
  │    Between the await and completion, process() calls will occur. The guard
  │    `if (!this.wasm || !this.playing)` returns silence during this window.
  │    On desktop, WASM instantiation is typically <15ms (sub-quantum). On older
  │    mobile devices, it may span several quanta, producing brief silence.
  │
  └─⑦ Main thread receives 'ready' → sends 'play'
       Worklet sets playing = true
       Next process() call: dsp_render() → 128 float32 frames → speakers
```

### Timing Budget

| Step | Typical Desktop | Typical Mobile |
|------|-----------------|----------------|
| ① AudioContext resume | <5ms | <10ms |
| ② WASM compile (cold) | 20–50ms | 50–150ms |
| ② WASM compile (cached) | <5ms | <10ms |
| ③ Worklet registration | 10–30ms | 20–50ms |
| ④ Node creation + wiring | <1ms | <2ms |
| ⑤ Init message transfer | <1ms | <2ms |
| ⑥ WASM instantiate + init | 5–15ms | 15–40ms |
| ⑦ Ready → first process() | One quantum: 2.67ms | One quantum: 2.67ms |
| **Total (cold)** | **~50–100ms** | **~100–260ms** |
| **Total (warm/cached)** | **~25–55ms** | **~50–115ms** |

### Parallelization Strategy

Steps ② and ③ are independent — the WASM module compilation and AudioWorklet script registration can proceed in parallel:

```typescript
async function initializeAudio(spcData: ArrayBuffer): Promise<void> {
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume(); // ① Must complete before ③

  // ② and ③ in parallel
  const [wasmModule] = await Promise.all([
    WebAssembly.compileStreaming(fetch(dspWasmUrl)),  // ②
    ctx.audioWorklet.addModule(workletScriptUrl),      // ③
  ]);

  // ④ Sequential from here
  const node = new AudioWorkletNode(ctx, 'spc-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  // ... wire audio graph, send init, await ready
}
```

### iOS Safari Autoplay Handling

iOS Safari suspends `AudioContext` at creation. The `resume()` call must occur within a user gesture's synchronous call stack — it cannot be deferred to a microtask or timeout.

**Strategy:**

1. On first user interaction (tap on a "Play" button or any loaded SPC), call `ctx.resume()` synchronously within the event handler.
2. If `ctx.state` is `'suspended'` after `resume()`, show a "Tap to enable audio" overlay. This handles the edge case where the browser rejected the resume (e.g., no prior user gesture).
3. Once `ctx.state` transitions to `'running'` (via `statechange` event or the `resume()` promise resolving), proceed with steps ②–⑦.
4. The AudioContext is created once and reused for the application lifetime. It is never closed unless the output sample rate changes (ADR-0014).

```typescript
// Called from onClick/onTouchEnd handler — synchronous call stack
function handlePlayClick(spcData: ArrayBuffer): void {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 48000 });
  }
  // resume() must be in the gesture's synchronous stack on iOS
  audioContext.resume().then(() => {
    if (audioContext.state === 'running') {
      initializeWorklet(audioContext, spcData);
    }
  });
}
```

### Lazy Initialization

The WASM module and AudioWorklet are initialized lazily — not at page load. Initialization is triggered by the first "play" action. This keeps the initial page load fast (no WASM fetch until needed) and avoids creating an AudioContext before a user gesture.

For subsequent SPC file loads (after the worklet is already initialized), only a `load-spc` message is sent — the WASM module and AudioWorklet are already running. The worklet stops playback, resets position, loads the new SPC, and waits for a `play` message:

```
User selects new SPC file
  │
  └─ node.port.postMessage({ type: 'load-spc', spcData }, [spcData.buffer])
     Worklet: pause → wasm_alloc() → copy → dsp_init() → send playback-state 'stopped'
     Main thread receives 'stopped' → sends 'play' to resume
```

---

## 4. WASM Memory Management

### 4.1 Memory Allocation Strategy

WASM linear memory is allocated at instantiation with a fixed initial size. **Memory must never grow at runtime** (ADR-0003). Growth invalidates all typed array views, which would break the worklet's buffer references during `process()`.

```
Initial memory: 4 MiB (64 WASM pages × 64 KiB/page)
Maximum memory: 4 MiB (growth disabled via Rust linker flags)
```

4 MiB accommodates all required allocations with ample headroom:

| Region | Size | Purpose |
|--------|------|---------|
| SPC RAM | 64 KiB | Full 64 KB SPC address space (RAM + registers + IPL ROM) |
| DSP registers | 128 B | 128-byte DSP register file |
| DSP internal state | ~8 KiB | Per-voice state (8 voices × ~1 KiB each): BRR decode buffers, envelope state, pitch counters, Gaussian interpolation ring buffers |
| Echo buffer | 62 KiB max | Echo ring buffer (up to 7680 samples × 2 channels × 2 bytes, S-DSP ESA/EDL controlled) |
| DSP output buffer (32 kHz) | 688 B | 2 channels × 86 samples × 4 bytes (int16 stored as i32 for DSP arithmetic) |
| Resampled output buffer (48 kHz) | 1,024 B | 2 channels × 128 samples × 4 bytes (float32, one AudioWorklet quantum) |
| Sinc filter coefficients | ~2 KiB | Lanczos-3 polyphase FIR kernel table (precomputed at init, ADR-0014) |
| Resampler state | 64 B | Fractional accumulator, filter history buffer |
| Snapshot buffer | ~68 KiB | Serialized emulation state for AudioContext recreation (ADR-0014) |
| Rust allocator overhead | ~64 KiB | dlmalloc metadata and alignment padding |
| **Total estimated** | **~270 KiB** | **~6.5% of 4 MiB budget** |

The large headroom ensures that future additions (e.g., FIR filter state for additional DSP effects) do not require a memory size change.

### 4.2 Memory Layout

```
WASM Linear Memory (4 MiB)
┌────────────────────────────────┐  0x000000
│  Rust heap (dlmalloc managed)  │
│  ┌──────────────────────────┐  │
│  │ SPC RAM (64 KiB)         │  │  Allocated by wasm_alloc() on init
│  ├──────────────────────────┤  │
│  │ DSP state (~8 KiB)       │  │  Allocated by dsp_init()
│  ├──────────────────────────┤  │
│  │ Echo buffer (≤62 KiB)    │  │  Allocated by dsp_init(), size from SPC EDL
│  ├──────────────────────────┤  │
│  │ DSP output buf (688 B)   │  │  Pre-allocated, pointer from dsp_get_output_ptr()
│  ├──────────────────────────┤  │
│  │ Resampled output (1 KiB) │  │  Pre-allocated, pointer from dsp_get_output_ptr()
│  ├──────────────────────────┤  │  (output_ptr points here — 48 kHz float32)
│  │ Sinc coefficients (~2K)  │  │  Computed once at dsp_init()
│  ├──────────────────────────┤  │
│  │ Snapshot buffer (~68 KiB)│  │  Used by dsp_snapshot() / dsp_restore()
│  └──────────────────────────┘  │
│         ... free heap ...       │
├────────────────────────────────┤  
│  Stack (grows downward)        │  Default ~64 KiB, configured via linker
└────────────────────────────────┘  0x400000 (4 MiB)
```

All allocations are performed during `dsp_init()`. After initialization completes, no further heap allocations occur for the lifetime of the WASM instance. The `process()` hot path is allocation-free.

### 4.3 Buffer Sharing Between WASM and JS

The AudioWorklet's `process()` method reads the resampled output buffer from WASM linear memory via a **cached** typed array view and copies it to the Web Audio output arrays:

```typescript
// Inside SpcProcessor.process()
process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
  if (!this.wasm || !this.playing) {
    return true; // Output silence, keep processor alive
  }

  // Call WASM to render 128 frames of 48 kHz stereo output
  const result = this.wasm.dsp_render(this.outputPtr, 128);
  if (result < 0) {
    // Controlled error return — NOT a WASM trap.
    // Map return code to specific error code (see §6.2).
    this.handleWasmResult(result, 'dsp_render');
    return true;
  }

  // Read from the cached typed array view over WASM memory.
  // The view is created once during init (§3 step ⑥) since memory never grows.
  // outputView: Float32Array of 256 elements (128 interleaved stereo frames)
  const output = this.outputView!;

  // Deinterleave into Web Audio's per-channel output arrays
  const left = outputs[0][0];
  const right = outputs[0][1];
  for (let i = 0; i < 128; i++) {
    left[i] = output[i * 2];
    right[i] = output[i * 2 + 1];
  }

  // Track render overruns for escalation (§6.1)
  this.consecutiveOverruns = 0; // Reset on successful render

  // Update position counter and emit telemetry on schedule
  this.samplePosition += this.samplesPerQuantum;
  this.quantaSinceLastTelemetry++;
  if (this.quantaSinceLastTelemetry >= this.telemetryInterval) {
    this.emitTelemetry();
    this.quantaSinceLastTelemetry = 0;
  }

  return true;
}
```

**Key constraints:**

- The `Float32Array` view is created once during init (step ⑥) and cached as `this.outputView`. Since memory never grows (ADR-0003 enforced), the view remains valid for the WASM instance's lifetime. This eliminates 375 short-lived objects per second from GC pressure.
- The deinterleave loop is the only JS computation on the audio thread. All DSP work (emulation + resampling) happens inside `dsp_render()` in WASM.
- `process()` returns `true` always to keep the processor alive. The main thread manages lifecycle by disconnecting the node when stopping.

---

## 5. Transfer Semantics

Every `postMessage` call crosses a thread boundary. The choice between **structured clone** (deep copy) and **transferable transfer** (zero-copy ownership transfer) has direct performance implications.

### 5.1 Transfer Matrix

| Direction | Message Type | Transfer Strategy | Rationale |
|-----------|-------------|-------------------|-----------|
| Main → Worklet | `init` | `wasmModule`: structured clone (Module is clonable, not transferable — browser shares compiled code backing store). `spcData`: **transferred** via transferable list. | SPC data can be 66 KiB+. Transfer avoids a copy. The main thread loses access to the buffer. |
| Main → Worklet | `load-spc` | `spcData`: **transferred**. | Same rationale. Main thread doesn't need the buffer after sending. |
| Main → Worklet | `restore-snapshot` | `snapshotData`: **transferred**. | ~68 KiB snapshot. Transfer avoids copy. |
| Main → Worklet | All control messages | Structured clone. | Small payloads (<100 bytes). Clone cost is negligible. |
| Worklet → Main | `telemetry` | Structured clone. | Telemetry is a small object (~200 bytes). Structured clone at ~60 Hz is sustainable. No ArrayBuffers to transfer. |
| Worklet → Main | `snapshot` | `snapshotData`: **transferred**. | ~68 KiB. Transfer avoids copy on the audio thread. |
| Worklet → Main | All other messages | Structured clone. | Small payloads. |
| Main → Export Worker | `init` | `wasmModule`: structured clone. | Same as worklet init. |
| Main → Export Worker | `start-export` | `spcData`: **transferred**. | Same rationale as worklet. |
| Export Worker → Main | `complete` | `fileData`: **transferred**. | Encoded file can be several MiB. Transfer is essential. |
| Export Worker → Main | `progress`, `error` | Structured clone. | Small payloads. |

### 5.2 Transfer Code Patterns

```typescript
// Transferring an ArrayBuffer (main → worklet)
node.port.postMessage(
  { type: 'load-spc', spcData: spcArrayBuffer },
  [spcArrayBuffer]  // Transfer list — spcArrayBuffer.byteLength becomes 0 on sender
);

// Transferring from worklet → main
this.port.postMessage(
  { type: 'snapshot', snapshotData, positionSamples },
  [snapshotData]  // Transfer list
);

// Structured clone (no transfer list) — for small messages
node.port.postMessage({ type: 'play' });
```

### 5.3 Audio Hot Path Performance

The audio hot path is the `process()` → `dsp_render()` → output copy cycle, executing every 2.67ms (at 48 kHz). **No `postMessage` calls occur on the normal (non-error) hot path.** The render operates on pre-allocated WASM memory via cached typed array views.

Telemetry `postMessage` calls are throttled to ~60 Hz (every 6th quantum). At ~200 bytes per telemetry message, the structured clone cost is <0.01ms — negligible relative to the 2.67ms quantum budget. Error-path `postMessage` calls inside `process()` are rare (only on WASM errors) and have negligible performance impact.

If profiling reveals pressure at higher telemetry rates, `SharedArrayBuffer` is the migration path (requires COOP/COEP headers on GitHub Pages — see ADR-0003).

### 5.4 SharedArrayBuffer: Future Path

The current design uses `MessagePort` for all worklet ↔ main communication. This is adequate for v1. If telemetry bandwidth becomes a bottleneck (unlikely at ~60 Hz), the architecture can migrate to `SharedArrayBuffer` for the telemetry channel:

- A `SharedArrayBuffer` is created on the main thread and transferred to the worklet during `init`.
- The worklet writes telemetry data directly into the shared buffer using `Atomics.store()`.
- The main thread reads from the shared buffer in its `requestAnimationFrame` loop using `Atomics.load()`.
- This eliminates postMessage overhead entirely for the telemetry path.
- Requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` response headers. GitHub Pages supports custom headers via `_headers` file (Cloudflare) or meta tags.

---

## 6. Error Flow

### 6.1 Error Categories

All error codes use UPPER_SNAKE_CASE per ADR-0015. All error messages include a `context` field per the `AppError` shape.

| Source | Error Code | Severity | Recovery | Escalation |
|--------|-----------|----------|----------|------------|
| WASM instantiation | `AUDIO_WASM_INIT_FAILED` | Fatal | Reload app | — |
| WASM trap (`RuntimeError` from `unreachable` instruction) | `AUDIO_WASM_TRAP` | Recoverable | Main thread attempts worklet node recreation (up to 3 retries). See §6.7. | After 3 failed retries → show error, offer reload |
| WASM controlled error return (non-zero) | `AUDIO_WASM_RENDER_ERROR` | Transient | Log error, output silence for that quantum, continue | 5 consecutive → escalate to `AUDIO_RENDER_OVERRUN_CRITICAL` |
| Invalid SPC data | `SPC_INVALID_DATA` | Recoverable | Skip file, show toast | — |
| Render overrun (`process()` misses deadline) | `AUDIO_WASM_RENDER_OVERRUN` | Transient | Output silence for that quantum, continue | **5 consecutive overruns → `AUDIO_RENDER_OVERRUN_CRITICAL`**: tear down and rebuild the AudioWorkletNode (same recovery as AUDIO_WASM_TRAP). See §6.8. |
| Render overrun critical | `AUDIO_RENDER_OVERRUN_CRITICAL` | Recoverable | Tear down AudioWorkletNode, rebuild. Up to 3 retries. | After 3 failed retries → show error, offer reload |
| Protocol mismatch | `AUDIO_PROTOCOL_VERSION_MISMATCH` | Fatal | Reload worklet/worker script | — |
| Codec load failure | `EXPORT_CODEC_LOAD_FAILED` | Recoverable | Show error in export dialog, retry available | — |
| Encoding failure | `EXPORT_ENCODING_FAILED` | Recoverable | Report to user, cancel job | — |
| AudioContext suspended | *(handled via state transition, not error message)* | Transient | Auto-resume on tab focus via `statechange` listener; if `resume()` requires user gesture, show "Audio paused" indicator | — |

### 6.2 WASM Error Propagation

The WASM module uses integer return codes (ADR-0007). Every exported function that can fail returns an `i32`:

```
 0 = success
-1 = invalid argument
-2 = invalid SPC data
-3 = not initialized
-4 = internal error (should not occur; indicates a logic bug)
```

**Important distinction:** WASM return codes (-1 through -4) are *controlled* error returns from Rust code — the WASM instance remains valid and usable. A WASM trap (`RuntimeError` from the `unreachable` instruction) is a fundamentally different failure mode where the instance is permanently corrupted.

The TypeScript wrapper in the worklet maps return codes to appropriate error codes:

```typescript
// Inside SpcProcessor
private handleWasmResult(result: number, operation: string): boolean {
  if (result >= 0) return true;

  // Map controlled WASM returns to specific error codes.
  // These are NOT traps — the WASM instance is still valid.
  const codeMap: Record<number, WorkletErrorCode> = {
    [-1]: 'AUDIO_WASM_RENDER_ERROR',    // invalid argument — recoverable
    [-2]: 'SPC_INVALID_DATA',           // invalid SPC data
    [-3]: 'AUDIO_WASM_RENDER_ERROR',    // not initialized — internal logic error
    [-4]: 'AUDIO_WASM_RENDER_ERROR',    // internal error — log and continue
  };

  this.port.postMessage({
    type: 'error',
    code: codeMap[result] ?? 'AUDIO_WASM_RENDER_ERROR',
    message: `WASM ${operation} failed with code ${result}`,
    context: {
      wasmReturnCode: result,
      operation,
      positionSamples: this.samplePosition,
    },
  } satisfies WorkletToMain.Error);

  return false;
}
```

### 6.3 WASM Panic Handling

With `panic = "abort"` (ADR-0007), a Rust panic compiles to the WASM `unreachable` instruction, which throws a `RuntimeError` in JavaScript. In the AudioWorklet, this manifests in two ways:

1. **Inside `process()`:** The `RuntimeError` propagates out of `process()`, triggering the `processorerror` event on the `AudioWorkletNode` in the main thread.
2. **Inside `port.onmessage`:** The `RuntimeError` propagates out of the message handler. The worklet processor becomes unusable.

In both cases, the processor is in an unrecoverable state — the WASM instance is invalid after a trap. However, the main thread can recover by tearing down and rebuilding the AudioWorkletNode with a fresh WASM instance (see §6.7).

### 6.4 AudioWorkletNode Error Handling (Main Thread)

```typescript
// Main thread setup — WASM trap recovery
let workletRecoveryAttempts = 0;
const MAX_WORKLET_RECOVERY_ATTEMPTS = 3;

node.onprocessorerror = (event: Event) => {
  console.error('AudioWorklet processor error:', event);
  // The processor is dead (WASM trap). Attempt recovery.
  reportError({
    code: 'WASM_TRAP',
    message: 'Audio processor encountered a WASM trap.',
    context: {
      recoveryAttempt: workletRecoveryAttempts + 1,
      maxAttempts: MAX_WORKLET_RECOVERY_ATTEMPTS,
    },
    recoverable: true,
  });
  attemptWorkletRecovery();
};

node.port.onmessage = (event: MessageEvent<WorkletToMain>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'error':
      if (msg.code === 'INVALID_SPC_DATA') {
        // Recoverable: skip this file, notify user
        reportError({
          code: msg.code,
          message: msg.message,
          context: msg.context,
          recoverable: true,
        });
      } else if (msg.code === 'RENDER_OVERRUN_CRITICAL') {
        // Escalated overrun — attempt worklet recovery
        reportError({
          code: msg.code,
          message: msg.message,
          context: msg.context,
          recoverable: true,
        });
        attemptWorkletRecovery();
      } else {
        // Non-fatal worklet error — log but continue
        reportError({
          code: msg.code,
          message: msg.message,
          context: msg.context,
          recoverable: true,
        });
      }
      break;

    case 'telemetry':
      // Write to ref-based channel, not Zustand (ADR-0005)
      audioStateBuffer.positionSamples = msg.positionSamples;
      audioStateBuffer.vuLeft = msg.vuLeft;
      audioStateBuffer.vuRight = msg.vuRight;
      audioStateBuffer.masterVuLeft = msg.masterVuLeft;
      audioStateBuffer.masterVuRight = msg.masterVuRight;
      audioStateBuffer.voices = msg.voices;
      audioStateBuffer.generation = msg.generation;
      break;

    case 'playback-state':
      // Low-frequency: write to Zustand (drives play/pause button UI)
      useAppStore.getState().setPlaybackStatus(msg.state);
      break;

    case 'playback-ended':
      useAppStore.getState().handleTrackEnded();
      break;

    // ... other cases
  }
};
```

### 6.5 Export Worker Error Handling

The Export Worker uses the same `postMessage` error pattern with UPPER_SNAKE_CASE codes and `context` field:

```typescript
exportWorker.onmessage = (event: MessageEvent<ExportWorkerToMain>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'error':
      reportError({
        code: msg.code,
        message: msg.message,
        context: { ...msg.context, jobId: msg.jobId },
        recoverable: msg.code !== 'OUT_OF_MEMORY',
      });
      useAppStore.getState().setExportJobError(msg.jobId, {
        code: msg.code,
        message: msg.message,
      });
      break;
    case 'progress':
      useAppStore.getState().setExportJobProgress(
        msg.jobId, msg.phase, msg.fraction, msg.overallProgress,
      );
      break;
    case 'complete':
      useAppStore.getState().completeExportJob(
        msg.jobId, msg.fileData, msg.mimeType, msg.suggestedName,
      );
      break;
  }
};

// Global worker error (script load failure, uncaught exception)
exportWorker.onerror = (event: ErrorEvent) => {
  console.error('Export Worker fatal error:', event);
  reportError({
    code: 'AUDIO_WORKLET_CRASHED',
    message: 'Export worker encountered an unrecoverable error.',
    context: { errorMessage: event.message },
    recoverable: false,
  });
  // The worker is dead. Recreate it on next export attempt.
  exportWorker.terminate();
  exportWorker = null;
};
```

### 6.6 AudioContext State Transitions

```
                 ┌──────────┐
      creation   │suspended │ ◄── Browser autoplay policy blocks audio
                 └────┬─────┘
                      │ ctx.resume() (user gesture)
                      ▼
                 ┌──────────┐
                 │ running  │ ◄── Normal operating state
                 └────┬─────┘
                      │ ctx.close() or browser decision
                      ▼
                 ┌──────────┐
                 │  closed  │ ◄── Terminal state. Cannot be reopened.
                 └──────────┘

         Tab backgrounded (mobile)
    running ──────────────────────► interrupted (iOS)
                                    or suspended (varies)
         Tab foregrounded
    interrupted ──────────────────► running (automatic on some,
                                    requires resume() on others)
```

The main thread listens for `statechange` on the AudioContext and updates the Zustand store:

```typescript
audioContext.addEventListener('statechange', () => {
  const state = audioContext.state;
  if (state === 'suspended' || state === 'interrupted') {
    useAppStore.getState().setAudioContextSuspended(true);
    // Note: recovery from 'suspended'/'interrupted' follows the same
    // autoplay handling as initial startup — resume() may need a user gesture.
  } else if (state === 'running') {
    useAppStore.getState().setAudioContextSuspended(false);
  }
});
```

### 6.7 WASM Trap Recovery Sequence

When a WASM trap occurs (`onprocessorerror` fires or `WASM_TRAP` error received), the main thread attempts to recover by rebuilding the AudioWorkletNode. The WASM module itself is fine (it's compiled code) — only the instance is corrupted.

Recovery is attempted up to 3 times. The cached `WebAssembly.Module` is reused (no recompilation needed).

```
WASM trap detected
  │
  ├─ recoveryAttempts < 3?
  │   │
  │   ├─ YES:
  │   │   ① Disconnect old AudioWorkletNode from audio graph
  │   │   ② Create new AudioWorkletNode(ctx, 'spc-processor', options)
  │   │         (AudioWorklet module is already registered — no re-registration needed)
  │   │   ③ Wire new node into audio graph: node → GainNode → AnalyserNode → destination
  │   │   ④ Send init message with cached WebAssembly.Module + current SPC data
  │   │         (Re-post the Module via structured clone — sender retains reference)
  │   │   ⑤ Wait for 'ready' response
  │   │   ⑥ Restore playback position from last known telemetry position
  │   │   ⑦ Send 'play' to resume
  │   │   ⑧ Increment recoveryAttempts
  │   │   → If another trap occurs within 10 seconds, count continues
  │   │   → If 10 seconds pass without a trap, reset recoveryAttempts to 0
  │   │
  │   └─ NO (3 failed attempts):
  │       Show error UI: "Audio engine could not recover. Reload to try again."
  │       Set playback state to 'error' in Zustand store.
  │       Do NOT auto-reload — let the user decide.
```

```typescript
async function attemptWorkletRecovery(): Promise<void> {
  if (workletRecoveryAttempts >= MAX_WORKLET_RECOVERY_ATTEMPTS) {
    useAppStore.getState().setPlaybackError({
      code: 'WASM_TRAP',
      message: 'Audio engine could not recover after multiple attempts.',
      context: { attempts: workletRecoveryAttempts },
      recoverable: false,
    });
    return;
  }

  workletRecoveryAttempts++;

  // ① Disconnect old node
  currentNode?.disconnect();

  // ② Create new AudioWorkletNode (module already registered)
  const newNode = new AudioWorkletNode(audioContext, 'spc-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  // ③ Wire into audio graph
  newNode.connect(gainNode);

  // ④ Send init with cached module + current SPC data
  const spcDataCopy = currentSpcData.slice(0); // Clone since original was transferred
  newNode.port.postMessage({
    type: 'init',
    version: PROTOCOL_VERSION,
    wasmModule: cachedWasmModule,  // Structured clone, sender keeps reference
    spcData: spcDataCopy,
    outputSampleRate: audioContext.sampleRate,
    resamplerMode: currentResamplerMode,
    interpolationMode: currentInterpolationMode,
  }, [spcDataCopy]);

  // ⑤ Wait for ready
  await waitForReady(newNode);

  // ⑥ Restore position
  newNode.port.postMessage({
    type: 'seek',
    samplePosition: audioStateBuffer.positionSamples,
  });

  // ⑦ Resume
  newNode.port.postMessage({ type: 'play' });

  // Attach error handlers to new node
  setupNodeErrorHandlers(newNode);
  currentNode = newNode;

  // Reset counter after 10 seconds of stability
  setTimeout(() => {
    workletRecoveryAttempts = 0;
  }, 10_000);
}
```

### 6.8 Render Overrun Escalation

The worklet tracks consecutive render overruns (quanta where `process()` misses its deadline or `dsp_render()` returns a non-fatal error). If **5 consecutive overruns** occur without a successful render in between, the worklet sends a `RENDER_OVERRUN_CRITICAL` error, signaling the main thread to tear down and rebuild.

```typescript
// Inside SpcProcessor
private consecutiveOverruns = 0;
private readonly MAX_CONSECUTIVE_OVERRUNS = 5;

// Called when dsp_render returns a non-fatal error or process() detects timing overrun
private handleRenderOverrun(): void {
  this.consecutiveOverruns++;

  if (this.consecutiveOverruns >= this.MAX_CONSECUTIVE_OVERRUNS) {
    // Escalate: 5 consecutive overruns indicates systemic failure
    this.port.postMessage({
      type: 'error',
      code: 'RENDER_OVERRUN_CRITICAL',
      message: `${this.consecutiveOverruns} consecutive render overruns — requesting rebuild.`,
      context: {
        consecutiveOverruns: this.consecutiveOverruns,
        positionSamples: this.samplePosition,
      },
    } satisfies WorkletToMain.Error);

    // Stop rendering to prevent further damage
    this.playing = false;
    this.consecutiveOverruns = 0;
  } else {
    // Non-critical: log and output silence this quantum
    this.port.postMessage({
      type: 'error',
      code: 'RENDER_OVERRUN',
      message: `Render overrun #${this.consecutiveOverruns}`,
      context: {
        consecutiveOverruns: this.consecutiveOverruns,
        positionSamples: this.samplePosition,
      },
    } satisfies WorkletToMain.Error);
  }
}
```

The main thread handles `RENDER_OVERRUN_CRITICAL` identically to `WASM_TRAP` — it calls `attemptWorkletRecovery()` (§6.7), sharing the same retry counter and 3-attempt limit.

---

## Appendix A: Complete WASM Export Surface

For reference, the full set of `extern "C"` functions exported by the `spc-apu-wasm` crate. This is the contract between the TypeScript worklet wrapper and the Rust WASM module (ADR-0007).

```typescript
/** TypeScript interface mirroring the WASM module's exported functions. */
interface DspExports {
  /** WASM linear memory. */
  readonly memory: WebAssembly.Memory;

  // ── Lifecycle ──

  /** Allocate bytes in WASM heap. Returns pointer. */
  wasm_alloc(size: number): number;
  /** Free previously allocated bytes. */
  wasm_dealloc(ptr: number, size: number): void;
  /** Initialize the DSP emulator with SPC data at the given pointer. Returns 0 on success. */
  dsp_init(spcDataPtr: number, spcDataLen: number): number;

  // ── Rendering ──

  /**
   * Render `numFrames` of output audio at the configured output sample rate.
   * Writes interleaved float32 stereo samples to the pre-allocated output buffer.
   * Returns the number of DSP samples consumed, or negative on error.
   */
  dsp_render(outputPtr: number, numFrames: number): number;
  /** Get the pointer to the pre-allocated output buffer (interleaved float32 stereo). */
  dsp_get_output_ptr(): number;

  // ── Playback Control ──

  /** Set the voice enable mask. Bit N = voice N. 0xFF = all enabled. */
  dsp_set_voice_mask(mask: number): void;
  /** Set playback speed factor. 1.0 = normal. */
  dsp_set_speed(factor: number): void;
  /** Seek to a position in DSP output samples. Returns 0 on success. */
  dsp_seek(samplePosition: number): number;
  /** Reset the emulator to initial state (re-read SPC data). */
  dsp_reset(): void;

  // ── Quality Settings (ADR-0014) ──

  /** Set output resampler mode. 0 = linear, 1 = sinc (Lanczos-3). */
  dsp_set_resampler_mode(mode: number): void;
  /** Set S-DSP source sample interpolation mode. 0 = gaussian, 1 = linear, 2 = cubic, 3 = sinc. */
  dsp_set_interpolation_mode(mode: number): void;

  // ── Telemetry ──

  /**
   * Get a pointer to the telemetry data structure.
   * Layout: see Appendix B.
   */
  dsp_get_telemetry_ptr(): number;
  /** Get the current playback position in DSP output samples. */
  dsp_get_position(): number;
  /** Read a single DSP register value. addr: 0x00–0x7F. */
  dsp_get_register(addr: number): number;

  // ── State Snapshot (ADR-0014) ──

  /** Serialize full emulation state. Returns pointer to snapshot buffer. */
  dsp_snapshot(): number;
  /** Get the size in bytes of the last snapshot. */
  dsp_snapshot_size(): number;
  /** Restore emulation state from a snapshot buffer. Returns 0 on success. */
  dsp_restore(ptr: number, len: number): number;
}
```

## Appendix B: Telemetry Data Layout in WASM Memory

The telemetry structure is written by `dsp_render()` and read by the worklet's `emitTelemetry()` method via a typed array view over WASM memory. This avoids a WASM→JS function call per telemetry field.

```
Offset   Size    Type       Field
──────   ────    ────       ─────
0x00     4       f32        masterVuLeft
0x04     4       f32        masterVuRight
0x08     32      f32[8]     vuLeft[0..7]
0x28     32      f32[8]     vuRight[0..7]
0x48     varies  struct[8]  voiceStates[0..7]

Per-voice state (16 bytes each):
  +0x00  1       u8         envelopePhase (0=attack, 1=decay, 2=sustain, 3=release, 4=silent)
  +0x01  1       u8         flags (bit 0: keyOn, bit 1: active)
  +0x02  2       u16        envelopeLevel (0–2047)
  +0x04  2       u16        pitch (14-bit)
  +0x06  1       u8         sampleSource
  +0x07  1       u8         reserved (padding)
  +0x08  8       reserved   (future use, alignment padding to 16 bytes)

Total telemetry block: 0x48 + (8 × 16) = 0x48 + 0x80 = 0xC8 = 200 bytes
```

The worklet reads this block once per telemetry interval and constructs the `Telemetry` message:

```typescript
private telemetryGeneration = 0;

private emitTelemetry(): void {
  const mem = (this.wasm!.memory as WebAssembly.Memory).buffer;
  const telPtr = this.wasm!.dsp_get_telemetry_ptr();

  const f32 = new Float32Array(mem, telPtr, 18); // 2 master + 8+8 per-voice VU
  const u8 = new Uint8Array(mem, telPtr + 0x48, 128); // 8 voices × 16 bytes

  const voices: VoiceState[] = [];
  for (let i = 0; i < 8; i++) {
    const base = i * 16;
    const phaseMap = ['attack', 'decay', 'sustain', 'release', 'silent'] as const;
    voices.push({
      index: i,
      envelopePhase: phaseMap[u8[base]] ?? 'silent',
      envelopeLevel: u8[base + 2] | (u8[base + 3] << 8),
      pitch: u8[base + 4] | (u8[base + 5] << 8),
      sampleSource: u8[base + 6],
      keyOn: (u8[base + 1] & 0x01) !== 0,
      active: (u8[base + 1] & 0x02) !== 0,
    });
  }

  this.telemetryGeneration++;

  this.port.postMessage({
    type: 'telemetry',
    positionSamples: this.wasm!.dsp_get_position(),
    masterVuLeft: f32[0],
    masterVuRight: f32[1],
    vuLeft: [f32[2], f32[3], f32[4], f32[5], f32[6], f32[7], f32[8], f32[9]] as const,
    vuRight: [f32[10], f32[11], f32[12], f32[13], f32[14], f32[15], f32[16], f32[17]] as const,
    voices,
    generation: this.telemetryGeneration,
  } satisfies WorkletToMain.Telemetry);
}
```

## Appendix C: audioStateBuffer Definition

The module-scoped mutable object consumed by `requestAnimationFrame` visualization loops (ADR-0005). Not a Zustand store. Not a React ref.

```typescript
/** Module-scoped mutable buffer for real-time audio telemetry. Not reactive. */
export const audioStateBuffer = {
  positionSamples: 0,
  vuLeft: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
  vuRight: [0, 0, 0, 0, 0, 0, 0, 0] as number[],
  masterVuLeft: 0,
  masterVuRight: 0,
  voices: [] as VoiceState[],
  /** Monotonically increasing counter. Visualization loops compare against their
   *  last-seen value to detect new data without deep comparison. */
  generation: 0,
};
```

The main thread's `MessagePort.onmessage` handler writes to this object (including the `generation` counter received from the worklet). Visualization components in their `requestAnimationFrame` callback check `generation` against their last-seen value — if changed, they read the new data and update the DOM directly (canvas draws, CSS transforms, style mutations). No React re-render occurs.

---

## Appendix D: Platform Detection

**`navigator.platform` is deprecated** and may be removed from browsers. For any code that needs platform-specific behavior (e.g., mapping Ctrl to Command on macOS), use this utility:

```typescript
/**
 * Detect whether the user is on macOS/iOS.
 * Uses navigator.userAgentData (Chromium) with fallback to navigator.platform
 * (Safari/Firefox where userAgentData is not available).
 */
function isMacPlatform(): boolean {
  if (navigator.userAgentData) {
    return navigator.userAgentData.platform === 'macOS';
  }
  // Fallback for Safari/Firefox (navigator.platform still works, just deprecated)
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}
```

This pattern is used by the keyboard shortcuts system for modifier key normalization (Ctrl ↔ Meta on macOS). The worker protocol itself does not require platform detection — it is platform-agnostic.
