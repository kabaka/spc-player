/* eslint-disable @typescript-eslint/no-non-null-assertion -- test assertions validate non-null before use */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EncoderConfig, ExportMetadata } from './encoder-types';
import { buildId3v2Tag, Mp3Encoder } from './mp3-encoder';

// ---------------------------------------------------------------------------
// Mock wasm-media-encoders MP3 encoder via dependency injection
// ---------------------------------------------------------------------------

/** Fake MP3 frame data with sync bytes. */
const fakeMp3Frame = new Uint8Array([
  0xff,
  0xfb, // MP3 frame sync
  0x90,
  0x00, // frame header bytes
  ...new Array(12).fill(0),
]);

function createMockWmeMp3Encoder() {
  return {
    configure: vi.fn(),
    encode: vi.fn(
      (_samples: readonly Float32Array[]): Uint8Array => fakeMp3Frame,
    ),
    finalize: vi.fn((): Uint8Array => new Uint8Array(0)),
  };
}

// ---------------------------------------------------------------------------
// ID3v2 Tag Tests
// ---------------------------------------------------------------------------

describe('buildId3v2Tag', () => {
  it('returns null when no metadata fields are present', () => {
    const result = buildId3v2Tag({});
    expect(result).toBeNull();
  });

  it('produces a valid ID3v2.4 header', () => {
    const tag = buildId3v2Tag({ title: 'Test' })!;
    expect(tag).not.toBeNull();

    // "ID3" magic bytes
    expect(tag[0]).toBe(0x49); // 'I'
    expect(tag[1]).toBe(0x44); // 'D'
    expect(tag[2]).toBe(0x33); // '3'

    // Version: ID3v2.4.0
    expect(tag[3]).toBe(0x04);
    expect(tag[4]).toBe(0x00);

    // Flags: none
    expect(tag[5]).toBe(0x00);

    // Size is syncsafe integer (4 bytes).
    const size =
      ((tag[6] & 0x7f) << 21) |
      ((tag[7] & 0x7f) << 14) |
      ((tag[8] & 0x7f) << 7) |
      (tag[9] & 0x7f);
    expect(size).toBe(tag.length - 10);
  });

  it('contains TIT2 frame for title', () => {
    const tag = buildId3v2Tag({ title: 'My Song' })!;
    const text = new TextDecoder().decode(tag);
    expect(text).toContain('TIT2');
    expect(text).toContain('My Song');
  });

  it('contains TPE1 frame for artist', () => {
    const tag = buildId3v2Tag({ artist: 'Nobuo Uematsu' })!;
    const text = new TextDecoder().decode(tag);
    expect(text).toContain('TPE1');
    expect(text).toContain('Nobuo Uematsu');
  });

  it('contains TALB frame for game', () => {
    const tag = buildId3v2Tag({ game: 'Final Fantasy VI' })!;
    const text = new TextDecoder().decode(tag);
    expect(text).toContain('TALB');
    expect(text).toContain('Final Fantasy VI');
  });

  it('contains COMM frame for comment', () => {
    const tag = buildId3v2Tag({ comment: 'Exported by SPC Player' })!;
    const text = new TextDecoder().decode(tag);
    expect(text).toContain('COMM');
    expect(text).toContain('Exported by SPC Player');
  });

  it('includes TYER frame for year', () => {
    const tag = buildId3v2Tag({ title: 'X', year: '1994' })!;
    const text = new TextDecoder().decode(tag);
    expect(text).toContain('TYER');
    expect(text).toContain('1994');
  });

  it('includes TRCK frame for track number', () => {
    const tag = buildId3v2Tag({ title: 'X', trackNumber: 5 })!;
    const text = new TextDecoder().decode(tag);
    expect(text).toContain('TRCK');
    expect(text).toContain('5');
  });

  it('includes all fields when fully populated', () => {
    const metadata: ExportMetadata = {
      title: 'Terra',
      artist: 'Nobuo Uematsu',
      game: 'Final Fantasy VI',
      comment: 'Exported by SPC Player',
      year: '1994',
      trackNumber: 1,
    };

    const tag = buildId3v2Tag(metadata)!;
    expect(tag.length).toBeGreaterThan(10);

    const text = new TextDecoder().decode(tag);
    expect(text).toContain('TIT2');
    expect(text).toContain('TPE1');
    expect(text).toContain('TALB');
    expect(text).toContain('COMM');
    expect(text).toContain('TYER');
    expect(text).toContain('TRCK');
  });

  it('uses UTF-8 encoding byte (0x03) in text frames', () => {
    const tag = buildId3v2Tag({ title: 'Test' })!;

    // After the 10-byte ID3 header, the TIT2 frame starts.
    // Frame: TIT2 (4) + size (4) + flags (2) + encoding (1) = byte at offset 20.
    expect(tag[20]).toBe(0x03);
  });

  it('COMM frame contains language code "eng"', () => {
    const tag = buildId3v2Tag({ comment: 'hello' })!;

    // Find COMM in the byte stream.
    let commOffset = -1;
    for (let i = 10; i < tag.length - 4; i++) {
      if (
        tag[i] === 0x43 &&
        tag[i + 1] === 0x4f &&
        tag[i + 2] === 0x4d &&
        tag[i + 3] === 0x4d
      ) {
        commOffset = i;
        break;
      }
    }
    expect(commOffset).not.toBe(-1);

    // Encoding byte at commOffset + 10, language at +11..+13.
    expect(tag[commOffset + 10]).toBe(0x03); // UTF-8
    expect(tag[commOffset + 11]).toBe(0x65); // 'e'
    expect(tag[commOffset + 12]).toBe(0x6e); // 'n'
    expect(tag[commOffset + 13]).toBe(0x67); // 'g'
  });
});

