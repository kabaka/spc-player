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

import type { DspCheckpoint } from './checkpoint-utils';
import { findNearestCheckpoint, validateCheckpoint } from './checkpoint-utils';
import type { DspExports } from './dsp-exports';
import type {
  MainToWorklet,
  PlaybackSegment,
  SampleEntry,
  VoiceState,
  WorkletErrorCode,
  WorkletToMain,
} from './worker-protocol';

// PROTOCOL_VERSION is a const — duplicated here because runtime imports
// from the main bundle are forbidden in AudioWorklet context.
const PROTOCOL_VERSION = 2;

/** Whether the `performance` timing API is available in this context. */
const hasPerformanceApi =
  typeof performance !== 'undefined' && typeof performance.now === 'function';

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

  // -- Instrument mode (render DSP while paused for note playback) ----------
  private instrumentModeActive = false;
  private instrumentSnapshot: ArrayBuffer | null = null;
  private instrumentSrcn = 0;
  private instrumentVoices: {
    active: boolean;
    midiNote: number;
    releasing: boolean;
  }[] = Array.from({ length: 8 }, () => ({
    active: false,
    midiNote: -1,
    releasing: false,
  }));
  private instrumentGain = 0x7f;
  private instrumentPitchOffset = 0;
  private pendingKoffMask = 0;
  private pendingNoteOns: { voice: number; pitch: number }[] = [];

  // -- Voice state buffer (pre-allocated for telemetry) ---------------------
  private voiceStatePtr = 0;

  // -- FIR coefficient buffer (pre-allocated, 8 bytes) ----------------------
  private firCoefficientsPtr = 0;

  // -- Echo telemetry rate (send every N telemetry cycles) ------------------
  private echoTelemetryCycle = 0;
  private static readonly ECHO_TELEMETRY_DIVISOR = 4;

  // -- DSP/CPU register telemetry buffers (D9, pre-allocated in WASM) ------
  private dspRegistersPtr = 0;
  private cpuRegistersPtr = 0;

  // -- RAM telemetry rate (send every Nth telemetry cycle, ~10 Hz) (D10) ---
  private ramTelemetryCycle = 0;
  private static readonly RAM_TELEMETRY_DIVISOR = 6;

  // -- Worklet processing load measurement (D15) ---------------------------
  private processLoadEma = 0;
  private peakLoadPercent = 0;
  private totalUnderruns = 0;

  // -- Audio stats emission (~1 Hz) (D16) ----------------------------------
  private quantaSinceLastStats = 0;
  private static readonly STATS_QUANTA_INTERVAL = 375; // ~1 Hz at 48 kHz (375 × 128/48000 ≈ 1s)

  // -- Pre-allocated telemetry voice state objects (avoid GC pressure) ------
  private readonly telemetryVoices: {
    -readonly [K in keyof VoiceState]: VoiceState[K];
  }[] = Array.from({ length: VOICE_COUNT }, (_, i) => ({
    index: i,
    envelopePhase: 'silent' as VoiceState['envelopePhase'],
    envelopeLevel: 0,
    pitch: 0,
    sampleSource: 0,
    keyOn: false,
    active: false,
  }));
  private readonly telemetryVuLeft: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ] = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly telemetryVuRight: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ] = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly telemetryStereoLeft: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ] = [0, 0, 0, 0, 0, 0, 0, 0];
  private readonly telemetryStereoRight: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ] = [0, 0, 0, 0, 0, 0, 0, 0];

  // -- Init queuing -----------------------------------------------------------
  private initPromise: Promise<void> | null = null;
  private pendingMessages: MainToWorklet[] = [];

  // -- Checkpoint store (§1.1–1.3 of audio-engine-plan) ---------------------
  private checkpointStore = {
    checkpoints: [] as DspCheckpoint[],
    intervalSamples: 5 * DSP_SAMPLE_RATE, // 160,000 samples (5s)
    maxCheckpoints: 120,
    nextCapturePosition: 5 * DSP_SAMPLE_RATE,
    maxCheckpointBytes: 8 * 1024 * 1024,
    checkpointBytes: 0,
  };

  // -- Voice mask tracking --------------------------------------------------
  private voiceMask = 0xff;

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

    // If not playing (and not in instrument mode), no WASM, or rendering
    // has been disabled due to repeated failures, fill with silence.
    const shouldRender = this.isPlaying || this.instrumentModeActive;
    if (!shouldRender || !this.wasm || this.renderDisabled) {
      this.fillSilence(left, right);
      return true;
    }

    // Check if playback has already finished (past duration + fade).
    // Skipped in instrument-mode-only rendering (no timed playback).
    if (this.isPlaying && this.isPlaybackFinished()) {
      this.fillSilence(left, right);
      return true;
    }

    try {
      // Flush deferred KOFF/KON writes before rendering (polyphonic instrument mode).
      this.flushPendingInstrumentWrites();

      // D15: Measure processing time for load calculation.
      const processStart = hasPerformanceApi ? performance.now() : 0;

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

      // Playback-specific tracking: position, checkpoints, fade, end detection.
      // Skipped in instrument-mode-only rendering (paused but rendering for notes).
      if (this.isPlaying) {
        // Track position in DSP sample domain (32kHz) for seek/duration.
        this.renderedSamples += intAdvance;

        // Capture a checkpoint if we've passed the next capture position.
        if (this.renderedSamples >= this.checkpointStore.nextCapturePosition) {
          this.captureCheckpoint(this.renderedSamples);
          this.checkpointStore.nextCapturePosition +=
            this.checkpointStore.intervalSamples;
        }

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

      // D15: Update process load measurement (EMA, alpha ≈ 0.1).
      if (hasPerformanceApi) {
        const processElapsed = performance.now() - processStart;
        const quantumMs = (QUANTUM_FRAMES / this.outputSampleRate) * 1000;
        const loadPercent = (processElapsed / quantumMs) * 100;
        this.processLoadEma = this.processLoadEma * 0.9 + loadPercent * 0.1;
        if (this.processLoadEma > this.peakLoadPercent) {
          this.peakLoadPercent = this.processLoadEma;
        }
        if (processElapsed > quantumMs) {
          this.totalUnderruns++;
        }
      }

      // D16: Emit audio stats at ~1 Hz.
      this.quantaSinceLastStats++;
      if (this.quantaSinceLastStats >= SpcProcessor.STATS_QUANTA_INTERVAL) {
        this.quantaSinceLastStats = 0;
        this.emitAudioStats();
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
        // Exit instrument mode before resuming playback
        if (this.instrumentModeActive) {
          this.handleExitInstrumentMode();
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
        this.voiceMask = msg.mask;
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
        if (this.wasm && msg.voice >= 0 && msg.voice <= 7) {
          const clampedPitch = Math.max(0, Math.min(0x3fff, msg.pitch));
          this.wasm.dsp_voice_note_on(msg.voice, clampedPitch);
        }
        break;
      case 'note-off':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        if (this.wasm && msg.voice >= 0 && msg.voice <= 7) {
          this.wasm.dsp_voice_note_off(msg.voice);
        }
        break;
      case 'set-checkpoint-config':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleSetCheckpointConfig(msg);
        break;
      case 'import-checkpoints':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleImportCheckpoints(msg);
        break;
      case 'enter-instrument-mode':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleEnterInstrumentMode();
        break;
      case 'exit-instrument-mode':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleExitInstrumentMode();
        break;
      case 'request-sample-catalog':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleRequestSampleCatalog();
        break;
      case 'set-instrument-sample':
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.handleSetInstrumentSample(msg);
        break;
      case 'instrument-note-on': {
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        if (!this.instrumentModeActive || !this.wasm) break;
        const { midiNote: onMidiNote, pitch: onPitch } = msg;

        // Check for duplicate — skip if already playing this note
        let isDuplicate = false;
        for (const slot of this.instrumentVoices) {
          if (slot.active && !slot.releasing && slot.midiNote === onMidiNote) {
            isDuplicate = true;
            break;
          }
        }
        if (isDuplicate) break;

        // Find free voice
        let freeVoice = -1;
        for (let i = 0; i < 8; i++) {
          if (!this.instrumentVoices[i].active) {
            freeVoice = i;
            break;
          }
        }

        // Drop if all voices in use
        if (freeVoice === -1) break;

        // Set per-voice registers (safe to write immediately — not global)
        const onVBase = freeVoice * 0x10;
        this.wasm.dsp_set_register(onVBase + 0x04, this.instrumentSrcn);
        this.wasm.dsp_set_register(onVBase + 0x00, this.instrumentGain);
        this.wasm.dsp_set_register(onVBase + 0x01, this.instrumentGain);

        // Cancel any pending KOFF for this voice (retrigger case)
        this.pendingKoffMask &= ~(1 << freeVoice);

        // Queue KON (deferred to process pre-render)
        this.pendingNoteOns.push({ voice: freeVoice, pitch: onPitch });

        // Track state
        this.instrumentVoices[freeVoice] = {
          active: true,
          midiNote: onMidiNote,
          releasing: false,
        };
        break;
      }
      case 'instrument-note-off': {
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        if (!this.instrumentModeActive) break;
        const { midiNote: offMidiNote } = msg;

        for (let i = 0; i < 8; i++) {
          const slot = this.instrumentVoices[i];
          if (slot.active && !slot.releasing && slot.midiNote === offMidiNote) {
            // Accumulate into KOFF bitmask (deferred)
            this.pendingKoffMask |= 1 << i;
            slot.releasing = true;
            slot.active = false; // Voice slot is now free for reuse
            break; // Only release one voice per note-off
          }
        }
        break;
      }
      case 'instrument-set-gain': {
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.instrumentGain = Math.max(0, Math.min(127, msg.gain));
        if (this.instrumentModeActive && this.wasm) {
          for (let v = 0; v < 8; v++) {
            this.wasm.dsp_set_register(v * 0x10 + 0x00, this.instrumentGain);
            this.wasm.dsp_set_register(v * 0x10 + 0x01, this.instrumentGain);
          }
        }
        break;
      }
      case 'instrument-set-pitch-offset': {
        if (this.initPromise !== null && this.wasm === null) {
          this.pendingMessages.push(msg);
          return;
        }
        this.instrumentPitchOffset = msg.semitones;
        if (this.instrumentModeActive && this.wasm) {
          for (let v = 0; v < 8; v++) {
            const slot = this.instrumentVoices[v];
            if (!slot.active || slot.releasing) continue;
            const adjustedMidi = slot.midiNote + this.instrumentPitchOffset;
            const newPitch = Math.round(
              0x1000 * Math.pow(2, (adjustedMidi - 60) / 12),
            );
            const clamped = Math.max(0, Math.min(0x3fff, newPitch));
            this.wasm.dsp_set_register(v * 0x10 + 0x02, clamped & 0xff);
            this.wasm.dsp_set_register(v * 0x10 + 0x03, (clamped >> 8) & 0x3f);
          }
        }
        break;
      }
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
      this.dspRegistersPtr = exports.wasm_alloc(128);
      this.cpuRegistersPtr = exports.wasm_alloc(8);
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

      // Re-allocate DSP/CPU register buffers after reset (D9).
      if (this.dspRegistersPtr !== 0 && this.wasm) {
        this.wasm.wasm_dealloc(this.dspRegistersPtr, 128);
      }
      this.dspRegistersPtr = this.wasm.wasm_alloc(128);
      if (this.cpuRegistersPtr !== 0 && this.wasm) {
        this.wasm.wasm_dealloc(this.cpuRegistersPtr, 8);
      }
      this.cpuRegistersPtr = this.wasm.wasm_alloc(8);

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

      // Reset load/underrun counters for new track (D15).
      this.processLoadEma = 0;
      this.peakLoadPercent = 0;
      this.totalUnderruns = 0;
      this.quantaSinceLastStats = 0;

      // Clear checkpoints — they belong to the previous track.
      this.checkpointStore.checkpoints.length = 0;
      this.checkpointStore.checkpointBytes = 0;
      this.checkpointStore.nextCapturePosition =
        this.checkpointStore.intervalSamples;

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
      // Seek to beginning: reset the DSP but preserve checkpoints
      // (they remain valid for the same track).
      this.renderedSamples = 0;
      this.resampleFrac = 0;
      this.prevDspLeft = 0;
      this.prevDspRight = 0;
      this.wasm.dsp_reset();
      this.checkpointStore.nextCapturePosition =
        this.checkpointStore.intervalSamples;
      return;
    }

    try {
      if (targetPosition < this.renderedSamples) {
        // Backward seek — find nearest prior checkpoint.
        const snapshotSize = this.wasm.dsp_snapshot_size();
        const checkpoint = findNearestCheckpoint(
          this.checkpointStore.checkpoints,
          targetPosition,
        );

        if (
          checkpoint &&
          validateCheckpoint(checkpoint.stateData, snapshotSize)
        ) {
          // Restore from checkpoint. On failure, fall back to reset.
          if (this.restoreCheckpoint(checkpoint.stateData)) {
            this.renderedSamples = checkpoint.positionSamples;
          } else {
            this.renderedSamples = 0;
          }
        } else {
          // No valid checkpoint — fall back to reset + skip.
          this.wasm.dsp_reset();
          this.renderedSamples = 0;
        }
      } else {
        // Forward seek — check if a checkpoint closer to the target exists.
        // Only use it if skipping saves > 1 second of DSP rendering.
        const FORWARD_CHECKPOINT_THRESHOLD = DSP_SAMPLE_RATE; // 32000 samples = 1s
        const samplesWithoutCheckpoint = targetPosition - this.renderedSamples;

        if (samplesWithoutCheckpoint > FORWARD_CHECKPOINT_THRESHOLD) {
          const snapshotSize = this.wasm.dsp_snapshot_size();
          const checkpoint = findNearestCheckpoint(
            this.checkpointStore.checkpoints,
            targetPosition,
          );

          if (
            checkpoint &&
            checkpoint.positionSamples > this.renderedSamples &&
            validateCheckpoint(checkpoint.stateData, snapshotSize)
          ) {
            const samplesWithCheckpoint =
              targetPosition - checkpoint.positionSamples;
            const samplesSaved =
              samplesWithoutCheckpoint - samplesWithCheckpoint;

            if (samplesSaved > FORWARD_CHECKPOINT_THRESHOLD) {
              if (this.restoreCheckpoint(checkpoint.stateData)) {
                this.renderedSamples = checkpoint.positionSamples;
              }
              // On restore failure, fall through to render from current position.
            }
          }
        }
      }

      const samplesToSkip = targetPosition - this.renderedSamples;

      // Muting strategy adapted from GME's Music_Emu::skip_():
      // For long seeks (>30k samples ≈ 0.94s at 32kHz), mute all voices
      // during the bulk of the skip to reduce DSP work (BRR decode, ADSR,
      // Gaussian interpolation are bypassed). The last MUTE_THRESHOLD/2
      // samples are rendered with voices restored so echo, ADSR envelopes,
      // and other DSP state converge to correct values before audible output.
      const MUTE_THRESHOLD = 30_000;

      if (samplesToSkip > MUTE_THRESHOLD) {
        const savedMask = this.voiceMask;
        this.wasm.dsp_set_voice_mask(0x00);

        // Skip in large chunks while muted (fewer WASM calls).
        let remaining = samplesToSkip - Math.floor(MUTE_THRESHOLD / 2);
        while (remaining > 0) {
          const chunk = Math.min(remaining, MAX_DSP_FRAMES_PER_QUANTUM);
          const result = this.wasm.dsp_render(this.outputPtr, chunk);
          if (result < 0) {
            this.wasm.dsp_set_voice_mask(savedMask);
            this.postError(
              'AUDIO_WASM_RENDER_ERROR',
              `dsp_render failed during muted seek with code ${result}`,
              { wasmErrorCode: result, seekTarget: targetPosition },
            );
            return;
          }
          remaining -= chunk;
        }

        // Restore voice mask and render the tail unmuted so DSP state
        // (echo buffer, ADSR envelopes) converges before audible output.
        this.wasm.dsp_set_voice_mask(savedMask);

        remaining = Math.floor(MUTE_THRESHOLD / 2);
        while (remaining > 0) {
          const chunk = Math.min(remaining, MAX_DSP_FRAMES_PER_QUANTUM);
          const result = this.wasm.dsp_render(this.outputPtr, chunk);
          if (result < 0) {
            this.postError(
              'AUDIO_WASM_RENDER_ERROR',
              `dsp_render failed during seek convergence with code ${result}`,
              { wasmErrorCode: result, seekTarget: targetPosition },
            );
            return;
          }
          remaining -= chunk;
        }
      } else if (samplesToSkip > 0) {
        // Short seek — render normally in larger chunks for efficiency.
        let remaining = samplesToSkip;
        while (remaining > 0) {
          const chunk = Math.min(remaining, MAX_DSP_FRAMES_PER_QUANTUM);
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
  // Checkpoint capture and restore (§1.2–1.10 of audio-engine-plan)
  // =========================================================================

  /**
   * Capture a DSP state snapshot at the current playback position.
   * Called during process() when renderedSamples crosses the next capture position.
   */
  private captureCheckpoint(position: number): void {
    if (!this.wasm) return;
    if (
      this.checkpointStore.checkpoints.length >=
      this.checkpointStore.maxCheckpoints
    ) {
      return;
    }

    const size = this.wasm.dsp_snapshot_size();
    if (
      this.checkpointStore.checkpointBytes + size >
      this.checkpointStore.maxCheckpointBytes
    ) {
      return;
    }

    const ptr = this.wasm.wasm_alloc(size);
    if (ptr === 0) return;

    const written = this.wasm.dsp_snapshot(ptr);
    if (written === 0) {
      this.wasm.wasm_dealloc(ptr, size);
      return;
    }

    const stateData = new ArrayBuffer(written);
    new Uint8Array(stateData).set(
      new Uint8Array(this.wasm.memory.buffer, ptr, written),
    );
    this.wasm.wasm_dealloc(ptr, size);

    this.checkpointStore.checkpoints.push({
      positionSamples: position,
      stateData,
    });
    this.checkpointStore.checkpointBytes += stateData.byteLength;
  }

  /**
   * Restore DSP state from a validated checkpoint's stateData buffer.
   * On failure, resets the DSP to a known good state and returns false.
   */
  private restoreCheckpoint(stateData: ArrayBuffer): boolean {
    if (!this.wasm) return false;

    const data = new Uint8Array(stateData);
    const ptr = this.wasm.wasm_alloc(data.byteLength);
    if (ptr === 0) return false;

    const wasmMemory = new Uint8Array(this.wasm.memory.buffer);
    wasmMemory.set(data, ptr);

    const result = this.wasm.dsp_restore(ptr, data.byteLength);
    this.wasm.wasm_dealloc(ptr, data.byteLength);

    if (result !== 0) {
      this.postError(
        'AUDIO_WASM_TRAP',
        `dsp_restore from checkpoint failed with code ${result}`,
        { restoreResult: result },
      );
      // Put DSP in a known good state so the seek handler can
      // fall back to the reset-and-render-forward path.
      this.wasm.dsp_reset();
      return false;
    }
    return true;
  }

  /**
   * Handle set-checkpoint-config: update interval/max and clear existing checkpoints.
   */
  private handleSetCheckpointConfig(
    msg: MainToWorklet.SetCheckpointConfig,
  ): void {
    this.checkpointStore.intervalSamples = msg.intervalSamples;
    this.checkpointStore.maxCheckpoints = msg.maxCheckpoints;
    this.checkpointStore.checkpoints.length = 0;
    this.checkpointStore.checkpointBytes = 0;
    this.checkpointStore.nextCapturePosition =
      this.renderedSamples + msg.intervalSamples;
  }

  /**
   * Handle import-checkpoints: merge pre-computed checkpoints into the store.
   * Each checkpoint is validated before insertion.
   */
  private handleImportCheckpoints(msg: MainToWorklet.ImportCheckpoints): void {
    if (!this.wasm) return;
    if (!Array.isArray(msg.checkpoints)) return;

    const snapshotSize = this.wasm.dsp_snapshot_size();

    for (const cp of msg.checkpoints) {
      if (
        this.checkpointStore.checkpoints.length >=
        this.checkpointStore.maxCheckpoints
      ) {
        break;
      }
      if (
        typeof cp.positionSamples !== 'number' ||
        !(cp.stateData instanceof ArrayBuffer)
      ) {
        continue;
      }
      if (!validateCheckpoint(cp.stateData, snapshotSize)) continue;
      if (
        this.checkpointStore.checkpointBytes + cp.stateData.byteLength >
        this.checkpointStore.maxCheckpointBytes
      ) {
        break;
      }

      this.checkpointStore.checkpoints.push({
        positionSamples: cp.positionSamples,
        stateData: cp.stateData,
      });
      this.checkpointStore.checkpointBytes += cp.stateData.byteLength;
    }

    // Re-sort by position to maintain binary search invariant.
    this.checkpointStore.checkpoints.sort(
      (a, b) => a.positionSamples - b.positionSamples,
    );

    // Update nextCapturePosition to avoid re-capturing already-covered positions.
    const last =
      this.checkpointStore.checkpoints[
        this.checkpointStore.checkpoints.length - 1
      ];
    if (last) {
      const nextFromLast =
        last.positionSamples + this.checkpointStore.intervalSamples;
      if (nextFromLast > this.checkpointStore.nextCapturePosition) {
        this.checkpointStore.nextCapturePosition = nextFromLast;
      }
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
  // Deferred KOFF/KON flush for polyphonic instrument mode
  // =========================================================================

  private flushPendingInstrumentWrites(): void {
    if (!this.instrumentModeActive || !this.wasm) return;
    if (this.pendingKoffMask === 0 && this.pendingNoteOns.length === 0) return;

    // Compute KON bitmask
    let konMask = 0;
    for (const noteOn of this.pendingNoteOns) {
      konMask |= 1 << noteOn.voice;
    }

    // Write KOFF: only for voices that are being released AND not re-triggered
    const koffToWrite = this.pendingKoffMask & ~konMask;
    this.wasm.dsp_set_register(0x5c, koffToWrite);
    this.pendingKoffMask = 0;

    // Trigger all pending KONs (apply current pitch offset)
    for (const noteOn of this.pendingNoteOns) {
      const slot = this.instrumentVoices[noteOn.voice];
      const adjustedMidi = slot.midiNote + this.instrumentPitchOffset;
      const adjustedPitch = Math.round(
        0x1000 * Math.pow(2, (adjustedMidi - 60) / 12),
      );
      const clamped = Math.max(0, Math.min(0x3fff, adjustedPitch));
      this.wasm.dsp_voice_note_on(noteOn.voice, clamped);
    }
    this.pendingNoteOns.length = 0;
  }

  // =========================================================================
  // Instrument mode
  // =========================================================================

  /** Maximum BRR blocks to walk per sample during catalog enumeration. */
  private static readonly MAX_BRR_BLOCKS_PER_SAMPLE = 1024;

  /** IPL ROM region start — sample data must not extend into this range. */
  private static readonly IPL_ROM_START = 0xffc0;

  private handleEnterInstrumentMode(): void {
    if (!this.wasm) return;

    if (this.isPlaying) {
      this.postError(
        'AUDIO_WASM_TRAP',
        'Cannot enter instrument mode while playing',
        {},
      );
      return;
    }

    if (this.instrumentModeActive) return;

    // 1. Capture DSP snapshot for later restoration
    const size = this.wasm.dsp_snapshot_size();
    const snapshotPtr = this.wasm.wasm_alloc(size);
    if (snapshotPtr === 0) {
      this.postError('AUDIO_WASM_TRAP', 'Failed to allocate snapshot buffer', {
        requestedSize: size,
      });
      return;
    }

    const written = this.wasm.dsp_snapshot(snapshotPtr);
    if (written === 0) {
      this.wasm.wasm_dealloc(snapshotPtr, size);
      this.postError('AUDIO_WASM_TRAP', 'dsp_snapshot returned 0 bytes', {});
      return;
    }

    // Copy snapshot out of WASM memory before dealloc
    const snapshotView = new Uint8Array(
      this.wasm.memory.buffer,
      snapshotPtr,
      written,
    );
    this.instrumentSnapshot = new ArrayBuffer(written);
    new Uint8Array(this.instrumentSnapshot).set(snapshotView);
    this.wasm.wasm_dealloc(snapshotPtr, size);

    // 2. Halt SPC700 CPU by writing idle loop (BRA $FE) at current PC.
    //    This prevents the sound driver from overwriting DSP registers.
    const cpuRegsPtr = this.wasm.wasm_alloc(8);
    this.wasm.dsp_get_cpu_registers(cpuRegsPtr);
    // Re-acquire view after potential memory growth from wasm_alloc
    // Register layout: [PC_lo, PC_hi, A, X, Y, SP, PSW, pad]
    const cpuRegs = new Uint8Array(this.wasm.memory.buffer, cpuRegsPtr, 8);
    const pc = cpuRegs[0] | (cpuRegs[1] << 8);
    this.wasm.wasm_dealloc(cpuRegsPtr, 8);

    // Reject if PC is in the IPL ROM region (0xFFC0-0xFFFF) or would overflow
    if (pc >= SpcProcessor.IPL_ROM_START) {
      this.postError(
        'AUDIO_WASM_TRAP',
        'Cannot enter instrument mode: SPC700 PC is in IPL ROM region',
        { pc },
      );
      return;
    }

    const ramBase = this.wasm.dsp_get_ram_ptr();
    const mem = new Uint8Array(this.wasm.memory.buffer);
    mem[ramBase + pc] = 0x2f; // BRA opcode
    mem[ramBase + pc + 1] = 0xfe; // offset -2 (branch to self)

    // 3. Configure all 8 voices for instrument playback
    // Key off ALL voices to silence residual game audio
    this.wasm.dsp_set_register(0x5c, 0xff); // KOFF all 8 voices
    for (let v = 0; v < 8; v++) {
      const vBase = v * 0x10;
      this.wasm.dsp_set_register(vBase + 0x00, this.instrumentGain); // VOLL
      this.wasm.dsp_set_register(vBase + 0x01, this.instrumentGain); // VOLR
      this.wasm.dsp_set_register(vBase + 0x05, 0xff); // ADSR1: enabled, attack=15, decay=7
      this.wasm.dsp_set_register(vBase + 0x06, 0xe0); // ADSR2: sustain=7, release=0
      this.wasm.dsp_set_register(vBase + 0x04, this.instrumentSrcn); // SRCN
    }

    // Clear EON, NON, PMON for ALL voices
    this.wasm.dsp_set_register(0x4d, 0x00); // EON
    this.wasm.dsp_set_register(0x3d, 0x00); // NON
    this.wasm.dsp_set_register(0x2d, 0x00); // PMON

    // Ensure master volume is audible (some games set MVOL to 0 before starting)
    if (this.wasm.dsp_get_register(0x0c) === 0) {
      this.wasm.dsp_set_register(0x0c, 0x7f); // MVOLL
    }
    if (this.wasm.dsp_get_register(0x1c) === 0) {
      this.wasm.dsp_set_register(0x1c, 0x7f); // MVOLR
    }

    // Clear mute and soft reset flags in FLG register
    const flg = this.wasm.dsp_get_register(0x6c);
    if (flg & 0xc0) {
      this.wasm.dsp_set_register(0x6c, flg & 0x3f);
    }

    // 4. Reset voice allocation state
    for (const slot of this.instrumentVoices) {
      slot.active = false;
      slot.midiNote = -1;
      slot.releasing = false;
    }
    this.pendingKoffMask = 0;
    this.pendingNoteOns = [];

    // 5. Activate instrument mode
    this.instrumentModeActive = true;
    this.postMessage({ type: 'instrument-mode-changed', active: true });
  }

  private handleExitInstrumentMode(): void {
    if (!this.wasm || !this.instrumentModeActive) return;

    // 1. Release ALL active voices via KOFF bitmask
    let koffMask = 0;
    for (let v = 0; v < 8; v++) {
      if (this.instrumentVoices[v].active) {
        koffMask |= 1 << v;
        this.instrumentVoices[v].active = false;
      }
    }
    if (koffMask !== 0) {
      this.wasm.dsp_set_register(0x5c, koffMask);
    }
    // Clear pending operations
    this.pendingKoffMask = 0;
    this.pendingNoteOns = [];

    // 2. Restore DSP snapshot (includes original RAM bytes at PC)
    if (this.instrumentSnapshot) {
      const data = new Uint8Array(this.instrumentSnapshot);
      const ptr = this.wasm.wasm_alloc(data.byteLength);
      if (ptr !== 0) {
        const wasmMemory = new Uint8Array(this.wasm.memory.buffer);
        wasmMemory.set(data, ptr);
        this.wasm.dsp_restore(ptr, data.byteLength);
        this.wasm.wasm_dealloc(ptr, data.byteLength);
      }
      this.instrumentSnapshot = null;
    }

    // 3. Deactivate instrument mode
    this.instrumentModeActive = false;
    this.postMessage({ type: 'instrument-mode-changed', active: false });
  }

  private handleRequestSampleCatalog(): void {
    if (!this.wasm) return;

    const dirBase = this.wasm.dsp_get_register(0x5d) * 0x100;
    const ramBase = this.wasm.dsp_get_ram_ptr();
    const mem = new Uint8Array(this.wasm.memory.buffer);

    const samples: SampleEntry[] = [];
    const seenAddresses = new Set<number>();

    for (let srcn = 0; srcn < 256; srcn++) {
      const entryOffset = dirBase + srcn * 4;

      // Bounds check: directory entry must fit within 64 KB RAM
      if (entryOffset + 4 > 65536) break;

      const startLo = mem[ramBase + entryOffset];
      const startHi = mem[ramBase + entryOffset + 1];
      const loopLo = mem[ramBase + entryOffset + 2];
      const loopHi = mem[ramBase + entryOffset + 3];

      const startAddress = startLo | (startHi << 8);
      const loopAddress = loopLo | (loopHi << 8);

      // Skip invalid entries: must be before IPL ROM region and
      // must have room for at least one 9-byte BRR block
      if (startAddress >= SpcProcessor.IPL_ROM_START) continue;
      if (startAddress + 9 > 65536) continue;

      // Deduplicate by start address (keep all SRCNs, skip re-walking BRR)
      if (seenAddresses.has(startAddress)) {
        // Find the existing entry and add as a duplicate SRCN reference.
        // For simplicity, include duplicate as a separate entry pointing
        // to the same data — the UI can deduplicate by startAddress.
        const existing = samples.find((s) => s.startAddress === startAddress);
        if (existing) {
          samples.push({
            srcn,
            startAddress: existing.startAddress,
            loopAddress,
            lengthBytes: existing.lengthBytes,
            blockCount: existing.blockCount,
            loops: existing.loops,
          });
        }
        continue;
      }

      // Walk BRR blocks to determine sample length and loop status
      let addr = startAddress;
      let blockCount = 0;
      let loops = false;

      while (
        blockCount < SpcProcessor.MAX_BRR_BLOCKS_PER_SAMPLE &&
        addr < SpcProcessor.IPL_ROM_START
      ) {
        const header = mem[ramBase + addr];
        blockCount++;

        const isEnd = (header & 0x01) !== 0;
        const isLoop = (header & 0x02) !== 0;

        if (isEnd) {
          loops = isLoop;
          break;
        }

        addr += 9;
      }

      if (blockCount === 0) continue;

      seenAddresses.add(startAddress);

      samples.push({
        srcn,
        startAddress,
        loopAddress,
        lengthBytes: blockCount * 9,
        blockCount,
        loops,
      });
    }

    this.postMessage({ type: 'sample-catalog', samples });
  }

  private handleSetInstrumentSample(
    msg: MainToWorklet.SetInstrumentSample,
  ): void {
    this.instrumentSrcn = msg.srcn & 0xff;
    if (this.instrumentModeActive && this.wasm) {
      for (let v = 0; v < 8; v++) {
        this.wasm.dsp_set_register(v * 0x10 + 0x04, this.instrumentSrcn);
      }
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

    // Populate DSP register buffer before VU read (stereo VU needs VOL_L/VOL_R).
    if (this.wasm && this.dspRegistersPtr !== 0) {
      this.wasm.dsp_get_registers(this.dspRegistersPtr);
    }

    this.readVoiceStatesAndVu();
    const masterVuLeft = this.computeRms(left);
    const masterVuRight = this.computeRms(right);
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
        // echoLen is in bytes; convert to Int16 element count.
        const echoElementCount = echoLen >>> 1;
        const echoView = new Int16Array(
          this.wasm.memory.buffer,
          echoPtr,
          echoElementCount,
        );
        echoBuffer = new ArrayBuffer(echoLen);
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

    // D9: Read DSP registers (128 bytes) and CPU registers (8 bytes) every telemetry cycle.
    let dspRegisters: ArrayBuffer | undefined;
    let cpuRegisters: ArrayBuffer | undefined;

    if (this.wasm && this.dspRegistersPtr !== 0) {
      // dsp_get_registers already called above (before readVoiceStatesAndVu).
      const dspView = new Uint8Array(
        this.wasm.memory.buffer,
        this.dspRegistersPtr,
        128,
      );
      dspRegisters = new ArrayBuffer(128);
      new Uint8Array(dspRegisters).set(dspView);
    }

    if (this.wasm && this.cpuRegistersPtr !== 0) {
      this.wasm.dsp_get_cpu_registers(this.cpuRegistersPtr);
      const cpuView = new Uint8Array(
        this.wasm.memory.buffer,
        this.cpuRegistersPtr,
        8,
      );
      cpuRegisters = new ArrayBuffer(8);
      new Uint8Array(cpuRegisters).set(cpuView);
    }

    // D10: Read SPC RAM at ~10 Hz (every 6th telemetry cycle).
    let ramSnapshot: ArrayBuffer | undefined;

    this.ramTelemetryCycle++;
    if (
      this.wasm &&
      this.ramTelemetryCycle >= SpcProcessor.RAM_TELEMETRY_DIVISOR
    ) {
      this.ramTelemetryCycle = 0;
      const ramPtr = this.wasm.dsp_get_ram_ptr();
      if (ramPtr !== 0) {
        ramSnapshot = new ArrayBuffer(65536);
        new Uint8Array(ramSnapshot).set(
          new Uint8Array(this.wasm.memory.buffer, ramPtr, 65536),
        );
        transferList.push(ramSnapshot);
      }
    }

    const msg: WorkletToMain.Telemetry = {
      type: 'telemetry',
      positionSamples: this.renderedSamples,
      vuLeft: [
        ...this.telemetryVuLeft,
      ] as unknown as WorkletToMain.Telemetry['vuLeft'],
      vuRight: [
        ...this.telemetryVuRight,
      ] as unknown as WorkletToMain.Telemetry['vuRight'],
      stereoLeft: [
        ...this.telemetryStereoLeft,
      ] as unknown as WorkletToMain.Telemetry['stereoLeft'],
      stereoRight: [
        ...this.telemetryStereoRight,
      ] as unknown as WorkletToMain.Telemetry['stereoRight'],
      masterVuLeft,
      masterVuRight,
      voices: this.telemetryVoices.map((v) => ({ ...v })),
      generation: this.generation,
      segment,
      echoBuffer,
      firCoefficients,
      dspRegisters,
      cpuRegisters,
      ramSnapshot,
    };

    if (transferList.length > 0) {
      this.port.postMessage(msg, transferList);
    } else {
      this.postMessage(msg);
    }
  }

  /** D16: Emit audio processing stats at ~1 Hz. */
  private emitAudioStats(): void {
    const msg: WorkletToMain.AudioStats = {
      type: 'audio-stats',
      processLoadPercent: this.processLoadEma,
      totalUnderruns: this.totalUnderruns,
      peakLoadPercent: this.peakLoadPercent,
      sampleRate: this.outputSampleRate,
    };
    this.postMessage(msg);
  }

  /**
   * Compute per-voice VU levels and voice state in a single pass.
   *
   * Calls dsp_get_voice_state once per voice (8 total WASM calls),
   * extracting both envelope-based VU levels and full voice state data.
   * Results are written to pre-allocated telemetryVuLeft, telemetryVuRight,
   * and telemetryVoices arrays to avoid GC pressure on the audio thread.
   */
  private readVoiceStatesAndVu(): void {
    if (!this.wasm) {
      for (let i = 0; i < VOICE_COUNT; i++) {
        this.telemetryVuLeft[i] = 0;
        this.telemetryVuRight[i] = 0;
        this.telemetryStereoLeft[i] = 0;
        this.telemetryStereoRight[i] = 0;
        const v = this.telemetryVoices[i];
        v.envelopePhase = 'silent';
        v.envelopeLevel = 0;
        v.pitch = 0;
        v.sampleSource = 0;
        v.keyOn = false;
        v.active = false;
      }
      return;
    }

    const envelopePhases: VoiceState['envelopePhase'][] = [
      'attack',
      'decay',
      'sustain',
      'release',
      'silent',
    ];

    // Create DSP register view once, outside the voice loop.
    const dspRegs =
      this.dspRegistersPtr !== 0
        ? new Uint8Array(this.wasm.memory.buffer, this.dspRegistersPtr, 128)
        : null;

    for (let i = 0; i < VOICE_COUNT; i++) {
      this.wasm.dsp_get_voice_state(i, this.voiceStatePtr);
      const stateView = new Uint32Array(
        this.wasm.memory.buffer,
        this.voiceStatePtr,
        6,
      );

      const envelopeNorm = stateView[1] / 2047;

      // VU: envelope-only, unsigned [0, 1] — for level meters
      this.telemetryVuLeft[i] = envelopeNorm;
      this.telemetryVuRight[i] = envelopeNorm;

      // Stereo: envelope × signed volume [-1, 1] — for Lissajous/correlation
      if (dspRegs) {
        const volLRaw = dspRegs[i * 0x10];
        const volRRaw = dspRegs[i * 0x10 + 1];
        const signedL = volLRaw > 127 ? volLRaw - 256 : volLRaw;
        const signedR = volRRaw > 127 ? volRRaw - 256 : volRRaw;
        this.telemetryStereoLeft[i] = envelopeNorm * (signedL / 128);
        this.telemetryStereoRight[i] = envelopeNorm * (signedR / 128);
      } else {
        this.telemetryStereoLeft[i] = envelopeNorm;
        this.telemetryStereoRight[i] = envelopeNorm;
      }

      // Voice state — mutate pre-allocated objects in place.
      const v = this.telemetryVoices[i];
      v.envelopePhase = envelopePhases[stateView[0]] ?? 'silent';
      v.envelopeLevel = stateView[1];
      v.pitch = stateView[2];
      v.sampleSource = stateView[3];
      v.keyOn = stateView[4] !== 0;
      v.active = stateView[5] !== 0;
    }
  }

  /** Compute RMS level from a buffer, scaled to [0, 1]. */
  private computeRms(buffer: Float32Array): number {
    let sum = 0;
    for (const sample of buffer) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / buffer.length);
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
