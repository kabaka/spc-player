/**
 * Worker protocol type definitions for SPC Player.
 *
 * Defines all message types for main thread ↔ AudioWorklet communication.
 * This file is shared between both execution contexts and must remain
 * self-contained at runtime — only type-only imports are permitted.
 *
 * @see docs/design/worker-protocol.md
 * @see docs/design/loop-playback.md §4.1, §4.4
 */

import type { AudioPipelineError } from '../types/errors';

// ---------------------------------------------------------------------------
// Protocol Version
// ---------------------------------------------------------------------------

/** Wire protocol version for main thread ↔ AudioWorklet messages. */
export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Main → AudioWorklet Messages (§2.2)
// ---------------------------------------------------------------------------

/** Messages sent from the main thread to the AudioWorklet via node.port.postMessage(). */
export type MainToWorklet =
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
  | MainToWorklet.RestoreSnapshot
  | MainToWorklet.SetPlaybackConfig;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace MainToWorklet {
  /** Initial handshake: transfers raw WASM bytes and first SPC file. */
  export interface Init {
    readonly type: 'init';
    readonly version: number;
    /** Raw WASM bytes. Compiled and instantiated by the worklet. */
    readonly wasmBytes: ArrayBuffer;
    /** SPC file data. ArrayBuffer is transferred (zero-copy). */
    readonly spcData: ArrayBuffer;
    /** Detected AudioContext.sampleRate for resampler configuration. */
    readonly outputSampleRate: number;
    /** Initial resampler mode. 0 = linear, 1 = sinc. */
    readonly resamplerMode: number;
    /** Initial S-DSP interpolation mode. 0 = gaussian, 1 = linear, 2 = cubic, 3 = sinc. */
    readonly interpolationMode: number;
    /** Total duration to play in DSP samples before fade begins. null = infinite (no auto-stop). */
    readonly durationSamples: number | null;
    /** Fade-out duration in DSP samples. 0 = no fade. */
    readonly fadeOutSamples: number;
  }

  /** Load a new SPC file into an already-initialized worklet. */
  export interface LoadSpc {
    readonly type: 'load-spc';
    /** SPC file data. ArrayBuffer is transferred. */
    readonly spcData: ArrayBuffer;
    /** Total duration to play in DSP samples before fade begins. null = infinite (no auto-stop). */
    readonly durationSamples: number | null;
    /** Fade-out duration in DSP samples. 0 = no fade. */
    readonly fadeOutSamples: number;
  }

  /** Begin or resume playback from current position. */
  export interface Play {
    readonly type: 'play';
  }

  /** Pause playback. Retains position. */
  export interface Pause {
    readonly type: 'pause';
  }

  /** Stop playback. Resets position to 0. */
  export interface Stop {
    readonly type: 'stop';
  }

  /** Seek to a sample position in the SPC playback. */
  export interface Seek {
    readonly type: 'seek';
    /** Target position in DSP output samples (at 32 kHz). */
    readonly samplePosition: number;
  }

  /**
   * Set which voices are enabled.
   * Bit N controls voice N (0–7). 1 = enabled, 0 = muted.
   * 0xFF = all voices enabled (default).
   */
  export interface SetVoiceMask {
    readonly type: 'set-voice-mask';
    readonly mask: number;
  }

  /** Set playback speed multiplier. 1.0 = normal. Range: 0.25–4.0. */
  export interface SetSpeed {
    readonly type: 'set-speed';
    readonly factor: number;
  }

  /** Change the output resampler algorithm at runtime (ADR-0014). */
  export interface SetResamplerMode {
    readonly type: 'set-resampler-mode';
    /** 0 = linear, 1 = sinc (Lanczos-3). */
    readonly mode: number;
  }

  /** Change the S-DSP source sample interpolation mode at runtime (ADR-0014). */
  export interface SetInterpolationMode {
    readonly type: 'set-interpolation-mode';
    /** 0 = gaussian, 1 = linear, 2 = cubic, 3 = sinc. */
    readonly mode: number;
  }

  /** Configure how often the worklet sends telemetry. */
  export interface SetTelemetryRate {
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
  export interface RequestSnapshot {
    readonly type: 'request-snapshot';
  }

  /**
   * Restore a previously captured emulation state snapshot.
   * Used after AudioContext recreation for sample rate changes (ADR-0014).
   */
  export interface RestoreSnapshot {
    readonly type: 'restore-snapshot';
    /** Serialized emulation state. ArrayBuffer is transferred. */
    readonly snapshotData: ArrayBuffer;
    /** New output sample rate the resampler should target. */
    readonly outputSampleRate: number;
  }

  /**
   * Update playback timing configuration mid-playback.
   * Sent when the user changes loop count during playback.
   *
   * The worklet counts rendered DSP samples against durationSamples. When the
   * count reaches durationSamples, a linear fade gain ramp is applied over
   * fadeOutSamples. When fade completes, the worklet emits PlaybackEnded and
   * stops. If durationSamples is null, the worklet renders indefinitely.
   * SetPlaybackConfig updates these values mid-playback; the worklet
   * recalculates remaining duration from its current position.
   *
   * @see docs/design/loop-playback.md §4.1
   */
  export interface SetPlaybackConfig {
    readonly type: 'set-playback-config';
    /** Total samples to render before fade begins (at 32 kHz). null = infinite (no auto-fade). */
    readonly durationSamples: number | null;
    /** Fade-out duration in samples (at 32 kHz). 0 = no fade. */
    readonly fadeOutSamples: number;
    /** Loop count for progress reporting. null = infinite. */
    readonly loopCount: number | null;
    /**
     * Structural timing for progress reporting (optional).
     * When present, the worklet can report which structural segment
     * (intro, loop N, end, fade) is currently playing.
     */
    readonly structure: {
      readonly introSamples: number;
      readonly loopSamples: number;
      readonly endSamples: number;
    } | null;
  }
}

// ---------------------------------------------------------------------------
// AudioWorklet → Main Messages (§2.3)
// ---------------------------------------------------------------------------

/** Messages sent from the AudioWorklet to the main thread via this.port.postMessage(). */
export type WorkletToMain =
  | WorkletToMain.Ready
  | WorkletToMain.PlaybackState
  | WorkletToMain.Telemetry
  | WorkletToMain.Snapshot
  | WorkletToMain.PlaybackEnded
  | WorkletToMain.Error;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace WorkletToMain {
  /** Initialization complete. WASM instantiated, SPC loaded, ready to render. */
  export interface Ready {
    readonly type: 'ready';
    readonly version: number;
  }

  /** Playback state transition notification. */
  export interface PlaybackState {
    readonly type: 'playback-state';
    readonly state: 'playing' | 'paused' | 'stopped';
  }

  /**
   * Periodic telemetry bundle emitted at the configured rate (~60 Hz default).
   * Written to the main thread's audioStateBuffer (ref-based channel, ADR-0005).
   * Does NOT flow through Zustand — consumed by rAF visualization loops.
   */
  export interface Telemetry {
    readonly type: 'telemetry';
    /** Current playback position in DSP output samples (32 kHz basis). */
    readonly positionSamples: number;
    /** Per-voice VU levels. 8 entries, range [0.0, 1.0]. Left channel. */
    readonly vuLeft: readonly [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    /** Per-voice VU levels. 8 entries, range [0.0, 1.0]. Right channel. */
    readonly vuRight: readonly [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    /** Master output level. Range [0.0, 1.0]. */
    readonly masterVuLeft: number;
    /** Master output level. Range [0.0, 1.0]. */
    readonly masterVuRight: number;
    /** Per-voice state for the mixer/analysis UI. */
    readonly voices: readonly VoiceState[];
    /** Monotonically increasing counter for change detection by rAF consumers. */
    readonly generation: number;
    /**
     * Current structural segment, when loop structure is known.
     * null when no xid6 timing is available.
     *
     * @see docs/design/loop-playback.md §4.4
     */
    readonly segment: PlaybackSegment | null;
  }

  /** Full emulation state snapshot, sent in response to 'request-snapshot'. */
  export interface Snapshot {
    readonly type: 'snapshot';
    /** Serialized emulation state captured atomically within one render quantum. */
    readonly snapshotData: ArrayBuffer;
    /** Playback position at the moment of capture. */
    readonly positionSamples: number;
  }

  /** The SPC track has reached its end (duration exceeded or stop condition met). */
  export interface PlaybackEnded {
    readonly type: 'playback-ended';
    /** Total samples rendered before ending. */
    readonly totalSamples: number;
  }

  /**
   * An error occurred in the worklet.
   *
   * The worklet sends only error codes and structured context — it does NOT
   * construct user-facing messages. The main thread maps codes to user-facing
   * strings via ADR-0015 error factory functions.
   */
  export interface Error {
    readonly type: 'error';
    readonly code: WorkletErrorCode;
    /** Technical description (for logging, not user display). */
    readonly message: string;
    /** Structured context for error reporting (ADR-0015 AppError.context). */
    readonly context: Record<string, unknown>;
  }
}

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

/** Per-voice state included in telemetry. */
export interface VoiceState {
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
 * Identifies the current position within the track's loop structure.
 *
 * @see docs/design/loop-playback.md §4.4
 */
export interface PlaybackSegment {
  /** Which structural part is currently playing. */
  readonly phase: 'intro' | 'loop' | 'end' | 'fade';
  /**
   * Current loop iteration (1-based). Only meaningful when phase is 'loop'.
   * null during intro, end, or fade.
   */
  readonly currentLoop: number | null;
  /** Total configured loop count. null for infinite mode. */
  readonly totalLoops: number | null;
}

/**
 * Worklet error codes — a subset of ADR-0015's AudioPipelineError codes
 * plus SPC_INVALID_DATA for SPC data rejected by the DSP emulator.
 *
 * The worklet sends these codes as-is; the main thread maps them
 * to user-facing messages via ADR-0015 error factory functions.
 */
export type WorkletErrorCode = AudioPipelineError['code'] | 'SPC_INVALID_DATA';
