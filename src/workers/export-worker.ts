/**
 * Export worker — offline DSP rendering, resampling, dithering, and encoding.
 *
 * This is a module worker (not AudioWorklet). It instantiates its own WASM
 * DSP emulator, renders at maximum CPU speed, applies Lanczos-3 sinc
 * resampling and TPDF dithering, then feeds PCM to the selected encoder.
 *
 * @see docs/design/export-pipeline.md §1–§6
 * @see docs/design/worker-protocol.md §2.4–§2.5
 * @see docs/adr/0003-audio-pipeline-architecture.md (export path)
 */

import type { DspExports } from '../audio/dsp-exports';
import type {
  MainToExportWorker,
  ExportWorkerToMain,
  ExportPhase,
  ExportErrorCode,
  ExportMetadata,
} from '../audio/worker-protocol';
import { PROTOCOL_VERSION } from '../audio/worker-protocol';
import type { Encoder } from '../export/encoders/encoder-types';

// ---------------------------------------------------------------------------
// Worker global scope — this file runs as a module worker, not in the DOM.
// TypeScript includes DOM lib, so `self` is typed as Window. This declares
// the worker-specific postMessage overload we need for Transferable support.
// ---------------------------------------------------------------------------

declare function postMessage(message: unknown, transfer?: Transferable[]): void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Native S-DSP sample rate. */
const DSP_SAMPLE_RATE = 32_000;

/** DSP frames rendered per chunk. ~128 ms at 32 kHz — cancellation check point. */
const CHUNK_FRAMES = 4096;

/** Stereo channels. */
const CHANNELS = 2;

/** Lanczos-3 kernel half-width (3 lobes). */
const SINC_LOBES = 3;

/** Minimum interval between progress messages (50 ms → ≤ 20 msg/sec). */
const PROGRESS_THROTTLE_MS = 50;

/**
 * Phase weights for overall progress computation.
 * WAV encoding is trivial so rendering dominates; for lossy codecs
 * encoding is the bottleneck.
 * @see docs/design/export-pipeline.md §4
 */
const PHASE_WEIGHTS = {
  wav: { rendering: 0.8, encoding: 0.1, metadata: 0.05, packaging: 0.05 },
  default: {
    rendering: 0.2,
    encoding: 0.7,
    metadata: 0.05,
    packaging: 0.05,
  },
} as const;

/** MIME types for each export format. */
const FORMAT_MIME: Record<string, string> = {
  wav: 'audio/wav',
  flac: 'audio/flac',
  'ogg-vorbis': 'audio/ogg',
  mp3: 'audio/mpeg',
  opus: 'audio/webm',
};

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let wasmExports: DspExports | null = null;
let cancelled = false;
let activeJobId: string | null = null;

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<MainToExportWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'init':
      handleInit(msg);
      break;
    case 'start-export':
      handleStartExport(msg);
      break;
    case 'cancel-export':
      handleCancelExport(msg);
      break;
  }
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function handleInit(msg: MainToExportWorker.Init): Promise<void> {
  try {
    if (msg.version !== PROTOCOL_VERSION) {
      postError(
        null,
        'AUDIO_PROTOCOL_VERSION_MISMATCH',
        `Expected protocol v${PROTOCOL_VERSION}, received v${msg.version}`,
        { expected: PROTOCOL_VERSION, received: msg.version },
      );
      return;
    }

    // Compile + instantiate WASM from raw bytes.
    // The Rust crate targets wasm32-unknown-unknown with panic=abort,
    // producing no env imports — empty importObject is correct.
    const { instance } = await WebAssembly.instantiate(msg.wasmBytes, {});
    // WASM exports are untyped at the boundary — cast is unavoidable.
    wasmExports = instance.exports as unknown as DspExports;

    postReady();
  } catch (err) {
    postError(
      null,
      'AUDIO_WASM_INIT_FAILED',
      err instanceof Error ? err.message : 'WASM instantiation failed',
      { error: String(err) },
    );
  }
}

// ---------------------------------------------------------------------------
// Start Export
// ---------------------------------------------------------------------------

