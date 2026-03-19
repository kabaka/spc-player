# Export Pipeline Architecture

**Status:** Draft (Revised)

> **Revision Notes (from peer review):**
>
> - **C-EXP-1:** Removed `'resampling'` from `ExportProgressMessage.phase`. Resampling is an implementation sub-step of rendering, not a user-visible phase. Phase union and weight table now match exactly: `'rendering' | 'encoding' | 'metadata' | 'packaging'`.
> - **C-EXP-2:** Removed 24-bit WAV from `CodecOptions` for v1. The pipeline handles float32→int16 only. 24-bit is noted as a future consideration; the architecture remains extensible.
> - **M-EXP-1:** Unified filename patterns between §2.2 and §7. `generateFilename` in §7 is the canonical source. All patterns now include game title, track title, voice number (1-based), and instrument name where available.
> - **M-EXP-2:** Committed to module workers with dynamic `import()`. Removed all `importScripts()` references. Safari 15+ is the minimum for module worker support.
> - **M-EXP-3:** Added accessibility subsection to §4 covering ARIA progress patterns, throttled updates, and batch announcements.
> - **Cross-doc:** Error codes use UPPER_SNAKE_CASE per ADR-0015. Phase list aligned with worker protocol. Export slice boundary clarified per ADR-0005. `ExportJobStatus` aligned with phase type.
> - **m-EXP-1:** Added rationale comment for `URL.revokeObjectURL` 10-second delay.
> - **Suggestions:** Added fflate rationale note. Noted estimated time remaining as a future enhancement.
> - **NEW-1/NEW-2 (Revision 3):** Replaced duplicate Worker Message Protocol type definitions with a cross-reference to the authoritative Worker and AudioWorklet Message Protocol document. This eliminates conflicting discriminators (`'export:progress'` vs `'progress'`), field name mismatches (`error` vs `message`, `data` vs `fileData`), and the missing `context` field on error messages.

---

## 1. Export Architecture Overview

### Why a Web Worker, Not AudioWorklet or OfflineAudioContext

Export runs in a **dedicated Web Worker**, not in the AudioWorklet and not via `OfflineAudioContext`.

**Why not AudioWorklet?** The AudioWorklet processes audio in 128-frame quanta synchronized with the hardware clock. It cannot run faster than real-time — a 3-minute track would take 3 minutes to export. The AudioWorklet's purpose is low-latency real-time output, not bulk rendering.

**Why not OfflineAudioContext?** `OfflineAudioContext` renders faster than real-time, but it still operates in AudioWorklet quantum increments with the same constraints: the resampling algorithm cannot differ from the real-time path, the rendering speed is implementation-dependent, and iOS Safari imposes audio session restrictions that can block offline rendering. Per ADR-0003, the export path must use windowed sinc resampling (vs. linear for real-time) and target arbitrary sample rates independently of the AudioContext — `OfflineAudioContext` cannot satisfy these requirements.

**Why a dedicated Web Worker?** The export worker runs an independent WASM instance of the DSP emulator at maximum CPU speed with no quantum timing constraints. It produces PCM samples as fast as the CPU allows, then passes them to the encoder. This cleanly separates export from playback — the user can continue listening while exporting.

### How Export Differs from Real-Time Playback

| Aspect | Real-Time Path | Export Path |
|--------|---------------|-------------|
| Execution context | AudioWorklet (audio thread) | Web Worker (background thread) |
| Timing | Synchronized to hardware clock | Maximum CPU speed |
| Resampler | Linear interpolation (WASM) | Windowed sinc / Lanczos-3 (WASM) |
| Output rate | 48 kHz (AudioContext rate) | Configurable: 32k, 44.1k, 48k, 96k |
| Dithering | None (float32 output to Web Audio) | TPDF dithering (float32 → int16) |
| Consumer | AudioWorklet → GainNode → destination | Encoder (WAV/FLAC/OGG/MP3) → Blob |
| Concurrency | Exclusive (one SPC loaded at a time) | Independent (can run during playback) |

### DSP Emulator in Export Mode

The export worker loads the same `spc-apu-wasm` WASM module used by the AudioWorklet. It instantiates a separate WASM instance with its own linear memory — fully independent of the playback instance. The worker calls `dsp_render()` in a tight loop, rendering chunks of PCM at 32 kHz, then passing each chunk through the sinc resampler and TPDF ditherer before feeding it to the encoder.

The rendering loop has no timing constraints. A 3-minute SPC track at 32 kHz = 5,760,000 stereo samples. On modern hardware, the DSP emulator produces this in well under 1 second. The encoder is typically the bottleneck.

