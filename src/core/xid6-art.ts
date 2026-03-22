/**
 * xid6 Embedded Art Extraction
 *
 * Parses the xid6 extended tags area of an SPC file and looks for
 * sub-chunks containing image data (PNG/JPEG magic bytes).
 *
 * The xid6 format doesn't formally define an image sub-chunk ID,
 * so we scan all variable-length sub-chunks for image magic bytes.
 */

const XID6_OFFSET = 0x10200;
const XID6_MAGIC = [0x78, 0x69, 0x64, 0x36] as const; // 'xid6'
const MAX_XID6_CHUNK_SIZE = 65_536;
const MAX_XID6_ITERATIONS = 1000;

// PNG magic: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
// JPEG magic: FF D8 FF
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;

function matchesMagic(
  data: Uint8Array,
  offset: number,
  magic: readonly number[],
): boolean {
  if (offset + magic.length > data.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (data[offset + i] !== magic[i]) return false;
  }
  return true;
}

function hasImageMagic(data: Uint8Array, offset: number): boolean {
  return (
    matchesMagic(data, offset, PNG_MAGIC) ||
    matchesMagic(data, offset, JPEG_MAGIC)
  );
}

/**
 * Extract embedded image data from the xid6 extended tags area of an SPC file.
 *
 * Scans all variable-length xid6 sub-chunks for PNG or JPEG magic bytes.
 * Returns the raw image bytes of the first match, or null if none found.
 *
 * @param spcData Raw SPC file data (full file including header)
 * @returns Raw image bytes or null
 */
export function extractXid6Art(spcData: Uint8Array): Uint8Array | null {
  if (!spcData || spcData.length < XID6_OFFSET + 8) return null;

  const offset = XID6_OFFSET;

  // Verify xid6 magic
  for (let i = 0; i < XID6_MAGIC.length; i++) {
    if (spcData[offset + i] !== XID6_MAGIC[i]) return null;
  }

  const view = new DataView(
    spcData.buffer,
    spcData.byteOffset,
    spcData.byteLength,
  );
  const chunkSize = view.getUint32(offset + 4, true);

  // Bound chunk size to prevent reading past the buffer
  const maxChunkSize = spcData.length - offset - 8;
  const effectiveChunkSize = Math.min(chunkSize, maxChunkSize);

  if (effectiveChunkSize > MAX_XID6_CHUNK_SIZE) return null;

  let pos = offset + 8;
  const endPos = pos + effectiveChunkSize;
  let iterations = 0;

  while (pos + 4 <= endPos && iterations < MAX_XID6_ITERATIONS) {
    iterations++;

    const type = spcData[pos + 2];

    if (type < 0x10) {
      // Fixed-length inline data — skip
      if (type === 0x01) {
        pos += 4;
      } else if (type === 0x02 || type === 0x04) {
        if (pos + 8 > endPos) break;
        pos += 8;
      } else {
        pos += 4;
      }
    } else {
      // Variable-length data
      if (pos + 8 > endPos) break;
      const dataLen = view.getUint32(pos + 4, true);

      if (dataLen > MAX_XID6_CHUNK_SIZE || pos + 8 + dataLen > endPos) break;

      // Check if this chunk contains image data
      const dataOffset = pos + 8;
      if (dataLen >= 8 && hasImageMagic(spcData, dataOffset)) {
        return spcData.slice(dataOffset, dataOffset + dataLen);
      }

      // Advance past data, aligned to 4 bytes
      const paddedLen = (dataLen + 3) & ~3;
      pos += 8 + paddedLen;
    }
  }

  return null;
}