async function handleStartExport(
  msg: MainToExportWorker.StartExport,
): Promise<void> {
  const { jobId } = msg;
  activeJobId = jobId;
  cancelled = false;

  if (!wasmExports) {
    postError(jobId, 'AUDIO_WASM_INIT_FAILED', 'WASM not initialized', {});
    return;
  }

  const wasm = wasmExports;
  const weights =
    msg.format === 'wav' ? PHASE_WEIGHTS.wav : PHASE_WEIGHTS.default;

  let encoder: Encoder | null = null;

  try {
    // --- Load SPC data into WASM memory ---
    const spcBytes = new Uint8Array(msg.spcData);
    const spcPtr = wasm.wasm_alloc(spcBytes.byteLength);
    if (spcPtr === 0) {
      postError(
        jobId,
        'AUDIO_WASM_INIT_FAILED',
        'Failed to allocate WASM memory for SPC data',
        { requestedSize: spcBytes.byteLength },
      );
      return;
    }

    const wasmMem = new Uint8Array(wasm.memory.buffer);
    wasmMem.set(spcBytes, spcPtr);

    const initResult = wasm.dsp_init(spcPtr, spcBytes.byteLength);
    wasm.wasm_dealloc(spcPtr, spcBytes.byteLength);

    if (initResult < 0) {
      postError(
        jobId,
        'SPC_INVALID_DATA',
        `dsp_init returned error code ${initResult}`,
        { wasmErrorCode: initResult },
      );
      return;
    }

    // --- Configure voice mask ---
    wasm.dsp_set_voice_mask(msg.voiceMask);

    // --- Determine total samples to render ---
    const totalDspSamples = msg.durationSamples ?? DSP_SAMPLE_RATE * 180;
    const fadeOutSamples = msg.fadeOutSamples;
    const totalWithFade = totalDspSamples + fadeOutSamples;

    // --- Set up resampler ---
    const targetRate = msg.sampleRate;
    const ratio = targetRate / DSP_SAMPLE_RATE; // > 1 for upsampling

    // --- Initialize encoder ---
    encoder = await getEncoder(msg.format);
    await encoder.init({
      sampleRate: targetRate,
      channels: CHANNELS,
      bitsPerSample: 16,
      quality: msg.quality,
      metadata: msg.metadata,
    });

    // --- Pre-allocate resampler history buffer ---
    // Need SINC_LOBES samples of history on each side for the kernel.
    // Store interleaved stereo history from previous chunks.
    const historySize = SINC_LOBES * CHANNELS;
    const history = new Float32Array(historySize);

    // --- Rendering + resampling + dithering loop ---
    const outputPtr = wasm.dsp_get_output_ptr();
    let dspSamplesRendered = 0;
    let lastProgressTime = 0;

    // TPDF dither state — two independent uniform RNG states.
    // Using a simple xorshift32 for deterministic, fast RNG.
    let rngState1 = 0x12345678;
    let rngState2 = 0x87654321;

    while (dspSamplesRendered < totalWithFade) {
      if (cancelled) {
        encoder.dispose();
        postCancelled(jobId);
        return;
      }

      // How many DSP frames to render this chunk
      const remaining = totalWithFade - dspSamplesRendered;
      const chunkDspFrames = Math.min(CHUNK_FRAMES, remaining);

      const renderResult = wasm.dsp_render(outputPtr, chunkDspFrames);
      if (renderResult < 0) {
        encoder.dispose();
        postError(
          jobId,
          'AUDIO_WASM_RENDER_ERROR',
          `dsp_render returned error code ${renderResult}`,
          { wasmErrorCode: renderResult },
        );
        return;
      }

      // Read interleaved stereo float32 from WASM memory.
      // dsp_render outputs interleaved [L0, R0, L1, R1, ...] float32.
      const dspOutput = new Float32Array(
        wasm.memory.buffer,
        outputPtr,
        chunkDspFrames * CHANNELS,
      );

      // Apply fade-out gain ramp if in the fade region
      applyFadeGain(
        dspOutput,
        dspSamplesRendered,
        chunkDspFrames,
        totalDspSamples,
        fadeOutSamples,
      );

      // Resample this chunk from DSP rate to target rate
      const resampledChunk = resampleChunk(
        history,
        dspOutput,
        chunkDspFrames,
        ratio,
        dspSamplesRendered,
        totalWithFade,
      );

      // TPDF dither float32 → int16
      const dithered = new Int16Array(resampledChunk.length);
      for (let i = 0; i < resampledChunk.length; i++) {
        // Generate two uniform random values in [-1, 1) using xorshift32
        rngState1 = xorshift32(rngState1);
        rngState2 = xorshift32(rngState2);
        const u1 = (rngState1 / 0x100000000) * 2 - 1; // [-1, 1)
        const u2 = (rngState2 / 0x100000000) * 2 - 1;
        // TPDF noise: sum of two uniform → triangular distribution, scaled
        // to ±1 LSB in the int16 domain (1/32768).
        const dither = (u1 + u2) / 32768;
        const sample = resampledChunk[i] + dither;
        // Clamp to [-1, 1] then quantize to int16
        dithered[i] = floatToInt16(sample);
      }

      // Feed dithered PCM to encoder
      encoder.encode(dithered);

      dspSamplesRendered += chunkDspFrames;

      // Update history buffer for next chunk's resampler continuity
      updateHistory(history, dspOutput, chunkDspFrames);

      // Throttled progress reporting
      const now = performance.now();
      if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
        lastProgressTime = now;
        const renderFraction = dspSamplesRendered / totalWithFade;
        postProgress(jobId, 'rendering', renderFraction, weights);
      }
    }

    // Final rendering progress
    postProgress(jobId, 'rendering', 1.0, weights);

    // --- Encoding finalization ---
    postProgress(jobId, 'encoding', 0.5, weights);

    if (cancelled) {
      encoder.dispose();
      postCancelled(jobId);
      return;
    }

    const encodedData = await encoder.finalize();
    postProgress(jobId, 'encoding', 1.0, weights);

    // --- Metadata phase (already embedded by encoder.init) ---
    postProgress(jobId, 'metadata', 1.0, weights);

    // --- Packaging ---
    postProgress(jobId, 'packaging', 0.5, weights);

    // Copy into a standalone ArrayBuffer for transfer.
    // Uint8Array.slice() always returns a new ArrayBuffer (not SharedArrayBuffer).
    const fileBuffer = new Uint8Array(encodedData).buffer as ArrayBuffer;

    const suggestedName = buildSuggestedName(
      msg.metadata,
      msg.voiceMask,
      msg.format,
    );
    postProgress(jobId, 'packaging', 1.0, weights);

    // Transfer the buffer to main thread (zero-copy)
    const completeMsg: ExportWorkerToMain.Complete = {
      type: 'complete',
      jobId,
      fileData: fileBuffer,
      mimeType: FORMAT_MIME[msg.format] ?? 'application/octet-stream',
      suggestedName,
    };
    postMessage(completeMsg, [fileBuffer]);
  } catch (err) {
    encoder?.dispose();

    if (cancelled) {
      postCancelled(jobId);
      return;
    }

    const code: ExportErrorCode =
      err instanceof Error && err.message.includes('codec')
        ? 'EXPORT_ENCODING_FAILED'
        : 'AUDIO_WASM_TRAP';

    postError(jobId, code, err instanceof Error ? err.message : String(err), {
      error: String(err),
      format: msg.format,
    });
  } finally {
    activeJobId = null;
  }
}

