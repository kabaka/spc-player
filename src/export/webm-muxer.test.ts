import { describe, expect, it } from 'vitest';

import type { OpusFrame, WebmMuxerConfig } from './webm-muxer';
import {
  buildOpusHead,
  buildSimpleBlock,
  encodeVint,
  muxOpusWebm,
} from './webm-muxer';

// ---------------------------------------------------------------------------
// encodeVint
// ---------------------------------------------------------------------------

describe('encodeVint', () => {
  it('encodes 0 as single byte with VINT marker', () => {
    const result = encodeVint(0);
    expect(result).toEqual(new Uint8Array([0x80]));
  });

  it('encodes values up to 126 as single byte', () => {
    const result = encodeVint(126);
    // 0x80 | 126 = 0xFE
    expect(result).toEqual(new Uint8Array([0xfe]));
  });

  it('encodes 127 as two bytes (exceeds 1-byte VINT range)', () => {
    const result = encodeVint(127);
    expect(result.length).toBe(2);
    // 0x40 | (127 >> 8) = 0x40, 127 & 0xFF = 0x7F
    expect(result[0]).toBe(0x40);
    expect(result[1]).toBe(0x7f);
  });

  it('encodes 16382 as two bytes (max 2-byte VINT)', () => {
    const result = encodeVint(16382);
    expect(result.length).toBe(2);
    // 0x40 | (16382 >> 8) = 0x40 | 0x3F = 0x7F
    expect(result[0]).toBe(0x7f);
    expect(result[1]).toBe(0xfe);
  });

  it('encodes 16383 as three bytes (exceeds 2-byte VINT range)', () => {
    const result = encodeVint(16383);
    expect(result.length).toBe(3);
    expect(result[0] & 0x20).toBe(0x20); // 3-byte VINT marker
  });

  it('encodes values in 4-byte range', () => {
    const result = encodeVint(0x200000);
    expect(result.length).toBe(4);
    expect(result[0] & 0x10).toBe(0x10); // 4-byte VINT marker
  });
});

// ---------------------------------------------------------------------------
// buildOpusHead
// ---------------------------------------------------------------------------

