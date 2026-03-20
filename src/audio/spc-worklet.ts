/**
 * SPC AudioWorklet Processor — runs DSP emulation on the audio thread.
 *
 * This file executes in an AudioWorklet context with NO DOM, NO fetch,
 * and NO ES module imports at runtime. Type-only imports are erased at
 * compile time and are safe.
 *
 * @see docs/adr/0003-audio-pipeline-architecture.md
 * @see docs/adr/0007-wasm-build-pipeline.md
 * @see docs/design/worker-protocol.md §2.2–2.3
 * @see docs/design/loop-playback.md §4.1–4.4
 */

import type { DspExports } from './dsp-exports';
import type {
  MainToWorklet,
  WorkletToMain,
  VoiceState,
  PlaybackSegment,
  WorkletErrorCode,
} from './worker-protocol';

// PROTOCOL_VERSION is a const — duplicated here because runtime imports
// from the main bundle are forbidden in AudioWorklet context.
const PROTOCOL_VERSION = 1;

/** Number of S-DSP voices. */
const VOICE_COUNT = 8;

/** Number of frames per AudioWorklet quantum. */
const QUANTUM_FRAMES = 128;

/** Number of output channels (stereo). */
const CHANNEL_COUNT = 2;

/** Native S-DSP sample rate in Hz. */
const DSP_SAMPLE_RATE = 32_000;

/** Number of float32 elements per stereo quantum (128 L + 128 R). */
const _OUTPUT_BUFFER_FLOATS = QUANTUM_FRAMES * CHANNEL_COUNT;

/**
 * Maximum DSP frames the WASM output buffer can hold.
 * Must match MAX_RENDER_FRAMES (4096) in crates/spc-apu-wasm/src/lib.rs.
 */
const MAX_DSP_FRAMES_PER_QUANTUM = 4096;

/**
 * Maximum render overrun failures before escalating to a fatal error.
 * After this many consecutive dsp_render failures, the processor posts
 * AUDIO_RENDER_OVERRUN_CRITICAL and stops attempting to render.
 */
const MAX_CONSECUTIVE_RENDER_FAILURES = 10;

class SpcProcessor extends AudioWorkletProcessor {
  // -- WASM state -----------------------------------------------------------
  private wasm: DspExports | null = null;
  private isPlaying = false;
  private outputPtr = 0;

  // -- Sample counting for duration/fade ------------------------------------
  private renderedSamples = 0;
  private durationSamples: number | null = null;
  private fadeOutSamples = 0;

  // -- Loop structure for telemetry -----------------------------------------
  private loopCount: number | null = null;
  private structure: {
    introSamples: number;
    loopSamples: number;
    endSamples: number;
  } | null = null;

  // -- Telemetry ------------------------------------------------------------
  private telemetryInterval = 6;
  private quantaSinceLastTelemetry = 0;
  private generation = 0;

  // -- Speed ----------------------------------------------------------------
  private speedFactor = 1.0;

  // -- Error tracking -------------------------------------------------------
  private consecutiveRenderFailures = 0;
  private renderDisabled = false;

  // -- Voice state buffer (pre-allocated for telemetry) ---------------------
  private voiceStatePtr = 0;

  // -- FIR coefficient buffer (pre-allocated, 8 bytes) ----------------------
  private firCoefficientsPtr = 0;

  // -- Echo telemetry rate (send every N telemetry cycles) ------------------
  private echoTelemetryCycle = 0;
  private static readonly ECHO_TELEMETRY_DIVISOR = 4;

  // -- Init queuing -----------------------------------------------------------
  private initPromise: Promise<void> | null = null;
  private pendingMessages: MainToWorklet[] = [];

  // -- Mode placeholders (future WASM API) ----------------------------------
  private resamplerMode = 0;
  private interpolationMode = 0;

  // -- Sinc resampler scratch buffer pointer --------------------------------
  private resampleOutputPtr = 0;

