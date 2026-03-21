# Audio Engine Improvements — Technical Plan

**Author:** audio-engineer  
**Date:** 2026-03-20  
**Status:** Draft

---

## Table of Contents

1. [Checkpoint-Based Seeking](#1-checkpoint-based-seeking)
2. [Pitch-Independent Speed Change](#2-pitch-independent-speed-change)
3. [Export Format Integration](#3-export-format-integration)
4. [Memory/Registers Telemetry Pipeline](#4-memoryregisters-telemetry-pipeline)
5. [Audio Chain Feedback Display](#5-audio-chain-feedback-display)
6. [AudioStateBuffer Target Interface](#6-audiostabuffer-target-interface)
7. [Batched WASM Export Additions](#7-batched-wasm-export-additions)
8. [Implementation Phases](#8-implementation-phases)

---

## 1. Checkpoint-Based Seeking

### Problem

Every backward seek resets the DSP to the initial SPC snapshot and emulates forward sample-by-sample. Seeking to 2:30 requires emulating ~4.8M samples on the AudioWorklet thread. This blocks the audio thread for hundreds of milliseconds, causing audible dropouts and perceived UI freezes.

### Existing Primitives

The WASM DSP module already exports everything needed:

```typescript
// src/audio/dsp-exports.ts
dsp_snapshot_size(): number;       // Returns size in bytes for a full state snapshot
dsp_snapshot(outPtr: number): number;  // Writes state to ptr, returns bytes written
dsp_restore(inPtr: number, len: number): number; // Restores state from ptr, returns 0 on success
dsp_set_voice_mask(mask: number): void; // Bit mask for voice muting (for Phase 1)
```

Snapshot/restore is already used for AudioContext recovery (`handleRequestSnapshot`/`handleRestoreSnapshot` in `spc-worklet.ts`). The checkpoint system reuses these same primitives.

### Design

#### 1.1 Checkpoint Data Structure (Worklet Thread)

```typescript
interface DspCheckpoint {
  /** Sample position at which this checkpoint was captured. */
  readonly positionSamples: number;
  /** Serialized DSP state: Header(16) | RAM(65536) | DSP_regs(128) | SPC700_regs(8). */
  readonly stateData: ArrayBuffer;
}

interface CheckpointStore {
  /** Sorted array of checkpoints, ascending by positionSamples. */
  readonly checkpoints: DspCheckpoint[];
  /** Interval in DSP samples between checkpoints. */
  readonly intervalSamples: number;
  /** Maximum number of checkpoints to store. */
  readonly maxCheckpoints: number;
  /** Next sample position at which to capture a checkpoint. */
  nextCapturePosition: number;
  /** Byte-level memory cap. */
  readonly maxCheckpointBytes: number;
  /** Current total bytes consumed by stored checkpoints. */
  checkpointBytes: number;
}
```

All checkpoint storage lives on the **worklet thread**. No transfer to the main thread — this avoids postMessage overhead and keeps snapshots available for immediate restore during seek.

#### 1.2 Snapshot Layout and Size

The DSP snapshot format is defined in `crates/spc-apu-wasm/src/lib.rs`:

| Section              | Size             | Notes                                                                     |
| -------------------- | ---------------- | ------------------------------------------------------------------------- |
| Header               | 16 bytes         | Magic `"SPCS"` (4B) + version (4B) + total_size (4B) + spc700_offset (4B) |
| SPC RAM              | 65,536 bytes     | Full 64KB RAM (includes echo buffer region)                               |
| DSP registers        | 128 bytes        | 128 S-DSP register bytes                                                  |
| SPC700 CPU registers | 8 bytes          | PC (2B) + A + X + Y + SP + PSW + pad                                      |
| **Total**            | **65,688 bytes** | `SNAPSHOT_TOTAL_SIZE` constant in Rust                                    |

There are no separate echo, BRR, or noise sections — the echo buffer lives within the 64KB RAM, and BRR/noise state is captured by the DSP registers.

#### 1.3 Memory Budget

| Configuration | Interval | Checkpoints (5 min) | Total Memory |        Worst-Case Seek |
| ------------- | -------- | ------------------- | ------------ | ---------------------: |
| Standard      | 5s       | 60                  | **3.84 MB**  | 160K samples (~150 ms) |
| Fast          | 2s       | 150                 | **9.6 MB**   |   64K samples (~60 ms) |

**Default:** 5-second interval, max 120 checkpoints (~7.7 MB cap). This covers 10 minutes of playback — most SPC tracks loop before that.

**Mobile:** Cap at Standard (5s) only. "Fast" mode disabled on mobile devices (`matchMedia('(pointer: coarse)')`) to limit memory pressure.

**Byte-level enforcement:** In addition to the checkpoint count cap, enforce a `maxCheckpointBytes` ceiling (default 8 MB). If the snapshot size ever changes due to a WASM module update, the byte cap prevents silently exceeding the memory budget.

```typescript
private readonly maxCheckpointBytes = 8 * 1024 * 1024; // 8 MB default
private checkpointBytes = 0;

private captureCheckpoint(position: number): void {
  if (!this.wasm) return;
  const size = this.wasm.dsp_snapshot_size();
  if (this.checkpointStore.checkpoints.length >= this.checkpointStore.maxCheckpoints) return;
  if (this.checkpointBytes + size > this.maxCheckpointBytes) return;

  // ... capture logic ...
  this.checkpointBytes += stateData.byteLength;
}
```

#### 1.4 Capture Strategy

During normal playback in `process()`, after rendering each quantum:

```
if (renderedSamples >= checkpointStore.nextCapturePosition) {
  captureCheckpoint(renderedSamples);
  checkpointStore.nextCapturePosition += checkpointStore.intervalSamples;
}
```

Capture cost: one `dsp_snapshot()` call = 65,688 bytes memcpy. At 5s intervals this happens once every ~5 seconds of wall time — negligible overhead (~1 µs for memcpy vs. 5 seconds of real-time audio).

When a new SPC is loaded (`handleLoadSpc`), clear all checkpoints and reset `checkpointBytes` to 0.

**Note:** Checkpoint capture is disabled during export rendering. Checkpoints are only useful for interactive seeking, not offline rendering.

#### 1.5 Checkpoint Integrity Verification

Before restoring any checkpoint via `dsp_restore()`, validate:

1. **Magic bytes:** First 4 bytes must equal `0x53504353` (`"SPCS"`)
2. **Size:** `stateData.byteLength` must equal `dsp_snapshot_size()`
3. **Version:** Header version field must match the current WASM module's expected version

```typescript
private validateCheckpoint(stateData: ArrayBuffer): boolean {
  if (stateData.byteLength !== this.wasm.dsp_snapshot_size()) return false;

  const header = new DataView(stateData);
  const magic = header.getUint32(0, true); // little-endian
  if (magic !== 0x53504353) return false; // "SPCS"

  return true;
}

private handleSeek(msg: MainToWorklet.Seek): void {
  // ...
  const checkpoint = this.findNearestCheckpoint(targetPosition);
  if (checkpoint && this.validateCheckpoint(checkpoint.stateData)) {
    // ... restore ...
  } else {
    // Invalid or missing checkpoint — fall back to reset + skip
    this.wasm.dsp_reset();
    // ...
  }
}
```

This prevents restoring corrupted data that could put the emulator in an undefined state (infinite loop, audio thread lockup).

#### 1.6 Seek Algorithm

```
handleSeek(targetPosition):
  if targetPosition == 0:
    dsp_reset()                    // Instant, O(1)
    clearCheckpoints()
    return

  if targetPosition > renderedSamples:
    // Forward seek — just skip ahead (existing behavior)
    skipForward(targetPosition - renderedSamples)
    return

  // Backward seek — find nearest prior checkpoint
  checkpoint = findNearestCheckpoint(targetPosition)  // binary search

  if checkpoint exists AND validateCheckpoint(checkpoint.stateData):
    dsp_restore(checkpoint.stateData)
    renderedSamples = checkpoint.positionSamples
    skipForward(targetPosition - checkpoint.positionSamples)
  else:
    // No valid checkpoint — fall back to reset + skip
    dsp_reset()
    renderedSamples = 0
    skipForward(targetPosition)
```

**Worst case with 5s checkpoints:** skip 160,000 samples (5s × 32kHz) instead of millions. **30× improvement** for typical seeks.

#### 1.7 Phase 1: Voice Muting During Seek (Quick Win)

Adapted from GME's `Music_Emu::skip_()`:

```typescript
private handleSeek(msg: MainToWorklet.Seek): void {
  // ... (existing target clamping) ...

  if (targetPosition < this.renderedSamples) {
    this.wasm.dsp_reset();
    this.renderedSamples = 0;
  }

  const samplesToSkip = targetPosition - this.renderedSamples;
  const MUTE_THRESHOLD = 30_000; // Same as GME

  if (samplesToSkip > MUTE_THRESHOLD) {
    const savedMask = /* read current mask or track it */;
    this.wasm.dsp_set_voice_mask(0x00); // Mute all voices

    // Skip in larger chunks when muted (fewer function calls)
    let remaining = samplesToSkip - MUTE_THRESHOLD / 2;
    while (remaining > 0) {
      const chunk = Math.min(remaining, MAX_DSP_FRAMES_PER_QUANTUM);
      this.wasm.dsp_render(this.outputPtr, chunk);
      remaining -= chunk;
    }

    this.wasm.dsp_set_voice_mask(savedMask); // Restore mask

    // Render remaining unmuted for DSP state convergence
    remaining = Math.floor(MUTE_THRESHOLD / 2);
    while (remaining > 0) {
      const chunk = Math.min(remaining, MAX_DSP_FRAMES_PER_QUANTUM);
      this.wasm.dsp_render(this.outputPtr, chunk);
      remaining -= chunk;
    }
  } else {
    // Short seek — render normally
    let remaining = samplesToSkip;
    while (remaining > 0) {
      const chunk = Math.min(remaining, QUANTUM_FRAMES);
      this.wasm.dsp_render(this.outputPtr, chunk);
      remaining -= chunk;
    }
  }

  this.renderedSamples = targetPosition;
  this.resampleFrac = 0;
  this.prevDspLeft = 0;
  this.prevDspRight = 0;
}
```

**Estimated speedup:** 20–30% for long seeks. The DSP still runs all logic (BRR decode, filtering, echo) but skips the final mix to the output buffer.

**Also:** use larger chunk sizes during seek (`MAX_DSP_FRAMES_PER_QUANTUM = 4096` instead of `QUANTUM_FRAMES = 128`). This reduces per-call overhead for the same total work. The existing code already uses `QUANTUM_FRAMES` (128) — switching to 4096 during seek reduces function call overhead by 32×.

#### 1.8 Phase 2: Checkpoint System

Add to `SpcProcessor`:

```typescript
private checkpointStore: CheckpointStore = {
  checkpoints: [],
  intervalSamples: 5 * DSP_SAMPLE_RATE, // 160,000 samples (5s)
  maxCheckpoints: 120,
  nextCapturePosition: 5 * DSP_SAMPLE_RATE,
  maxCheckpointBytes: 8 * 1024 * 1024,
  checkpointBytes: 0,
};

private captureCheckpoint(position: number): void {
  if (!this.wasm) return;
  if (this.checkpointStore.checkpoints.length >= this.checkpointStore.maxCheckpoints) return;

  const size = this.wasm.dsp_snapshot_size();
  if (this.checkpointStore.checkpointBytes + size > this.checkpointStore.maxCheckpointBytes) return;

  const ptr = this.wasm.wasm_alloc(size);
  if (ptr === 0) return;

  const written = this.wasm.dsp_snapshot(ptr);
  if (written === 0) {
    this.wasm.wasm_dealloc(ptr, size);
    return;
  }

  const stateData = new ArrayBuffer(written);
  new Uint8Array(stateData).set(
    new Uint8Array(this.wasm.memory.buffer, ptr, written)
  );
  this.wasm.wasm_dealloc(ptr, size);

  this.checkpointStore.checkpoints.push({
    positionSamples: position,
    stateData,
  });
  this.checkpointStore.checkpointBytes += stateData.byteLength;
}

private findNearestCheckpoint(targetPosition: number): DspCheckpoint | null {
  const cps = this.checkpointStore.checkpoints;
  if (cps.length === 0) return null;

  // Binary search for largest checkpoint ≤ targetPosition
  let lo = 0, hi = cps.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (cps[mid].positionSamples <= targetPosition) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result >= 0 ? cps[result] : null;
}
```

#### 1.9 Phase 3: Pre-Compute Checkpoints via Web Worker

At SPC load time, spawn a **dedicated Web Worker** (not the AudioWorklet) that:

1. Instantiates its own copy of the DSP WASM module
2. Loads the SPC data
3. Renders forward at maximum speed, capturing snapshots at the configured interval
4. Transfers completed checkpoints to the main thread (using `Transferable` ArrayBuffers)
5. Main thread forwards checkpoints to the AudioWorklet via `postMessage`
6. Worker self-terminates after transfer to free its ~0.5 MB WASM instance

```
┌─────────────┐    load SPC     ┌──────────────────┐
│ Main Thread  │ ──────────────→ │ Precompute Worker │
│              │                 │ (WASM instance #2)│
│              │                 │                   │
│              │  checkpoints[]  │ render at max CPU │
│              │ ←────────────── │ snapshot every 5s │
│              │  (transferred)  │ then terminate()  │
│              │                 └──────────────────┘
│              │
│              │  forward to worklet
│              │ ──────────────→ ┌──────────────────┐
│              │                 │ AudioWorklet      │
│              │                 │ merges into store │
│              │                 └──────────────────┘
└─────────────┘
```

New message type for importing pre-computed checkpoints:

```typescript
// Main → Worklet
interface ImportCheckpoints {
  readonly type: 'import-checkpoints';
  readonly checkpoints: Array<{
    positionSamples: number;
    stateData: ArrayBuffer;
  }>;
}
```

The `import-checkpoints` handler must validate:

- `Array.isArray(msg.checkpoints)` before iterating
- Each element has `positionSamples` (number) and `stateData` (ArrayBuffer)
- Total count does not exceed `maxCheckpoints`
- Each `stateData` passes `validateCheckpoint()` (magic bytes + size check)

The precompute worker can render ~10 minutes of SPC audio in ~1–2 seconds on modern hardware (WASM emulation at max speed without audio output). This means the full checkpoint set is ready almost immediately after load.

**Lifecycle:** The worker spins up on track load, transfers all checkpoints, then calls `self.close()` or the main thread calls `worker.terminate()` to free the WASM instance memory.

#### 1.10 Configurable Interval

Expose checkpoint interval as a setting (via `set-checkpoint-config` message):

| Preset   | Interval | Max Memory (5 min) |        Worst-Case Seek |
| -------- | -------- | ------------------ | ---------------------: |
| Standard | 5s       | 3.84 MB            | 160K samples (~150 ms) |
| Fast     | 2s       | 9.6 MB             |   64K samples (~60 ms) |

**Mobile devices:** Only "Standard" is available. Detect via `matchMedia('(pointer: coarse)')` and cap at 5s interval to stay within the global 30 MB memory budget.

---

## 2. Pitch-Independent Speed Change

### Problem

The current `speedFactor` multiplies into the resampling ratio in `process()`:

```typescript
const ratio = (DSP_SAMPLE_RATE / this.outputSampleRate) * this.speedFactor;
```

This changes the rate at which SPC samples are consumed per output sample. At 2× speed, each output sample consumes 2× as many DSP samples — the waveform is compressed in time, raising pitch proportionally. Speed and pitch are inseparable in this design.

### Solution: SoundTouchJS

Insert a `SoundTouchNode` (from `@soundtouchjs/audio-worklet`, part of the `cutterbl/SoundTouchJS` monorepo) between the SPC worklet and the destination. The SPC worklet **always** runs at 1.0× speed; SoundTouch handles tempo independently of pitch.

**Bundle size:** ~25–40 KB gzipped. Must be lazy-loaded via dynamic `import()` — never included in the main bundle (only 9.1 KB JS headroom remains). The worklet processor file is loaded separately via `addModule()` and excluded from bundle-size checks (add `/soundtouch/i` to `WORKER_PATTERNS`).

**License:** LGPL-2.1. Must be loaded as a separate ES module via dynamic `import()` to satisfy LGPL requirements (same pattern as other LGPL dependencies per ADR-0006). Update `THIRD_PARTY_LICENSES`.

#### 2.1 Revised Audio Graph

```
Current:
  SpcWorkletNode ──→ GainNode ──→ AnalyserNode ──→ destination
  (speed applied via sampleIncrement in worklet)

Proposed:
  SpcWorkletNode ──→ SoundTouchNode ──→ GainNode ──→ AnalyserNode ──→ destination
  (worklet always 1.0×)  (tempo control)

Bypass (tempo=1.0):
  SpcWorkletNode ──→ GainNode ──→ AnalyserNode ──→ destination
  (SoundTouchNode disconnected — zero overhead)
```

#### 2.2 Integration Design

The SoundTouchJS API requires `SoundTouchNode.register(audioCtx, processorUrl)` before construction. This registers the AudioWorklet processor globally on the context.

```typescript
// In engine.ts
import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';

class AudioEngine {
  private soundTouchNode: SoundTouchNode | null = null;
  private currentTempo = 1.0;

  async initSoundTouch(): Promise<void> {
    // Lazy-load SoundTouchJS as a separate module (LGPL compliance)
    const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet');

    // Register the processor before constructing the node
    const processorUrl = new URL(
      '@soundtouchjs/audio-worklet/dist/soundtouch-worklet.js',
      import.meta.url,
    ).href;
    await SoundTouchNode.register(this.audioContext, processorUrl);

    this.soundTouchNode = new SoundTouchNode(this.audioContext);
  }

  setSpeed(factor: number): void {
    const clampedFactor = Math.max(0.25, Math.min(4.0, factor));

    if (Math.abs(clampedFactor - 1.0) < 0.001) {
      // Normal speed — bypass SoundTouch entirely
      this.bypassSoundTouch();
    } else {
      // Non-1.0 speed — route through SoundTouch
      this.engageSoundTouch(clampedFactor);
    }
  }

  private bypassSoundTouch(): void {
    // Disconnect SoundTouch from the chain
    this.workletNode.disconnect();
    this.workletNode.connect(this.gainNode);
    this.currentTempo = 1.0;

    // Remove speedFactor from the worklet — it stays at 1.0
    this.postCommand({ type: 'set-speed', factor: 1.0 });
  }

  private engageSoundTouch(tempo: number): void {
    if (!this.soundTouchNode) {
      // Lazy init if not yet loaded
      this.initSoundTouch().then(() => this.engageSoundTouch(tempo));
      return;
    }

    // Re-route: worklet → SoundTouch → gain
    this.workletNode.disconnect();
    this.workletNode.connect(this.soundTouchNode);
    this.soundTouchNode.connect(this.gainNode);

    // SoundTouch handles the tempo change
    this.soundTouchNode.tempo = tempo;
    this.currentTempo = tempo;

    // Worklet MUST run at 1.0× — SoundTouch does the time-stretching
    this.postCommand({ type: 'set-speed', factor: 1.0 });
  }
}
```

#### 2.3 Key Design Decisions

**The SPC worklet always runs at `speedFactor = 1.0`.**

The old approach of changing `speedFactor` in the worklet is fundamentally broken for pitch-independent speed: it changes the DSP sample consumption rate, which _is_ the pitch. With SoundTouch in the chain, the worklet produces audio at its natural 32 kHz → 48 kHz resampled rate, and SoundTouch's WSOLA algorithm stretches/compresses the output in time without altering pitch.

**Bypass at 1.0× for zero overhead.**

When tempo is exactly 1.0, SoundTouchNode is **disconnected** from the graph — not just set to tempo=1.0. Even idle WSOLA has non-zero cost. The audio path at 1.0× is identical to the current path — no quality loss, no latency addition. This bypass is an architectural invariant enforced in code review.

**LGPL-2.1 compliance.**

`@soundtouchjs/audio-worklet` is LGPL-2.1. Load it as a separate ES module via `import()`. Do not bundle it into the main application chunk. This satisfies LGPL requirements (same pattern used for other LGPL dependencies per ADR-0006). The worklet processor file is loaded via `addModule()` — separate from the JS bundle. Add both to `THIRD_PARTY_LICENSES`.

**Prefetch during idle time.**

After initial audio playback starts successfully, prefetch the SoundTouchJS module during idle time using `import()` with a catch handler. This eliminates the latency spike when the user first changes speed.

#### 2.4 SoundTouch Latency Considerations

WSOLA introduces ~20 ms of latency (processing window). This is acceptable for music playback but should be noted in the audio chain display (§5). The latency is deterministic and doesn't affect A-B loop timing because loop boundaries are in the sample domain, not the output domain.

#### 2.5 Audio Thread Budget with SoundTouch

When SoundTouch is active, total audio thread work per quantum:

- DSP render: 0.5–1.2 ms
- SoundTouch WSOLA: 0.5–1.5 ms
- Total: 1.0–2.7 ms (quantum budget is 2.667 ms)

At the high end, this is tight. On mobile with slower CPUs, audio glitches are possible. Mitigations:

- SoundTouch bypass at 1.0× is the common case
- Consider displaying a warning on mobile when pitch-independent speed is engaged
- Investigate SoundTouchJS quality config options for a lower-cost WSOLA window on mobile

#### 2.6 Interaction with Seek

When tempo ≠ 1.0, seeking still operates in the DSP sample domain (32 kHz). The worklet seeks to the correct sample position. SoundTouch's internal buffers contain stale audio from the pre-seek position. After seek, disconnect and reconnect the SoundTouchNode to clear its internal state:

```typescript
seek(samplePosition: number): void {
  this.postCommand({ type: 'seek', samplePosition });
  if (this.soundTouchNode && this.currentTempo !== 1.0) {
    // Reconnect to clear SoundTouch internal buffers
    this.workletNode.disconnect();
    this.soundTouchNode.disconnect();
    this.workletNode.connect(this.soundTouchNode);
    this.soundTouchNode.connect(this.gainNode);
  }
}
```

#### 2.7 Audio Recovery Integration

The `audio-recovery.ts` module handles AudioContext failures by recreating the context and reconnecting nodes. It must be updated as part of SoundTouchJS integration. `engine.ts` should expose a `rebuildAudioGraph()` method that reconstructs the full graph including conditional SoundTouch, and recovery should call this instead of individually reconnecting nodes.

---

## 3. Export Format Integration

### Current State

- `wav-encoder.ts` — ✅ Working (custom TypeScript implementation)
- `mp3-encoder.ts` — ❌ Stub wrapping `wasm-media-encoders` (not implemented)
- `flac-encoder.ts` — ❌ Stub wrapping `libflac.js` (not implemented)
- `ogg-encoder.ts` — ❌ Stub wrapping `wasm-media-encoders` (not implemented)

The encoder interface is well-designed (`Encoder` in `encoder-types.ts`). The export worker (`export-worker.ts`) handles offline DSP rendering with sinc resampling and TPDF dithering. The pipeline works — only the codec library integrations are missing.

### 3.1 MP3 via `wasm-media-encoders`

`wasm-media-encoders` (v0.7.0, MIT license) is already a project dependency. It bundles a WASM-compiled LAME encoder (MP3 WASM ~130 KB / 66 KB gzipped) and OGG Vorbis encoder. The MIT license wrapper avoids LGPL compliance complexity while still using the same LAME core.

**Integration steps:**

1. Verify `wasm-media-encoders` is installed (already in `package.json` at v0.7.0)
2. Connect the existing `mp3-encoder.ts` stub to the actual library API:
   ```typescript
   // wasm-media-encoders API:
   createMp3Encoder() → configure({sampleRate, channels, vbrQuality}) → encode(Float32Array[]) → finalize()
   ```
3. Test ID3v2.4 metadata injection (custom `buildId3v2Tag()` is already implemented)
4. The encoder is loaded via dynamic `import()` in the export worker — already in a separate chunk, correctly isolated from the main bundle

### 3.2 OGG Vorbis via `wasm-media-encoders`

Same library provides OGG Vorbis encoding (WASM ~440 KB / 158 KB gzipped):

```typescript
// wasm-media-encoders API:
createOggEncoder() → configure({sampleRate, channels, vbrQuality}) → encode(Float32Array[]) → finalize()
```

OGG Vorbis serves as the lossy export fallback for browsers without WebCodecs support (needed for Opus).

### 3.3 FLAC via `libflac.js` or Modern Alternative

The FLAC encoder stub targets `libflac.js` (Rillke/flac.js). This library was last updated ~2019 and uses Emscripten 1.37.20. Risk of browser compatibility issues is moderate.

**Option A — Use existing `libflac.js`:**

1. `npm install libflac.js`
2. Test the `flac-encoder.ts` stub against the actual library
3. Verify Vorbis comment metadata works
4. **Critical:** Test against production CSP — old Emscripten glue code may use `eval()` or `new Function()`, which would be blocked by the CSP (`script-src` has no `unsafe-eval`). The `wasm-unsafe-eval` directive only allows WASM instantiation, not JS eval.
5. Test with modern browsers (WASM validation may reject old Emscripten output)

**Option B — Self-compile libFLAC:**

1. Build reference libFLAC (C) with modern Emscripten (3.1.x)
2. Expose: `create_encoder`, `init_stream`, `process_interleaved`, `finish`, `delete`
3. Publish as internal WASM artifact in `vendor/` or a local npm package
4. This gives full control over the WASM module, metadata API, and CSP compatibility

**Option C — `@nicktehr/flac-encoder` or other maintained fork:**

Search npm for maintained FLAC encoder packages. If none exist, Option A or B.

**Recommendation:** Try Option A first. If `libflac.js` works with current browsers and CSP, it's the fastest path. Fall back to Option B if the old Emscripten build fails CSP validation or WASM instantiation.

### 3.4 Opus via WebCodecs

WebCodecs `AudioEncoder` provides native browser encoding — no WASM library needed:

| Feature              | Chrome | Edge | Firefox | Safari |
| -------------------- | ------ | ---- | ------- | ------ |
| AudioEncoder basic   | 94+    | 94+  | 130+    | 26+    |
| Opus codec configure | 110+   | 110+ | 130+    | 26+    |

**Integration:**

```typescript
class OpusEncoder implements Encoder {
  private audioEncoder: AudioEncoder | null = null;
  private outputChunks: EncodedAudioChunk[] = [];
  private sampleRate: number = 48000;

  async init(config: EncoderConfig): Promise<void> {
    if (typeof AudioEncoder === 'undefined') {
      throw new Error('WebCodecs AudioEncoder not available in this browser');
    }

    this.audioEncoder = new AudioEncoder({
      output: (chunk) => this.outputChunks.push(chunk),
      error: (e) => {
        throw e;
      },
    });

    this.audioEncoder.configure({
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: config.channels,
      bitrate: 128_000, // 128 kbps default, configurable via quality
    });
  }

  encode(samples: Int16Array): void {
    // Convert Int16 to Float32 AudioData
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768.0;
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: this.sampleRate,
      numberOfFrames: float32.length / 2, // stereo
      numberOfChannels: 2,
      timestamp: this.timestampUs,
      data: float32,
    });

    this.audioEncoder.encode(audioData);
    audioData.close();
  }

  async finalize(): Promise<Uint8Array> {
    await this.audioEncoder.flush();
    // Need WebM container wrapping for the raw Opus frames
    return this.wrapInWebmContainer(this.outputChunks);
  }
}
```

**Container challenge:** WebCodecs `AudioEncoder` produces raw Opus frames, not a containerized file. Options:

1. Use WebM container (simpler — WebM is a subset of Matroska, and Opus-in-WebM is well-defined)
2. Implement minimal OGG page writer (~200 lines)

**Recommendation:** Use **WebM container** for Opus output. Writing a WebM Opus muxer is simpler than OGG. The `mkvdemux`/`mkvmux` libraries exist for this.

**Fallback:** Keep `wasm-media-encoders` OGG Vorbis as a fallback for browsers without WebCodecs.

### 3.5 Export Pipeline Data Flow

```
Main Thread                  Export Worker
──────────                   ─────────────
  StartExport(spcData,   ──→  1. Instantiate WASM DSP
   format, metadata)          2. dsp_init(spcData)
                               3. Loop:
                                  a. dsp_render(4096 frames) at max CPU
                                  b. Sinc resample 32kHz → target rate
                                  c. TPDF dither float32 → int16
                                  d. encoder.encode(int16Chunk)
                                  e. Post progress (throttled to 20 msg/s)
                               4. encoder.finalize() → encoded Blob
  ←── Complete(blob)          5. Transfer blob to main thread
```

### 3.6 Progress Reporting and Cancellation

Already designed in the export worker. The `CancelExport` message sets a flag checked between render chunks. Progress is calculated as `renderedSamples / totalSamples` and throttled to 50ms intervals (`PROGRESS_THROTTLE_MS`).

Add per-encoder progress for formats where encoding itself is slow (FLAC compression):

```typescript
interface ExportProgress {
  phase: 'rendering' | 'encoding' | 'finalizing';
  progress: number; // 0.0 - 1.0
  format: ExportFormat;
}
```

### 3.7 Format Priority

| Priority | Format     | Library               | Effort | Risk                                 |
| -------- | ---------- | --------------------- | ------ | ------------------------------------ |
| 1        | WAV        | Custom (done)         | —      | None                                 |
| 2        | MP3        | `wasm-media-encoders` | Low    | Low — stub exists                    |
| 3        | FLAC       | `libflac.js`          | Medium | Medium — library age, CSP            |
| 4        | Opus       | WebCodecs + WebM mux  | Medium | Low — native API                     |
| 5        | OGG Vorbis | `wasm-media-encoders` | Low    | Low — stub exists, fallback for Opus |

---

## 4. Memory/Registers Telemetry Pipeline

### Problem

`MemoryViewer.tsx` reads from a static `Uint8Array(65536)` that is never populated. The component structure (virtual scrolling, hex/ASCII display) works, but there's no data flowing from the DSP emulator to the display.

### Design: Two Data Channels

#### Channel A: DSP Registers + SPC700 CPU (High Frequency, Small Data)

- **Data:** 128 DSP register bytes + 8 SPC700 CPU register bytes = **136 bytes**
- **Update rate:** ~60 Hz (every telemetry quantum, `telemetryInterval = 6`)
- **Transport:** postMessage (already used for VU telemetry)
- **Flow:** Extend existing `WorkletToMain.Telemetry` message

```typescript
// Add to WorkletToMain.Telemetry:
interface Telemetry {
  // ... existing fields ...

  /** S-DSP register bank (128 bytes). Present on every telemetry cycle. */
  readonly dspRegisters?: ArrayBuffer;

  /** SPC700 CPU register snapshot. Present on every telemetry cycle. */
  readonly cpuRegisters?: {
    readonly a: number; // Accumulator
    readonly x: number; // X index
    readonly y: number; // Y index
    readonly sp: number; // Stack pointer
    readonly pc: number; // Program counter (16-bit)
    readonly psw: number; // Processor status word
  };
}
```

New WASM exports needed (see §7 for batched approach):

```typescript
// Add to DspExports:
dsp_get_registers(outPtr: number): number;    // Copy 128 DSP regs to ptr
dsp_get_cpu_registers(outPtr: number): number; // Copy CPU regs (8 bytes) to ptr
```

#### Channel B: SPC RAM (Low Frequency, Large Data)

- **Data:** 64 KB SPC RAM
- **Update rate:** 10 Hz (every 6 telemetry cycles)
- **Transport:** postMessage with ArrayBuffer transfer

**Primary Design: postMessage with Transfer**

GitHub Pages cannot set custom HTTP response headers (COOP/COEP), and there is no meta-tag equivalent that reliably enables SharedArrayBuffer across browsers. Since SPC Player deploys to GitHub Pages, SharedArrayBuffer is not available in production.

The postMessage-with-transfer approach is performant and reliable:

```typescript
// Every 6 telemetry cycles (~10 Hz), in emitTelemetry():
if (this.shouldSendMemoryDump()) {
  const ramPtr = this.wasm.dsp_get_ram_ptr();
  const ramCopy = new ArrayBuffer(65536);
  new Uint8Array(ramCopy).set(
    new Uint8Array(this.wasm.memory.buffer, ramPtr, 65536),
  );
  this.port.postMessage(
    { type: 'memory-dump', data: ramCopy },
    [ramCopy], // Transfer, not copy — zero-copy to main thread
  );
}
```

**Bandwidth:** 64 KB × 10 Hz = **640 KB/s** through transferred ArrayBuffers. This is well within the structured clone transfer budget — transfers are near-instant (pointer swap, not byte copy).

**Future enhancement:** If the project migrates to a platform with HTTP header control (Cloudflare Pages, Netlify), SharedArrayBuffer can be adopted as an optimization. This would use an atomic generation counter for tear-free reads. This enhancement is out of scope for the current plan and would require an ADR documenting the deployment platform change.

#### 4.1 Integration with `audioStateBuffer` Pattern

Extend the existing `AudioStateBuffer` (`audio-state-buffer.ts`) — see §6 for the full target interface across all plans:

```typescript
// Fields added by this plan:
dspRegisters: Uint8Array; // 128 DSP register bytes
cpuRegisters: {
  // SPC700 CPU registers
  a: number;
  x: number;
  y: number;
  sp: number;
  pc: number;
  psw: number;
}
ramCopy: Uint8Array; // 64KB SPC RAM via postMessage transfer
```

The main thread's `handleWorkletMessage` (in `engine.ts`) updates these fields on each telemetry/memory-dump message. `MemoryViewer.tsx` reads from `audioStateBuffer.ramCopy` via its existing rAF loop.

#### 4.2 WASM Memory Layout

The SPC RAM's base address in WASM linear memory needs to be queryable:

```typescript
// New WASM export (batched with others in §7)
dsp_get_ram_ptr(): number; // Returns pointer to 64KB SPC RAM within WASM memory
```

This is more efficient than copying through a separate export — we read directly from WASM memory at the known offset.

#### 4.3 Update Throttling

| Data          | Size  | Rate                      | Bandwidth     |
| ------------- | ----- | ------------------------- | ------------- |
| DSP registers | 128 B | 60 Hz (every telemetry)   | 7.5 KB/s      |
| CPU registers | 8 B   | 60 Hz (every telemetry)   | 480 B/s       |
| SPC RAM       | 64 KB | 10 Hz (every 6 telemetry) | 640 KB/s      |
| **Total**     |       |                           | **~648 KB/s** |

This is well within the postMessage transfer bandwidth budget.

---

## 5. Audio Chain Feedback Display

### What to Show

| Metric                   | Source                   | Update Rate | Notes                                    |
| ------------------------ | ------------------------ | ----------- | ---------------------------------------- |
| DSP Native Rate          | Constant                 | Static      | Always 32,000 Hz                         |
| AudioContext Sample Rate | `audioCtx.sampleRate`    | Static      | Typically 44100 or 48000 Hz              |
| Base Latency             | `audioCtx.baseLatency`   | Static      | Processing latency in seconds            |
| Output Latency           | `audioCtx.outputLatency` | Polled      | Hardware output latency                  |
| Total Latency            | base + output            | Derived     | End-to-end latency                       |
| Buffer Underruns         | Worklet counter          | ~1 Hz       | Count of `process()` calls with no data  |
| Worklet Load             | Worklet timing           | ~10 Hz      | % of render quantum used                 |
| Resampler Mode           | Setting                  | On change   | "Linear" or "Sinc (Lanczos-3)"           |
| Interpolation Mode       | Setting                  | On change   | "Gaussian" / "Linear" / "Cubic" / "Sinc" |
| SoundTouch Active        | Engine state             | On change   | "Bypassed" or "Active (tempo 1.5×)"      |
| SoundTouch Latency       | Constant when active     | On change   | ~20 ms                                   |

### What We Cannot Show (And Why)

**Exclusive Mode** — not possible in browsers. The Web Audio API always operates through the browser's audio mixer in shared mode with the OS. There is no API (standard or proposed) for exclusive/direct hardware access. The browser's audio thread provides the closest analog to "exclusive" processing.

**What to show instead:** A "Latency" section displaying `baseLatency + outputLatency` with a brief explanation that browser audio always uses shared mode. Optionally, a toggle between `latencyHint: 'interactive'` (low latency, higher CPU) and `latencyHint: 'playback'` (power-efficient, higher latency).

### 5.1 Worklet Processing Load

Measure how much of each render quantum (128 frames / 48kHz ≈ 2.667 ms) is consumed by `process()`:

```typescript
// In spc-worklet.ts process():
const t0 = performance.now();
// ... all rendering work ...
const elapsed = performance.now() - t0;

// Running average
this.processTimeMs = this.processTimeMs * 0.95 + elapsed * 0.05;
```

Report as percentage: `(processTimeMs / quantumDurationMs) * 100`.

- `< 50%` — healthy
- `50–80%` — moderate load (warn at 60%)
- `> 80%` — risk of underruns (error at 80%)

Surface this metric prominently in the audio chain display — not buried in settings.

**Note:** `performance.now()` is available in AudioWorklet in Chromium and Firefox. If unavailable, skip this metric.

### 5.2 Buffer Underrun Detection

Track consecutive `process()` calls where the worklet can't produce audio (WASM not ready, render failure):

```typescript
// Already partially tracked via consecutiveRenderFailures
// Extend with a cumulative counter:
private totalUnderruns = 0;

// In process(), when filling silence due to no data:
this.totalUnderruns++;
```

Report `totalUnderruns` in a telemetry extension message at low frequency (~1 Hz).

### 5.3 New Telemetry: Audio Stats

Add a new low-frequency telemetry message from the worklet:

```typescript
// New WorkletToMain message
interface AudioStats {
  readonly type: 'audio-stats';
  readonly processLoadPercent: number; // 0-100
  readonly totalUnderruns: number; // cumulative count
}
```

Emitted every ~1 second (configurable). Main thread combines with AudioContext properties for the display.

### 5.4 Main-Thread–Side Stats

```typescript
function getAudioChainStats(ctx: AudioContext): AudioChainInfo {
  return {
    dspNativeRate: 32_000,
    contextSampleRate: ctx.sampleRate,
    baseLatencyMs: ctx.baseLatency * 1000,
    outputLatencyMs: (ctx.outputLatency ?? 0) * 1000,
    totalLatencyMs: (ctx.baseLatency + (ctx.outputLatency ?? 0)) * 1000,
    state: ctx.state,
  };
}
```

`outputLatency` is not available in all browsers (Safari doesn't support it as of early 2026). Handle gracefully — show "N/A" if undefined.

### 5.5 UI Component

A small panel (collapsible) in the settings or analysis area:

```
┌─ Audio Chain ────────────────────────────────┐
│ DSP Output          32,000 Hz                │
│ Audio Context       48,000 Hz                │
│ Resampler           Sinc (Lanczos-3)         │
│ S-DSP Interpolation Gaussian                 │
│ ────────────────────────────────────────      │
│ Latency                                      │
│   Processing        5.3 ms                   │
│   Output            8.0 ms                   │
│   Total            13.3 ms                   │
│ ────────────────────────────────────────      │
│ Performance                                  │
│   Worklet Load      23%  ████░░░░░░          │
│   Buffer Underruns  0                        │
│ ────────────────────────────────────────      │
│ Time Stretch        Bypassed                 │
│                                              │
│ ℹ Browser audio uses shared mode.            │
│   Exclusive/ASIO mode is not available.      │
└──────────────────────────────────────────────┘
```

---

## 6. AudioStateBuffer Target Interface

Three plans propose extending `AudioStateBuffer`. To avoid conflicting incremental changes to this shared interface, the full target interface is defined here. Fields are implemented per-phase as data flows become available, but the interface is defined in one pass:

```typescript
export interface AudioStateBuffer {
  // ─── Existing fields ─────────────────────────────────────────────
  positionSamples: number;
  vuLeft: Float32Array; // 8 voices
  vuRight: Float32Array; // 8 voices
  masterVuLeft: number;
  masterVuRight: number;
  voices: VoiceStateSnapshot[]; // 8 voice state snapshots
  echoBuffer: Int16Array | null;
  firCoefficients: Uint8Array; // 8 FIR taps
  generation: number; // monotonic change counter

  // ─── Audio Engine Plan additions ─────────────────────────────────
  /** S-DSP register bank (128 bytes). Updated at telemetry rate (~60 Hz). */
  dspRegisters: Uint8Array;
  /** SPC700 CPU registers. Updated at telemetry rate (~60 Hz). */
  cpuRegisters: {
    a: number; // Accumulator
    x: number; // X index
    y: number; // Y index
    sp: number; // Stack pointer
    pc: number; // Program counter (16-bit)
    psw: number; // Processor status word
  };
  /** SPC RAM copy (64 KB). Updated via postMessage transfer at ~10 Hz. */
  ramCopy: Uint8Array;

  // ─── Visualization Plan additions ────────────────────────────────
  /** 32-band spectrum data from AnalyserNode. Updated at render rate. */
  spectrumBands: Float32Array;
  /** Per-voice spectrum magnitude (8 voices). For visualization only. */
  voiceSpectrumBands: Float32Array[];
}
```

Default values for new fields:

```typescript
// In createDefaultBuffer():
dspRegisters: new Uint8Array(128),
cpuRegisters: { a: 0, x: 0, y: 0, sp: 0, pc: 0, psw: 0 },
ramCopy: new Uint8Array(65536),
spectrumBands: new Float32Array(32),
voiceSpectrumBands: Array.from({ length: 8 }, () => new Float32Array(32)),
```

Each plan implements the data flow for its fields independently, but the interface definition ships once in Phase 1 to prevent cross-plan merge conflicts.

---

## 7. Batched WASM Export Additions

All new WASM exports across all plans are batched into a single Rust change to minimize build-pipeline friction (the WASM build requires rustup's cargo, not Homebrew's — use `npm run build:wasm`).

| Export                  | Signature             | Purpose                                                    | Consuming Plan                    |
| ----------------------- | --------------------- | ---------------------------------------------------------- | --------------------------------- |
| `dsp_get_ram_ptr`       | `() → u32`            | Pointer to 64KB SPC RAM in WASM memory                     | Audio engine (RAM telemetry)      |
| `dsp_get_registers`     | `(outPtr: u32) → u32` | Copy 128 DSP register bytes to ptr                         | Audio engine (register telemetry) |
| `dsp_get_cpu_registers` | `(outPtr: u32) → u32` | Copy SPC700 CPU regs (8 bytes: PC+A+X+Y+SP+PSW+pad) to ptr | Audio engine (register telemetry) |

Existing exports already sufficient for checkpoints: `dsp_snapshot_size`, `dsp_snapshot`, `dsp_restore`.

**Implementation:** Add all three exports in one Rust commit. Update `DspExports` interface in `dsp-exports.ts` in the same commit. Run `npm run build:wasm` once.

---

## 8. Implementation Phases

### Phase 1: Quick Wins (Low Risk, High Impact)

**Seeking — Voice Muting + Larger Chunks**

- Modify `handleSeek()` in `spc-worklet.ts`:
  - Mute voices during long seeks (> 30K samples)
  - Use `MAX_DSP_FRAMES_PER_QUANTUM` (4096) chunk size during seek instead of `QUANTUM_FRAMES` (128)
- Files: `spc-worklet.ts`
- Risk: Very low — isolated change, same approach as battle-tested GME
- Impact: 20–30% faster seeks + 32× fewer function calls during seek

**AudioStateBuffer Interface Definition**

- Define the full target `AudioStateBuffer` interface (per §6) with default values
- No data flow changes yet — just the type definition and defaults
- Files: `audio-state-buffer.ts`
- Risk: Very low — additive type change
- Impact: Prevents cross-plan merge conflicts

**Audio Stats Display**

- Add `processLoadPercent` and `totalUnderruns` tracking to worklet
- Create `AudioChainInfo` component reading from `AudioContext` properties
- Files: `spc-worklet.ts`, new component, `engine.ts`
- Risk: Low — read-only display
- Impact: Users can see actual audio pipeline state

### Phase 2: Core Improvements (Medium Risk, High Impact)

**Batched WASM Exports**

- Add `dsp_get_registers`, `dsp_get_cpu_registers`, `dsp_get_ram_ptr` in one Rust change
- Update `DspExports` interface
- Run `npm run build:wasm` once
- Files: `crates/spc-apu-wasm/src/lib.rs`, `dsp-exports.ts`
- Risk: Low — additive WASM exports
- Impact: Unblocks register/RAM telemetry

**Checkpoint-Based Seeking**

- Add `CheckpointStore` to `SpcProcessor` with integrity validation (magic bytes, size check)
- Capture checkpoints during normal playback (with byte-level memory cap)
- Use checkpoints in `handleSeek()` for near-instant backward seeks
- Files: `spc-worklet.ts`, `worker-protocol.ts` (new message types)
- Risk: Medium — new worklet-thread state management
- Impact: **30–150× faster backward seeks** (the #1 user complaint)

**MP3 Export**

- Verify `wasm-media-encoders` (already installed at v0.7.0) works via `mp3-encoder.ts`
- Test metadata injection
- Files: `mp3-encoder.ts`
- Risk: Low — stub and dependency already exist
- Impact: Second most-requested export format

**Memory/Registers Telemetry (Registers Only)**

- Extend `WorkletToMain.Telemetry` with register data
- Wire to `audioStateBuffer.dspRegisters` and `audioStateBuffer.cpuRegisters`
- Update analysis components to display live data
- Files: `spc-worklet.ts`, `engine.ts`, `MemoryViewer.tsx`
- Risk: Low — small data, existing transport
- Impact: Register display comes alive

### Phase 3: Full Features (Higher Effort)

**SoundTouchJS Integration**

- Install `@soundtouchjs/audio-worklet` (from `cutterbl/SoundTouchJS` monorepo)
- Use `SoundTouchNode.register(audioCtx, processorUrl)` API before construction
- Modify `engine.ts` audio graph to insert/bypass SoundTouchNode
- Change `setSpeed()` to route through SoundTouch instead of worklet speedFactor
- Handle seek with disconnect/reconnect pattern (no `flush()` method)
- Update `audio-recovery.ts` with `rebuildAudioGraph()` method
- LGPL compliance: separate module loading, `THIRD_PARTY_LICENSES` update
- Add `/soundtouch/i` to `WORKER_PATTERNS` in bundle-size checks
- Files: `engine.ts`, `audio-recovery.ts`, `audio-sync.ts`, `package.json`, `THIRD_PARTY_LICENSES`
- Risk: Medium — audio graph rewiring, LGPL compliance
- Impact: Pitch-independent speed change

**Memory Viewer Live Updates (RAM)**

- Implement postMessage-with-transfer path for 64KB RAM at ~10 Hz
- Update `MemoryViewer.tsx` to read from `audioStateBuffer.ramCopy`
- Files: `spc-worklet.ts`, `engine.ts`, `MemoryViewer.tsx`
- Risk: Low — straightforward postMessage transport
- Impact: Memory viewer shows live SPC RAM changes during playback

**FLAC Export**

- Install or build libFLAC WASM
- Test against production CSP (check for `eval()` in glue code)
- Verify `flac-encoder.ts` works end-to-end
- Test Vorbis comment metadata
- Risk: Medium — library may need CSP-safe recompilation
- Impact: Lossless export option

### Phase 4: Advanced (Lower Priority)

**Checkpoint Pre-Computation Worker**

- Web Worker that pre-renders checkpoints at load time
- Transfer checkpoints to worklet via main thread relay (Transferable ArrayBuffers)
- Worker self-terminates after transfer to free WASM instance (~0.5 MB)
- Validate imported checkpoints (magic bytes, size) before accepting in worklet
- Files: New `checkpoint-worker.ts`, `engine.ts`, `spc-worklet.ts`
- Risk: Low–Medium — standard Worker pattern
- Impact: First seek to any position is also fast

**Opus Export via WebCodecs**

- Implement `opus-encoder.ts` using `AudioEncoder`
- Implement WebM container muxer (or find library)
- Files: New `opus-encoder.ts`, new `webm-muxer.ts`
- Risk: Medium — WebCodecs API is newer, needs container work
- Impact: Modern lossy format, supersedes OGG Vorbis

**OGG Vorbis Export**

- Verify `ogg-encoder.ts` works with `wasm-media-encoders`
- Fallback for browsers without WebCodecs
- Files: `ogg-encoder.ts`
- Risk: Low — stub and dependency exist
- Impact: Lossy export fallback

---

## Appendix A: New Worker Protocol Messages

```typescript
// Main → Worklet
interface ImportCheckpoints {
  readonly type: 'import-checkpoints';
  readonly checkpoints: Array<{
    positionSamples: number;
    stateData: ArrayBuffer;
  }>;
}

interface SetCheckpointConfig {
  readonly type: 'set-checkpoint-config';
  readonly intervalSamples: number;
  readonly maxCheckpoints: number;
}

// Worklet → Main
interface AudioStats {
  readonly type: 'audio-stats';
  readonly processLoadPercent: number;
  readonly totalUnderruns: number;
}

interface MemoryDump {
  readonly type: 'memory-dump';
  readonly data: ArrayBuffer; // 64KB SPC RAM (transferred)
}
```

All message handlers must include a `default:` case in the switch statement that logs unknown message types.

## Appendix B: Dependency Additions

| Package                       | Version | License      | Purpose         | Phase   |
| ----------------------------- | ------- | ------------ | --------------- | ------- |
| `@soundtouchjs/audio-worklet` | latest  | LGPL-2.1     | Time stretching | Phase 3 |
| `libflac.js`                  | latest  | BSD-3-Clause | FLAC encoding   | Phase 3 |

`wasm-media-encoders` (v0.7.0, MIT) is already a project dependency — no installation needed for MP3 and OGG Vorbis encoding.

All LGPL dependencies loaded as separate modules (dynamic `import()`), not bundled into the main chunk. SoundTouchJS processor loaded via `addModule()` — excluded from bundle-size checks.
