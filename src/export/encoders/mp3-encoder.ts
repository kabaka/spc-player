/**
 * MP3 encoder adapter wrapping wasm-media-encoders (WASM-compiled LAME).
 *
 * Lazy-loaded via dynamic import() in the export worker.
 * Produces MP3 files with VBR encoding and custom ID3v2.4 metadata tags.
 *
 * @see docs/design/export-pipeline.md §6
 * @see docs/adr/0006-audio-codec-libraries.md
 */

import type { Encoder, EncoderConfig, ExportMetadata } from './encoder-types';
import { deinterleaveToChannels } from './pcm-utils';

// ---------------------------------------------------------------------------
// wasm-media-encoders MP3 encoder type surface
// ---------------------------------------------------------------------------

/** Minimal type surface for the wasm-media-encoders MP3 encoder instance. */
export interface WmeMp3Encoder {
  configure(params: {
    channels: 1 | 2;
    sampleRate: number;
    vbrQuality?: number;
  }): void;
  encode(samples: readonly Float32Array[]): Uint8Array;
  finalize(): Uint8Array;
}

// ---------------------------------------------------------------------------
// ID3v2.4 Tag Generator
// ---------------------------------------------------------------------------

const TEXT_ENCODING_UTF8 = 3;

/**
 * Build a single ID3v2.4 text frame (TIT2, TPE1, TALB, etc.).
 * Layout: Frame ID (4) + Size (4) + Flags (2) + Encoding (1) + Text.
 */
function buildTextFrame(frameId: string, text: string): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  // Frame: 4 (id) + 4 (size) + 2 (flags) + 1 (encoding byte) + textBytes
  const frameSize = 1 + textBytes.length; // encoding byte + text
  const frame = new Uint8Array(10 + frameSize);
  const view = new DataView(frame.buffer);

  // Frame ID (4 ASCII chars)
  frame.set(encoder.encode(frameId), 0);
  // Size (4 bytes big-endian, excludes the 10-byte header)
  view.setUint32(4, frameSize, false);
  // Flags (2 bytes, all zero)
  view.setUint16(8, 0, false);
  // Text encoding: 3 = UTF-8
  frame[10] = TEXT_ENCODING_UTF8;
  // Text content
  frame.set(textBytes, 11);

  return frame;
}

/**
 * Build an ID3v2.4 COMM (comment) frame.
 * Layout: Frame ID (4) + Size (4) + Flags (2) + Encoding (1) + Language (3)
 *         + Short description (null-terminated) + Comment text.
 */
function buildCommentFrame(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  // encoding (1) + language (3) + empty description null terminator (1) + text
  const frameSize = 1 + 3 + 1 + textBytes.length;
  const frame = new Uint8Array(10 + frameSize);
  const view = new DataView(frame.buffer);

  // Frame ID
  frame.set(encoder.encode('COMM'), 0);
  // Size
  view.setUint32(4, frameSize, false);
  // Flags
  view.setUint16(8, 0, false);
  // Encoding: UTF-8
  frame[10] = TEXT_ENCODING_UTF8;
  // Language: 'eng'
  frame[11] = 0x65; // 'e'
  frame[12] = 0x6e; // 'n'
  frame[13] = 0x67; // 'g'
  // Short description: empty (null terminator)
  frame[14] = 0x00;
  // Comment text
  frame.set(textBytes, 15);

  return frame;
}

/**
 * Build a complete ID3v2.4 tag from export metadata.
 * Returns null if no metadata fields are present.
 *
 * ID3v2.4 header: "ID3" (3) + Version (2: 0x04 0x00) + Flags (1) + Size (4, syncsafe).
 * Size uses syncsafe integer encoding (7 bits per byte).
 */
