import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EncoderConfig } from './encoder-types';
import { OggEncoder } from './ogg-encoder';

// ---------------------------------------------------------------------------
// Mock wasm-media-encoders OGG encoder via dependency injection
// ---------------------------------------------------------------------------

/** Fake OGG page data with OggS magic bytes. */
const fakeOggOutput = new Uint8Array([
  0x4f,
  0x67,
  0x67,
  0x53, // 'OggS' capture pattern
  0x00, // version
  0x02, // header type (beginning of stream)
  ...new Array(20).fill(0),
]);

function createMockWmeOggEncoder() {
  return {
    configure: vi.fn(),
    encode: vi.fn(
      (_samples: readonly Float32Array[]): Uint8Array => fakeOggOutput,
    ),
    finalize: vi.fn((): Uint8Array => new Uint8Array(0)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OggEncoder', () => {
  let encoder: OggEncoder;
  let mockWme: ReturnType<typeof createMockWmeOggEncoder>;

  const defaultConfig: EncoderConfig = {
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16,
    quality: 6,
  };

  beforeEach(() => {
    mockWme = createMockWmeOggEncoder();
    encoder = new OggEncoder(mockWme);
  });

  it('configures encoder with correct parameters', async () => {
    await encoder.init(defaultConfig);

    expect(mockWme.configure).toHaveBeenCalledWith({
      channels: 2,
      sampleRate: 44100,
      vbrQuality: 6,
    });
  });

  it('uses default quality 6 when not specified', async () => {
    const config: EncoderConfig = {
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 16,
    };
    await encoder.init(config);

    expect(mockWme.configure).toHaveBeenCalledWith({
      channels: 2,
      sampleRate: 48000,
      vbrQuality: 6,
    });
  });

  it('produces output with OggS magic bytes', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));
    const result = encoder.finalize();

    expect(result[0]).toBe(0x4f); // 'O'
    expect(result[1]).toBe(0x67); // 'g'
    expect(result[2]).toBe(0x67); // 'g'
    expect(result[3]).toBe(0x53); // 'S'
  });

  it('does not attempt to embed metadata (not supported)', async () => {
    const config: EncoderConfig = {
      ...defaultConfig,
      metadata: {
        title: 'Test Track',
        artist: 'Test Artist',
      },
    };

    // Should not throw — metadata is silently ignored.
    await encoder.init(config);

    // configure is called but metadata fields are not passed.
    expect(mockWme.configure).toHaveBeenCalledWith({
      channels: 2,
      sampleRate: 44100,
      vbrQuality: 6,
    });
  });

  it('delegates encode() to the underlying encoder', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));

    expect(mockWme.encode).toHaveBeenCalled();
  });

  it('de-interleaves stereo samples for the encoder', async () => {
    await encoder.init(defaultConfig);

    // Stereo: L0, R0, L1, R1
    encoder.encode(new Int16Array([1000, -1000, 2000, -2000]));

    const callArgs = mockWme.encode.mock.calls[0][0];
    expect(callArgs).toHaveLength(2);
    // Left channel
    expect(callArgs[0][0]).toBeCloseTo(1000 / 32768, 4);
    expect(callArgs[0][1]).toBeCloseTo(2000 / 32768, 4);
    // Right channel
    expect(callArgs[1][0]).toBeCloseTo(-1000 / 32768, 4);
    expect(callArgs[1][1]).toBeCloseTo(-2000 / 32768, 4);
  });

  it('concatenates encode and finalize chunks', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([0, 0]));
    const result = encoder.finalize();

    expect(mockWme.encode).toHaveBeenCalled();
    expect(mockWme.finalize).toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
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

  it('handles mono encoding', async () => {
    const monoConfig: EncoderConfig = {
      sampleRate: 32000,
      channels: 1,
      bitsPerSample: 16,
      quality: 4,
    };

    await encoder.init(monoConfig);
    expect(mockWme.configure).toHaveBeenCalledWith({
      channels: 1,
      sampleRate: 32000,
      vbrQuality: 4,
    });

    encoder.encode(new Int16Array([100, 200, 300, 400]));

    const callArgs = mockWme.encode.mock.calls[0][0];
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0]).toHaveLength(4);
  });
});
