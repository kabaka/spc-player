/**
 * Generates synthetic SPC test fixtures for unit testing.
 *
 * Run: npx tsx tests/fixtures/generate-spc-fixtures.ts
 *
 * All fixtures are synthetic (not derived from copyrighted game audio).
 */

import { existsSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Shared constants (mirroring spc-parser.ts)
// ---------------------------------------------------------------------------

const SPC_MAGIC = Buffer.from('SNES-SPC700 Sound File Data v0.30', 'ascii');
const SPC_MIN_PLAYABLE_SIZE = 0x10180; // 65,920 bytes
const SPC_MIN_FULL_SIZE = 0x10200; // 66,048 bytes

// Offsets
const OFF_MAGIC = 0x00; // 33 bytes
const OFF_26_26 = 0x21; // 2 bytes
const OFF_HAS_ID666 = 0x23; // 1 byte
const OFF_VERSION = 0x24; // 1 byte
const OFF_PC = 0x25; // 2 bytes LE
const OFF_A = 0x27;
const OFF_X = 0x28;
const OFF_Y = 0x29;
const OFF_PSW = 0x2a;
const OFF_SP = 0x2b;
// ID666 text format fields
const OFF_TITLE = 0x2e; // 32 bytes
const OFF_GAME = 0x4e; // 32 bytes
const OFF_DUMPER = 0x6e; // 16 bytes
const OFF_COMMENTS = 0x7e; // 32 bytes
const OFF_DATE = 0x9e; // 11 bytes
const OFF_SONG_LEN = 0xa9; // 3 bytes (text) or 3 bytes (binary)
const OFF_FADE_LEN = 0xac; // 5 bytes (text) or 4 bytes (binary)
const OFF_ARTIST = 0xb1; // 32 bytes
const OFF_CHAN_DISABLES = 0xd1; // 1 byte
const OFF_EMULATOR = 0xd2; // 1 byte
const _OFF_RAM = 0x100; // 65536 bytes
const _OFF_DSP = 0x10100; // 128 bytes
const _OFF_EXTRA_RAM = 0x10180; // 64 bytes
const _OFF_IPL_ROM = 0x101c0; // 64 bytes
const OFF_XID6 = 0x10200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeAscii(
  buf: Buffer,
  offset: number,
  str: string,
  maxLen: number,
): void {
  const bytes = Buffer.from(str, 'ascii');
  bytes.copy(buf, offset, 0, Math.min(bytes.length, maxLen));
}

function writeHeader(
  buf: Buffer,
  opts: {
    hasId666?: number;
    pc?: number;
    a?: number;
    x?: number;
    y?: number;
    psw?: number;
    sp?: number;
  },
): void {
  SPC_MAGIC.copy(buf, OFF_MAGIC);
  buf[OFF_26_26] = 26;
  buf[OFF_26_26 + 1] = 26;
  buf[OFF_HAS_ID666] = opts.hasId666 ?? 0x1a;
  buf[OFF_VERSION] = 30;
  buf.writeUInt16LE(opts.pc ?? 0x0400, OFF_PC);
  buf[OFF_A] = opts.a ?? 0x00;
  buf[OFF_X] = opts.x ?? 0x01;
  buf[OFF_Y] = opts.y ?? 0x02;
  buf[OFF_PSW] = opts.psw ?? 0x42;
  buf[OFF_SP] = opts.sp ?? 0xef;
}

function writeTextId666(
  buf: Buffer,
  opts: {
    title?: string;
    game?: string;
    dumper?: string;
    comments?: string;
    date?: string;
    songLenSec?: string;
    fadeLenMs?: string;
    artist?: string;
    channelDisables?: number;
    emulator?: number;
  },
): void {
  if (opts.title) writeAscii(buf, OFF_TITLE, opts.title, 32);
  if (opts.game) writeAscii(buf, OFF_GAME, opts.game, 32);
  if (opts.dumper) writeAscii(buf, OFF_DUMPER, opts.dumper, 16);
  if (opts.comments) writeAscii(buf, OFF_COMMENTS, opts.comments, 32);
  if (opts.date) writeAscii(buf, OFF_DATE, opts.date, 11);
  if (opts.songLenSec) writeAscii(buf, OFF_SONG_LEN, opts.songLenSec, 3);
  if (opts.fadeLenMs) writeAscii(buf, OFF_FADE_LEN, opts.fadeLenMs, 5);
  if (opts.artist) writeAscii(buf, OFF_ARTIST, opts.artist, 32);
  buf[OFF_CHAN_DISABLES] = opts.channelDisables ?? 0;
  const emu = opts.emulator ?? 0;
  buf[OFF_EMULATOR] = emu === 0 ? 0 : 0x30 + emu;
}

// ---------------------------------------------------------------------------
// Fixture generators
// ---------------------------------------------------------------------------

function generateMinimalValid(): Buffer {
  const buf = Buffer.alloc(SPC_MIN_FULL_SIZE);
  writeHeader(buf, {
    pc: 0x0400,
    a: 0xaa,
    x: 0xbb,
    y: 0xcc,
    psw: 0x02,
    sp: 0xef,
  });
  writeTextId666(buf, {
    title: 'Test Song',
    game: 'Test Game',
    dumper: 'Test Dumper',
    comments: 'Test Comment',
    date: '2024/01/15',
    songLenSec: '180',
    fadeLenMs: '10000',
    artist: 'Test Artist',
    emulator: 0x02, // Snes9x
  });
  return buf;
}

function generateBinaryId666(): Buffer {
  const buf = Buffer.alloc(SPC_MIN_FULL_SIZE);
  writeHeader(buf, {
    pc: 0x0500,
    a: 0x10,
    x: 0x20,
    y: 0x30,
    psw: 0x04,
    sp: 0xcf,
  });

  // Text fields (same in both formats)
  writeAscii(buf, OFF_TITLE, 'Binary Format Song', 32);
  writeAscii(buf, OFF_GAME, 'Binary Game', 32);
  writeAscii(buf, OFF_DUMPER, 'BinDumper', 16);
  writeAscii(buf, OFF_COMMENTS, 'Binary format test', 32);

  // Artist in Shift-JIS: "テスト" (katakana "test")
  // テ = 0x83, 0x65 | ス = 0x83, 0x58 | ト = 0x83, 0x67
  const sjisArtist = Buffer.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]);
  sjisArtist.copy(buf, OFF_ARTIST);

  // Binary format date: YYYYMMDD as uint32 LE at 0x9E
  buf.writeUInt32LE(20240115, OFF_DATE);
  // Zero out rest of date area — the heuristic checks bytes 0xA2–0xA8 for zeros
  // buf[0xA2] through buf[0xA8] are already zero from alloc

  // Song length as text digits (Rust parser uses read_number which is text-based)
  writeAscii(buf, OFF_SONG_LEN, '120', 3);

  // Fade length as text digits (4 bytes in binary format)
  writeAscii(buf, OFF_FADE_LEN, '5000', 4);

  buf[OFF_CHAN_DISABLES] = 0;
  buf[OFF_EMULATOR] = 0x31; // ASCII '1' = ZSNES

  return buf;
}

