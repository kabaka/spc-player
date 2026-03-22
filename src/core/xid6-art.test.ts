import { describe, expect, it } from 'vitest';

import { extractXid6Art } from './xid6-art';

// ── Helpers ───────────────────────────────────────────────────────────

/** Build a minimal SPC file stub with xid6 data at offset 0x10200. */
function buildSpcWithXid6(xid6Payload: Uint8Array): Uint8Array {
  const totalSize = 0x10200 + xid6Payload.length;
  const data = new Uint8Array(totalSize);
  data.set(xid6Payload, 0x10200);
  return data;
}

/** Build an xid6 block with magic header and a single variable-length sub-chunk. */
function buildXid6Block(
  subChunkId: number,
  subChunkData: Uint8Array,
): Uint8Array {
  const type = 0x12; // binary variable-length data
  const paddedLen = (subChunkData.length + 3) & ~3;
  const subChunkSize = 8 + paddedLen;

  // xid6 header: 'xid6' magic (4 bytes) + chunk size (4 bytes) + sub-chunk
  const result = new Uint8Array(8 + subChunkSize);
  const view = new DataView(result.buffer);

  // Magic
  result[0] = 0x78; // 'x'
  result[1] = 0x69; // 'i'
  result[2] = 0x64; // 'd'
  result[3] = 0x36; // '6'

  // Chunk size (little-endian)
  view.setUint32(4, subChunkSize, true);

  // Sub-chunk header
  const pos = 8;
  view.setUint16(pos, subChunkId, true);
  result[pos + 2] = type;
  result[pos + 3] = 0;
  view.setUint32(pos + 4, subChunkData.length, true);

  // Sub-chunk data
  result.set(subChunkData, pos + 8);
  return result;
}

/** Build xid6 with multiple sub-chunks. */
function buildXid6MultiChunk(
  chunks: { id: number; type: number; data: Uint8Array }[],
): Uint8Array {
  // Calculate total payload size
  let payloadSize = 0;
  for (const chunk of chunks) {
    if (chunk.type >= 0x10) {
      const paddedLen = (chunk.data.length + 3) & ~3;
      payloadSize += 8 + paddedLen;
    } else {
      payloadSize += chunk.type === 0x01 ? 4 : 8;
    }
  }

  const result = new Uint8Array(8 + payloadSize);
  const view = new DataView(result.buffer);

  // Magic
  result[0] = 0x78;
  result[1] = 0x69;
  result[2] = 0x64;
  result[3] = 0x36;
  view.setUint32(4, payloadSize, true);

  let pos = 8;
  for (const chunk of chunks) {
    view.setUint16(pos, chunk.id, true);
    result[pos + 2] = chunk.type;
    result[pos + 3] = 0;

    if (chunk.type >= 0x10) {
      view.setUint32(pos + 4, chunk.data.length, true);
      result.set(chunk.data, pos + 8);
      const paddedLen = (chunk.data.length + 3) & ~3;
      pos += 8 + paddedLen;
    } else if (chunk.type === 0x01) {
      pos += 4;
    } else {
      pos += 8;
    }
  }

  return result;
}

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

// ── Tests ─────────────────────────────────────────────────────────────

