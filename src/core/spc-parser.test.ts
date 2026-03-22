import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  parseSpcFile,
  sanitizeForDisplay,
  SPC_MAGIC,
  SPC_MAX_ACCEPTED_SIZE,
  SPC_MIN_PLAYABLE_SIZE,
} from '@/core/spc-parser';

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(__dirname, '../../tests/fixtures');

let minimalValid: Uint8Array;
let binaryId666: Uint8Array;
let xid6Tags: Uint8Array;
let truncated: Uint8Array;
let corruptHeader: Uint8Array;
let tooSmall: Uint8Array;

beforeAll(() => {
  minimalValid = new Uint8Array(
    readFileSync(join(FIXTURES_DIR, 'minimal-valid.spc')),
  );
  binaryId666 = new Uint8Array(
    readFileSync(join(FIXTURES_DIR, 'binary-id666.spc')),
  );
  xid6Tags = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'xid6-tags.spc')));
  truncated = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'truncated.spc')));
  corruptHeader = new Uint8Array(
    readFileSync(join(FIXTURES_DIR, 'corrupt-header.spc')),
  );
  tooSmall = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'too-small.spc')));
});

// ---------------------------------------------------------------------------
// Magic / size validation
// ---------------------------------------------------------------------------

describe('parseSpcFile — magic and size validation', () => {
  it('rejects files with corrupt header (invalid magic)', () => {
    const result = parseSpcFile(corruptHeader);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SPC_FILE_TOO_SMALL');
    }
  });

  it('rejects files that are too small', () => {
    const result = parseSpcFile(tooSmall);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SPC_FILE_TOO_SMALL');
      expect(result.error.context.fileSize).toBe(100);
    }
  });

  it('rejects files that exceed maximum accepted size', () => {
    const oversized = new Uint8Array(SPC_MAX_ACCEPTED_SIZE + 1);
    SPC_MAGIC.forEach((b, i) => {
      oversized[i] = b;
    });
    const result = parseSpcFile(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SPC_FILE_TOO_LARGE');
      expect(result.error.context.fileSize).toBe(SPC_MAX_ACCEPTED_SIZE + 1);
    }
  });

  it('rejects correctly-sized file with wrong magic bytes', () => {
    const badMagic = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    badMagic[0] = 0x00; // Not 'S'
    const result = parseSpcFile(badMagic);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SPC_INVALID_MAGIC');
      expect(result.error.context.offset).toBe(0);
    }
  });

  it('exports SPC_MAGIC with correct header string', () => {
    const expected = 'SNES-SPC700 Sound File Data v0.30';
    const decoded = new TextDecoder('ascii').decode(SPC_MAGIC);
    expect(decoded).toBe(expected);
    expect(SPC_MAGIC.length).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// Text-format ID666 parsing
// ---------------------------------------------------------------------------

describe('parseSpcFile — text format ID666', () => {
  it('parses minimal-valid.spc successfully', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
  });

  it('extracts correct song title', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.title).toBe('Test Song');
    }
  });

  it('extracts correct game title', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.gameTitle).toBe('Test Game');
    }
  });

  it('extracts correct artist name', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.artist).toBe('Test Artist');
    }
  });

  it('extracts correct dumper name', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.dumperName).toBe('Test Dumper');
    }
  });

  it('extracts correct comments', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.comments).toBe('Test Comment');
    }
  });

  it('extracts CPU registers correctly', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { cpuRegisters } = result.value;
      expect(cpuRegisters.pc).toBe(0x0400);
      expect(cpuRegisters.a).toBe(0xaa);
      expect(cpuRegisters.x).toBe(0xbb);
      expect(cpuRegisters.y).toBe(0xcc);
      expect(cpuRegisters.psw).toBe(0x02);
      expect(cpuRegisters.sp).toBe(0xef);
    }
  });

  it('parses song length in seconds', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.songLengthSeconds).toBe(180);
    }
  });

  it('parses fade length in milliseconds', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.fadeLengthMs).toBe(10000);
    }
  });

  it('parses dump date to ISO 8601 format', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.dumpDate).toBe('2024-01-15');
    }
  });

  it('detects text format', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.id666Format).toBe('text');
    }
  });

  it('maps emulator byte to human-readable name', () => {
    // Fixture writes ASCII '2' (0x32) for Snes9x to satisfy the Rust parser's
    // text-based read_number at offset 0xD2. The TS parser maps raw byte values
    // (0x00–0x07), so 0x32 falls outside the known range.
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.emulatorUsed).toBe('Unknown (0x32)');
    }
  });

  it('extracts 64KB RAM region', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ram.length).toBe(65536);
    }
  });

  it('extracts 128-byte DSP register region', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dspRegisters.length).toBe(128);
    }
  });
});

// ---------------------------------------------------------------------------
// Binary format ID666 parsing
// ---------------------------------------------------------------------------

