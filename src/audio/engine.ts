/**
 * AudioEngine — singleton managing AudioContext, AudioWorklet, and WASM module.
 *
 * Owns the real-time audio graph:
 *   AudioWorkletNode → GainNode → destination
 *
 * @see docs/adr/0003-audio-pipeline-architecture.md
 * @see docs/adr/0007-wasm-build-pipeline.md
 */

import spcWorkletUrl from './spc-worklet.ts?worker&url';
import { loadDspWasmBytes } from './wasm-loader';
import { audioStateBuffer, resetAudioStateBuffer } from './audio-state-buffer';
import type { MainToWorklet, WorkletToMain } from './worker-protocol';
import { PROTOCOL_VERSION } from './worker-protocol';
import { reportError } from '@/errors/report';
import { audioPipelineError, spcParseError } from '@/errors/factories';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TARGET_SAMPLE_RATE = 48_000;
const DEFAULT_RESAMPLER_MODE = 0; // linear
const DEFAULT_INTERPOLATION_MODE = 0; // gaussian
const SNAPSHOT_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// AudioEngine
// ---------------------------------------------------------------------------

class AudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private wasmBytes: ArrayBuffer | null = null;
  private spcData: ArrayBuffer | null = null;
  private isInitialized = false;
  private onPlaybackEnded: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private userIntentPlaying = false;
  private suspendedByVisibility = false;

  /** Initialize: compile WASM, create AudioContext, load worklet, create audio graph. */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 1. Fetch raw WASM bytes (worklet compiles + instantiates)
      this.wasmBytes = await loadDspWasmBytes();

      // 2. Create AudioContext at 48 kHz
      this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

      // 3. Load AudioWorklet processor script
      await this.audioContext.audioWorklet.addModule(spcWorkletUrl);

      // 4. Build audio graph: WorkletNode → GainNode → destination
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        'spc-processor',
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        },
      );

      this.gainNode = this.audioContext.createGain();
      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      // 5. Wire message handler
      this.workletNode.port.onmessage = (event: MessageEvent<WorkletToMain>) =>
        this.handleWorkletMessage(event.data);

      // 6. Detect worklet processor errors
      this.workletNode.onprocessorerror = () => {
        reportError(
          audioPipelineError('AUDIO_WORKLET_CRASHED', {
            workletProcessorName: 'spc-processor',
          }),
        );
      };

      // 7. Page visibility — suspend/resume to save battery
      this.visibilityHandler = () => this.handleVisibilityChange();
      document.addEventListener('visibilitychange', this.visibilityHandler);

      this.isInitialized = true;
    } catch (error) {
      // Clean up partial init
      await this.teardownGraph();

      const detail = error instanceof Error ? error.message : String(error);

      // Distinguish WASM fetch failure from worklet load failure
      if (!this.wasmBytes) {
        reportError(audioPipelineError('AUDIO_WASM_INIT_FAILED', { detail }));
      } else {
        reportError(
          audioPipelineError('AUDIO_WORKLET_LOAD_FAILED', { detail }),
        );
      }

      throw error;
    }
  }

  /**
   * Load SPC data and send to worklet.
   * Initializes the engine lazily if not yet done.
   */
  async loadSpc(
    spcData: ArrayBuffer,
    durationSamples: number | null,
    fadeOutSamples: number,
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }

    if (!this.workletNode || !this.audioContext || !this.wasmBytes) return;

    // Keep a copy so recreateAudioContext can re-init the worklet
    this.spcData = spcData.slice(0);

    const port = this.workletNode.port;
    const actualSampleRate = this.audioContext.sampleRate;

    if (!this.hasWorkletReceived()) {
      const msg: MainToWorklet.Init = {
        type: 'init',
        version: PROTOCOL_VERSION,
        wasmBytes: this.wasmBytes,
        spcData,
        outputSampleRate: actualSampleRate,
        resamplerMode: DEFAULT_RESAMPLER_MODE,
        interpolationMode: DEFAULT_INTERPOLATION_MODE,
        durationSamples,
        fadeOutSamples,
      };

      // wasmBytes is intentionally cloned (not transferred) so it
      // remains available for future loadSpc calls after destroy/re-init.
      // spcData is transferred (zero-copy) since the caller is done with it.
      port.postMessage(msg, [spcData]);
    } else {
      // Subsequent load — worklet already has WASM instance
      const msg: MainToWorklet.LoadSpc = {
        type: 'load-spc',
        spcData,
        durationSamples,
        fadeOutSamples,
      };

      port.postMessage(msg, [spcData]);
    }

    resetAudioStateBuffer();
  }

  /** Begin or resume playback. Resumes suspended AudioContext for autoplay policy. */
  play(): boolean {
    if (!this.isInitialized || !this.audioContext) return false;
    this.userIntentPlaying = true;

    // Handle browser autoplay policy — AudioContext starts suspended
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        reportError(
          audioPipelineError('AUDIO_CONTEXT_SUSPENDED', {
            audioContextState: this.audioContext?.state,
            detail,
          }),
        );
      });
    }

    this.postCommand({ type: 'play' });
    return true;
  }

  /** Pause playback. Retains position. */
  pause(): void {
    this.userIntentPlaying = false;
    this.postCommand({ type: 'pause' });
  }

  /** Stop playback, reset position. */
  stop(): void {
    this.userIntentPlaying = false;
    this.postCommand({ type: 'stop' });
    resetAudioStateBuffer();
  }

  /** Seek to a sample position (at 32 kHz DSP rate). */
  seek(samplePosition: number): void {
    this.postCommand({ type: 'seek', samplePosition });
  }

  /** Set voice mask (bit N = voice N enabled, 0xFF = all enabled). */
  setVoiceMask(mask: number): void {
    this.postCommand({ type: 'set-voice-mask', mask });
  }

  /** Set playback speed multiplier. 1.0 = normal. */
  setSpeed(factor: number): void {
    this.postCommand({ type: 'set-speed', factor });
  }

  /** Set volume (0–1). Uses GainNode for click-free control. */
  setVolume(volume: number): void {
    if (!this.gainNode || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(volume, now + 0.02);
  }

  /** Update playback timing configuration mid-playback. */
  setPlaybackConfig(config: MainToWorklet.SetPlaybackConfig): void {
    this.postCommand(config);
  }

  /** Set S-DSP interpolation mode (ADR-0014). 0=gaussian, 1=linear, 2=cubic, 3=sinc. */
  setInterpolationMode(mode: number): void {
    this.postCommand({ type: 'set-interpolation-mode', mode });
  }

  /** Trigger a note-on for a specific voice. */
  noteOn(voice: number, pitch: number): void {
    this.postCommand({ type: 'note-on', voice, pitch });
  }

  /** Trigger a note-off (key release) for a specific voice. */
  noteOff(voice: number): void {
    this.postCommand({ type: 'note-off', voice });
  }

  /** Set output resampler mode. 0=linear (JS), 1=sinc (WASM Lanczos-3). */
  setResamplerMode(mode: 'linear' | 'sinc'): void {
    this.postCommand({
      type: 'set-resampler-mode',
      mode: mode === 'sinc' ? 1 : 0,
    });
  }

  /**
   * Request a full emulation state snapshot from the worklet.
   * Returns a Promise that resolves with the serialized state.
   */
  requestSnapshot(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (!this.workletNode) {
        reject(new Error('Worklet not initialized'));
        return;
      }

      const port = this.workletNode.port;

      const cleanup = () => {
        clearTimeout(timer);
        port.removeEventListener('message', handler);
      };

      const handler = (event: MessageEvent<WorkletToMain>) => {
        if (event.data.type === 'snapshot') {
          cleanup();
          resolve(event.data.snapshotData);
        }
      };

      const timer = setTimeout(() => {
        port.removeEventListener('message', handler);
        reject(new Error('Snapshot request timed out after 5000ms'));
      }, SNAPSHOT_TIMEOUT_MS);

      port.addEventListener('message', handler);
      this.postCommand({ type: 'request-snapshot' });
    });
  }

  /** Restore a previously captured emulation state snapshot. */
  restoreSnapshot(data: ArrayBuffer, outputSampleRate?: number): void {
    const rate =
      outputSampleRate ?? this.audioContext?.sampleRate ?? TARGET_SAMPLE_RATE;
    this.postCommand({
      type: 'restore-snapshot',
      snapshotData: data,
      outputSampleRate: rate,
    });
  }

  /**
   * Recreate the AudioContext at a new sample rate while preserving emulation state.
   *
   * Flow:
   * 1. Pause playback
   * 2. Request snapshot from worklet
   * 3. Close old AudioContext
   * 4. Create new AudioContext at new sample rate
   * 5. Create new AudioWorkletNode
   * 6. Send init message with WASM bytes (cloned ArrayBuffer — Chromium bug)
   * 7. Send restore-snapshot message
   * 8. Resume playback if it was playing
   */
  async recreateAudioContext(newSampleRate: number): Promise<void> {
    if (!this.isInitialized || !this.wasmBytes) {
      throw new Error('Engine not initialized');
    }

    const wasPlaying = this.userIntentPlaying;

    // 1. Pause playback
    this.pause();

    // 2. Request snapshot
    let snapshotData: ArrayBuffer;
    try {
      snapshotData = await this.requestSnapshot();
    } catch {
      // If snapshot fails (empty worklet), use empty buffer.
      snapshotData = new ArrayBuffer(0);
    }

    // 3. Tear down old graph
    await this.teardownGraph();

    try {
      // 4. Create new AudioContext at new sample rate
      this.audioContext = new AudioContext({ sampleRate: newSampleRate });

      // 5. Load AudioWorklet processor and create new node
      await this.audioContext.audioWorklet.addModule(spcWorkletUrl);

      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        'spc-processor',
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        },
      );

      this.gainNode = this.audioContext.createGain();
      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.workletNode.port.onmessage = (event: MessageEvent<WorkletToMain>) =>
        this.handleWorkletMessage(event.data);

      this.workletNode.onprocessorerror = () => {
        reportError(
          audioPipelineError('AUDIO_WORKLET_CRASHED', {
            workletProcessorName: 'spc-processor',
          }),
        );
      };

      this.visibilityHandler = () => this.handleVisibilityChange();
      document.addEventListener('visibilitychange', this.visibilityHandler);

      // 6. Send init message with WASM bytes (clone, do NOT transfer — Chromium bug)
      // Use stored SPC data so dsp_init receives valid data
      const spcClone = this.spcData
        ? this.spcData.slice(0)
        : new ArrayBuffer(0);
      const initReady = new Promise<void>((resolve, reject) => {
        const port = this.workletNode?.port;
        if (!port) {
          reject(new Error('Worklet not initialized'));
          return;
        }

        const cleanup = () => {
          clearTimeout(timer);
          port.removeEventListener('message', handler);
        };

        const handler = (event: MessageEvent<WorkletToMain>) => {
          if (event.data.type === 'ready') {
            cleanup();
            resolve();
          } else if (event.data.type === 'error') {
            cleanup();
            reject(new Error(event.data.message));
          }
        };

        const timer = setTimeout(() => {
          port.removeEventListener('message', handler);
          reject(new Error('Worklet init timed out after 5000ms'));
        }, SNAPSHOT_TIMEOUT_MS);

        port.addEventListener('message', handler);
      });

      const initMsg: MainToWorklet.Init = {
        type: 'init',
        version: PROTOCOL_VERSION,
        wasmBytes: this.wasmBytes,
        spcData: spcClone,
        outputSampleRate: newSampleRate,
        resamplerMode: DEFAULT_RESAMPLER_MODE,
        interpolationMode: DEFAULT_INTERPOLATION_MODE,
        durationSamples: null,
        fadeOutSamples: 0,
      };

      this.workletNode.port.postMessage(initMsg);

      await initReady;

      // 7. Restore snapshot
      if (snapshotData.byteLength > 0) {
        this.restoreSnapshot(snapshotData, newSampleRate);
      }

      // 8. Resume playback if it was playing
      if (wasPlaying) {
        this.play();
      }
    } catch (error) {
      await this.teardownGraph();
      const detail = error instanceof Error ? error.message : String(error);
      reportError(audioPipelineError('AUDIO_WORKLET_LOAD_FAILED', { detail }));
      throw error;
    }
  }

  /** Set callback for when playback ends naturally (duration exceeded). */
  setOnPlaybackEnded(callback: (() => void) | null): void {
    this.onPlaybackEnded = callback;
  }

  /** Tear down the audio graph and release resources. */
  async destroy(): Promise<void> {
    await this.teardownGraph();
    this.isInitialized = false;
    this.wasmBytes = null;
    this.spcData = null;
    resetAudioStateBuffer();
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /** Whether the worklet has received at least one Init message with WASM. */
  private hasWorkletReceivedInit = false;

  private hasWorkletReceived(): boolean {
    return this.hasWorkletReceivedInit;
  }

  /** Post a command to the worklet, guarding against uninitialized state. */
  private postCommand(msg: MainToWorklet): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage(msg);
  }

  /** Handle all messages from the AudioWorklet. */
  private handleWorkletMessage(msg: WorkletToMain): void {
    switch (msg.type) {
      case 'ready':
        this.handleReady(msg);
        break;
      case 'playback-state':
        // Forward to consumers if needed (engine doesn't own store)
        break;
      case 'telemetry':
        this.handleTelemetry(msg);
        break;
      case 'snapshot':
        // Handled by external snapshot request flow
        break;
      case 'playback-ended':
        this.onPlaybackEnded?.();
        break;
      case 'error':
        this.handleWorkletError(msg);
        break;
    }
  }

  private handleReady(msg: WorkletToMain.Ready): void {
    if (msg.version !== PROTOCOL_VERSION) {
      reportError(
        audioPipelineError('AUDIO_PROTOCOL_VERSION_MISMATCH', {
          detail: `worklet=${msg.version}, main=${PROTOCOL_VERSION}`,
        }),
      );
      return;
    }
    this.hasWorkletReceivedInit = true;
  }

  /** Write telemetry data directly to the ref-based audioStateBuffer. */
  private handleTelemetry(msg: WorkletToMain.Telemetry): void {
    audioStateBuffer.positionSamples = msg.positionSamples;
    audioStateBuffer.masterVuLeft = msg.masterVuLeft;
    audioStateBuffer.masterVuRight = msg.masterVuRight;

    for (let i = 0; i < 8; i++) {
      audioStateBuffer.vuLeft[i] = msg.vuLeft[i];
      audioStateBuffer.vuRight[i] = msg.vuRight[i];
    }

    for (let i = 0; i < msg.voices.length; i++) {
      const src = msg.voices[i];
      const dst = audioStateBuffer.voices[i];
      dst.envelopePhase = src.envelopePhase;
      dst.envelopeLevel = src.envelopeLevel;
      dst.pitch = src.pitch;
      dst.sampleSource = src.sampleSource;
      dst.keyOn = src.keyOn;
      dst.active = src.active;
    }

    // Update echo buffer data when present (sent at ~15 Hz).
    if (msg.echoBuffer) {
      audioStateBuffer.echoBuffer = new Int16Array(msg.echoBuffer);
    }

    // Update FIR coefficients when present (sent alongside echo data).
    if (msg.firCoefficients) {
      audioStateBuffer.firCoefficients.set(new Uint8Array(msg.firCoefficients));
    }

    audioStateBuffer.generation = msg.generation;
  }

  /** Map worklet error codes to error factories and report. */
  private handleWorkletError(msg: WorkletToMain.Error): void {
    if (msg.code === 'SPC_INVALID_DATA') {
      reportError(spcParseError('SPC_INVALID_DATA', msg.context));
    } else {
      reportError(audioPipelineError(msg.code, msg.context));
    }
  }

  /** Suspend AudioContext when page is hidden; resume when visible. */
  private handleVisibilityChange(): void {
    if (!this.audioContext) return;

    if (document.hidden) {
      // Only suspend if nothing is actively playing — music players
      // should continue playback in the background.
      if (this.audioContext.state === 'running' && !this.userIntentPlaying) {
        this.suspendedByVisibility = true;
        this.audioContext.suspend().catch((e: unknown) => {
          if (this.audioContext?.state !== 'closed') {
            reportError(
              audioPipelineError('AUDIO_CONTEXT_SUSPENDED', {
                detail: `visibility suspend: ${e instanceof Error ? e.message : String(e)}`,
              }),
            );
          }
        });
      }
    } else {
      if (
        this.suspendedByVisibility &&
        this.audioContext.state === 'suspended'
      ) {
        this.suspendedByVisibility = false;
        this.audioContext.resume().catch((e: unknown) => {
          if (this.audioContext?.state !== 'closed') {
            reportError(
              audioPipelineError('AUDIO_CONTEXT_SUSPENDED', {
                detail: `visibility resume: ${e instanceof Error ? e.message : String(e)}`,
              }),
            );
          }
        });
      }
    }
  }

  /** Disconnect nodes, close context, remove listeners. */
  private async teardownGraph(): Promise<void> {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.onprocessorerror = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        await this.audioContext.close();
      }
      this.audioContext = null;
    }

    this.userIntentPlaying = false;
    this.suspendedByVisibility = false;
    this.hasWorkletReceivedInit = false;
  }
}

/** Singleton AudioEngine instance for the application. */
export const audioEngine = new AudioEngine();
