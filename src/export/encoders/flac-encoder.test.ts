import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EncoderConfig } from './encoder-types';
import { FlacEncoder } from './flac-encoder';

// ---------------------------------------------------------------------------
// Mock libflac.js via dependency injection
// ---------------------------------------------------------------------------

let writeCallbackFn: ((buffer: Uint8Array, bytes: number) => void) | null =
  null;

function createMockFlac() {
  writeCallbackFn = null;

  return {
    ready: true,
    FLAC__METADATA_TYPE_VORBIS_COMMENT: 4,

    create_libflac_encoder: vi.fn((): number => 1),

    init_encoder_stream: vi.fn(
      (
        _handle: number,
        writeCb: (buffer: Uint8Array, bytes: number) => void,
      ): number => {
        writeCallbackFn = writeCb;
        return 0;
      },
    ),

    FLAC__metadata_object_new: vi.fn((): object => ({
      type: 'vorbis_comment',
    })),
    FLAC__metadata_object_vorbiscomment_entry_new: vi.fn(
      (field: string, value: string): object => ({ field, value }),
    ),
    FLAC__metadata_object_vorbiscomment_append_comment: vi.fn(
      (): boolean => true,
    ),
    FLAC__stream_encoder_set_metadata: vi.fn((): boolean => true),

    FLAC__stream_encoder_process_interleaved: vi.fn((): boolean => {
      if (writeCallbackFn) {
        const fakeData = new Uint8Array([
          0x66,
          0x4c,
          0x61,
          0x43, // 'fLaC' magic
          0x00,
          0x00,
          0x00,
          0x22, // STREAMINFO block header
          ...new Array(30).fill(0),
        ]);
        writeCallbackFn(fakeData, fakeData.length);
      }
      return true;
    }),

    FLAC__stream_encoder_finish: vi.fn((): boolean => true),
    FLAC__stream_encoder_delete: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlacEncoder', () => {
  let encoder: FlacEncoder;
  let mockFlac: ReturnType<typeof createMockFlac>;

  const defaultConfig: EncoderConfig = {
    sampleRate: 44100,
    channels: 2,
    bitsPerSample: 16,
    compression: 5,
  };

  beforeEach(() => {
    mockFlac = createMockFlac();
    encoder = new FlacEncoder(mockFlac);
  });

  it('creates encoder with correct parameters', async () => {
    await encoder.init(defaultConfig);

    expect(mockFlac.create_libflac_encoder).toHaveBeenCalledWith(
      44100,
      2,
      16,
      5,
      0,
      false,
    );
  });

  it('uses default compression level 5 when not specified', async () => {
    const config: EncoderConfig = {
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 16,
    };
    await encoder.init(config);

    expect(mockFlac.create_libflac_encoder).toHaveBeenCalledWith(
      48000,
      2,
      16,
      5,
      0,
      false,
    );
  });

  it('produces output with FLAC magic bytes (fLaC)', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, -100, 200, -200]));
    const result = encoder.finalize();

    expect(result[0]).toBe(0x66); // 'f'
    expect(result[1]).toBe(0x4c); // 'L'
    expect(result[2]).toBe(0x61); // 'a'
    expect(result[3]).toBe(0x43); // 'C'
  });

  it('widens int16 samples to int32 for libflac', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([32767, -32768, 0, 100]));

    const call = mockFlac.FLAC__stream_encoder_process_interleaved.mock
      .calls[0] as unknown as [number, Int32Array, number];
    const int32Buffer = call[1];

    expect(int32Buffer[0]).toBe(32767);
    expect(int32Buffer[1]).toBe(-32768);
    expect(int32Buffer[2]).toBe(0);
    expect(int32Buffer[3]).toBe(100);
  });

  it('passes correct sample count per channel', async () => {
    await encoder.init(defaultConfig);
    // 8 interleaved stereo samples = 4 samples per channel.
    encoder.encode(new Int16Array([1, 2, 3, 4, 5, 6, 7, 8]));

    const call = mockFlac.FLAC__stream_encoder_process_interleaved.mock
      .calls[0] as unknown as [number, Int32Array, number];
    expect(call[2]).toBe(4);
  });

  it('applies Vorbis comment metadata', async () => {
    const config: EncoderConfig = {
      ...defaultConfig,
      metadata: {
        title: 'Test Track',
        artist: 'Test Artist',
        game: 'Test Game',
        comment: 'A comment',
        year: '1995',
        trackNumber: 3,
      },
    };

    await encoder.init(config);

    expect(
      mockFlac.FLAC__metadata_object_vorbiscomment_entry_new,
    ).toHaveBeenCalledWith('TITLE', 'Test Track');
    expect(
      mockFlac.FLAC__metadata_object_vorbiscomment_entry_new,
    ).toHaveBeenCalledWith('ARTIST', 'Test Artist');
    expect(
      mockFlac.FLAC__metadata_object_vorbiscomment_entry_new,
    ).toHaveBeenCalledWith('ALBUM', 'Test Game');
    expect(
      mockFlac.FLAC__metadata_object_vorbiscomment_entry_new,
    ).toHaveBeenCalledWith('COMMENT', 'A comment');
    expect(
      mockFlac.FLAC__metadata_object_vorbiscomment_entry_new,
    ).toHaveBeenCalledWith('DATE', '1995');
    expect(
      mockFlac.FLAC__metadata_object_vorbiscomment_entry_new,
    ).toHaveBeenCalledWith('TRACKNUMBER', '3');

    expect(mockFlac.FLAC__stream_encoder_set_metadata).toHaveBeenCalled();
  });

  it('skips metadata when none provided', async () => {
    await encoder.init(defaultConfig);

    expect(
      mockFlac.FLAC__metadata_object_vorbiscomment_entry_new,
    ).not.toHaveBeenCalled();
    expect(mockFlac.FLAC__stream_encoder_set_metadata).not.toHaveBeenCalled();
  });

  it('accumulates multiple encode() chunks', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([1, 2]));
    encoder.encode(new Int16Array([3, 4]));

    expect(
      mockFlac.FLAC__stream_encoder_process_interleaved,
    ).toHaveBeenCalledTimes(2);

    const result = encoder.finalize();
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

  it('calls FLAC__stream_encoder_finish on finalize', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([0, 0]));
    encoder.finalize();

    expect(mockFlac.FLAC__stream_encoder_finish).toHaveBeenCalledWith(1);
  });

  it('deletes encoder handle on dispose', async () => {
    await encoder.init(defaultConfig);
    encoder.dispose();

    expect(mockFlac.FLAC__stream_encoder_delete).toHaveBeenCalledWith(1);
  });

  it('resets state on dispose', async () => {
    await encoder.init(defaultConfig);
    encoder.encode(new Int16Array([100, 200]));
    encoder.dispose();

    expect(() => encoder.encode(new Int16Array([0]))).toThrow();
  });

  it('throws when encoder creation fails', async () => {
    mockFlac.create_libflac_encoder.mockReturnValueOnce(0);

    await expect(encoder.init(defaultConfig)).rejects.toThrow(
      'failed to create encoder instance',
    );
  });

  it('throws when stream initialization fails', async () => {
    mockFlac.init_encoder_stream.mockReturnValueOnce(1);

    await expect(encoder.init(defaultConfig)).rejects.toThrow(
      'init_encoder_stream failed',
    );
  });

  it('throws when process_interleaved fails', async () => {
    mockFlac.FLAC__stream_encoder_process_interleaved.mockReturnValueOnce(
      false,
    );

    await encoder.init(defaultConfig);

    expect(() => encoder.encode(new Int16Array([0, 0]))).toThrow(
      'encoding failed during process_interleaved',
    );
  });
});
