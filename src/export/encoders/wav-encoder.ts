/**
 * Custom TypeScript WAV encoder.
 *
 * Produces RIFF/WAVE containers with PCM 16-bit audio (mono or stereo)
 * and optional LIST/INFO metadata chunks.
 *
 * @see docs/design/export-pipeline.md §6
 * @see docs/adr/0006-audio-codec-libraries.md
 */

import type { Encoder, EncoderConfig, ExportMetadata } from './encoder-types';

/** Encode a UTF-8 string to bytes, truncated to fit the WAV INFO chunk. */
function encodeString(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Build a LIST/INFO chunk containing RIFF INFO metadata fields.
 * Returns null if no metadata fields are present.
 */
function buildInfoChunk(metadata: ExportMetadata): Uint8Array | null {
  const entries: { id: string; data: Uint8Array }[] = [];

  if (metadata.title) {
    entries.push({ id: 'INAM', data: encodeString(metadata.title) });
  }
  if (metadata.artist) {
    entries.push({ id: 'IART', data: encodeString(metadata.artist) });
  }
  if (metadata.comment) {
    entries.push({ id: 'ICMT', data: encodeString(metadata.comment) });
  }

  if (entries.length === 0) return null;

  // Calculate total LIST chunk size: 4 bytes for 'INFO' + sub-chunks
  let infoPayloadSize = 4; // 'INFO' type identifier
  for (const entry of entries) {
    // Each sub-chunk: 4 (id) + 4 (size) + data + null terminator + optional pad byte
    const dataLen = entry.data.length + 1; // +1 for null terminator
    const paddedLen = dataLen + (dataLen % 2); // pad to even
    infoPayloadSize += 8 + paddedLen;
  }

  // LIST chunk: 4 (LIST) + 4 (size) + payload
  const chunk = new Uint8Array(8 + infoPayloadSize);
  const view = new DataView(chunk.buffer);
  let offset = 0;

  // 'LIST' chunk header
  chunk.set(encodeString('LIST'), offset);
  offset += 4;
  view.setUint32(offset, infoPayloadSize, true);
  offset += 4;

  // 'INFO' type
  chunk.set(encodeString('INFO'), offset);
  offset += 4;

  // Sub-chunks
  for (const entry of entries) {
    chunk.set(encodeString(entry.id), offset);
    offset += 4;
    const dataLen = entry.data.length + 1; // include null terminator
    const paddedLen = dataLen + (dataLen % 2);
    view.setUint32(offset, dataLen, true);
    offset += 4;
    chunk.set(entry.data, offset);
    offset += entry.data.length;
    // Null terminator (and pad byte if needed) — already zeroed by Uint8Array
    offset += paddedLen - entry.data.length;
  }

  return chunk;
}

/** Create a new WAV encoder instance. */
export function createWavEncoder(): Encoder {
  return new WavEncoder();
}

/** Custom TypeScript WAV encoder implementing the streaming Encoder interface. */
export class WavEncoder implements Encoder {
  private config: EncoderConfig | null = null;
  private chunks: Int16Array[] = [];
  private totalSamples = 0;

  init(config: EncoderConfig): void {
    this.config = config;
    this.chunks = [];
    this.totalSamples = 0;
  }

  encode(samples: Int16Array): void {
    if (!this.config) {
      throw new Error('WavEncoder: init() must be called before encode()');
    }
    this.chunks.push(new Int16Array(samples));
    this.totalSamples += samples.length;
  }

  finalize(): Uint8Array {
    if (!this.config) {
      throw new Error('WavEncoder: init() must be called before finalize()');
    }

    const { sampleRate, channels, bitsPerSample } = this.config;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = this.totalSamples * bytesPerSample;

    if (dataSize > 0xffffffff - 44) {
      throw new Error('WAV data exceeds 4 GB RIFF size limit');
    }

    // Build optional INFO chunk
    const infoChunk = this.config.metadata
      ? buildInfoChunk(this.config.metadata)
      : null;
    const infoSize = infoChunk?.length ?? 0;

    // RIFF header (12) + fmt chunk (24) + data chunk header (8) + data + INFO
    const fileSize = 12 + 24 + 8 + dataSize + infoSize;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    // RIFF header
    bytes.set(encodeString('RIFF'), offset);
    offset += 4;
    view.setUint32(offset, fileSize - 8, true); // file size minus RIFF header
    offset += 4;
    bytes.set(encodeString('WAVE'), offset);
    offset += 4;

    // fmt chunk
    bytes.set(encodeString('fmt '), offset);
    offset += 4;
    view.setUint32(offset, 16, true); // fmt chunk size (PCM = 16)
    offset += 4;
    view.setUint16(offset, 1, true); // audio format: PCM = 1
    offset += 2;
    view.setUint16(offset, channels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, byteRate, true);
    offset += 4;
    view.setUint16(offset, blockAlign, true);
    offset += 2;
    view.setUint16(offset, bitsPerSample, true);
    offset += 2;

    // data chunk header
    bytes.set(encodeString('data'), offset);
    offset += 4;
    view.setUint32(offset, dataSize, true);
    offset += 4;

    // PCM data — write int16 samples as little-endian
    for (const chunk of this.chunks) {
      for (const sample of chunk) {
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    // INFO chunk (after data)
    if (infoChunk) {
      bytes.set(infoChunk, offset);
    }

    return bytes;
  }

  dispose(): void {
    this.config = null;
    this.chunks = [];
    this.totalSamples = 0;
  }
}