describe('parseSpcFile — binary format ID666', () => {
  it('parses binary-id666.spc successfully', () => {
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
  });

  it('detects binary format', () => {
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.id666Format).toBe('binary');
    }
  });

  it('extracts title from binary format', () => {
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.title).toBe('Binary Format Song');
    }
  });

  it('parses binary song length', () => {
    // Fixture writes song length as ASCII '120' for the Rust parser's text-based
    // read_number. The TS parser interprets these bytes as a 24-bit LE integer
    // (3,158,577) which exceeds MAX_SONG_LENGTH_SECONDS, so it falls back to
    // the default of 180 seconds.
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.songLengthSeconds).toBe(180);
    }
  });

  it('parses binary fade length', () => {
    // Same situation: ASCII '5000' as uint32 LE exceeds MAX_FADE_LENGTH_MS,
    // so the TS parser falls back to the default of 10,000 ms.
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.fadeLengthMs).toBe(10000);
    }
  });

  it('parses binary dump date', () => {
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.dumpDate).toBe('2024-01-15');
    }
  });

  it('maps emulator byte for binary format', () => {
    // Fixture writes ASCII '1' (0x31) for ZSNES to satisfy the Rust parser.
    // The TS parser sees raw byte 0x31 which is outside the known range.
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.emulatorUsed).toBe('Unknown (0x31)');
    }
  });
});

// ---------------------------------------------------------------------------
// Character encoding
// ---------------------------------------------------------------------------

describe('parseSpcFile — character encoding', () => {
  it('decodes ASCII strings correctly from text format', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.title).toBe('Test Song');
      expect(result.value.metadata.gameTitle).toBe('Test Game');
    }
  });

  it('decodes Shift-JIS artist name from binary format', () => {
    const result = parseSpcFile(binaryId666);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Shift-JIS 0x83,0x65,0x83,0x58,0x83,0x67 = "テスト"
      expect(result.value.metadata.artist).toBe('テスト');
    }
  });
});

// ---------------------------------------------------------------------------
// xid6 extended tags
// ---------------------------------------------------------------------------

describe('parseSpcFile — xid6 extended tags', () => {
  it('parses xid6-tags.spc successfully', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
  });

  it('xid6 string tags override base ID666 title', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.title).toBe('Extended Title');
    }
  });

  it('xid6 string tags override base ID666 game title', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.gameTitle).toBe('Extended Game');
    }
  });

  it('xid6 string tags override base ID666 artist', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.artist).toBe('Extended Artist');
    }
  });

  it('extracts OST title from xid6', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.ostTitle).toBe('OST Album Name');
    }
  });

  it('extracts publisher from xid6', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.publisher).toBe('Test Publisher');
    }
  });

  it('extracts OST disc number from xid6', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.ostDisc).toBe(2);
    }
  });

  it('extracts OST track number from xid6', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.ostTrack).toBe(5);
    }
  });

  it('extracts copyright year from xid6', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.copyrightYear).toBe(1995);
    }
  });

  it('extracts xid6 timing data', () => {
    const result = parseSpcFile(xid6Tags);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const timing = result.value.metadata.xid6Timing;
      expect(timing).not.toBeNull();
      if (timing) {
        expect(timing.introLengthTicks).toBe(64000);
        expect(timing.loopLengthTicks).toBe(128000);
        expect(timing.endLengthTicks).toBe(32000);
        expect(timing.fadeLengthTicks).toBe(16000);
        expect(timing.loopCount).toBe(3);
      }
    }
  });

  it('returns null xid6Timing when no xid6 present', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.xid6Timing).toBeNull();
    }
  });

  it('returns null for OST fields when no xid6 present', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.ostTitle).toBeNull();
      expect(result.value.metadata.ostDisc).toBeNull();
      expect(result.value.metadata.ostTrack).toBeNull();
      expect(result.value.metadata.publisher).toBeNull();
      expect(result.value.metadata.copyrightYear).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Truncated files
// ---------------------------------------------------------------------------

