import { Err, Ok } from '@/types/result';
import { spcParseError, spcParseWarning } from '@/errors/factories';

import type { SpcParseWarning } from '@/types/errors';
import type {
  Id666Tags,
  SpcFile,
  SpcMetadata,
  SpcParseResult,
  Xid6Tags,
  Xid6Timing,
} from '@/core/spc-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SPC_MIN_PLAYABLE_SIZE = 0x10180; // 65,920 bytes
export const SPC_MIN_FULL_SIZE = 0x10200; // 66,048 bytes
export const SPC_MAX_ACCEPTED_SIZE = 131_072; // 128 KB

export const SPC_MAGIC = new Uint8Array([
  0x53, 0x4e, 0x45, 0x53, 0x2d, 0x53, 0x50, 0x43, 0x37, 0x30, 0x30, 0x20, 0x53,
  0x6f, 0x75, 0x6e, 0x64, 0x20, 0x46, 0x69, 0x6c, 0x65, 0x20, 0x44, 0x61, 0x74,
  0x61, 0x20, 0x76, 0x30, 0x2e, 0x33, 0x30,
]);

const DEFAULT_SONG_LENGTH_SECONDS = 180;
const DEFAULT_FADE_LENGTH_MS = 10_000;
const MAX_SONG_LENGTH_SECONDS = 86_400;
const MAX_FADE_LENGTH_MS = 600_000;
const MAX_XID6_CHUNK_SIZE = 65_536;
const MAX_XID6_ITERATIONS = 1000;

const EMULATOR_NAMES: Record<number, string> = {
  0x00: 'Unknown',
  0x01: 'ZSNES',
  0x02: 'Snes9x',
  0x03: 'ZST2SPC',
  0x04: 'ETC',
  0x05: 'SNEShout',
  0x06: 'ZSNES / W',
  0x07: 'Snes9x / W',
};

// ---------------------------------------------------------------------------
// Safety helpers (§5.5)
// ---------------------------------------------------------------------------

function safeSlice(
  data: Uint8Array,
  offset: number,
  length: number,
): Uint8Array | null {
  if (offset < 0 || length < 0 || offset + length > data.length) return null;
  return data.slice(offset, offset + length);
}

function safeUint16LE(data: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > data.length) return null;
  // Both operands are byte-width (0x00–0xFF); the left-shift produces
  // at most 0xFF00, so the OR result fits in 16 bits — no overflow.
  return data[offset] | (data[offset + 1] << 8);
}

function safeUint32LE(data: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > data.length) return null;
  // Use DataView.getUint32 to guarantee an unsigned 32-bit result.
  // A plain bitwise-OR expression would produce a signed int32 when
  // the high byte >= 0x80.
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  return view.getUint32(0, true);
}

// ---------------------------------------------------------------------------
// String decoding and sanitization (§2.3, §5.3)
// ---------------------------------------------------------------------------

/** Strip control characters, null bytes, and BiDi overrides from display strings. */
export function sanitizeForDisplay(str: string): string {
  let result = str.replace(/\0/g, '');
  // Remove control characters (0x00–0x1F and 0x7F) including tabs and newlines
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x1F\x7F]/g, '');
  // Strip Unicode BiDi override/embedding characters
  result = result.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  return result.trim();
}

function decodeId666String(bytes: Uint8Array): string {
  // Find null terminator — treat all bytes after first 0x00 as padding
  let nullIndex = bytes.indexOf(0x00);
  if (nullIndex === -1) nullIndex = bytes.length;
  const meaningful = bytes.slice(0, nullIndex);

  if (meaningful.length === 0) return '';

  // Attempt UTF-8 (handles ASCII as a subset)
  try {
    const utf8Result = new TextDecoder('utf-8', { fatal: true }).decode(
      meaningful,
    );
    return sanitizeForDisplay(utf8Result);
  } catch {
    // Not valid UTF-8
  }

  // Attempt Shift-JIS (common in Japanese SPC files)
  try {
    const sjisResult = new TextDecoder('shift-jis', { fatal: true }).decode(
      meaningful,
    );
    return sanitizeForDisplay(sjisResult);
  } catch {
    // Not valid Shift-JIS
  }

  // Fallback to Latin-1 (never fails — maps every byte 0x00–0xFF)
  const latin1Result = new TextDecoder('iso-8859-1').decode(meaningful);
  return sanitizeForDisplay(latin1Result);
}