describe('extractXid6Art', () => {
  it('returns null for data too short to contain xid6', () => {
    expect(extractXid6Art(new Uint8Array(100))).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(extractXid6Art(null as unknown as Uint8Array)).toBeNull();
  });

  it('returns null when xid6 magic is missing', () => {
    const data = new Uint8Array(0x10200 + 100);
    expect(extractXid6Art(data)).toBeNull();
  });

  it('returns null when xid6 has no image sub-chunks', () => {
    const textData = new TextEncoder().encode('Hello World');
    const xid6Block = buildXid6Block(0x01, textData);
    const spc = buildSpcWithXid6(xid6Block);
    expect(extractXid6Art(spc)).toBeNull();
  });

  it('extracts PNG image data from xid6 sub-chunk', () => {
    const pngPayload = new Uint8Array(PNG_MAGIC.length + 16);
    pngPayload.set(PNG_MAGIC, 0);
    for (let i = PNG_MAGIC.length; i < pngPayload.length; i++) {
      pngPayload[i] = i & 0xff;
    }

    const xid6Block = buildXid6Block(0x50, pngPayload);
    const spc = buildSpcWithXid6(xid6Block);
    const result = extractXid6Art(spc);

    expect(result).not.toBeNull();
    const art = result as Uint8Array;
    expect(art.length).toBe(pngPayload.length);
    expect(art[0]).toBe(0x89);
    expect(art[1]).toBe(0x50);
    expect(art[2]).toBe(0x4e);
    expect(art[3]).toBe(0x47);
  });

  it('extracts JPEG image data from xid6 sub-chunk', () => {
    const jpegPayload = new Uint8Array(JPEG_MAGIC.length + 16);
    jpegPayload.set(JPEG_MAGIC, 0);
    for (let i = JPEG_MAGIC.length; i < jpegPayload.length; i++) {
      jpegPayload[i] = i & 0xff;
    }

    const xid6Block = buildXid6Block(0x50, jpegPayload);
    const spc = buildSpcWithXid6(xid6Block);
    const result = extractXid6Art(spc);

    expect(result).not.toBeNull();
    const art = result as Uint8Array;
    expect(art[0]).toBe(0xff);
    expect(art[1]).toBe(0xd8);
    expect(art[2]).toBe(0xff);
  });

  it('returns null when chunk size exceeds maximum', () => {
    const data = new Uint8Array(0x10200 + 12);
    // Set xid6 magic
    data[0x10200] = 0x78;
    data[0x10200 + 1] = 0x69;
    data[0x10200 + 2] = 0x64;
    data[0x10200 + 3] = 0x36;
    // Set chunk size larger than MAX_XID6_CHUNK_SIZE
    const view = new DataView(data.buffer);
    view.setUint32(0x10200 + 4, 0xffffffff, true);
    expect(extractXid6Art(data)).toBeNull();
  });

  it('handles sub-chunk with data length exceeding bounds', () => {
    const xid6 = new Uint8Array(20);
    xid6[0] = 0x78;
    xid6[1] = 0x69;
    xid6[2] = 0x64;
    xid6[3] = 0x36;
    const view = new DataView(xid6.buffer);
    view.setUint32(4, 12, true);
    // Sub-chunk with variable type and absurd data length
    view.setUint16(8, 0x50, true);
    xid6[10] = 0x12; // type = variable
    xid6[11] = 0;
    view.setUint32(12, 9999, true);

    const spc = buildSpcWithXid6(xid6);
    expect(extractXid6Art(spc)).toBeNull();
  });

  it('skips fixed-length sub-chunks before finding image data', () => {
    const pngPayload = new Uint8Array(PNG_MAGIC.length + 8);
    pngPayload.set(PNG_MAGIC, 0);

    const xid6 = buildXid6MultiChunk([
      // Fixed-length type 0x01 sub-chunk (4 bytes total)
      { id: 0x06, type: 0x01, data: new Uint8Array(0) },
      // Variable-length text sub-chunk (no image)
      { id: 0x01, type: 0x11, data: new TextEncoder().encode('Title\0') },
      // Variable-length image sub-chunk
      { id: 0x50, type: 0x12, data: pngPayload },
    ]);

    const spc = buildSpcWithXid6(xid6);
    const result = extractXid6Art(spc);

    expect(result).not.toBeNull();
    const art = result as Uint8Array;
    expect(art[0]).toBe(0x89);
  });

  it('returns null for data too small to contain image magic', () => {
    // Variable-length chunk with only 4 bytes of data (too small for PNG magic)
    const smallData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const xid6Block = buildXid6Block(0x50, smallData);
    const spc = buildSpcWithXid6(xid6Block);
    // 4 bytes is < 8 minimum for image check
    expect(extractXid6Art(spc)).toBeNull();
  });
});