export function buildId3v2Tag(metadata: ExportMetadata): Uint8Array | null {
  const frames: Uint8Array[] = [];

  if (metadata.title) frames.push(buildTextFrame('TIT2', metadata.title));
  if (metadata.artist) frames.push(buildTextFrame('TPE1', metadata.artist));
  if (metadata.game) frames.push(buildTextFrame('TALB', metadata.game));
  if (metadata.comment) frames.push(buildCommentFrame(metadata.comment));
  if (metadata.year) frames.push(buildTextFrame('TYER', metadata.year));
  if (metadata.trackNumber != null) {
    frames.push(buildTextFrame('TRCK', String(metadata.trackNumber)));
  }

  if (frames.length === 0) return null;

  // Calculate total frame payload size.
  let payloadSize = 0;
  for (const frame of frames) {
    payloadSize += frame.length;
  }

  if (payloadSize > 0x0fffffff) {
    throw new Error('ID3v2 tag payload exceeds syncsafe integer limit');
  }

  // ID3v2 header: 10 bytes.
  const tag = new Uint8Array(10 + payloadSize);

  // "ID3"
  tag[0] = 0x49; // 'I'
  tag[1] = 0x44; // 'D'
  tag[2] = 0x33; // '3'
  // Version: ID3v2.4.0
  tag[3] = 0x04;
  tag[4] = 0x00;
  // Flags: none
  tag[5] = 0x00;
  // Size: syncsafe integer (4 bytes, 7 bits each)
  tag[6] = (payloadSize >> 21) & 0x7f;
  tag[7] = (payloadSize >> 14) & 0x7f;
  tag[8] = (payloadSize >> 7) & 0x7f;
  tag[9] = payloadSize & 0x7f;

  // Append all frames.
  let offset = 10;
  for (const frame of frames) {
    tag.set(frame, offset);
    offset += frame.length;
  }

  return tag;
}

// ---------------------------------------------------------------------------
// Mp3Encoder class
// ---------------------------------------------------------------------------

/**
 * Create a new MP3 encoder instance.
 * @param injectedEncoder - Pre-created encoder instance (for testing). If omitted, loads via dynamic import.
 */
export function createMp3Encoder(injectedEncoder?: WmeMp3Encoder): Encoder {
  return new Mp3Encoder(injectedEncoder);
}

/** MP3 encoder adapter implementing the streaming Encoder interface. */
export class Mp3Encoder implements Encoder {
  private config: EncoderConfig | null = null;
  private wmeEncoder: WmeMp3Encoder | null = null;
  private outputChunks: Uint8Array[] = [];
  private initialized = false;
  private readonly injectedEncoder: WmeMp3Encoder | undefined;

  constructor(injectedEncoder?: WmeMp3Encoder) {
    this.injectedEncoder = injectedEncoder;
  }

  async init(config: EncoderConfig): Promise<void> {
    this.config = config;
    this.outputChunks = [];
    this.initialized = false;

    let encoder: WmeMp3Encoder;

    if (this.injectedEncoder) {
      encoder = this.injectedEncoder;
    } else {
      const specifier = 'wasm-media-encoders';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM interop module
      const mod = (await import(/* @vite-ignore */ specifier)) as any;
      encoder = (await mod.createMp3Encoder()) as WmeMp3Encoder;
    }

    // VBR quality 0–9 (0 = best). Default V2 (~190 kbps).
    const quality = config.quality ?? 2;

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
      throw new Error('Mp3Encoder: init() must be called before encode()');
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
    if (!this.initialized || !this.wmeEncoder || !this.config) {
      throw new Error('Mp3Encoder: init() must be called before finalize()');
    }

    const finalChunk = this.wmeEncoder.finalize();
    if (finalChunk.length > 0) {
      this.outputChunks.push(new Uint8Array(finalChunk));
    }

    // Calculate total MP3 data size.
    let mp3Size = 0;
    for (const chunk of this.outputChunks) {
      mp3Size += chunk.length;
    }

    // Build ID3v2 tag if metadata is present.
    const id3Tag = this.config.metadata
      ? buildId3v2Tag(this.config.metadata)
      : null;
    const id3Size = id3Tag?.length ?? 0;

    // Assemble final MP3 file: ID3v2 tag + MP3 frames.
    const result = new Uint8Array(id3Size + mp3Size);
    let offset = 0;

    if (id3Tag) {
      result.set(id3Tag, offset);
      offset += id3Tag.length;
    }

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