  // -- Resampler state (32kHz DSP → output rate) ----------------------------
  private outputSampleRate = sampleRate; // AudioWorkletGlobalScope.sampleRate
  private resampleFrac = 0;
  private prevDspLeft = 0;
  private prevDspRight = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<MainToWorklet>) => {
      this.handleMessage(event.data);
    };
  }

  // =========================================================================
  // process() — called every quantum (128 frames at output sample rate)
  // =========================================================================

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0];
    if (!output || output.length < CHANNEL_COUNT) {
      return true;
    }

    const left = output[0];
    const right = output[1];

    // If not playing, no WASM, or rendering has been disabled due to
    // repeated failures, fill with silence and keep the processor alive.
    if (!this.isPlaying || !this.wasm || this.renderDisabled) {
      this.fillSilence(left, right);
      return true;
    }

    // Check if playback has already finished (past duration + fade).
    if (this.isPlaybackFinished()) {
      this.fillSilence(left, right);
      return true;
    }

    try {
      // Calculate DSP-to-output ratio: how many DSP samples per output sample.
      // At 1× speed: 32000/48000 ≈ 0.6667 (upsampling from lower to higher rate).
      // At 2× speed: 0.6667 * 2 ≈ 1.333 (more DSP samples consumed per output).
      const ratio =
        (DSP_SAMPLE_RATE / this.outputSampleRate) * this.speedFactor;

      // Determine how many new DSP frames to render. The interpolation of
      // the last output sample (index 127) accesses combined[idx+1] where
      // idx = floor(resampleFrac + 127 * ratio), so we need that many + 1
      // new frames from the DSP. combined[0] is the carry-over sample from
      // the previous quantum, combined[1..N] are newly rendered frames.
      const lastOutputPos = this.resampleFrac + (QUANTUM_FRAMES - 1) * ratio;
      const dspFramesToRender = Math.min(
        Math.max(
          Math.floor(lastOutputPos) + 1, // for interpolation
          Math.floor(this.resampleFrac + QUANTUM_FRAMES * ratio), // for carry-over
        ),
        MAX_DSP_FRAMES_PER_QUANTUM,
      );

      const result = this.wasm.dsp_render(this.outputPtr, dspFramesToRender);

      if (result < 0) {
        this.handleRenderError(result);
        this.fillSilence(left, right);
        return true;
      }

      // Successful render — reset consecutive failure counter.
      this.consecutiveRenderFailures = 0;

      // View over the interleaved stereo DSP output in WASM linear memory.
      const memory = this.wasm.memory.buffer;
      const dspView = new Float32Array(
        memory,
        this.outputPtr,
        dspFramesToRender * CHANNEL_COUNT,
      );

      let intAdvance: number;

      if (this.resamplerMode === 1 && this.resampleOutputPtr !== 0) {
        // Sinc resampling via WASM Lanczos-3 filter.
        const consumed = this.wasm.dsp_resample_sinc(
          this.outputPtr,
          dspFramesToRender,
          this.resampleOutputPtr,
          QUANTUM_FRAMES,
          DSP_SAMPLE_RATE * this.speedFactor,
          this.outputSampleRate,
        );

        if (consumed < 0) {
          // Sinc resampler error — fall back to silence for this quantum.
          this.fillSilence(left, right);
          return true;
        }

        // Read resampled output from the WASM sinc output buffer.
        const resampledView = new Float32Array(
          this.wasm.memory.buffer,
          this.resampleOutputPtr,
          QUANTUM_FRAMES * CHANNEL_COUNT,
        );

        for (let i = 0; i < QUANTUM_FRAMES; i++) {
          left[i] = resampledView[i * 2];
          right[i] = resampledView[i * 2 + 1];
        }

        intAdvance = consumed;
      } else {
        // Linear interpolation: resample dspFramesToRender frames at 32kHz
        // into exactly QUANTUM_FRAMES output samples at the output rate.
        // The "combined" buffer is logically:
        //   [prevDsp, dspView[0], dspView[1], ..., dspView[N-1]]
        // where prevDsp is the carry-over sample from the previous quantum.
        for (let i = 0; i < QUANTUM_FRAMES; i++) {
          const pos = this.resampleFrac + i * ratio;
          const idx = Math.trunc(pos);
          const frac = pos - idx;

          // Sample pair at combined[idx] (left side of interpolation).
          const s0L = idx === 0 ? this.prevDspLeft : dspView[(idx - 1) * 2];
          const s0R =
            idx === 0 ? this.prevDspRight : dspView[(idx - 1) * 2 + 1];

          // Sample pair at combined[idx + 1] → dspView frame idx.
          const s1L = dspView[idx * 2];
          const s1R = dspView[idx * 2 + 1];

          left[i] = s0L + (s1L - s0L) * frac;
          right[i] = s0R + (s1R - s0R) * frac;
        }

        // Advance resampler state. The total DSP-domain advance for this
        // quantum determines how many integer DSP samples were consumed and
        // what fractional offset carries into the next quantum.
        const totalAdvance = this.resampleFrac + QUANTUM_FRAMES * ratio;
        intAdvance = Math.trunc(totalAdvance);
        this.resampleFrac = totalAdvance - intAdvance;

        // Carry over the last consumed DSP sample for next quantum.
        if (intAdvance > 0) {
          this.prevDspLeft = dspView[(intAdvance - 1) * 2];
          this.prevDspRight = dspView[(intAdvance - 1) * 2 + 1];
        }
      }

      // Track position in DSP sample domain (32kHz) for seek/duration.
      this.renderedSamples += intAdvance;

      // Apply fade gain ramp if we've passed durationSamples.
      this.applyFade(left, right, intAdvance);

      // Check if playback just finished after this quantum.
      if (this.isPlaybackFinished()) {
        this.postMessage({
          type: 'playback-ended',
          totalSamples: this.renderedSamples,
        });
        this.isPlaying = false;
        // Silence any remaining audio in this quantum that is past the end.
        // (applyFade already zeroed samples past the fade region.)
      }

      // Telemetry emission at configured interval.
      this.quantaSinceLastTelemetry++;
      if (
        this.telemetryInterval > 0 &&
        this.quantaSinceLastTelemetry >= this.telemetryInterval
      ) {
        this.quantaSinceLastTelemetry = 0;
        this.emitTelemetry(left, right);
      }
    } catch (err) {
      this.postError(
        'AUDIO_WASM_TRAP',
        err instanceof Error ? err.message : 'Unknown WASM trap',
        { error: String(err) },
      );
      this.fillSilence(left, right);
    }

    return true;
  }

  // =========================================================================
  // Message handling
  // =========================================================================

  private handleMessage(msg: MainToWorklet): void {
    switch (msg.type) {
      case 'init':
        this.initPromise = this.handleInit(msg).then(() =>
          this.flushPendingMessages(),
        );
        break;
      case 'load-spc':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleLoadSpc(msg);
        break;
      case 'play':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.isPlaying = true;
        this.postMessage({ type: 'playback-state', state: 'playing' });
        break;
      case 'pause':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.isPlaying = false;
        this.postMessage({ type: 'playback-state', state: 'paused' });
        break;
      case 'stop':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.isPlaying = false;
        this.renderedSamples = 0;
        this.resampleFrac = 0;
        this.prevDspLeft = 0;
        this.prevDspRight = 0;
        this.postMessage({ type: 'playback-state', state: 'stopped' });
        break;
      case 'seek':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleSeek(msg);
        break;
      case 'set-voice-mask':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        if (this.wasm) {
          this.wasm.dsp_set_voice_mask(msg.mask);
        }
        break;
      case 'set-speed':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.speedFactor = Math.max(
          0.25,
          Math.min(4.0, Number.isFinite(msg.factor) ? msg.factor : 1.0),
        );
        break;
      case 'set-telemetry-rate':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.telemetryInterval = msg.quantaInterval;
        this.quantaSinceLastTelemetry = 0;
        break;
      case 'set-playback-config':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleSetPlaybackConfig(msg);
        break;
      case 'set-resampler-mode':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleSetResamplerMode(msg.mode);
        break;
      case 'set-interpolation-mode':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleSetInterpolationMode(msg.mode);
        break;
      case 'request-snapshot':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleRequestSnapshot();
        break;
      case 'restore-snapshot':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleRestoreSnapshot(msg);
        break;
      case 'note-on':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        if (this.wasm) {
          this.wasm.dsp_voice_note_on(msg.voice, msg.pitch);
        }
        break;
      case 'note-off':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        if (this.wasm) {
          this.wasm.dsp_voice_note_off(msg.voice);
        }
        break;
    }
  }

  private flushPendingMessages(): void {
    const messages = this.pendingMessages;
    this.pendingMessages = [];
    for (const msg of messages) {
      this.handleMessage(msg);
    }
  }

  // =========================================================================
  // Init
  // =========================================================================

  private async handleInit(msg: MainToWorklet.Init): Promise<void> {
    try {
      // Version check
      if (msg.version !== PROTOCOL_VERSION) {
        this.postError(
          'AUDIO_PROTOCOL_VERSION_MISMATCH',
          `Expected protocol v${PROTOCOL_VERSION}, received v${msg.version}`,
          { expected: PROTOCOL_VERSION, received: msg.version },
        );
        return;
      }

      // Compile + instantiate WASM from raw bytes. The Rust crate targets
      // wasm32-unknown-unknown with panic=abort, producing no env imports.
      // NOTE: Ideally we'd pre-compile on the main thread and transfer a
      // WebAssembly.Module, but Chromium silently drops Module objects sent
      // via postMessage to AudioWorklet ports (browser bug). Raw bytes are
      // the workaround.
      const { instance } = await WebAssembly.instantiate(msg.wasmBytes, {});
      const exports = instance.exports as unknown as DspExports;

      // Allocate space in WASM memory for SPC data and copy it in.
      const spcDataView = new Uint8Array(msg.spcData);
      const spcPtr = exports.wasm_alloc(spcDataView.byteLength);
      if (spcPtr === 0) {
        this.postError(
          'AUDIO_WASM_INIT_FAILED',
          'Failed to allocate WASM memory for SPC data',
          { requestedSize: spcDataView.byteLength },
        );
        return;
      }

      const wasmMemory = new Uint8Array(exports.memory.buffer);
      wasmMemory.set(spcDataView, spcPtr);

      // Initialize the DSP emulator with the SPC snapshot.
      const initResult = exports.dsp_init(spcPtr, spcDataView.byteLength);
      if (initResult < 0) {
        exports.wasm_dealloc(spcPtr, spcDataView.byteLength);
        this.postError(
          'AUDIO_WASM_INIT_FAILED',
          `dsp_init returned error code ${initResult}`,
          { wasmErrorCode: initResult },
        );
        return;
      }

      exports.wasm_dealloc(spcPtr, spcDataView.byteLength);

      // Cache the pre-allocated output buffer pointer.
      this.outputPtr = exports.dsp_get_output_ptr();
      this.voiceStatePtr = exports.wasm_alloc(24);
      this.firCoefficientsPtr = exports.wasm_alloc(8);
      this.wasm = exports;

      // Configure playback timing.
      this.durationSamples = msg.durationSamples;
      this.fadeOutSamples = msg.fadeOutSamples;
      this.renderedSamples = 0;
      this.isPlaying = false;
      this.renderDisabled = false;
      this.consecutiveRenderFailures = 0;

      // Store resampler/interpolation mode and apply to WASM.
      this.resamplerMode = msg.resamplerMode;
      this.interpolationMode = msg.interpolationMode;
      exports.dsp_set_interpolation_mode(msg.interpolationMode);
      this.resampleOutputPtr = exports.dsp_get_resample_output_ptr();
      if (msg.resamplerMode === 1) {
        exports.dsp_resample_sinc_reset();
      }

      // Store output sample rate and reset resampler state.
      this.outputSampleRate = msg.outputSampleRate;
      this.resampleFrac = 0;
      this.prevDspLeft = 0;
      this.prevDspRight = 0;

      this.postMessage({ type: 'ready', version: PROTOCOL_VERSION });
    } catch (err) {
      this.postError(
        'AUDIO_WASM_INIT_FAILED',
        err instanceof Error ? err.message : 'WASM instantiation failed',
        { error: String(err) },
      );
    }
  }

  // =========================================================================
  // Load SPC
  // =========================================================================

  private handleLoadSpc(msg: MainToWorklet.LoadSpc): void {
    if (!this.wasm) {
      this.postError(
        'AUDIO_WASM_INIT_FAILED',
        'Cannot load SPC: WASM not initialized',
        {},
      );
      return;
    }

    try {
      // Stop playback during load.
      this.isPlaying = false;

      const spcDataView = new Uint8Array(msg.spcData);
      const spcPtr = this.wasm.wasm_alloc(spcDataView.byteLength);
      if (spcPtr === 0) {
        this.postError(
          'AUDIO_WASM_INIT_FAILED',
          'Failed to allocate WASM memory for SPC data',
          { requestedSize: spcDataView.byteLength },
        );
        return;
      }

      const wasmMemory = new Uint8Array(this.wasm.memory.buffer);
      wasmMemory.set(spcDataView, spcPtr);

      // Reset the DSP and re-init with new SPC data.
      this.wasm.dsp_reset();
      const initResult = this.wasm.dsp_init(spcPtr, spcDataView.byteLength);
      if (initResult < 0) {
        this.wasm.wasm_dealloc(spcPtr, spcDataView.byteLength);
        this.postError(
          'SPC_INVALID_DATA',
          `dsp_init rejected SPC data with code ${initResult}`,
          { wasmErrorCode: initResult },
        );
        return;
      }

      this.wasm.wasm_dealloc(spcPtr, spcDataView.byteLength);

      // Re-allocate voice state buffer after reset.
      if (this.voiceStatePtr !== 0 && this.wasm) {
        this.wasm.wasm_dealloc(this.voiceStatePtr, 24);
      }
      this.voiceStatePtr = this.wasm.wasm_alloc(24);

      // Re-allocate FIR coefficient buffer after reset.
      if (this.firCoefficientsPtr !== 0 && this.wasm) {
        this.wasm.wasm_dealloc(this.firCoefficientsPtr, 8);
      }
      this.firCoefficientsPtr = this.wasm.wasm_alloc(8);

      // Update output buffer pointer (may change after reset).
      this.outputPtr = this.wasm.dsp_get_output_ptr();

      // Reset playback state.
      this.renderedSamples = 0;
      this.durationSamples = msg.durationSamples;
      this.fadeOutSamples = msg.fadeOutSamples;
      this.loopCount = null;
      this.structure = null;
      this.renderDisabled = false;
      this.consecutiveRenderFailures = 0;

      // Reset resampler state for new track.
      this.resampleFrac = 0;
      this.prevDspLeft = 0;
      this.prevDspRight = 0;

      this.postMessage({ type: 'playback-state', state: 'stopped' });
    } catch (err) {
      this.postError(
        'AUDIO_WASM_TRAP',
        err instanceof Error ? err.message : 'Failed to load SPC',
        { error: String(err) },
      );
    }
  }

  // =========================================================================
  // Seek
  // =========================================================================

  private handleSeek(msg: MainToWorklet.Seek): void {
    if (!this.wasm) return;

    const MAX_SEEK_SAMPLES = 3600 * 32_000; // 1 hour at 32 kHz
    const targetPosition = Math.min(
      Math.max(0, msg.samplePosition),
      MAX_SEEK_SAMPLES,
    );

    if (targetPosition <= 0) {
      // Seek to beginning: reset the DSP.
      this.renderedSamples = 0;
      this.resampleFrac = 0;
      this.prevDspLeft = 0;
      this.prevDspRight = 0;
      this.wasm.dsp_reset();
      return;
    }

    try {
      if (targetPosition < this.renderedSamples) {
        // Backward seek: reset and re-render to the target position.
        this.wasm.dsp_reset();
        this.renderedSamples = 0;
      }

      // Forward seek: render silently (discard output) until reaching target.
      const samplesToSkip = targetPosition - this.renderedSamples;
      const skipChunkSize = QUANTUM_FRAMES;
      let remaining = samplesToSkip;

      while (remaining > 0) {
        const chunk = Math.min(remaining, skipChunkSize);
        const result = this.wasm.dsp_render(this.outputPtr, chunk);
        if (result < 0) {
          this.postError(
            'AUDIO_WASM_RENDER_ERROR',
            `dsp_render failed during seek with code ${result}`,
            { wasmErrorCode: result, seekTarget: targetPosition },
          );
          return;
        }
        remaining -= chunk;
      }

      this.renderedSamples = targetPosition;

      // Reset resampler state — the DSP stream is discontinuous after seek.
      this.resampleFrac = 0;
      this.prevDspLeft = 0;
      this.prevDspRight = 0;
    } catch (err) {
      this.postError(
        'AUDIO_WASM_TRAP',
        err instanceof Error ? err.message : 'Seek failed',
        { error: String(err), seekTarget: targetPosition },
      );
    }
  }

  // =========================================================================
  // Playback config update
  // =========================================================================

  private handleSetPlaybackConfig(msg: MainToWorklet.SetPlaybackConfig): void {
    this.loopCount = msg.loopCount;
    this.structure = msg.structure;

    const previousDuration = this.durationSamples;
    this.durationSamples = msg.durationSamples;
    this.fadeOutSamples = msg.fadeOutSamples;

    // If we were fading and the new duration extends past our position,
    // the fade is implicitly cancelled (applyFade won't trigger until
    // renderedSamples >= durationSamples again).

    // If we're already past the new duration, the next process() call
    // will begin the fade immediately.

    // If switching to infinite (null), any active fade is cancelled.
    if (msg.durationSamples === null && previousDuration !== null) {
      // Switched to infinite — no special action needed; process() skips
      // all duration/fade checks when durationSamples is null.
    }
  }

  // =========================================================================
  // Interpolation and resampler mode handlers
  // =========================================================================

  private handleSetInterpolationMode(mode: number): void {
    this.interpolationMode = mode;
    if (this.wasm) {
      this.wasm.dsp_set_interpolation_mode(mode);
    }
  }

  private handleSetResamplerMode(mode: number): void {
    this.resamplerMode = mode;
    if (this.wasm && mode === 1) {
      // Reset sinc resampler state when switching to sinc mode.
      this.wasm.dsp_resample_sinc_reset();
    }
  }

  // =========================================================================
  // Snapshot / Restore
  // =========================================================================

  private handleRequestSnapshot(): void {
    if (!this.wasm) {
      const emptyBuffer = new ArrayBuffer(0);
      this.port.postMessage(
        {
          type: 'snapshot',
          snapshotData: emptyBuffer,
          positionSamples: this.renderedSamples,
        } satisfies WorkletToMain.Snapshot,
        [emptyBuffer],
      );
      return;
    }

    const size = this.wasm.dsp_snapshot_size();
    const ptr = this.wasm.wasm_alloc(size);
    if (ptr === 0) {
      this.postError('AUDIO_WASM_TRAP', 'Failed to allocate snapshot buffer', {
        requestedSize: size,
      });
      return;
    }

    const written = this.wasm.dsp_snapshot(ptr);
    if (written === 0) {
      this.wasm.wasm_dealloc(ptr, size);
      this.postError('AUDIO_WASM_TRAP', 'dsp_snapshot returned 0 bytes', {});
      return;
    }

    // Copy snapshot out of WASM memory before dealloc.
    const wasmView = new Uint8Array(this.wasm.memory.buffer, ptr, written);
    const snapshotData = new ArrayBuffer(written);
    new Uint8Array(snapshotData).set(wasmView);
    this.wasm.wasm_dealloc(ptr, size);

    this.port.postMessage(
      {
        type: 'snapshot',
        snapshotData,
        positionSamples: this.renderedSamples,
      } satisfies WorkletToMain.Snapshot,
      [snapshotData],
    );
  }

  private handleRestoreSnapshot(msg: MainToWorklet.RestoreSnapshot): void {
    if (!this.wasm) return;

    const data = new Uint8Array(msg.snapshotData);
    if (data.byteLength > 0) {
      const ptr = this.wasm.wasm_alloc(data.byteLength);
      if (ptr === 0) {
        this.postError('AUDIO_WASM_TRAP', 'Failed to allocate restore buffer', {
          requestedSize: data.byteLength,
        });
        return;
      }

      const wasmMemory = new Uint8Array(this.wasm.memory.buffer);
      wasmMemory.set(data, ptr);

      const result = this.wasm.dsp_restore(ptr, data.byteLength);
      this.wasm.wasm_dealloc(ptr, data.byteLength);

      if (result !== 0) {
        this.postError(
          'AUDIO_WASM_TRAP',
          `dsp_restore failed with code ${result}`,
          { restoreResult: result },
        );
        return;
      }
    }

    if (msg.outputSampleRate > 0) {
      this.outputSampleRate = msg.outputSampleRate;
    }

    // Reset resampler state so stale fractional position and carry-over
    // samples from the old rate don't corrupt the first quantum.
    this.resampleFrac = 0;
    this.prevDspLeft = 0;
    this.prevDspRight = 0;
    if (this.resamplerMode === 1) {
      this.wasm.dsp_resample_sinc_reset();
    }
  }

  // =========================================================================
  // Fade gain ramp
  // =========================================================================

  /**
   * Apply linear fade gain ramp to the output buffers when playback
   * position has passed durationSamples.
   *
   * The fade is applied per-sample across the quantum. Each sample's
   * position is checked against the fade region bounds.
   */
  private applyFade(
    left: Float32Array,
    right: Float32Array,
    dspSamplesInQuantum: number,
  ): void {
    if (this.durationSamples === null) return;
    if (this.fadeOutSamples <= 0) return;

    // Sample position at the START of this quantum (before advancement).
    const quantumStartSample = this.renderedSamples - dspSamplesInQuantum;
    const fadeStart = this.durationSamples;
    const fadeEnd = this.durationSamples + this.fadeOutSamples;

    // If the entire quantum is before the fade region, no-op.
    if (this.renderedSamples <= fadeStart) return;

    // Apply per-sample gain across the quantum.
    for (let i = 0; i < QUANTUM_FRAMES; i++) {
      // Map output frame index to DSP sample position.
      // Linear interpolation: frame i corresponds to a proportional
      // position within the quantum's DSP sample range.
      const samplePos =
        quantumStartSample + (i / QUANTUM_FRAMES) * dspSamplesInQuantum;

      if (samplePos < fadeStart) {
        // Before fade — full volume, no modification.
        continue;
      }

      if (samplePos >= fadeEnd) {
        // Past fade — silence.
        left[i] = 0;
        right[i] = 0;
        continue;
      }

      // Within fade region — linear ramp from 1.0 → 0.0.
      const fadeProgress = (samplePos - fadeStart) / this.fadeOutSamples;
      const gain = 1.0 - fadeProgress;
      left[i] *= gain;
      right[i] *= gain;
    }
  }

  // =========================================================================
  // Playback state helpers
  // =========================================================================

  /** Check if playback has finished (past duration + fade). */
  private isPlaybackFinished(): boolean {
    if (this.durationSamples === null) return false;
    const endSample = this.durationSamples + this.fadeOutSamples;
    return this.renderedSamples >= endSample;
  }

  // =========================================================================
  // Telemetry
  // =========================================================================

  private emitTelemetry(left: Float32Array, right: Float32Array): void {
    this.generation++;

    const vuLeft = this.computePerVoiceVu('left');
    const vuRight = this.computePerVoiceVu('right');
    const masterVuLeft = this.computeRms(left);
    const masterVuRight = this.computeRms(right);
    const voices = this.readVoiceStates();
    const segment = this.computePlaybackSegment();

    // Read echo buffer data at a lower rate than VU meters.
    this.echoTelemetryCycle++;
    const includeEcho =
      this.wasm !== null &&
      this.echoTelemetryCycle >= SpcProcessor.ECHO_TELEMETRY_DIVISOR;

    let echoBuffer: ArrayBuffer | undefined;
    let firCoefficients: ArrayBuffer | undefined;
    const transferList: ArrayBuffer[] = [];

    if (includeEcho && this.wasm) {
      this.echoTelemetryCycle = 0;

      const echoPtr = this.wasm.dsp_get_echo_buffer_ptr();
      const echoLen = this.wasm.dsp_get_echo_buffer_length();

      if (echoPtr !== 0 && echoLen > 0) {
        // Copy echo buffer out of WASM linear memory (views are invalidated on memory growth).
        const echoView = new Int16Array(
          this.wasm.memory.buffer,
          echoPtr,
          echoLen,
        );
        echoBuffer = new ArrayBuffer(echoLen * 2);
        new Int16Array(echoBuffer).set(echoView);
        transferList.push(echoBuffer);
      }

      // Read FIR coefficients (8 bytes).
      if (this.firCoefficientsPtr !== 0) {
        this.wasm.dsp_get_fir_coefficients(this.firCoefficientsPtr);
        const firView = new Uint8Array(
          this.wasm.memory.buffer,
          this.firCoefficientsPtr,
          8,
        );
        firCoefficients = new ArrayBuffer(8);
        new Uint8Array(firCoefficients).set(firView);
      }
    }

    const msg: WorkletToMain.Telemetry = {
      type: 'telemetry',
      positionSamples: this.renderedSamples,
      vuLeft,
      vuRight,
      masterVuLeft,
      masterVuRight,
      voices,
      generation: this.generation,
      segment,
      echoBuffer,
      firCoefficients,
    };

    if (transferList.length > 0) {
      this.port.postMessage(msg, transferList);
    } else {
      this.postMessage(msg);
    }
  }

  /**
   * Compute per-voice VU levels.
   *
   * Currently returns a rough estimate by reading voice state from WASM.
   * The envelope level (0–2047) is normalized to [0, 1] as a proxy for
   * VU. A more accurate implementation would read per-voice PCM output
   * from the DSP — this requires additional WASM exports in a future update.
   */
  private computePerVoiceVu(
    _channel: 'left' | 'right',
  ): readonly [number, number, number, number, number, number, number, number] {
    if (!this.wasm) {
      return [0, 0, 0, 0, 0, 0, 0, 0];
    }

    const levels: number[] = [];
    // Use the pre-allocated voice state buffer (6 × u32).
    // dsp_get_voice_state writes: [envelopePhase, envelopeLevel, pitch, sampleSource, keyOn, active]
    for (let i = 0; i < VOICE_COUNT; i++) {
      this.wasm.dsp_get_voice_state(i, this.voiceStatePtr);
      const stateView = new Uint32Array(
        this.wasm.memory.buffer,
        this.voiceStatePtr,
        6,
      );
      const envelopeLevel = stateView[1];
      // Normalize 11-bit envelope (0–2047) to [0, 1].
      levels.push(envelopeLevel / 2047);
    }

    return levels as unknown as readonly [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
  }

  /** Compute RMS level from a buffer, scaled to [0, 1]. */
  private computeRms(buffer: Float32Array): number {
    let sum = 0;
    for (const sample of buffer) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
  }

  /** Read per-voice state from WASM for telemetry. */
  private readVoiceStates(): readonly VoiceState[] {
    if (!this.wasm) return [];

    const voices: VoiceState[] = [];

    const envelopePhases: VoiceState['envelopePhase'][] = [
      'attack',
      'decay',
      'sustain',
      'release',
      'silent',
    ];

    for (let i = 0; i < VOICE_COUNT; i++) {
      this.wasm.dsp_get_voice_state(i, this.voiceStatePtr);
      const stateView = new Uint32Array(
        this.wasm.memory.buffer,
        this.voiceStatePtr,
        6,
      );

      voices.push({
        index: i,
        envelopePhase: envelopePhases[stateView[0]] ?? 'silent',
        envelopeLevel: stateView[1],
        pitch: stateView[2],
        sampleSource: stateView[3],
        keyOn: stateView[4] !== 0,
        active: stateView[5] !== 0,
      });
    }

    return voices;
  }

  // =========================================================================
  // PlaybackSegment calculation
  // =========================================================================

  /**
   * Determine which structural segment of the track is currently playing.
   *
   * @see docs/design/loop-playback.md §4.4
   */
  private computePlaybackSegment(): PlaybackSegment | null {
    if (!this.structure) return null;

    const { introSamples, loopSamples, endSamples } = this.structure;
    const pos = this.renderedSamples;

    // Fade phase — past durationSamples.
    if (this.durationSamples !== null && pos >= this.durationSamples) {
      return {
        phase: 'fade',
        currentLoop: null,
        totalLoops: this.loopCount,
      };
    }

    // Intro phase.
    if (pos < introSamples) {
      return {
        phase: 'intro',
        currentLoop: null,
        totalLoops: this.loopCount,
      };
    }

    // Loop phase — determine which iteration.
    if (loopSamples > 0) {
      const posInLoopRegion = pos - introSamples;
      const totalLoopDuration =
        this.loopCount !== null ? loopSamples * this.loopCount : Infinity;

      if (posInLoopRegion < totalLoopDuration) {
        // Currently in a loop iteration (1-based).
        const currentLoop = Math.floor(posInLoopRegion / loopSamples) + 1;
        return {
          phase: 'loop',
          currentLoop,
          totalLoops: this.loopCount,
        };
      }
    }

    // End phase — past all loops, before fade.
    if (endSamples > 0) {
      return {
        phase: 'end',
        currentLoop: null,
        totalLoops: this.loopCount,
      };
    }

    // Fallback: if no end section, still pre-fade.
    return {
      phase: 'end',
      currentLoop: null,
      totalLoops: this.loopCount,
    };
  }

  // =========================================================================
  // Error handling
  // =========================================================================

  private handleRenderError(errorCode: number): void {
    this.consecutiveRenderFailures++;

    if (this.consecutiveRenderFailures >= MAX_CONSECUTIVE_RENDER_FAILURES) {
      this.postError(
        'AUDIO_RENDER_OVERRUN_CRITICAL',
        `${this.consecutiveRenderFailures} consecutive render failures; disabling render`,
        {
          wasmErrorCode: errorCode,
          consecutiveFailures: this.consecutiveRenderFailures,
        },
      );
      this.renderDisabled = true;
      this.isPlaying = false;
      return;
    }

    this.postError(
      'AUDIO_WASM_RENDER_ERROR',
      `dsp_render returned error code ${errorCode}`,
      {
        wasmErrorCode: errorCode,
        consecutiveFailures: this.consecutiveRenderFailures,
      },
    );
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private fillSilence(left: Float32Array, right: Float32Array): void {
    left.fill(0);
    right.fill(0);
  }

  private postMessage(msg: WorkletToMain): void {
    this.port.postMessage(msg);
  }

  private postError(
    code: WorkletErrorCode,
    message: string,
    context: Record<string, unknown>,
  ): void {
    this.postMessage({ type: 'error', code, message, context });
  }
}

registerProcessor('spc-processor', SpcProcessor);