// ---------------------------------------------------------------------------
// ID666 format detection (§2.2)
// ---------------------------------------------------------------------------

function detectId666Format(data: Uint8Array): 'text' | 'binary' {
  // Heuristic 1: Check date field (0x9E–0xA8, 11 bytes) for printable ASCII
  const dateBytes = safeSlice(data, 0x9e, 11);
  if (dateBytes) {
    let printableCount = 0;
    for (const b of dateBytes) {
      if ((b >= 0x20 && b <= 0x7e) || b === 0x00) printableCount++;
    }

    if (printableCount >= 9) {
      // In text format, song length field (0xA9, 3 bytes) should be ASCII digits or nulls
      const lengthByte0 = data[0xa9];
      if (
        lengthByte0 === 0x00 ||
        (lengthByte0 >= 0x30 && lengthByte0 <= 0x39)
      ) {
        return 'text';
      }
    }
  }

  // Heuristic 2: In binary format, unused bytes at 0xA2–0xA8 are typically zero
  const unusedBytes = safeSlice(data, 0xa2, 7);
  if (unusedBytes) {
    let zeroCount = 0;
    for (const b of unusedBytes) {
      if (b === 0x00) zeroCount++;
    }
    if (zeroCount >= 5) {
      return 'binary';
    }
  }

  // Heuristic 3: Check if date field is a plausible YYYYMMDD integer
  const dateInt = safeUint32LE(data, 0x9e);
  if (dateInt !== null && dateInt >= 19900101 && dateInt <= 20401231) {
    return 'binary';
  }

  // Default: text format (more common in the wild)
  return 'text';
}

// ---------------------------------------------------------------------------
// Numeric field parsers (§2.5)
// ---------------------------------------------------------------------------

function parseTextSongLength(bytes: Uint8Array): number | null {
  let str = '';
  for (const b of bytes) {
    if (b === 0x00) break;
    if (b < 0x30 || b > 0x39) return null;
    str += String.fromCharCode(b);
  }
  if (str === '') return null;
  const seconds = parseInt(str, 10);
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > MAX_SONG_LENGTH_SECONDS
  )
    return null;
  return seconds;
}

function parseBinarySongLength(bytes: Uint8Array): number | null {
  // 24-bit little-endian integer (seconds).
  // All operands are byte-width (0x00–0xFF), so shifts stay within
  // safe 32-bit range — no overflow concern.
  const seconds = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
  if (seconds === 0) return null;
  if (seconds > MAX_SONG_LENGTH_SECONDS) return null;
  return seconds;
}

function parseTextFadeLength(bytes: Uint8Array): number | null {
  let str = '';
  for (const b of bytes) {
    if (b === 0x00) break;
    if (b < 0x30 || b > 0x39) return null;
    str += String.fromCharCode(b);
  }
  if (str === '') return null;
  const ms = parseInt(str, 10);
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_FADE_LENGTH_MS) return null;
  return ms;
}

function parseBinaryFadeLength(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // DataView.getUint32 returns unsigned — no overflow concern.
  const ms = view.getUint32(0, true);
  if (ms === 0) return null;
  if (ms > MAX_FADE_LENGTH_MS) return null;
  return ms;
}

// ---------------------------------------------------------------------------
// Date parsing (§2.6)
// ---------------------------------------------------------------------------

