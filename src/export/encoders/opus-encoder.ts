/**
 * Opus encoder adapter using WebCodecs AudioEncoder + WebM container.
 *
 * Encodes PCM audio to Opus via the browser-native WebCodecs API,
 * then wraps the encoded frames in a WebM container.
 *
 * Browser support: Chromium 94+, Safari 16.4+. Not supported in Firefox < 130.
 * Feature-detected at init time.
 *
 * @see docs/design/export-pipeline.md §6
 * @see docs/dev/plans/audio-engine-plan.md §3.4
 */

import type { Encoder, EncoderConfig } from './encoder-types';
import type { OpusFrame } from '../webm-muxer';
import { muxOpusWebm } from '../webm-muxer';

// ---------------------------------------------------------------------------
// WebCodecs type narrowing for environments without WebCodecs
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the WebCodecs AudioEncoder.
 * Declared here to avoid depending on DOM types that may not exist.
 */
interface WebCodecsAudioEncoder {
  configure(config: {
    codec: string;
    sampleRate: number;
    numberOfChannels: number;
    bitrate?: number;
  }): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
  readonly state: string;
}

/**
 * Minimal interface for WebCodecs AudioData.
 */
interface WebCodecsAudioData {
  close(): void;
}

/**
 * Minimal interface for WebCodecs EncodedAudioChunk.
 */