function generateXid6Tags(): Buffer {
  // Build xid6 sub-chunks first
  const chunks: Buffer[] = [];

  // String sub-chunk helper (type=0x11)
  function addStringChunk(id: number, value: string): void {
    const strBuf = Buffer.from(value, 'utf-8');
    const strWithNull = Buffer.alloc(strBuf.length + 1);
    strBuf.copy(strWithNull);
    // Pad to 4-byte alignment
    const paddedLen = (strWithNull.length + 3) & ~3;
    const chunk = Buffer.alloc(8 + paddedLen);
    chunk.writeUInt16LE(id, 0);
    chunk[2] = 0x11; // type: null-terminated string
    chunk[3] = 0;
    chunk.writeUInt32LE(strWithNull.length, 4);
    strWithNull.copy(chunk, 8);
    chunks.push(chunk);
  }

  // Integer 32-bit sub-chunk helper (type=0x04 — inline numeric)
  function addInt32Chunk(id: number, value: number): void {
    const chunk = Buffer.alloc(8);
    chunk.writeUInt16LE(id, 0);
    chunk[2] = 0x04; // type: 32-bit integer
    chunk[3] = 0;
    chunk.writeUInt32LE(value, 4);
    chunks.push(chunk);
  }

  // Integer 16-bit sub-chunk helper (type=0x02 — inline numeric)
  function addInt16Chunk(id: number, value: number): void {
    const chunk = Buffer.alloc(8);
    chunk.writeUInt16LE(id, 0);
    chunk[2] = 0x02;
    chunk[3] = 0;
    chunk.writeUInt16LE(value, 4);
    chunks.push(chunk);
  }

  // Inline 1-byte sub-chunk helper (type=0x01)
  function addByteChunk(id: number, value: number): void {
    const chunk = Buffer.alloc(4);
    chunk.writeUInt16LE(id, 0);
    chunk[2] = 0x01; // type: byte value in fixedData field
    chunk[3] = value & 0xff;
    chunks.push(chunk);
  }

  // xid6 string tags
  addStringChunk(0x01, 'Extended Title');
  addStringChunk(0x02, 'Extended Game');
  addStringChunk(0x03, 'Extended Artist');
  addStringChunk(0x10, 'OST Album Name');
  addStringChunk(0x13, 'Test Publisher');

  // xid6 numeric tags
  addByteChunk(0x06, 0x02); // Emulator = Snes9x
  addByteChunk(0x11, 2); // OST disc = 2
  addInt16Chunk(0x14, 1995); // Copyright year
  addInt32Chunk(0x30, 64000); // Intro length ticks
  addInt32Chunk(0x31, 128000); // Loop length ticks
  addInt32Chunk(0x32, 32000); // End length ticks
  addInt32Chunk(0x33, 16000); // Fade length ticks
  addInt32Chunk(0x35, 3); // Loop count

  // OST track (id=0x12) as variable-length 2-byte data (type=0x12)
  const trackChunk = Buffer.alloc(12);
  trackChunk.writeUInt16LE(0x12, 0);
  trackChunk[2] = 0x12; // type: variable int
  trackChunk[3] = 0;
  trackChunk.writeUInt32LE(2, 4); // 2 bytes of data
  trackChunk[8] = 0x00; // sub-track
  trackChunk[9] = 5; // track 5
  chunks.push(trackChunk);

  const chunksData = Buffer.concat(chunks);

  // xid6 header: "xid6" + uint32 LE size
  const xid6Header = Buffer.alloc(8);
  xid6Header.write('xid6', 0, 4, 'ascii');
  xid6Header.writeUInt32LE(chunksData.length, 4);

  const totalSize = SPC_MIN_FULL_SIZE + 8 + chunksData.length;
  const buf = Buffer.alloc(totalSize);

  // Base SPC header + text ID666
  writeHeader(buf, { pc: 0x0600, a: 0x55, x: 0x66, y: 0x77 });
  writeTextId666(buf, {
    title: 'Base Title',
    game: 'Base Game',
    artist: 'Base Artist',
    songLenSec: '90',
    fadeLenMs: '5000',
  });

  // Write xid6 at offset 0x10200
  xid6Header.copy(buf, OFF_XID6);
  chunksData.copy(buf, OFF_XID6 + 8);

  return buf;
}

