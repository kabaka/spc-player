import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EncoderConfig } from './encoder-types';
import type { OpusEncoderDeps } from './opus-encoder';
import { isOpusEncoderAvailable, OpusEncoder } from './opus-encoder';

// ---------------------------------------------------------------------------
// Mock WebCodecs via dependency injection
// ---------------------------------------------------------------------------

interface MockEncodedChunk {
  timestamp: number;
  duration: number;
  byteLength: number;
  copyTo(dest: ArrayBufferView): void;
}

function createMockDeps() {
  let outputCallback: ((chunk: MockEncodedChunk) => void) | null = null;
  let errorCallback: ((err: Error) => void) | null = null;
  let encodeCallCount = 0;

  /** Fake Opus frame data. */
  const fakeOpusFrame = new Uint8Array([
    0x48,
    0x00,
    0x00,
    0x00, // Opus TOC byte + padding
    0x01,
    0x02,
    0x03,
    0x04,
  ]);

  const mockEncoder = {
    configure: vi.fn(),
    encode: vi.fn((_data: unknown) => {
      encodeCallCount++;
      // Simulate output callback firing with an encoded chunk.
      if (outputCallback) {
        const chunk: MockEncodedChunk = {
          timestamp: (encodeCallCount - 1) * 20_000, // 20ms per frame
          duration: 20_000,
          byteLength: fakeOpusFrame.length,
          copyTo: (dest: ArrayBufferView) => {
            new Uint8Array(
              dest.buffer,
              dest.byteOffset,
              fakeOpusFrame.length,
            ).set(fakeOpusFrame);
          },
        };
        outputCallback(chunk);
      }
    }),
    flush: vi.fn(async () => {
      // Simulate flush producing one final chunk.
      if (outputCallback) {
        const chunk: MockEncodedChunk = {
          timestamp: encodeCallCount * 20_000,
          duration: 20_000,
          byteLength: fakeOpusFrame.length,
          copyTo: (dest: ArrayBufferView) => {
            new Uint8Array(
              dest.buffer,
              dest.byteOffset,
              fakeOpusFrame.length,
            ).set(fakeOpusFrame);
          },
        };
        outputCallback(chunk);
      }
    }),
    close: vi.fn(),
    state: 'configured' as string,
  };

  const mockAudioData = {
    close: vi.fn(),
  };

  const deps: OpusEncoderDeps = {
    createAudioEncoder: (init) => {
      outputCallback = init.output;
      errorCallback = init.error;
      return mockEncoder;
    },
    createAudioData: (_init) => mockAudioData,
  };

  return {
    deps,
    mockEncoder,
    mockAudioData,
    getErrorCallback: () => errorCallback,
    resetEncodeCount: () => {
      encodeCallCount = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isOpusEncoderAvailable', () => {
  it('returns false when AudioEncoder is not defined', async () => {
    // In the test environment (Node/jsdom), AudioEncoder is not defined.
    expect(await isOpusEncoderAvailable()).toBe(false);
  });
});

describe('OpusEncoder', () => {
  let encoder: OpusEncoder;
  let mock: ReturnType<typeof createMockDeps>;

  const defaultConfig: EncoderConfig = {
    sampleRate: 48000,
    channels: 2,
    bitsPerSample: 16,
    quality: 2,
  };

  beforeEach(() => {
    mock = createMockDeps();
    encoder = new OpusEncoder(mock.deps);
  });

  // --- Feature detection ---

  it('throws when WebCodecs is unavailable and no deps injected', async () => {
    const realEncoder = new OpusEncoder();
    await expect(realEncoder.init(defaultConfig)).rejects.toThrow(
      'WebCodecs support',
    );
  });

  // --- Initialization ---

  it('configures AudioEncoder with correct parameters', async () => {
    await encoder.init(defaultConfig);

    expect(mock.mockEncoder.configure).toHaveBeenCalledWith({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  });

  it('uses default bitrate 128kbps when quality not specified', async () => {
    const config: EncoderConfig = {
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 16,
    };
    await encoder.init(config);

    expect(mock.mockEncoder.configure).toHaveBeenCalledWith(
      expect.objectContaining({ bitrate: 128_000 }),
    );
  });

  it('maps quality 0 to highest bitrate (320kbps)', async () => {
    const config: EncoderConfig = { ...defaultConfig, quality: 0 };
    await encoder.init(config);

    expect(mock.mockEncoder.configure).toHaveBeenCalledWith(
      expect.objectContaining({ bitrate: 320_000 }),
    );
  });

  it('maps quality 9 to lowest bitrate (32kbps)', async () => {
    const config: EncoderConfig = { ...defaultConfig, quality: 9 };
    await encoder.init(config);

    expect(mock.mockEncoder.configure).toHaveBeenCalledWith(
      expect.objectContaining({ bitrate: 32_000 }),
    );
  });

  // --- Encoding ---

  it('creates AudioData and feeds to encoder', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));

    expect(mock.mockEncoder.encode).toHaveBeenCalledTimes(1);
    expect(mock.mockAudioData.close).toHaveBeenCalledTimes(1);
  });

  it('accumulates multiple encode() calls', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([1, 2, 3, 4]));
    encoder.encode(new Int16Array([5, 6, 7, 8]));

    expect(mock.mockEncoder.encode).toHaveBeenCalledTimes(2);
  });

  it('skips encoding when samples produce zero frames', async () => {
    const monoConfig: EncoderConfig = {
      ...defaultConfig,
      channels: 1,
    };
    await encoder.init(monoConfig);
    // Empty sample array
    encoder.encode(new Int16Array(0));

    expect(mock.mockEncoder.encode).not.toHaveBeenCalled();
  });

  it('throws if encode() is called before init()', () => {
    expect(() => encoder.encode(new Int16Array([0]))).toThrow(
      'init() must be called before encode()',
    );
  });

  // --- Finalize ---

  it('produces output with WebM EBML magic bytes', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));
    const result = await encoder.finalize();

    // WebM starts with EBML header: 0x1A 0x45 0xDF 0xA3
    expect(result[0]).toBe(0x1a);
    expect(result[1]).toBe(0x45);
    expect(result[2]).toBe(0xdf);
    expect(result[3]).toBe(0xa3);
  });

  it('contains "webm" DocType in the EBML header', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));
    const result = await encoder.finalize();

    // The string "webm" should appear in the EBML header.
    const decoded = new TextDecoder().decode(result.subarray(0, 50));
    expect(decoded).toContain('webm');
  });

  it('contains A_OPUS codec ID', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));
    const result = await encoder.finalize();

    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('A_OPUS');
  });

  it('contains OpusHead in CodecPrivate', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));
    const result = await encoder.finalize();

    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('OpusHead');
  });

  it('flushes the encoder during finalize', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100]));
    await encoder.finalize();

    expect(mock.mockEncoder.flush).toHaveBeenCalled();
  });

  it('throws if finalize() is called before init()', async () => {
    await expect(encoder.finalize()).rejects.toThrow(
      'init() must be called before finalize()',
    );
  });

  // --- Error handling ---

  it('throws encoder error on encode()', async () => {
    await encoder.init(defaultConfig);

    // Simulate the error callback being called
    const errCb = mock.getErrorCallback();
    errCb?.(new Error('Encoder hardware failure'));

    expect(() => encoder.encode(new Int16Array([0, 0]))).toThrow(
      'Encoder hardware failure',
    );
  });

  // --- Dispose ---

  it('closes the AudioEncoder on dispose', async () => {
    await encoder.init(defaultConfig);
    encoder.dispose();

    expect(mock.mockEncoder.close).toHaveBeenCalled();
  });

  it('resets state on dispose', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, 200]));
    encoder.dispose();

    expect(() => encoder.encode(new Int16Array([0]))).toThrow();
  });

  it('does not throw if dispose() is called without init()', () => {
    expect(() => encoder.dispose()).not.toThrow();
  });
});