describe('buildOpusHead', () => {
  it('produces a 19-byte OpusHead structure', () => {
    const head = buildOpusHead(48000, 2);
    expect(head.length).toBe(19);
  });

  it('starts with "OpusHead" magic signature', () => {
    const head = buildOpusHead(48000, 2);
    const magic = new TextDecoder().decode(head.subarray(0, 8));
    expect(magic).toBe('OpusHead');
  });

  it('has version 1 at byte 8', () => {
    const head = buildOpusHead(48000, 2);
    expect(head[8]).toBe(1);
  });

  it('stores channel count at byte 9', () => {
    const mono = buildOpusHead(44100, 1);
    expect(mono[9]).toBe(1);

    const stereo = buildOpusHead(48000, 2);
    expect(stereo[9]).toBe(2);
  });

  it('stores pre-skip as little-endian uint16 at bytes 10-11', () => {
    const head = buildOpusHead(48000, 2);
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const preSkip = view.getUint16(10, true);
    expect(preSkip).toBe(3840);
  });

  it('stores input sample rate as little-endian uint32 at bytes 12-15', () => {
    const head = buildOpusHead(32000, 2);
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const sampleRate = view.getUint32(12, true);
    expect(sampleRate).toBe(32000);
  });

  it('stores output gain as 0 dB at bytes 16-17', () => {
    const head = buildOpusHead(48000, 2);
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    expect(view.getInt16(16, true)).toBe(0);
  });

  it('uses channel mapping family 0 at byte 18', () => {
    const head = buildOpusHead(48000, 2);
    expect(head[18]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildSimpleBlock
// ---------------------------------------------------------------------------

describe('buildSimpleBlock', () => {
  it('starts with track number VINT', () => {
    const block = buildSimpleBlock(1, 0, new Uint8Array([0xaa]));
    // Track 1 as VINT = 0x81
    expect(block[0]).toBe(0x81);
  });

  it('encodes relative timestamp as big-endian int16', () => {
    const block = buildSimpleBlock(1, 500, new Uint8Array([0x00]));
    // After track VINT (1 byte), timestamp is at bytes 1-2
    const ts = (block[1] << 8) | block[2];
    expect(ts).toBe(500);
  });

  it('encodes negative relative timestamps', () => {
    const block = buildSimpleBlock(1, -100, new Uint8Array([0x00]));
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    // Track VINT for track 1 is 1 byte, timestamp at offset 1
    const ts = view.getInt16(1, false); // big-endian
    expect(ts).toBe(-100);
  });

  it('sets keyframe flag (0x80) at flags byte', () => {
    const block = buildSimpleBlock(1, 0, new Uint8Array([0x00]));
    // After track VINT (1) + timestamp (2) = byte 3
    expect(block[3]).toBe(0x80);
  });

  it('appends frame data after header', () => {
    const frameData = new Uint8Array([0x01, 0x02, 0x03]);
    const block = buildSimpleBlock(1, 0, frameData);
    // Header: 1 (track VINT) + 2 (timestamp) + 1 (flags) = 4 bytes
    expect(block.subarray(4)).toEqual(frameData);
  });

  it('clamps timestamp to int16 range', () => {
    const block = buildSimpleBlock(1, 40000, new Uint8Array([0x00]));
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    const ts = view.getInt16(1, false);
    expect(ts).toBe(32767); // clamped to max int16
  });
});

// ---------------------------------------------------------------------------
// muxOpusWebm
// ---------------------------------------------------------------------------

describe('muxOpusWebm', () => {
  const defaultConfig: WebmMuxerConfig = {
    sampleRate: 48000,
    channels: 2,
    durationMs: 1000,
  };

  const sampleFrames: OpusFrame[] = [
    {
      data: new Uint8Array([0x48, 0x01, 0x02]),
      timestampUs: 0,
      durationUs: 20000,
    },
    {
      data: new Uint8Array([0x48, 0x03, 0x04]),
      timestampUs: 20000,
      durationUs: 20000,
    },
  ];

  it('starts with EBML magic bytes 0x1A45DFA3', () => {
    const result = muxOpusWebm(sampleFrames, defaultConfig);
    expect(result[0]).toBe(0x1a);
    expect(result[1]).toBe(0x45);
    expect(result[2]).toBe(0xdf);
    expect(result[3]).toBe(0xa3);
  });

  it('contains "webm" DocType string', () => {
    const result = muxOpusWebm(sampleFrames, defaultConfig);
    const decoded = new TextDecoder().decode(result.subarray(0, 60));
    expect(decoded).toContain('webm');
  });

  it('contains "A_OPUS" codec identifier', () => {
    const result = muxOpusWebm(sampleFrames, defaultConfig);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('A_OPUS');
  });

  it('contains "OpusHead" in CodecPrivate', () => {
    const result = muxOpusWebm(sampleFrames, defaultConfig);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('OpusHead');
  });

  it('produces valid output for empty frames', () => {
    const result = muxOpusWebm([], defaultConfig);
    // Should still have EBML header + segment
    expect(result[0]).toBe(0x1a);
    expect(result.length).toBeGreaterThan(20);
  });

  it('hardcodes SamplingFrequency to 48000 regardless of input sample rate', () => {
    const config: WebmMuxerConfig = { sampleRate: 32000, channels: 2 };
    const result = muxOpusWebm(sampleFrames, config);

    // Find the SamplingFrequency EBML element (ID 0xB5) and verify it's 48000
    // SamplingFrequency is encoded as float32 big-endian after 0xB5 + size VINT
    const bytes = Array.from(result);
    const idx = bytes.indexOf(0xb5);
    expect(idx).toBeGreaterThan(-1);

    // After ID (1 byte) and size VINT (1 byte for 4 bytes = 0x84), the value is float32
    const view = new DataView(result.buffer, result.byteOffset + idx + 2, 4);
    const freq = view.getFloat32(0, false); // big-endian
    expect(freq).toBe(48000);
  });

  it('includes duration in segment info when provided', () => {
    const withDuration = muxOpusWebm(sampleFrames, {
      ...defaultConfig,
      durationMs: 5000,
    });
    const withoutDuration = muxOpusWebm(sampleFrames, {
      sampleRate: 48000,
      channels: 2,
    });
    // File with duration should be larger due to the Duration EBML element
    expect(withDuration.length).toBeGreaterThan(withoutDuration.length);
  });

  it('contains Cluster element for non-empty frames', () => {
    const result = muxOpusWebm(sampleFrames, defaultConfig);
    const bytes = Array.from(result);

    // Cluster ID: 0x1F 0x43 0xB6 0x75
    let found = false;
    for (let i = 0; i < bytes.length - 3; i++) {
      if (
        bytes[i] === 0x1f &&
        bytes[i + 1] === 0x43 &&
        bytes[i + 2] === 0xb6 &&
        bytes[i + 3] === 0x75
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