```
Export Worker Architecture
═════════════════════════

┌─────────────────────────────────────────────────────────────┐
│  Export Web Worker                                          │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  WASM DSP    │───▶│  Sinc        │───▶│  TPDF        │  │
│  │  Emulator    │    │  Resampler   │    │  Ditherer    │  │
│  │  (32 kHz)    │    │  (→ target)  │    │  (f32→i16)   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         ▲                                       │          │
│         │                                       ▼          │
│  ┌──────────────┐                      ┌──────────────┐   │
│  │  SPC File    │                      │  Encoder     │   │
│  │  Data        │                      │  (codec lib) │   │
│  └──────────────┘                      └──────┬───────┘   │
│                                               │            │
└───────────────────────────────────────────────┼────────────┘
                       ▼ postMessage            │
              ┌──────────────────┐              ▼
              │  Main Thread     │     Encoded Blob
              │  (progress, UI)  │     (transferred)
              └──────────────────┘
```

### Voice Selection in the WASM Emulator

For per-track and per-instrument exports, the WASM module exposes voice mask controls. The export worker configures which voices are active before rendering:

```rust
#[no_mangle]
pub extern "C" fn dsp_set_voice_mask(mask: u8);
// Bitmask: bit N = 1 means voice N is active
// 0xFF = all voices (full mix)
// 0x01 = voice 0 only
// 0x04 = voice 2 only
```

For full mix export, the mask is `0xFF`. For per-track export of voice 3, the mask is `0x08`. The DSP emulator still runs all 8 voices internally (to maintain correct echo, noise, and pitch modulation state) but mixes only the selected voices into the output buffer.

---

## 2. Export Types

### 2.1 Full Mix Export

Exports all 8 voices mixed together as a single stereo file.

```
SPC data → WASM DSP (voice mask 0xFF, 32 kHz)
  → Sinc resampler (32 kHz → target rate)
  → TPDF ditherer (float32 → int16)
  → Encoder (selected codec)
  → Blob → Download
```

**Duration determination:** The SPC file's ID666 tag contains a play length (in seconds) and fade length. The export renders `playLength + fadeLength` seconds of audio. If no duration tag exists, the user must specify a duration or the export uses a configurable default (e.g., 180 seconds). During the fade portion, a linear gain ramp from 1.0 to 0.0 is applied to the PCM output before encoding.

### 2.2 Per-Track Export

Exports each selected voice as a separate stereo file. The user selects which voices to export (1–8). Each voice produces one file.

```
For each selected voice N:
  SPC data → WASM DSP (voice mask = 1 << N, 32 kHz)
  → Sinc resampler → TPDF ditherer → Encoder → Blob
```

**Important:** Each voice requires a full DSP emulation pass. The emulator must run from the beginning of the SPC for each voice because the DSP state (echo buffer, noise generator, pitch modulation) depends on all voices running together. The voice mask only controls which voices contribute to the output mix — all 8 voices are always emulated internally.

This means exporting all 8 voices individually is 8× the emulation cost of a full mix export. The export system pipelines this: while voice N is encoding, voice N+1 can begin its emulation pass.

**Filename pattern:** `{game} - {title} - Voice {N} ({instrument_name}).{ext}` where `{N}` is 1-based and `{instrument_name}` is included when available from xid6 metadata. Falls back to `{game} - {title} - Voice {N}.{ext}` when no instrument name is present. See §7 `generateFilename` for the canonical implementation.

### 2.3 Per-Instrument Sample Export

Extracts raw BRR sample data from the SPC file's RAM and decodes it to PCM. This does **not** run the DSP emulator — it directly reads BRR-encoded sample blocks from the SPC's 64 KB RAM using the source directory table.

```
SPC RAM → Parse source directory (addresses at $xxD0-$xxFF in DSP DIR register)
  → For each BRR sample entry:
    → Read BRR blocks from RAM (9 bytes per block: 1 header + 8 nibble pairs = 16 PCM samples)
    → Decode BRR → 16-bit PCM at native pitch (32 kHz base rate)
    → Optionally resample to target rate
    → Encode → Blob
```

**No emulation required.** BRR decoding is a straightforward decompression algorithm. The WASM module exposes a dedicated export for this:

```rust
#[no_mangle]
pub extern "C" fn brr_decode_sample(
    ram_ptr: *const u8,       // Pointer to 64 KB SPC RAM in WASM memory
    dir_entry_index: u32,     // Source directory entry index (0-based)
    output_ptr: *mut i16,     // Pre-allocated output buffer
    max_samples: u32,         // Maximum samples to decode
) -> u32;                     // Returns number of samples actually decoded
```

