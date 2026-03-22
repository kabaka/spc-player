/**
 * OGG Vorbis encoder adapter wrapping wasm-media-encoders.
 *
 * Lazy-loaded via dynamic import() in the export worker.
 * Produces OGG Vorbis files with quality-based VBR encoding.
 *
 * NOTE: wasm-media-encoders does not support Vorbis comments.
 * Metadata embedding is not available for OGG Vorbis exports.
 *
 * @see docs/design/export-pipeline.md §6
 * @see docs/adr/0006-audio-codec-libraries.md
 */

import type { Encoder, EncoderConfig } from './encoder-types';
import { deinterleaveToChannels } from './pcm-utils';

// ---------------------------------------------------------------------------
// wasm-media-encoders OGG encoder type surface
// ---------------------------------------------------------------------------

/** Minimal type surface for the wasm-media-encoders OGG encoder instance. */
export interface WmeOggEncoder {
  configure(params: {
    channels: 1 | 2;
    sampleRate: number;
    vbrQuality?: number;
  }): void;
  encode(samples: readonly Float32Array[]): Uint8Array;
  finalize(): Uint8Array;
}

// ---------------------------------------------------------------------------
// OggEncoder class
// ---------------------------------------------------------------------------

// OGG Vorbis export deferred to post-Phase F. See roadmap v2 resolved decisions.

/**
 * Create a new OGG Vorbis encoder instance.
 * @param injectedEncoder - Pre-created encoder instance (for testing). If omitted, loads via dynamic import.
 */
export function createOggEncoder(injectedEncoder?: WmeOggEncoder): Encoder {
  return new OggEncoder(injectedEncoder);
}

/** OGG Vorbis encoder adapter implementing the streaming Encoder interface. */
export class OggEncoder implements Encoder {
  private config: EncoderConfig | null = null;
  private wmeEncoder: WmeOggEncoder | null = null;
  private outputChunks: Uint8Array[] = [];
  private initialized = false;
  private readonly injectedEncoder: WmeOggEncoder | undefined;

  constructor(injectedEncoder?: WmeOggEncoder) {
    this.injectedEncoder = injectedEncoder;
  }

  async init(config: EncoderConfig): Promise<void> {
    this.config = config;
    this.outputChunks = [];
    this.initialized = false;

    let encoder: WmeOggEncoder;

    if (this.injectedEncoder) {
      encoder = this.injectedEncoder;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM interop module
      const mod = (await import('wasm-media-encoders')) as any;
      encoder = (await mod.createOggEncoder()) as WmeOggEncoder;
    }

    // Quality range for Vorbis: -1 to 10. Default 6 (~192 kbps).
    const quality = config.quality ?? 6;

    encoder.configure({
      channels: config.channels,
      sampleRate: config.sampleRate,
      vbrQuality: quality,
    });

    this.wmeEncoder = encoder;
    this.initialized = true;
  }

  encode(samples: Int16Array): void {
    if (!this.initialized || !this.wmeEncoder || !this.config) {
      throw new Error('OggEncoder: init() must be called before encode()');
    }

    const channelBuffers = deinterleaveToChannels(
      samples,
      this.config.channels,
    );
    const encoded = this.wmeEncoder.encode(channelBuffers);

    if (encoded.length > 0) {
      this.outputChunks.push(new Uint8Array(encoded));
    }
  }

  finalize(): Uint8Array {
    if (!this.initialized || !this.wmeEncoder) {
      throw new Error('OggEncoder: init() must be called before finalize()');
    }

    const finalChunk = this.wmeEncoder.finalize();
    if (finalChunk.length > 0) {
      this.outputChunks.push(new Uint8Array(finalChunk));
    }

    let totalLength = 0;
    for (const chunk of this.outputChunks) {
      totalLength += chunk.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.outputChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  dispose(): void {
    this.wmeEncoder = null;
    this.config = null;
    this.outputChunks = [];
    this.initialized = false;
  }
}