function formatDate(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2040) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseTextDate(bytes: Uint8Array): string | null {
  let str = '';
  for (const b of bytes) {
    if (b === 0x00) break;
    if (b >= 0x20 && b <= 0x7e) str += String.fromCharCode(b);
  }
  str = str.trim();
  if (str === '' || /^0+$/.test(str)) return null;

  // Pattern: YYYY/MM/DD or YYYY-MM-DD
  let match = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) {
    return formatDate(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
    );
  }

  // Pattern: MM/DD/YYYY or MM-DD-YYYY
  match = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    return formatDate(
      parseInt(match[3], 10),
      parseInt(match[1], 10),
      parseInt(match[2], 10),
    );
  }

  // Pattern: YYYYMMDD
  match = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return formatDate(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
    );
  }

  // Pattern: YYYY only
  match = str.match(/^(\d{4})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1990 && year <= 2040) return `${year}`;
  }

  // Unparseable — return raw string
  return str;
}

function parseBinaryDate(bytes: Uint8Array): string | null {
  // Use safeUint32LE for unsigned read to avoid sign issues
  const value = safeUint32LE(bytes, 0);
  if (value === null || value === 0) return null;

  if (value >= 19900101 && value <= 20401231) {
    const year = Math.floor(value / 10000);
    const month = Math.floor((value % 10000) / 100);
    const day = value % 100;
    return formatDate(year, month, day);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Emulator byte mapping (§2.7)
// ---------------------------------------------------------------------------

function emulatorByteToString(value: number): string {
  return (
    EMULATOR_NAMES[value] ??
    `Unknown (0x${value.toString(16).padStart(2, '0')})`
  );
}

// ---------------------------------------------------------------------------
// ID666 tag parsing
// ---------------------------------------------------------------------------

function parseId666Tags(
  data: Uint8Array,
  warnings: SpcParseWarning[],
): Id666Tags {
  const format = detectId666Format(data);

  // String fields are the same in both formats
  const titleBytes = safeSlice(data, 0x2e, 32);
  const gameTitleBytes = safeSlice(data, 0x4e, 32);
  const dumperBytes = safeSlice(data, 0x6e, 16);
  const commentsBytes = safeSlice(data, 0x7e, 32);
  const artistBytes = safeSlice(data, 0xb1, 32);

  const title = titleBytes ? decodeId666String(titleBytes) : '';
  const gameTitle = gameTitleBytes ? decodeId666String(gameTitleBytes) : '';
  const dumperName = dumperBytes ? decodeId666String(dumperBytes) : '';
  const comments = commentsBytes ? decodeId666String(commentsBytes) : '';
  const artist = artistBytes ? decodeId666String(artistBytes) : '';

  let dumpDate: string | null = null;
  let songLengthSeconds: number | null = null;
  let fadeLengthMs: number | null = null;

  if (format === 'text') {
    const dateBytes = safeSlice(data, 0x9e, 11);
    if (dateBytes) {
      dumpDate = parseTextDate(dateBytes);
    }

    const songLenBytes = safeSlice(data, 0xa9, 3);
    if (songLenBytes) {
      songLengthSeconds = parseTextSongLength(songLenBytes);
      if (songLengthSeconds === null) {
        warnings.push(spcParseWarning('SPC_INVALID_DURATION', 'songLength'));
      }
    }

    const fadeLenBytes = safeSlice(data, 0xac, 5);
    if (fadeLenBytes) {
      fadeLengthMs = parseTextFadeLength(fadeLenBytes);
    }
  } else {
    // Binary format
    const dateBytes = safeSlice(data, 0x9e, 4);
    if (dateBytes) {
      dumpDate = parseBinaryDate(dateBytes);
    }

    const songLenBytes = safeSlice(data, 0xa9, 3);
    if (songLenBytes) {
      songLengthSeconds = parseBinarySongLength(songLenBytes);
      if (songLengthSeconds === null) {
        warnings.push(spcParseWarning('SPC_INVALID_DURATION', 'songLength'));
      }
    }

    const fadeLenBytes = safeSlice(data, 0xac, 4);
    if (fadeLenBytes) {
      fadeLengthMs = parseBinaryFadeLength(fadeLenBytes);
    }
  }

  if (dumpDate === null) {
    // Only warn if the date field had non-zero content
    const dateBytes = safeSlice(data, 0x9e, 11);
    if (dateBytes && dateBytes.some((b) => b !== 0x00)) {
      warnings.push(spcParseWarning('SPC_UNPARSEABLE_DATE', 'dumpDate'));
    }
  }

  const channelDisables = data[0xd1] ?? 0;
  const emulatorByte = data[0xd2] ?? 0;

  return {
    title,
    gameTitle,
    dumperName,
    comments,
    dumpDate,
    songLengthSeconds,
    fadeLengthMs,
    artist,
    defaultChannelDisables: channelDisables,
    emulatorUsed: emulatorByte,
    detectedFormat: format,
  };
}

// ---------------------------------------------------------------------------
// xid6 tag application helpers
// ---------------------------------------------------------------------------

function applyXid6Tag(
  tags: Xid6Tags,
  id: number,
  _type: number,
  value: number,
): void {
  switch (id) {
    case 0x06:
      tags.emulatorUsed = value;
      break;
    case 0x11:
      tags.ostDisc = value;
      break;
    case 0x34:
      tags.mutedVoices = value;
      break;
  }
}

function applyXid6IntTag(tags: Xid6Tags, id: number, value: number): void {
  switch (id) {
    case 0x05: {
      // Dump date — YYYYMMDD format
      if (value >= 19900101 && value <= 20401231) {
        const year = Math.floor(value / 10000);
        const month = Math.floor((value % 10000) / 100);
        const day = value % 100;
        tags.dumpDate = formatDate(year, month, day);
      }
      break;
    }
    case 0x12:
      tags.ostTrack = value & 0xff;
      break;
    case 0x14:
      tags.copyrightYear = value & 0xffff;
      break;
    case 0x30:
      tags.introLengthTicks = value;
      break;
    case 0x31:
      tags.loopLengthTicks = value;
      break;
    case 0x32:
      tags.endLengthTicks = value;
      break;
    case 0x33:
      tags.fadeLengthTicks = value;
      break;
    case 0x35:
      tags.loopCount = value;
      break;
    case 0x36:
      tags.amplificationLevel = value;
      break;
  }
}

function applyXid6VariableTag(
  tags: Xid6Tags,
  id: number,
  type: number,
  tagData: Uint8Array,
): void {
  if (type === 0x11) {
    // Null-terminated string
    const str = decodeId666String(tagData);
    switch (id) {
      case 0x01:
        tags.title = str;
        break;
      case 0x02:
        tags.gameTitle = str;
        break;
      case 0x03:
        tags.artist = str;
        break;
      case 0x04:
        tags.dumperName = str;
        break;
      case 0x07:
        tags.comments = str;
        break;
      case 0x10:
        tags.ostTitle = str;
        break;
      case 0x13:
        tags.publisher = str;
        break;
    }
  } else if (type === 0x12 && id === 0x12) {
    // OST track — variable-length integer (2 bytes: high = track, low = sub)
    if (tagData.length >= 2) {
      tags.ostTrack = tagData[1];
    } else if (tagData.length === 1) {
      tags.ostTrack = tagData[0];
    }
  }
}

// ---------------------------------------------------------------------------
// xid6 parser (§3.4)
// ---------------------------------------------------------------------------

function parseXid6(data: Uint8Array, offset: number): Xid6Tags | null {
  if (offset + 8 > data.length) return null;

  // Check magic "xid6"
  if (
    data[offset] !== 0x78 ||
    data[offset + 1] !== 0x69 ||
    data[offset + 2] !== 0x64 ||
    data[offset + 3] !== 0x36
  ) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunkSize = view.getUint32(offset + 4, true);

  // Bound chunk size to prevent reading past the buffer
  const maxChunkSize = data.length - offset - 8;
  const effectiveChunkSize = Math.min(chunkSize, maxChunkSize);

  // Cap at absolute maximum to prevent absurd allocations
  if (effectiveChunkSize > MAX_XID6_CHUNK_SIZE) {
    return null;
  }

  const tags: Xid6Tags = {};
  let pos = offset + 8;
  const endPos = pos + effectiveChunkSize;
  let iterations = 0;

  while (pos + 4 <= endPos && iterations < MAX_XID6_ITERATIONS) {
    iterations++;

    const id = view.getUint16(pos, true);
    const type = data[pos + 2];
    const fixedData = data[pos + 3];

    if (type < 0x10) {
      // Fixed-length inline data
      if (type === 0x01) {
        // 1-byte value in byte 3 of the 4-byte header
        applyXid6Tag(tags, id, type, fixedData);
        pos += 4;
      } else if (type === 0x02) {
        // 16-bit value in 4-byte data block after header
        if (pos + 8 > endPos) break;
        const value = view.getUint16(pos + 4, true);
        applyXid6IntTag(tags, id, value);
        pos += 8;
      } else if (type === 0x04) {
        // 32-bit value in 4-byte data block after header
        if (pos + 8 > endPos) break;
        const value = view.getUint32(pos + 4, true);
        applyXid6IntTag(tags, id, value);
        pos += 8;
      } else {
        // Unknown inline type — skip the 4-byte header only
        pos += 4;
      }
    } else {
      // Variable-length data
      if (pos + 8 > endPos) break;
      const dataLen = view.getUint32(pos + 4, true);

      // Sanity check data length
      if (dataLen > MAX_XID6_CHUNK_SIZE || pos + 8 + dataLen > endPos) break;

      const tagData = data.slice(pos + 8, pos + 8 + dataLen);
      applyXid6VariableTag(tags, id, type, tagData);

      // Advance past data, aligned to 4 bytes
      const paddedLen = (dataLen + 3) & ~3;
      pos += 8 + paddedLen;
    }
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Metadata merging
// ---------------------------------------------------------------------------

function buildXid6Timing(xid6: Xid6Tags): Xid6Timing | null {
  if (
    xid6.introLengthTicks === undefined &&
    xid6.loopLengthTicks === undefined &&
    xid6.endLengthTicks === undefined &&
    xid6.fadeLengthTicks === undefined
  ) {
    return null;
  }

  return {
    introLengthTicks: xid6.introLengthTicks ?? 0,
    loopLengthTicks: xid6.loopLengthTicks ?? 0,
    endLengthTicks: xid6.endLengthTicks ?? 0,
    fadeLengthTicks: xid6.fadeLengthTicks ?? 0,
    loopCount: xid6.loopCount ?? null,
  };
}

function mergeMetadata(id666: Id666Tags, xid6: Xid6Tags | null): SpcMetadata {
  const songLengthSeconds =
    id666.songLengthSeconds ?? DEFAULT_SONG_LENGTH_SECONDS;
  const fadeLengthMs = id666.fadeLengthMs ?? DEFAULT_FADE_LENGTH_MS;

  const emulatorByte = xid6?.emulatorUsed ?? id666.emulatorUsed;

  return {
    title: xid6?.title ?? id666.title,
    gameTitle: xid6?.gameTitle ?? id666.gameTitle,
    artist: xid6?.artist ?? id666.artist,
    dumperName: xid6?.dumperName ?? id666.dumperName,
    comments: xid6?.comments ?? id666.comments,
    dumpDate: xid6?.dumpDate ?? id666.dumpDate,
    emulatorUsed: emulatorByteToString(emulatorByte),
    songLengthSeconds,
    fadeLengthMs,
    ostTitle: xid6?.ostTitle ?? null,
    ostDisc: xid6?.ostDisc ?? null,
    ostTrack: xid6?.ostTrack ?? null,
    publisher: xid6?.publisher ?? null,
    copyrightYear: xid6?.copyrightYear ?? null,
    xid6Timing: xid6 ? buildXid6Timing(xid6) : null,
    id666Format: id666.detectedFormat,
  };
}

// ---------------------------------------------------------------------------
// Main parser (§7.2)
// ---------------------------------------------------------------------------

/** Parse an SPC file from raw bytes. Pure function, no side effects. */
export function parseSpcFile(data: Uint8Array): SpcParseResult {
  const warnings: SpcParseWarning[] = [];

  // --- Size validation ---
  if (data.length > SPC_MAX_ACCEPTED_SIZE) {
    return Err(spcParseError('SPC_FILE_TOO_LARGE', { fileSize: data.length }));
  }

  if (data.length < SPC_MIN_PLAYABLE_SIZE) {
    return Err(spcParseError('SPC_FILE_TOO_SMALL', { fileSize: data.length }));
  }

  // --- Magic validation ---
  for (let i = 0; i < SPC_MAGIC.length; i++) {
    if (data[i] !== SPC_MAGIC[i]) {
      return Err(
        spcParseError('SPC_INVALID_MAGIC', {
          offset: i,
          expected: `0x${SPC_MAGIC[i].toString(16).padStart(2, '0')}`,
          actual: `0x${data[i].toString(16).padStart(2, '0')}`,
        }),
      );
    }
  }

  // --- Post-magic header checks ---
  if (data[0x21] !== 26 || data[0x22] !== 26) {
    warnings.push(spcParseWarning('SPC_MALFORMED_HEADER'));
  }

  // Has ID666 byte — tolerate any value, parse tags regardless
  const hasId666Byte = data[0x23];
  if (hasId666Byte !== 0x1a && hasId666Byte !== 0x1b) {
    warnings.push(spcParseWarning('SPC_MALFORMED_HEADER'));
  }

  // --- CPU registers ---
  const pc = safeUint16LE(data, 0x25) ?? 0;
  const a = data[0x27] ?? 0;
  const x = data[0x28] ?? 0;
  const y = data[0x29] ?? 0;
  const psw = data[0x2a] ?? 0;
  const sp = data[0x2b] ?? 0;

  // --- ID666 tags ---
  const id666 = parseId666Tags(data, warnings);

  // Check for completely empty tags
  if (
    hasId666Byte === 0x1b &&
    id666.title === '' &&
    id666.gameTitle === '' &&
    id666.artist === ''
  ) {
    warnings.push(spcParseWarning('SPC_MISSING_TAGS'));
  }

  // --- Extract RAM, DSP, IPL ROM ---
  const ram = safeSlice(data, 0x100, 65536);
  if (!ram) {
    return Err(
      spcParseError('SPC_CORRUPT_DATA', {
        offset: 0x100,
        expected: '65536 bytes of SPC700 RAM',
      }),
    );
  }

  const dspRegisters = safeSlice(data, 0x10100, 128);
  if (!dspRegisters) {
    return Err(
      spcParseError('SPC_CORRUPT_DATA', {
        offset: 0x10100,
        expected: '128 bytes of DSP registers',
      }),
    );
  }

  // Handle truncated files — zero-fill missing IPL ROM
  let iplRom: Uint8Array;
  if (data.length >= SPC_MIN_FULL_SIZE) {
    iplRom = safeSlice(data, 0x101c0, 64) ?? new Uint8Array(64);
  } else {
    // Truncated file — zero-fill
    iplRom = new Uint8Array(64);
    warnings.push(spcParseWarning('SPC_TRUNCATED_FILE'));
  }

  // --- xid6 extended tags ---
  let xid6: Xid6Tags | null = null;
  if (data.length > SPC_MIN_FULL_SIZE) {
    xid6 = parseXid6(data, SPC_MIN_FULL_SIZE);
  }

  // --- Merge metadata ---
  const metadata = mergeMetadata(id666, xid6);

  // Apply xid6 muted voices override to channel disables
  const defaultChannelDisables =
    xid6?.mutedVoices ?? id666.defaultChannelDisables;

  return Ok({
    ram,
    dspRegisters,
    iplRom,
    cpuRegisters: { pc, a, x, y, sp, psw },
    metadata,
    defaultChannelDisables,
    warnings,
  } satisfies SpcFile);
}