BRR samples are mono. The output is a mono PCM buffer at the sample's native playback rate. The sample's loop point (from the BRR block header's loop flag) is preserved as metadata where the output format supports it.

**Filename pattern:** `{game} - {title} - Sample {index:02} ({name}).{ext}` — see §7 `generateFilename` for the canonical implementation.

### 2.4 Batch Export

Exports multiple SPC files using the same format and quality settings. The input is an array of SPC file buffers (from IndexedDB, file picker, or playlist). Each file is exported independently through the same pipeline as a single-file export.

```
For each SPC file in queue:
  Load SPC → Instantiate WASM DSP → Render → Resample → Dither → Encode → Blob
  Report per-file progress
After all files:
  Package as ZIP (or individual downloads) → Download
```

Batch export reuses the same WASM instance by resetting the emulator state between files:

```rust
#[no_mangle]
pub extern "C" fn dsp_load_spc(ptr: *const u8, len: u32) -> u32;
// Loads a new SPC file into the existing WASM instance.
// Returns 0 on success, non-zero error code on failure.
// Resets all DSP state, SPC700 CPU, and RAM.
```

---

## 3. Queue Management

### Queue Architecture

The export queue is managed by a dedicated `ExportQueueManager` class on the main thread. It is **not** part of the Zustand store — the queue manager owns the Web Worker lifecycle and communicates with the store only to publish observable state (active jobs, progress).

**ExportSlice vs. ExportQueueManager boundary (per ADR-0005):**

The Zustand `export` slice holds **only user-visible, reactive state** needed to render the export UI:
- Job descriptors: `id`, `status`, `progress`, `error`, `label`, `sourceFilename`, output metadata
- Batch-level summary: total/completed/failed counts, current job ID
- Derived flags: `isExporting`, `queueSize`

The `ExportQueueManager` service owns **operational, non-reactive state** that the UI does not observe directly:
- Queue ordering (the FIFO array of pending `ExportJobDescriptor` objects)
- Worker lifecycle (creation, termination, message routing)
- `AbortController` instances for cancellation
- WASM instance caching and codec loader state
- Transfer buffer management

Per ADR-0005's principle, operational non-reactive state stays out of the store. The `ExportQueueManager` pushes state updates into the Zustand slice via actions; the store never reaches into the manager.

```
Queue Architecture
══════════════════

┌──────────────────────────────────────────────────────┐
│  Main Thread                                         │
│                                                      │
│  ┌─────────────────┐      ┌──────────────────────┐  │
│  │ ExportQueueMgr  │─────▶│ Zustand export slice │  │
│  │ (service)       │      │ (observable state)   │  │
│  │                 │      │                      │  │
│  │ • pending[]     │      │ • jobs[] (id,status, │  │
│  │ • activeJob     │      │   progress,error,    │  │
│  │ • abortCtrl     │      │   label,filename)    │  │
│  │ • worker ref    │      │ • isExporting        │  │
│  │ • codec cache   │      │ • queueSize          │  │
│  └────────┬────────┘      └──────────────────────┘  │
│           │                                          │
│           │ postMessage                              │
│           ▼                                          │
│  ┌─────────────────┐                                 │
│  │ Export Worker    │  (1 worker at a time;           │
│  │ (module worker) │   sequential processing)        │
│  └─────────────────┘                                 │
└──────────────────────────────────────────────────────┘
```

### Sequential Processing

Export jobs run **sequentially**, one at a time. Rationale:

1. **Memory:** Each WASM DSP instance requires ~256 KB of linear memory (64 KB SPC RAM + DSP state + resampler buffers + encoder working memory). Running multiple exports in parallel multiplies this cost.
2. **CPU:** The export worker already saturates one CPU core during encoding. Parallel workers would compete for CPU time and degrade throughput on most consumer devices (especially mobile).
3. **Encoder WASM instances:** Codec libraries (libflac.js, lame-wasm) each instantiate their own WASM module with their own linear memory. Running 2+ encoders simultaneously could exceed mobile memory limits.
4. **Simplicity:** Sequential processing eliminates race conditions in progress reporting, file naming, and download handling.

The queue is a FIFO array of `ExportJob` descriptors. When the active job completes (or fails/is cancelled), the queue manager dequeues the next job and sends it to the worker.

### Memory Constraints

For large batch exports, the queue manager **does not** hold all SPC file data in memory simultaneously. Instead:

- SPC file data is loaded from IndexedDB on demand, one file at a time, when that job reaches the front of the queue.
- After a job completes, the encoded Blob is either downloaded immediately or collected into a running ZIP stream. The PCM buffer is released.
- The ZIP builder (for batch downloads) uses a streaming approach — each file is appended to the ZIP as it completes, rather than accumulating all encoded files in memory before zipping.

### Queue State

```typescript
// Internal to ExportQueueManager — NOT in Zustand
interface InternalQueueState {
  pending: ExportJobDescriptor[];   // Jobs waiting to start
  activeJob: ExportJobDescriptor | null; // Currently processing
  workerId: number | null;          // Active worker reference
}

// Published to Zustand export slice — observable by UI
interface ExportSliceState {
  jobs: ExportJob[];                // All jobs with current status
  isExporting: boolean;             // True if any job is active
  queueSize: number;                // Number of pending jobs
}
```

---

## 4. Progress Reporting

### Worker → Main Thread Progress Protocol

The export worker sends progress messages to the main thread via `postMessage`. Progress is reported at two granularities:

1. **Render progress:** During DSP emulation, the worker reports the percentage of audio rendered (samples produced / total samples needed). Updates are throttled to at most 20 messages per second to avoid flooding the message channel.
2. **Encode progress:** During encoding, progress is reported per encoded chunk. For streaming encoders, this is the percentage of PCM data fed to the encoder. For buffer-all encoders, this is a binary "encoding" → "done" transition.

### Progress Message Shape

Progress messages use the `ExportWorkerToMain.Progress` type from the Worker Protocol (see §8). Key fields:

- `phase: ExportPhase` — one of `'rendering'`, `'encoding'`, `'metadata'`, `'packaging'`
- `fraction` — progress within the current phase (0.0–1.0)
- `overallProgress` — weighted progress across all phases (0.0–1.0)

> **Note:** Resampling is an implementation sub-step of the `'rendering'` phase (DSP emulation → sinc resampler → TPDF ditherer all execute within a single render chunk iteration). It is not exposed as a separate user-visible phase.

### Phase Weighting

Overall job progress is computed from weighted phase progress. The weights reflect typical execution time distribution:

| Phase | Weight | Description |
|-------|--------|-------------|
| `rendering` | 0.20 | DSP emulation + sinc resampling + dithering |
| `encoding` | 0.70 | Codec encoding (CPU-intensive for FLAC/OGG/MP3) |
| `metadata` | 0.05 | Tag embedding |
| `packaging` | 0.05 | Blob creation / ZIP append |

WAV encoding is trivial (raw PCM copy), so for WAV exports the weights shift: `rendering` = 0.80, `encoding` = 0.10, `metadata` = 0.05, `packaging` = 0.05.

### Batch Progress

For batch exports, the UI displays two levels of progress:

1. **Per-file progress bar:** Shows the current file's overall progress (the `overallProgress` field above).
2. **Batch progress:** `completedFiles / totalFiles` as a fraction and percentage.

The Zustand `export` slice holds both:

```typescript
interface ExportSliceState {
  jobs: ExportJob[];
  // Batch-level summary — derived from jobs array
  batchProgress: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    currentJobId: string | null;
  } | null;
}
```

### UI Rendering

Progress updates are high-frequency (up to 20/sec). The Zustand store updates on each progress message, but only the `ExportProgressBar` component subscribes to the relevant job's progress field via a selector:

```typescript
const progress = useExportStore(
  (s) => s.jobs.find((j) => j.id === jobId)?.progress ?? 0
);
```

Because the progress bar is a simple numeric display (not a complex component tree), re-renders at 20 Hz are acceptable. For canvas-based progress visualizations, the rAF pattern from ADR-0005 can be used instead.

Export progress does **not** affect audio playback. The export worker and AudioWorklet are on separate threads with no shared state.

### Accessibility

The export progress UI follows WCAG 2.2 AA patterns:

- **Progress indicator:** Use Radix `Progress` primitive with `aria-valuenow` set to `Math.round(overallProgress * 100)`.
- **Value text:** Set `aria-valuetext` to a human-readable string combining phase and percentage, e.g., `"Encoding: 45%"`. This gives screen readers meaningful context beyond a bare number.
- **Throttled ARIA updates:** ARIA attribute updates on the progress bar are throttled to **250ms intervals** (matching the global ARIA update throttle from the accessibility patterns doc). The internal Zustand state updates at up to 20 Hz, but the DOM attribute reflecting `aria-valuenow` and `aria-valuetext` updates at most every 250ms to avoid overwhelming screen readers.
- **Job lifecycle announcements:** An `aria-live="polite"` region announces key state transitions:
  - Job started: `"Export started: {label}"`
  - Job completed: `"Export complete: {label}"`
  - Job failed: `"Export failed: {label}"`
- **Batch progress announcements:** At file boundaries during batch export, announce `"Exporting file {n} of {total}"` via the same `aria-live="polite"` region. These announcements are coalesced — if multiple files complete in rapid succession, only the latest is announced.
- **Cancel button:** Each job's cancel button has `aria-label="Cancel export: {label}"` for unambiguous identification.

---

## 5. Cancellation

### User-Initiated Cancellation

The user can cancel:
- A single export job (via a cancel button on the job's progress row).
- The entire batch (via a "Cancel All" button).

### Cancellation Flow

```
User clicks Cancel
  → ExportQueueManager.cancel(jobId)
  → Sends { type: 'cancel-export' } to the export worker via postMessage
  → Worker receives cancel message:
    1. Sets a cancellation flag
    2. The render loop checks the flag every N iterations (e.g., every 4096 samples)
    3. When detected: stops rendering, releases encoder resources, sends 'cancelled' back
  → ExportQueueManager updates job status to 'cancelled' in Zustand store
  → If batch: dequeues next job (or stops if "Cancel All")
```

### Worker-Side Cancellation

The worker cannot be forcibly terminated mid-render without losing state. Instead, it uses a cooperative cancellation pattern:

```typescript
// Inside the export worker's render loop
let cancelled = false;

self.onmessage = (e) => {
  if (e.data.type === 'cancel-export') {
    cancelled = true;
  }
};

function renderLoop(totalSamples: number): Int16Array | null {
  const CHUNK_SIZE = 4096; // Check cancellation every 4096 samples
  for (let offset = 0; offset < totalSamples; offset += CHUNK_SIZE) {
    if (cancelled) {
      return null; // Abort — caller handles cleanup
    }
    // Render CHUNK_SIZE samples via WASM
    // Feed to encoder
    // Report progress
  }
  return encodedResult;
}
```

The `CHUNK_SIZE` of 4096 samples (~128ms at 32 kHz) provides sub-200ms cancellation responsiveness without excessive flag-checking overhead.

### Cleanup on Cancellation

When a job is cancelled:
1. The encoder's in-progress state is discarded (no finalization call).
2. Any partial Blob data is released (no references retained).
3. The WASM DSP instance remains valid — it can be reloaded with the next SPC file.
4. If the cancelled job was part of a batch with a running ZIP stream, the partial ZIP is discarded (the ZIP cannot contain incomplete entries).

### "Cancel All" for Batches

"Cancel All" sets the cancellation flag on the active worker **and** clears the pending queue. The queue manager:
1. Sends `cancel-export` to the active worker.
2. Sets all pending jobs' status to `'cancelled'` in the Zustand store.
3. Clears the internal pending queue.

---

## 6. Codec Integration

### Codec Loading Strategy

Each codec library is **lazy-loaded** via dynamic `import()` when the user first requests an export in that format. The WASM binaries for FLAC, OGG Vorbis, and MP3 are separate chunks that Vite code-splits automatically. A user who only exports WAV never downloads any codec WASM.

```typescript
async function getEncoder(format: ExportFormat): Promise<Encoder> {
  switch (format) {
    case 'wav':
      return new WavEncoder();  // No WASM — pure TypeScript
    case 'flac': {
      const { createFlacEncoder } = await import('./codecs/flac-adapter');
      return createFlacEncoder();
    }
    case 'ogg': {
      const { createOggEncoder } = await import('./codecs/ogg-adapter');
      return createOggEncoder();
    }
    case 'mp3': {
      const { createMp3Encoder } = await import('./codecs/mp3-adapter');
      return createMp3Encoder();
    }
  }
}
```

**Error handling:** If a codec WASM module fails to load (network error, corrupt binary, out-of-memory), the adapter throws an error with code `AUDIO_CODEC_LOAD_FAILED`. The export worker catches this, reports an `error` message (per the Worker Protocol) with the error code and structured context, and the job transitions to `'failed'` status. Error codes follow UPPER_SNAKE_CASE per ADR-0015.

### Worker Architecture: Module Worker

All codec encoding happens inside the **same export worker** that runs the DSP emulation. There is no separate worker per codec and no worker pool.

The export worker is instantiated as a **module worker**:

```typescript
const exportWorker = new Worker(
  new URL('./export-worker.ts', import.meta.url),
  { type: 'module' }
);
```

Module workers support top-level `import` declarations, dynamic `import()` for lazy codec loading, and standard ES module semantics. This is the correct choice for a Vite-based build pipeline.

**Minimum browser support:** Safari 15+ (module workers landed in Safari 15). All Chromium and Firefox versions that support AudioWorklet also support module workers.

Rationale for a single shared worker:
- The PCM data produced by the DSP render loop is already in the worker's memory. Transferring it to a separate encoder worker would require copying or transferring large `ArrayBuffer`s across threads.
- Only one export runs at a time (sequential queue), so there is no benefit to parallelizing codec workers.
- Each codec's WASM module is loaded inside the worker via dynamic `import()`. The codec WASM is instantiated on first use and cached for subsequent exports of the same format.

```
Export Worker Internals
═══════════════════════

┌────────────────────────────────────────────────────┐
│  Export Worker (module worker)                     │
│                                                    │
│  WASM Instances:                                   │
│  ┌────────────┐  ┌────────┐  ┌───────┐  ┌──────┐ │
│  │ spc-apu    │  │ libflac│  │libvorb│  │ lame │ │
│  │ (always)   │  │ (lazy) │  │(lazy) │  │(lazy)│ │
│  └────────────┘  └────────┘  └───────┘  └──────┘ │
│                                                    │
│  TypeScript:                                       │
│  ┌────────────┐                                    │
│  │ WAV encoder│ (no WASM)                          │
│  └────────────┘                                    │
└────────────────────────────────────────────────────┘
```

### Streaming Encoding vs. Buffer-All

Codec libraries are wrapped in a common `Encoder` interface that supports **streaming** (chunk-based) encoding:

```typescript
interface Encoder {
  /** Initialize the encoder with output parameters */
  init(config: EncoderConfig): void;
  
  /** Feed a chunk of interleaved int16 PCM samples */
  encode(samples: Int16Array): void;
  
  /** Finalize encoding and return the complete encoded file */
  finalize(): Uint8Array;
  
  /** Release all resources */
  dispose(): void;
}

interface EncoderConfig {
  sampleRate: number;     // e.g., 48000
  channels: number;       // 1 (mono) or 2 (stereo)
  bitsPerSample: number;  // 16
  // Codec-specific
  quality?: number;       // OGG: -1 to 10. MP3: VBR 0–9.
  compression?: number;   // FLAC: 0–8
  metadata?: ExportMetadata;
}
```

The render loop feeds PCM chunks to the encoder incrementally:

```
Render 4096 DSP samples (32 kHz)
  → Resample to target rate (e.g., 6144 samples at 48 kHz)
  → Dither to int16
  → encoder.encode(chunk)    // Encoder processes incrementally
  → Report progress
  ... repeat ...
encoder.finalize()            // Flush encoder, get complete file
```

This streaming approach keeps peak memory usage proportional to the chunk size (~48 KB per chunk at 4096 stereo 16-bit samples), not proportional to the total track duration. A 3-minute track at 96 kHz stereo int16 = ~66 MB as a full buffer; streaming avoids this.

**Per-codec streaming support:**

| Codec | Streaming | Notes |
|-------|-----------|-------|
| WAV | Yes (trivial) | Write header placeholder, append PCM chunks, seek back to fix header sizes at finalize |
| FLAC | Yes | libflac.js supports incremental `encode()` calls |
| OGG Vorbis | Yes | libvorbisenc natively produces OGG pages incrementally |
| MP3 | Yes | LAME's `encodeBuffer()` accepts chunks; `flush()` at end |

### Metadata Embedding

Metadata is embedded **by the encoder adapter** during initialization or finalization, depending on the format:

| Format | Metadata System | When Applied | Fields |
|--------|----------------|--------------|--------|
| WAV | RIFF LIST/INFO chunk | After `data` chunk at finalize | INAM (title), IART (artist), ICMT (comment) |
| FLAC | Vorbis comments | At init (in STREAMINFO) | TITLE, ARTIST, ALBUM (game), COMMENT |
| OGG | Vorbis comments | At init (comment header packet) | TITLE, ARTIST, ALBUM (game), COMMENT |
| MP3 | ID3v2.3 tag | Prepended at finalize | TIT2 (title), TPE1 (artist), TALB (game), COMM |

The `ExportMetadata` type maps SPC ID666/xid6 fields to format-neutral metadata keys:

```typescript
interface ExportMetadata {
  title: string;         // ID666 song title
  artist: string;        // ID666 artist
  game: string;          // ID666 game title
  year?: string;         // xid6 or ID666 date dumped
  comment: string;       // "Exported by SPC Player" + ID666 comments
  trackNumber?: number;  // Voice number for per-track exports
  duration?: number;     // Seconds, for formats that support it
}
```

**ID3v2 implementation:** Rather than relying on LAME's built-in ID3 support (which may be incomplete in the WASM port), a lightweight TypeScript ID3v2.3 tag generator produces the tag header as a `Uint8Array`. This is prepended to the MP3 data at finalize. The implementation is ~100 lines: a frame serializer for text frames (TIT2, TPE1, TALB, COMM) with UTF-8 encoding.

---

## 7. Download / Save

### Single File Download

Individual exports use the standard Blob URL + anchor click pattern:

```typescript
function downloadBlob(data: Uint8Array, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after a delay to ensure the browser has initiated the download.
  // 10 seconds is sufficient because createObjectURL downloads are synchronous
  // from the browser's perspective — the blob data is already in memory, so the
  // "download" begins immediately when the anchor is clicked. The delay only
  // needs to cover the time for the browser to copy the reference, not the time
  // to write the file to disk.
  // NOTE: For very large files (100 MB+) on extremely slow I/O, there is a
  // theoretical edge case where 10s could be insufficient. In practice, SPC
  // exports are small (a 3-min 96 kHz stereo WAV is ~66 MB). If this proves
  // problematic, the delay can be increased or replaced with a download
  // completion callback via the File System Access API path.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
```

**MIME types:**

| Format | MIME Type |
|--------|-----------|
| WAV | `audio/wav` |
| FLAC | `audio/flac` |
| OGG | `audio/ogg` |
| MP3 | `audio/mpeg` |
| ZIP | `application/zip` |

### File System Access API (Progressive Enhancement)

When the File System Access API is available (`'showSaveFilePicker' in window`), the export dialog offers a "Save As…" option that lets the user choose the destination. This is a progressive enhancement — the Blob URL fallback works everywhere.

```typescript
async function saveWithPicker(
  data: Uint8Array,
  suggestedName: string,
  accept: Record<string, string[]>,
): Promise<void> {
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ accept }],
  });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}
```

The File System Access API is supported in Chromium browsers. Safari and Firefox fall back to Blob URL downloads.

### Filename Generation

Filenames are generated from SPC metadata with sanitization. This is the **canonical** filename generation logic; all references to filename patterns in §2 defer to this implementation.

```typescript
function generateFilename(
  metadata: ExportMetadata,
  format: ExportFormat,
  voiceIndex?: number,
  instrumentName?: string,
  sampleIndex?: number,
): string {
  const ext = FORMAT_EXTENSIONS[format]; // 'wav', 'flac', 'ogg', 'mp3'
  const title = sanitizeFilename(metadata.title || 'Untitled');
  const game = sanitizeFilename(metadata.game || 'Unknown Game');

  if (sampleIndex !== undefined) {
    const name = instrumentName
      ? ` (${sanitizeFilename(instrumentName)})`
      : '';
    return `${game} - ${title} - Sample ${String(sampleIndex + 1).padStart(2, '0')}${name}.${ext}`;
  }
  if (voiceIndex !== undefined) {
    const name = instrumentName
      ? ` (${sanitizeFilename(instrumentName)})`
      : '';
    return `${game} - ${title} - Voice ${voiceIndex + 1}${name}.${ext}`;
  }
  return `${game} - ${title}.${ext}`;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')  // Remove illegal chars
    .replace(/\s+/g, ' ')                       // Collapse whitespace
    .trim()
    .slice(0, 200);                              // Length limit
}
```

### Batch Export: ZIP Packaging

Batch exports produce a single ZIP file containing all exported audio files. The ZIP is built using a **streaming ZIP writer** that appends files as they complete, rather than accumulating all files in memory.

The streaming ZIP implementation uses **fflate** on the main thread, receiving encoded `Uint8Array` blobs transferred from the worker. fflate is preferred for its small bundle size (~8 KB gzipped), streaming `Zip` API that supports incremental file appends, and pure-JS implementation with no WASM dependency competing for memory with the codec WASM modules. (The final library choice may be revisited during implementation if streaming ZIP requirements evolve.)

```
Worker completes file 1 → transfers Uint8Array to main thread
  → ZIP writer appends file 1 entry
  → Uint8Array can be GC'd

Worker completes file 2 → transfers Uint8Array to main thread
  → ZIP writer appends file 2 entry
  ... etc ...

All files done → ZIP writer finalizes → Download ZIP blob
```

**ZIP filename:** `{game} - Export.zip` or `SPC Export - {timestamp}.zip` if files span multiple games.

For small batches (≤3 files), the user can opt for individual downloads instead of ZIP packaging.

---

## 8. TypeScript Types

### ExportFormat

```typescript
type ExportFormat = 'wav' | 'flac' | 'ogg' | 'mp3';

type ExportMode = 'fullMix' | 'perTrack' | 'perInstrument' | 'batch';
```

### ExportOptions

```typescript
interface ExportOptions {
  /** Output format */
  format: ExportFormat;

  /** Target sample rate in Hz */
  sampleRate: 32000 | 44100 | 48000 | 96000;

  /** Export mode */
  mode: ExportMode;

  /**
   * Voice selection bitmask (bits 0–7 = voices 0–7).
   * - fullMix: 0xFF (all voices)
   * - perTrack: which voices to export (each produces a separate file)
   * - perInstrument: ignored (uses source directory)
   * - batch: 0xFF (full mix per file)
   */
  voiceMask: number;

  /** Metadata derived from SPC ID666/xid6 tags */
  metadata: ExportMetadata;

  /** Duration to render in seconds (playLength + fadeLength) */
  durationSeconds: number;

  /** Fade-out duration in seconds (last N seconds ramp to silence) */
  fadeDurationSeconds: number;

  /** Codec-specific settings */
  codecOptions: CodecOptions;

  /**
   * For batch mode: array of SPC file references.
   * Each entry is an IndexedDB key or an ArrayBuffer.
   */
  batchFiles?: SpcFileRef[];

  /** For batch mode: whether to package as ZIP or individual downloads */
  batchPackaging: 'zip' | 'individual';
}

interface CodecOptions {
  /** FLAC compression level (0–8, default 5) */
  flacCompression?: number;
  /** OGG Vorbis quality (-1 to 10, default 6) */
  oggQuality?: number;
  /** MP3 VBR quality (0–9, lower = better, default 2) */
  mp3Quality?: number;
}

type SpcFileRef =
  | { type: 'indexeddb'; key: string }
  | { type: 'buffer'; data: ArrayBuffer; filename: string };
```

> **v1 scope note:** `CodecOptions.wavBitDepth` is omitted. The v1 pipeline produces 16-bit WAV only (float32 → TPDF dither → int16). See §9 "Future Considerations" for 24-bit WAV.

### ExportMetadata

```typescript
interface ExportMetadata {
  title: string;
  artist: string;
  game: string;
  year?: string;
  comment: string;
  trackNumber?: number;
  duration?: number;
}
```

### ExportJob

```typescript
type ExportJobStatus =
  | 'queued'
  | 'rendering'
  | 'encoding'
  | 'metadata'
  | 'packaging'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface ExportJob {
  /** Unique job ID (crypto.randomUUID()) */
  id: string;

  /** Current status */
  status: ExportJobStatus;

  /** Overall progress (0.0–1.0) */
  progress: number;

  /** Export options for this job */
  options: ExportOptions;

  /** Human-readable description (e.g., "Chrono Trigger - Corridors of Time.flac") */
  label: string;

  /** Source filename (for display) */
  sourceFilename: string;

  /** Error message if status is 'failed' */
  error?: string;

  /** Error code if status is 'failed' (UPPER_SNAKE_CASE per ADR-0015) */
  errorCode?: string;

  /** Timestamp when job was created */
  createdAt: number;

  /** Timestamp when job completed/failed/cancelled */
  completedAt?: number;

  /** Encoded file size in bytes (set on completion) */
  outputSize?: number;
}
```

### Worker Message Protocol

Export worker messages are defined authoritatively in the **Worker and AudioWorklet Message Protocol** document:

- **Main → Worker:** `MainToExportWorker` (`Init`, `StartExport`, `CancelExport`)
- **Worker → Main:** `ExportWorkerToMain` (`Ready`, `Progress`, `Complete`, `Error`, `Cancelled`)

This document does not redefine those types. Implementors should import the canonical types from the protocol module. Key conventions:

- Message `type` discriminators are **unprefixed** (e.g., `'progress'`, not `'export:progress'`).
- Error messages use `code: ExportErrorCode` (from ADR-0015) with a `context` field — not a free-form `error` string.
- `ExportPhase` is the 4-phase model: `'rendering'` → `'encoding'` → `'metadata'` → `'packaging'`. Completion is signaled by the `Complete` message, not by a phase.
- All fields are `readonly`. `ArrayBuffer` fields are transferred, not copied.

### Encoder Interface

```typescript
interface Encoder {
  init(config: EncoderConfig): void;
  encode(samples: Int16Array): void;
  finalize(): Uint8Array;
  dispose(): void;
}

interface EncoderConfig {
  sampleRate: number;
  channels: 1 | 2;
  bitsPerSample: 16;
  quality?: number;
  compression?: number;
  metadata?: ExportMetadata;
}
```

### Zustand Export Slice

```typescript
interface ExportSliceState {
  jobs: ExportJob[];
  isExporting: boolean;
  queueSize: number;
  batchProgress: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    currentJobId: string | null;
  } | null;
}

interface ExportSliceActions {
  /** Add a job to the queue and start processing if idle */
  enqueueExport(options: ExportOptions, spcData: ArrayBuffer, label: string): string;
  /** Add multiple jobs for batch export */
  enqueueBatch(files: Array<{ options: ExportOptions; spcData: ArrayBuffer; label: string }>): string[];
  /** Cancel a specific job */
  cancelExport(jobId: string): void;
  /** Cancel all pending and active jobs */
  cancelAll(): void;
  /** Remove completed/failed/cancelled jobs from the list */
  clearCompleted(): void;
}
```

---

## 9. Future Considerations

- **24-bit WAV export:** The v1 pipeline quantizes to int16 with TPDF dithering. Adding 24-bit output requires extending the `Encoder.encode()` signature to accept wider sample types (or a generic `ArrayBufferView`), adjusting the TPDF ditherer (24-bit may use shaped dither or no dither depending on the source bit depth), and adding `wavBitDepth` back to `CodecOptions`. The architecture supports this without structural changes — the `Encoder` interface and pipeline stages are designed to be bit-depth-agnostic at the boundary level.
- **Estimated time remaining:** The data needed to compute ETA is already available during export: `samplesRendered`, `totalSamples`, and wall-clock timestamps from `performance.now()`. A simple linear extrapolation (`(totalSamples - samplesRendered) / (samplesRendered / elapsedTime)`) would provide a rough estimate. This is a UI-only enhancement with no pipeline changes required.

---

## Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Export execution context | Dedicated Web Worker (module worker) | Faster-than-real-time rendering; no AudioWorklet timing constraints |
| Not OfflineAudioContext | Confirmed | Cannot use different resampler; platform audio session restrictions |
| Worker type | Module worker (`{ type: 'module' }`) | Dynamic `import()` for lazy codec loading; Safari 15+ minimum |
| Queue processing | Sequential (one job at a time) | Memory constraints; CPU saturation; simplicity |
| Queue state | ExportQueueManager class (main thread) | Owns worker lifecycle, abort controllers, codec cache; publishes to Zustand for UI per ADR-0005 |
| Progress reporting | Worker → main thread postMessage (≤20/sec) | Non-blocking; phased progress with weighted overall % |
| Progress phases | `rendering → encoding → metadata → packaging` | Resampling is a sub-step of rendering, not a user-visible phase |
| Cancellation | Cooperative flag checked every 4096 samples | Sub-200ms responsiveness; clean resource release |
| Codec loading | Lazy `import()` per format (in module worker) | Users only download codecs they use |
| Codec worker architecture | Single shared worker (all codecs in same worker) | Avoids PCM transfer overhead; only one export at a time |
| Encoding mode | Streaming (chunk-based) | Bounded memory usage; enables progress reporting |
| Bit depth (v1) | 16-bit only (float32 → TPDF → int16) | 24-bit deferred; architecture extensible |
| Metadata embedding | Per-codec adapter; ID3v2 in TypeScript | Consistent interface; no dependency on codec's tag support |
| Download mechanism | Blob URL + anchor (fallback) / File System Access API (progressive) | Universal support with progressive enhancement |
| Batch packaging | Streaming ZIP via fflate | Files appended as completed; bounded memory; small bundle size |
| WASM instance reuse | Same instance, reset via `dsp_load_spc()` | Avoids re-instantiation cost for batch |
| Error codes | UPPER_SNAKE_CASE per ADR-0015 | Cross-document consistency |