// ---------------------------------------------------------------------------
// Cancel Export
// ---------------------------------------------------------------------------

function handleCancelExport(msg: MainToExportWorker.CancelExport): void {
  if (activeJobId === msg.jobId) {
    cancelled = true;
  }
}

// ---------------------------------------------------------------------------
// Sinc Resampler — Lanczos-3 windowed sinc
// ---------------------------------------------------------------------------

/**
 * Lanczos-3 kernel: sinc(x) * sinc(x / SINC_LOBES) for |x| < SINC_LOBES.
 * sinc(x) = sin(πx) / (πx), sinc(0) = 1.
 */
function lanczos3(x: number): number {
  if (x === 0) return 1;
  if (x >= SINC_LOBES || x <= -SINC_LOBES) return 0;
  const pix = Math.PI * x;
  const pixa = pix / SINC_LOBES;
  return (Math.sin(pix) / pix) * (Math.sin(pixa) / pixa);
}

/**
 * Resample a chunk of interleaved stereo float32 from DSP rate to target rate
 * using a Lanczos-3 windowed sinc interpolation kernel.
 *
 * @param history - Previous SINC_LOBES frames of DSP output (interleaved stereo)
 *                  for kernel overlap into prior chunks.
 * @param dspOutput - Current chunk's interleaved stereo float32 DSP output.
 * @param dspFrames - Number of stereo frames in dspOutput.
 * @param ratio - targetRate / DSP_SAMPLE_RATE (e.g. 1.5 for 32k→48k).
 * @param globalDspOffset - Total DSP frames rendered before this chunk.
 * @param totalDspFrames - Total DSP frames for the entire export.
 * @returns Interleaved stereo float32 at the target rate.
 */