function generateTruncated(): Buffer {
  // Exactly SPC_MIN_PLAYABLE_SIZE — no extra RAM, no IPL ROM, no xid6
  const buf = Buffer.alloc(SPC_MIN_PLAYABLE_SIZE);
  writeHeader(buf, { pc: 0x0300 });
  writeTextId666(buf, {
    title: 'Truncated Song',
    game: 'Truncated Game',
    artist: 'Truncated Artist',
    songLenSec: '60',
  });
  return buf;
}

function generateCorruptHeader(): Buffer {
  // 256 bytes of pseudo-random data — no valid SPC magic
  const buf = Buffer.alloc(256);
  for (let i = 0; i < buf.length; i++) {
    // Deterministic fill — avoid Math.random for reproducibility
    buf[i] = (i * 137 + 43) & 0xff;
  }
  return buf;
}

function generateTooSmall(): Buffer {
  return Buffer.alloc(100);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const FIXTURES: { name: string; generate: () => Buffer }[] = [
  { name: 'minimal-valid.spc', generate: generateMinimalValid },
  { name: 'binary-id666.spc', generate: generateBinaryId666 },
  { name: 'xid6-tags.spc', generate: generateXid6Tags },
  { name: 'truncated.spc', generate: generateTruncated },
  { name: 'corrupt-header.spc', generate: generateCorruptHeader },
  { name: 'too-small.spc', generate: generateTooSmall },
];

const allExist = FIXTURES.every((f) => existsSync(join(FIXTURES_DIR, f.name)));

if (allExist) {
  console.log('All SPC fixtures already exist — skipping generation.');
  process.exit(0);
}

for (const fixture of FIXTURES) {
  const path = join(FIXTURES_DIR, fixture.name);
  const data = fixture.generate();
  writeFileSync(path, data);
  console.log(`Generated ${fixture.name} (${data.length} bytes)`);
}

console.log('Done. All fixtures written to tests/fixtures/.');