interface WebCodecsEncodedAudioChunk {
  readonly timestamp: number;
  readonly duration: number | null;
  readonly byteLength: number;
  copyTo(destination: ArrayBuffer | ArrayBufferView): void;
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/** Check if the browser supports Opus encoding via WebCodecs. */
export async function isOpusEncoderAvailable(): Promise<boolean> {
  if (typeof globalThis.AudioEncoder === 'undefined') {
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebCodecs global
    const support = await (globalThis.AudioEncoder as any).isConfigSupported({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Factory types for dependency injection (testability)
// ---------------------------------------------------------------------------

/** Factory function to create an AudioEncoder instance. */
export type AudioEncoderFactory = (init: {
  output: (chunk: WebCodecsEncodedAudioChunk) => void;
  error: (err: Error) => void;
}) => WebCodecsAudioEncoder;

/** Factory function to create an AudioData instance. */
export type AudioDataFactory = (init: {
  format: string;
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: Float32Array;
}) => WebCodecsAudioData & { close(): void };

// ---------------------------------------------------------------------------
// Injected dependencies for testing
// ---------------------------------------------------------------------------

/** Dependency injection container for the Opus encoder. */
export interface OpusEncoderDeps {
  readonly createAudioEncoder: AudioEncoderFactory;
  readonly createAudioData: AudioDataFactory;
}

// ---------------------------------------------------------------------------
// OpusEncoder class
// ---------------------------------------------------------------------------

/** Default bitrate for Opus encoding (128 kbps). */
const DEFAULT_BITRATE = 128_000;

/**
 * Create a new Opus encoder instance.
 * @param deps - Injected WebCodecs factories (for testing). If omitted, uses real WebCodecs API.
 */
export function createOpusEncoder(deps?: OpusEncoderDeps): Encoder {
  return new OpusEncoder(deps);
}

/** Opus encoder adapter implementing the streaming Encoder interface. */
export class OpusEncoder implements Encoder {
  private config: EncoderConfig | null = null;
  private audioEncoder: WebCodecsAudioEncoder | null = null;
  private frames: OpusFrame[] = [];
  private encoderError: Error | null = null;
  private initialized = false;
  private timestampUs = 0;
  private readonly deps: OpusEncoderDeps | undefined;

  constructor(deps?: OpusEncoderDeps) {
    this.deps = deps;
  }

  async init(config: EncoderConfig): Promise<void> {
    if (!this.deps && !(await isOpusEncoderAvailable())) {
      throw new Error(
        'Opus export requires a browser with WebCodecs support (Chromium 94+, Safari 16.4+)',
      );
    }

    this.config = config;
    this.frames = [];
    this.encoderError = null;
    this.initialized = false;
    this.timestampUs = 0;

    const createEncoder =
      this.deps?.createAudioEncoder ?? createRealAudioEncoder;

    this.audioEncoder = createEncoder({
      output: (chunk: WebCodecsEncodedAudioChunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.frames.push({
          data,
          timestampUs: chunk.timestamp,
          durationUs: chunk.duration ?? 0,
        });
      },
      error: (err: Error) => {
        this.encoderError = err;
      },
    });

    // Map quality (0-9 VBR scale for MP3) to bitrate.
    // quality 0 = best = highest bitrate (320k)
    // quality 9 = worst = lowest bitrate (64k)
    // Default (2) → 128 kbps
    const bitrate = qualityToBitrate(config.quality);

    this.audioEncoder.configure({
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: config.channels,
      bitrate,
    });

    this.initialized = true;
  }

  encode(samples: Int16Array): void {
    if (!this.initialized || !this.audioEncoder || !this.config) {
      throw new Error('OpusEncoder: init() must be called before encode()');
    }

    if (this.encoderError) {
      throw this.encoderError;
    }

    // Convert interleaved Int16 → interleaved Float32 for AudioData
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768;
    }

    const framesPerChannel = Math.floor(samples.length / this.config.channels);
    if (framesPerChannel === 0) return;

    const createData = this.deps?.createAudioData ?? createRealAudioData;
    const audioData = createData({
      format: 'f32',
      sampleRate: this.config.sampleRate,
      numberOfFrames: framesPerChannel,
      numberOfChannels: this.config.channels,
      timestamp: this.timestampUs,
      data: float32,
    });

    this.audioEncoder.encode(audioData as AudioData);
    audioData.close();

    // Advance timestamp
    this.timestampUs += Math.round(
      (framesPerChannel / this.config.sampleRate) * 1_000_000,
    );
  }

  /**
   * Flush the encoder and assemble the WebM container.
   *
   * Note: This method is async because WebCodecs flush() returns a Promise.
   * The export worker awaits this call.
   */
  async finalize(): Promise<Uint8Array> {
    if (!this.initialized || !this.audioEncoder || !this.config) {
      throw new Error('OpusEncoder: init() must be called before finalize()');
    }

    // Flush any remaining frames from the encoder.
    await this.audioEncoder.flush();

    if (this.encoderError) {
      throw this.encoderError;
    }

    // Calculate total duration from accumulated frames.
    let totalDurationMs: number | undefined;
    if (this.frames.length > 0) {
      const lastFrame = this.frames[this.frames.length - 1];
      totalDurationMs = (lastFrame.timestampUs + lastFrame.durationUs) / 1000;
    }

    // Mux frames into WebM container.
    return muxOpusWebm(this.frames, {
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
      durationMs: totalDurationMs,
    });
  }

  dispose(): void {
    if (this.audioEncoder && this.audioEncoder.state !== 'closed') {
      this.audioEncoder.close();
    }
    this.audioEncoder = null;
    this.config = null;
    this.frames = [];
    this.encoderError = null;
    this.initialized = false;
    this.timestampUs = 0;
  }
}

// ---------------------------------------------------------------------------
// Real WebCodecs factories (used in production)
// ---------------------------------------------------------------------------

function createRealAudioEncoder(init: {
  output: (chunk: WebCodecsEncodedAudioChunk) => void;
  error: (err: Error) => void;
}): WebCodecsAudioEncoder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebCodecs global
  return new (globalThis as any).AudioEncoder(init) as WebCodecsAudioEncoder;
}

function createRealAudioData(init: {
  format: string;
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: Float32Array;
}): WebCodecsAudioData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebCodecs global
  return new (globalThis as any).AudioData(init) as WebCodecsAudioData;
}

// ---------------------------------------------------------------------------
// Quality → bitrate mapping
// ---------------------------------------------------------------------------

/**
 * Map VBR quality setting to Opus bitrate.
 * Uses a similar scale to the MP3 encoder (0 = best, 9 = worst).
 */
function qualityToBitrate(quality?: number): number {
  if (quality == null) return DEFAULT_BITRATE;

  // Clamp to 0-9 range
  const q = Math.max(0, Math.min(9, quality));

  // Map: 0 → 320k, 2 → 128k, 5 → 96k, 9 → 32k
  const bitrateMap = [
    320_000, // 0 - best
    192_000, // 1
    128_000, // 2 - default
    112_000, // 3
    96_000, // 4
    80_000, // 5
    64_000, // 6
    48_000, // 7
    40_000, // 8
    32_000, // 9 - worst
  ];

  return bitrateMap[q];
}