// ---------------------------------------------------------------------------
// Mp3Encoder Tests
// ---------------------------------------------------------------------------

describe('Mp3Encoder', () => {
  let encoder: Mp3Encoder;
  let mockWme: ReturnType<typeof createMockWmeMp3Encoder>;

  const defaultConfig: EncoderConfig = {
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16,
    quality: 2,
  };

  beforeEach(() => {
    mockWme = createMockWmeMp3Encoder();
    encoder = new Mp3Encoder(mockWme);
  });

  it('configures encoder with correct parameters', async () => {
    await encoder.init(defaultConfig);

    expect(mockWme.configure).toHaveBeenCalledWith({
      channels: 2,
      sampleRate: 44100,
      vbrQuality: 2,
    });
  });

  it('uses default quality 2 when not specified', async () => {
    const config: EncoderConfig = {
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 16,
    };
    await encoder.init(config);

    expect(mockWme.configure).toHaveBeenCalledWith({
      channels: 2,
      sampleRate: 48000,
      vbrQuality: 2,
    });
  });

  it('passes VBR quality directly to configure', async () => {
    const qualities = [0, 4, 9];

    for (const quality of qualities) {
      const mock = createMockWmeMp3Encoder();
      const e = new Mp3Encoder(mock);
      const config: EncoderConfig = { ...defaultConfig, quality };
      await e.init(config);
      expect(mock.configure).toHaveBeenCalledWith({
        channels: 2,
        sampleRate: 44100,
        vbrQuality: quality,
      });
      e.dispose();
    }
  });

  it('produces output with MP3 frame sync bytes', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));
    const result = encoder.finalize();

    // Without metadata, first bytes are the MP3 frame sync.
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xfb);
  });

  it('prepends ID3v2 tag when metadata is present', async () => {
    const config: EncoderConfig = {
      ...defaultConfig,
      metadata: { title: 'Test Song', artist: 'Test Artist' },
    };

    await encoder.init(config);
    encoder.encode(new Int16Array([100, -100]));
    const result = encoder.finalize();

    // ID3v2 tag at start.
    expect(result[0]).toBe(0x49); // 'I'
    expect(result[1]).toBe(0x44); // 'D'
    expect(result[2]).toBe(0x33); // '3'

    // MP3 frame sync follows after the ID3 tag.
    const id3Size =
      ((result[6] & 0x7f) << 21) |
      ((result[7] & 0x7f) << 14) |
      ((result[8] & 0x7f) << 7) |
      (result[9] & 0x7f);
    const mp3Start = 10 + id3Size;
    expect(result[mp3Start]).toBe(0xff);
    expect(result[mp3Start + 1]).toBe(0xfb);
  });

  it('de-interleaves stereo into per-channel Float32Arrays', async () => {
    await encoder.init(defaultConfig);
    // L0=100, R0=-100, L1=200, R1=-200
    encoder.encode(new Int16Array([100, -100, 200, -200]));

    const callArgs = mockWme.encode.mock.calls[0][0];
    expect(callArgs).toHaveLength(2);
    // Left channel (normalized float32)
    expect(callArgs[0][0]).toBeCloseTo(100 / 32768, 4);
    expect(callArgs[0][1]).toBeCloseTo(200 / 32768, 4);
    // Right channel (normalized float32)
    expect(callArgs[1][0]).toBeCloseTo(-100 / 32768, 4);
    expect(callArgs[1][1]).toBeCloseTo(-200 / 32768, 4);
  });

  it('handles mono encoding', async () => {
    const monoConfig: EncoderConfig = {
      sampleRate: 32000,
      channels: 1,
      bitsPerSample: 16,
      quality: 5,
    };

    await encoder.init(monoConfig);
    expect(mockWme.configure).toHaveBeenCalledWith({
      channels: 1,
      sampleRate: 32000,
      vbrQuality: 5,
    });

    encoder.encode(new Int16Array([100, 200, 300]));

    const callArgs = mockWme.encode.mock.calls[0][0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0][0]).toBeCloseTo(100 / 32768, 4);
  });

  it('accumulates multiple encode() chunks', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([1, 2]));
    encoder.encode(new Int16Array([3, 4]));

    expect(mockWme.encode).toHaveBeenCalledTimes(2);

    const result = encoder.finalize();
    expect(result.length).toBeGreaterThan(0);
  });

  it('calls finalize() on the wasm encoder during finalize', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([0, 0]));
    encoder.finalize();

    expect(mockWme.finalize).toHaveBeenCalled();
  });

  it('throws if encode() is called before init()', () => {
    expect(() => encoder.encode(new Int16Array([0]))).toThrow(
      'init() must be called before encode()',
    );
  });

  it('throws if finalize() is called before init()', () => {
    expect(() => encoder.finalize()).toThrow(
      'init() must be called before finalize()',
    );
  });

  it('resets state on dispose', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, 200]));
    encoder.dispose();

    expect(() => encoder.encode(new Int16Array([0]))).toThrow();
  });

  it('does not prepend ID3v2 tag when no metadata provided', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([0, 0]));
    const result = encoder.finalize();

    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xfb);
  });
});