function resampleChunk(
  history: Float32Array,
  dspOutput: Float32Array,
  dspFrames: number,
  ratio: number,
  globalDspOffset: number,
  totalDspFrames: number,
): Float32Array {
  // If ratio is 1.0 (32k → 32k), no resampling needed — just copy.
  if (ratio === 1.0) {
    return new Float32Array(dspOutput.subarray(0, dspFrames * CHANNELS));
  }

  // Compute output frame range for this chunk
  const outStartFrame = Math.ceil(globalDspOffset * ratio);
  const chunkEndDsp = globalDspOffset + dspFrames;
  const outEndFrame =
    chunkEndDsp >= totalDspFrames
      ? Math.ceil(totalDspFrames * ratio)
      : Math.ceil(chunkEndDsp * ratio);
  const outFrames = outEndFrame - outStartFrame;

  if (outFrames <= 0) {
    return new Float32Array(0);
  }

  const result = new Float32Array(outFrames * CHANNELS);

  for (let i = 0; i < outFrames; i++) {
    // Position in DSP sample domain for this output sample
    const dspPos = (outStartFrame + i) / ratio;
    // Position relative to this chunk's start
    const localPos = dspPos - globalDspOffset;

    let sumL = 0;
    let sumR = 0;
    let weightSum = 0;

    // Evaluate the Lanczos-3 kernel over ±SINC_LOBES samples
    const center = Math.floor(localPos);
    const startK = center - SINC_LOBES + 1;
    const endK = center + SINC_LOBES;

    for (let k = startK; k <= endK; k++) {
      const dist = localPos - k;
      const w = lanczos3(dist);
      if (w === 0) continue;

      // Read sample at DSP frame index k (relative to chunk start).
      // Negative indices reach into the history buffer.
      let sL: number;
      let sR: number;

      if (k < 0) {
        // Reach into history — history stores the last SINC_LOBES frames.
        const histIdx = SINC_LOBES + k; // k is negative, so this indexes back
        if (histIdx >= 0) {
          sL = history[histIdx * CHANNELS];
          sR = history[histIdx * CHANNELS + 1];
        } else {
          // Before available history — treat as zero (start of file)
          sL = 0;
          sR = 0;
        }
      } else if (k < dspFrames) {
        sL = dspOutput[k * CHANNELS];
        sR = dspOutput[k * CHANNELS + 1];
      } else {
        // Beyond chunk boundary — zero-pad (last chunk of file)
        sL = 0;
        sR = 0;
      }

      sumL += sL * w;
      sumR += sR * w;
      weightSum += w;
    }

    // Normalize by weight sum to maintain unity gain
    if (weightSum !== 0) {
      result[i * CHANNELS] = sumL / weightSum;
      result[i * CHANNELS + 1] = sumR / weightSum;
    }
  }

  return result;
}

/**
 * Update the history buffer with the tail of the current DSP chunk.
 * Stores the last SINC_LOBES frames for the next chunk's kernel overlap.
 */
function updateHistory(
  history: Float32Array,
  dspOutput: Float32Array,
  dspFrames: number,
): void {
  const framesToCopy = Math.min(SINC_LOBES, dspFrames);
  const srcStart = (dspFrames - framesToCopy) * CHANNELS;

  if (framesToCopy < SINC_LOBES) {
    // Shift existing history forward, then append new frames
    const shift = SINC_LOBES - framesToCopy;
    history.copyWithin(0, shift * CHANNELS);
    history.set(
      dspOutput.subarray(srcStart, srcStart + framesToCopy * CHANNELS),
      shift * CHANNELS,
    );
  } else {
    // Full replacement
    history.set(
      dspOutput.subarray(srcStart, srcStart + framesToCopy * CHANNELS),
    );
  }
}

// ---------------------------------------------------------------------------
// TPDF Dithering helpers
// ---------------------------------------------------------------------------

/** xorshift32 PRNG — fast, deterministic, period 2^32-1. */
function xorshift32(state: number): number {
  let s = state;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return s >>> 0; // Ensure unsigned 32-bit
}

/** Clamp a float sample to [-1, 1] and quantize to int16. */
function floatToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  const scaled = clamped < 0 ? clamped * 32768 : clamped * 32767;
  return Math.round(scaled);
}

// ---------------------------------------------------------------------------
// Fade-out
// ---------------------------------------------------------------------------

/**
 * Apply a linear fade-out gain ramp to DSP output in-place.
 * The fade region starts at `durationSamples` and extends for `fadeOutSamples`.
 */
function applyFadeGain(
  dspOutput: Float32Array,
  chunkStartSample: number,
  chunkFrames: number,
  durationSamples: number,
  fadeOutSamples: number,
): void {
  if (fadeOutSamples <= 0) return;

  const fadeStart = durationSamples;
  const fadeEnd = durationSamples + fadeOutSamples;

  for (let i = 0; i < chunkFrames; i++) {
    const globalSample = chunkStartSample + i;

    if (globalSample < fadeStart) continue;

    let gain: number;
    if (globalSample >= fadeEnd) {
      gain = 0;
    } else {
      // Linear ramp from 1.0 → 0.0
      gain = 1 - (globalSample - fadeStart) / fadeOutSamples;
    }

    dspOutput[i * CHANNELS] *= gain;
    dspOutput[i * CHANNELS + 1] *= gain;
  }
}

