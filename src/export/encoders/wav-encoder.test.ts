import { describe, it, expect, beforeEach } from 'vitest';

import type { EncoderConfig } from './encoder-types';
import { WavEncoder } from './wav-encoder';

/** Read a 4-char ASCII string from a buffer at the given offset. */
function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

describe('WavEncoder', () => {
  let encoder: WavEncoder;

  beforeEach(() => {
    encoder = new WavEncoder();
  });

  it('produces a valid RIFF/WAVE header for stereo 16-bit PCM', () => {
    const config: EncoderConfig = {
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    };
    encoder.init(config);

    // 4 stereo samples: L0 R0 L1 R1 L2 R2 L3 R3
    const samples = new Int16Array([
      100, -100, 200, -200, 300, -300, 400, -400,
    ]);
    encoder.encode(samples);

    const result = encoder.finalize();
    const view = new DataView(result.buffer);

    // RIFF header
    expect(readFourCC(view, 0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(result.length - 8);
    expect(readFourCC(view, 8)).toBe('WAVE');

    // fmt chunk
    expect(readFourCC(view, 12)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // PCM fmt size
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint32(28, true)).toBe(44100 * 4); // byte rate
    expect(view.getUint16(32, true)).toBe(4); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    // data chunk
    expect(readFourCC(view, 36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
  });

  it('produces a valid RIFF/WAVE header for mono 16-bit PCM', () => {
    const config: EncoderConfig = {
      sampleRate: 32000,
      channels: 1,
      bitsPerSample: 16,
    };
    encoder.init(config);
    encoder.encode(new Int16Array([1000, -1000, 2000, -2000]));

    const result = encoder.finalize();
    const view = new DataView(result.buffer);

    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(32000); // sample rate
    expect(view.getUint32(28, true)).toBe(32000 * 2); // byte rate (mono 16-bit)
    expect(view.getUint16(32, true)).toBe(2); // block align (mono 16-bit)
  });

  it('round-trips PCM data bit-exactly', () => {
    const config: EncoderConfig = {
      sampleRate: 48000,
      channels: 2,
      bitsPerSample: 16,
    };
    encoder.init(config);

    const input = new Int16Array([0, 0, 32767, -32768, 1, -1, 16384, -16384]);
    encoder.encode(input);

    const result = encoder.finalize();
    const view = new DataView(result.buffer);

    // Data starts at offset 44
    const dataOffset = 44;
    for (let i = 0; i < input.length; i++) {
      expect(view.getInt16(dataOffset + i * 2, true)).toBe(input[i]);
    }
  });

  it('accumulates multiple encode() chunks', () => {
    const config: EncoderConfig = {
      sampleRate: 44100,
      channels: 1,
      bitsPerSample: 16,
    };
    encoder.init(config);

    const chunk1 = new Int16Array([100, 200]);
    const chunk2 = new Int16Array([300, 400]);
    encoder.encode(chunk1);
    encoder.encode(chunk2);

    const result = encoder.finalize();
    const view = new DataView(result.buffer);

    // data chunk size = 4 samples × 2 bytes
    expect(view.getUint32(40, true)).toBe(8);

    // verify all samples
    const dataOffset = 44;
    expect(view.getInt16(dataOffset, true)).toBe(100);
    expect(view.getInt16(dataOffset + 2, true)).toBe(200);
    expect(view.getInt16(dataOffset + 4, true)).toBe(300);
    expect(view.getInt16(dataOffset + 6, true)).toBe(400);
  });

  it('handles empty input', () => {
    const config: EncoderConfig = {
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    };
    encoder.init(config);

    const result = encoder.finalize();
    const view = new DataView(result.buffer);

    // RIFF header still valid
    expect(readFourCC(view, 0)).toBe('RIFF');
    expect(readFourCC(view, 8)).toBe('WAVE');

    // data size = 0
    expect(view.getUint32(40, true)).toBe(0);

    // Total file = 44 bytes (header only)
    expect(result.length).toBe(44);
  });

  it('embeds LIST/INFO metadata chunk', () => {
    const config: EncoderConfig = {
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      metadata: {
        title: 'Test Song',
        artist: 'Test Artist',
        comment: 'A comment',
      },
    };
    encoder.init(config);
    encoder.encode(new Int16Array([0, 0]));

    const result = encoder.finalize();
    const view = new DataView(result.buffer);

    // Find the LIST chunk after the data chunk
    const dataChunkSize = view.getUint32(40, true);
    const listOffset = 44 + dataChunkSize;

    expect(readFourCC(view, listOffset)).toBe('LIST');
    const listSize = view.getUint32(listOffset + 4, true);
    expect(listSize).toBeGreaterThan(4);
    expect(readFourCC(view, listOffset + 8)).toBe('INFO');

    // Verify RIFF size accounts for LIST chunk
    const riffSize = view.getUint32(4, true);
    expect(riffSize).toBe(result.length - 8);

    // Verify INAM sub-chunk exists
    const infoContent = new TextDecoder().decode(
      result.slice(listOffset + 8, listOffset + 8 + listSize),
    );
    expect(infoContent).toContain('INFO');
    expect(infoContent).toContain('INAM');
    expect(infoContent).toContain('Test Song');
  });

  it('omits LIST/INFO chunk when no metadata is provided', () => {
    const config: EncoderConfig = {
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    };
    encoder.init(config);
    encoder.encode(new Int16Array([0, 0]));

    const result = encoder.finalize();
    // Without metadata: header (44) + data (4 bytes)
    expect(result.length).toBe(48);
  });

  it('omits LIST/INFO chunk when metadata has no relevant fields', () => {
    const config: EncoderConfig = {
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      metadata: {
        year: '1995',
        dumper: 'Someone',
      },
    };
    encoder.init(config);
    encoder.encode(new Int16Array([0, 0]));

    const result = encoder.finalize();
    // year/dumper are not mapped to RIFF INFO fields, so no LIST chunk
    expect(result.length).toBe(48);
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

  it('resets state on dispose()', () => {
    encoder.init({
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
    });
    encoder.encode(new Int16Array([100, 200]));
    encoder.dispose();

    // After dispose, encode should throw
    expect(() => encoder.encode(new Int16Array([0]))).toThrow();
  });
});