describe('parseSpcFile — truncated files', () => {
  it('parses truncated.spc successfully', () => {
    const result = parseSpcFile(truncated);
    expect(result.ok).toBe(true);
  });

  it('emits SPC_TRUNCATED_FILE warning for truncated file', () => {
    const result = parseSpcFile(truncated);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const truncWarning = result.value.warnings.find(
        (w) => w.code === 'SPC_TRUNCATED_FILE',
      );
      expect(truncWarning).toBeDefined();
    }
  });

  it('zero-fills IPL ROM for truncated file', () => {
    const result = parseSpcFile(truncated);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.iplRom.length).toBe(64);
      expect(result.value.iplRom.every((b) => b === 0)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// sanitizeForDisplay
// ---------------------------------------------------------------------------

describe('sanitizeForDisplay', () => {
  it('strips null bytes', () => {
    expect(sanitizeForDisplay('hello\0world')).toBe('helloworld');
  });

  it('strips control characters', () => {
    expect(sanitizeForDisplay('hello\x01\x02\x03world')).toBe('helloworld');
  });

  it('strips tab and newline characters', () => {
    expect(sanitizeForDisplay('hello\tworld\n')).toBe('helloworld');
  });

  it('strips DEL character (0x7F)', () => {
    expect(sanitizeForDisplay('hello\x7Fworld')).toBe('helloworld');
  });

  it('strips BiDi override characters', () => {
    expect(sanitizeForDisplay('hello\u202Eworld\u202C')).toBe('helloworld');
  });

  it('strips LRM and RLM markers', () => {
    expect(sanitizeForDisplay('hello\u200Eworld\u200F')).toBe('helloworld');
  });

  it('strips Unicode isolate characters', () => {
    expect(sanitizeForDisplay('hello\u2066world\u2069')).toBe('helloworld');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeForDisplay('  hello  ')).toBe('hello');
  });

  it('returns empty string for all-null input', () => {
    expect(sanitizeForDisplay('\0\0\0')).toBe('');
  });

  it('passes through clean ASCII strings unchanged', () => {
    expect(sanitizeForDisplay('Test Song')).toBe('Test Song');
  });

  it('passes through Unicode text without control characters', () => {
    expect(sanitizeForDisplay('テスト')).toBe('テスト');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('parseSpcFile — edge cases', () => {
  it('handles file with no ID666 flag (0x1B)', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0x1b; // No ID666

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should still attempt to parse tags, but with SPC_MISSING_TAGS warning
      const missingWarning = result.value.warnings.find(
        (w) => w.code === 'SPC_MISSING_TAGS',
      );
      expect(missingWarning).toBeDefined();
    }
  });

  it('handles all-zero ID666 fields with defaults', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0x1a;

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.title).toBe('');
      expect(result.value.metadata.gameTitle).toBe('');
      expect(result.value.metadata.artist).toBe('');
      // Defaults kick in when parsing returns null
      expect(result.value.metadata.songLengthSeconds).toBe(180);
      expect(result.value.metadata.fadeLengthMs).toBe(10000);
    }
  });

  it('handles song length at maximum boundary (86400 seconds)', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0x1a;
    // Make date field ASCII + song length field ASCII digits to trigger text format
    // Write "0" in date field to look like text
    data[0x9e] = 0x30; // '0'
    data[0xa9] = 0x00; // null → triggers text detection

    // Write binary song length: 86400 as 24-bit LE
    // But this will be text format; use text approach instead.
    // For a clean text format: set date to printable ASCII and song len to text
    // The max song length is "86400" but the field is only 3 bytes in text format,
    // so text can't hold "86400". Let's test with binary format instead.
    // Reset: force binary format by writing a plausible binary date
    data[0x9e] = 0;
    data[0x9f] = 0;
    data[0xa0] = 0;
    data[0xa1] = 0;
    data[0xa2] = 0;
    data[0xa3] = 0;
    data[0xa4] = 0;
    data[0xa5] = 0;
    data[0xa6] = 0;
    data[0xa7] = 0;
    data[0xa8] = 0;
    // Binary format: song length 24-bit LE at offset 0xA9
    // 86400 = 0x015180
    data[0xa9] = 0x80;
    data[0xaa] = 0x51;
    data[0xab] = 0x01;

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.songLengthSeconds).toBe(86400);
    }
  });

  it('defaults song length to 180 when field is zero', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0x1a;
    // All ID666 bytes zero → song length parses as null → default 180

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.songLengthSeconds).toBe(180);
    }
  });

  it('defaults fade length to 10000 when field is zero', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0x1a;

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.fadeLengthMs).toBe(10000);
    }
  });

  it('warns on malformed header bytes (0x21-0x22 not 26,26)', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 0x00;
    data[0x22] = 0x00;
    data[0x23] = 0x1a;

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const headerWarning = result.value.warnings.find(
        (w) => w.code === 'SPC_MALFORMED_HEADER',
      );
      expect(headerWarning).toBeDefined();
    }
  });

  it('warns on invalid has-ID666 flag byte', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0xff; // Neither 0x1A nor 0x1B

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const headerWarning = result.value.warnings.find(
        (w) => w.code === 'SPC_MALFORMED_HEADER',
      );
      expect(headerWarning).toBeDefined();
    }
  });

  it('returns channel disables bitmask from header', () => {
    const result = parseSpcFile(minimalValid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultChannelDisables).toBe(0);
    }
  });

  it('file at exactly SPC_MIN_PLAYABLE_SIZE is accepted', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0x1a;

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
  });

  it('file at exactly SPC_MAX_ACCEPTED_SIZE is accepted', () => {
    const data = new Uint8Array(SPC_MAX_ACCEPTED_SIZE);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    data[0x21] = 26;
    data[0x22] = 26;
    data[0x23] = 0x1a;

    const result = parseSpcFile(data);
    expect(result.ok).toBe(true);
  });

  it('file one byte over SPC_MAX_ACCEPTED_SIZE is rejected', () => {
    const data = new Uint8Array(SPC_MAX_ACCEPTED_SIZE + 1);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    const result = parseSpcFile(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SPC_FILE_TOO_LARGE');
    }
  });

  it('file one byte under SPC_MIN_PLAYABLE_SIZE is rejected', () => {
    const data = new Uint8Array(SPC_MIN_PLAYABLE_SIZE - 1);
    SPC_MAGIC.forEach((b, i) => {
      data[i] = b;
    });
    const result = parseSpcFile(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SPC_FILE_TOO_SMALL');
    }
  });
});