// ---------------------------------------------------------------------------
// Encoder loading — dynamic import for lazy-loaded codecs
// ---------------------------------------------------------------------------

async function getEncoder(
  format: 'wav' | 'flac' | 'ogg-vorbis' | 'mp3' | 'opus',
): Promise<Encoder> {
  switch (format) {
    case 'wav': {
      const { createWavEncoder } =
        await import('../export/encoders/wav-encoder');
      return createWavEncoder();
    }
    case 'flac': {
      const { createFlacEncoder } =
        await import('../export/encoders/flac-encoder');
      return createFlacEncoder();
    }
    case 'ogg-vorbis': {
      const { createOggEncoder } =
        await import('../export/encoders/ogg-encoder');
      return createOggEncoder();
    }
    case 'mp3': {
      const { createMp3Encoder } =
        await import('../export/encoders/mp3-encoder');
      return createMp3Encoder();
    }
    case 'opus': {
      const { createOpusEncoder } =
        await import('../export/encoders/opus-encoder');
      return createOpusEncoder();
    }
  }
}

// ---------------------------------------------------------------------------
// Filename generation
// ---------------------------------------------------------------------------

/** Characters illegal in filenames on Windows/macOS/Linux. */
// eslint-disable-next-line no-control-regex -- intentional: strip control characters from filenames
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

const FORMAT_EXTENSION: Record<string, string> = {
  wav: '.wav',
  flac: '.flac',
  'ogg-vorbis': '.ogg',
  mp3: '.mp3',
  opus: '.webm',
};

/** Sanitize a metadata string for safe use in filenames. */
function sanitizeForFilename(raw: string): string {
  return raw.replace(ILLEGAL_FILENAME_CHARS, '_').replace(/\s+/g, ' ').trim();
}

function buildSuggestedName(
  metadata: ExportMetadata,
  voiceMask: number,
  format: string,
): string {
  const parts: string[] = [];

  if (metadata.game) parts.push(sanitizeForFilename(metadata.game));
  if (metadata.title) parts.push(sanitizeForFilename(metadata.title));

  // If single voice, add voice number (1-based)
  if (voiceMask !== 0xff && voiceMask !== 0) {
    const voiceBit = Math.log2(voiceMask);
    if (Number.isInteger(voiceBit)) {
      parts.push(`Voice ${voiceBit + 1}`);
    }
  }

  const baseName = parts.length > 0 ? parts.join(' - ') : 'export';
  const ext = FORMAT_EXTENSION[format] ?? '.bin';
  return baseName + ext;
}

// ---------------------------------------------------------------------------
// Progress + message posting
// ---------------------------------------------------------------------------

type PhaseWeights = Record<ExportPhase, number>;

function computeOverallProgress(
  currentPhase: ExportPhase,
  fraction: number,
  weights: PhaseWeights,
): number {
  const phases: ExportPhase[] = [
    'rendering',
    'encoding',
    'metadata',
    'packaging',
  ];
  let overall = 0;
  for (const phase of phases) {
    if (phase === currentPhase) {
      overall += weights[phase] * fraction;
      break;
    }
    overall += weights[phase]; // completed phases contribute full weight
  }
  return Math.min(1, overall);
}

function postProgress(
  jobId: string,
  phase: ExportPhase,
  fraction: number,
  weights: PhaseWeights,
): void {
  const msg: ExportWorkerToMain.Progress = {
    type: 'progress',
    jobId,
    phase,
    fraction,
    overallProgress: computeOverallProgress(phase, fraction, weights),
  };
  postMessage(msg);
}

function postReady(): void {
  const msg: ExportWorkerToMain.Ready = {
    type: 'ready',
    version: PROTOCOL_VERSION,
  };
  postMessage(msg);
}

function postError(
  jobId: string | null,
  code: ExportErrorCode,
  message: string,
  context: Record<string, unknown>,
): void {
  const msg: ExportWorkerToMain.Error = {
    type: 'error',
    jobId: jobId ?? '',
    code,
    message,
    context,
  };
  postMessage(msg);
}

function postCancelled(jobId: string): void {
  const msg: ExportWorkerToMain.Cancelled = {
    type: 'cancelled',
    jobId,
  };
  postMessage(msg);
}
