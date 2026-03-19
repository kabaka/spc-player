# SPC File Parsing and Validation Specification

**Status:** Draft (Revised)  
**Date:** 2026-03-18  
**Revised:** 2026-03-19  
**Related ADRs:** ADR-0001 (emulation library), ADR-0003 (audio pipeline), ADR-0005 (state management), ADR-0007 (WASM build pipeline), ADR-0015 (error handling)

### Revision Notes

Peer review fixes applied 2026-03-19:

- **C3:** Fixed xid6 inline type 0x02/0x04 parsing — read full 16/32-bit values from data block after sub-chunk header, advance 8 bytes total. Clarified sub-chunk structure description in §3.1.
- **M5:** Binary format song length at 0xA9 treated as raw seconds (not ticks/64000). The 1/64000-tick unit applies only to xid6 timing fields (0x30–0x33).
- **M6:** Fixed signed 32-bit shift in binary date parsing — use `safeUint32LE` helper for unsigned read.
- **M7:** Integrated BiDi character stripping directly into `sanitizeForDisplay` function body.
- **M8:** Aligned date validation range — both `detectId666Format()` and `formatDate()` now use year ≤ 2040.
- **X1:** Error/warning codes use `SPC_` prefix per ADR-0015.
- **X2:** Warnings moved into `SpcFile`; removed redundant `warnings` from `SpcParseResult` success case.
- **X3:** Error construction uses factory functions per ADR-0015 Rule 5.
- **X4:** Added `context` field to `SpcParseError`.
- **R1:** Fixed `validateFileSize` return type — changed from `SpcParseResult` (missing success return) to guard pattern `SpcParseError | null`.
- **m4:** `sanitizeForDisplay` strips tabs and newlines from single-line metadata strings.
- **m5:** Added note acknowledging batch/multi-file parsing as future concern (§7.1).
- **m6:** Redundant warnings removed from result wrapper (covered by X2).
- **S4:** Added overflow safety comments to bitwise shift operations.

---

## 1. SPC File Format Validation

### 1.1 File Size Constraints

| Check                 | Value                  | Rationale                                                                                                                                                                                                                                    |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum valid size    | 66,048 bytes (0x10200) | Header (0x100) + SPC700 RAM (0x10000) + DSP registers (0x80) + unused (0x40) + IPL ROM (0x40). A file shorter than this is missing required binary data.                                                                                     |
| Minimum playable size | 65,920 bytes (0x10180) | Header + RAM + DSP registers. The unused region and IPL ROM can be zero-filled if absent — some dumpers produce truncated files missing the trailing 128 bytes.                                                                              |
| Maximum accepted size | 131,072 bytes (128 KB) | An SPC file with xid6 data can exceed 66,048 bytes, but the xid6 chunk is bounded. 128 KB provides generous headroom for even pathological xid6 data while preventing memory exhaustion from a user uploading a multi-megabyte non-SPC file. |

```typescript
const SPC_MIN_PLAYABLE_SIZE = 0x10180; // 65,920 bytes
const SPC_MIN_FULL_SIZE = 0x10200; // 66,048 bytes
const SPC_MAX_ACCEPTED_SIZE = 131_072; // 128 KB
```

**Decision: Reject files below `SPC_MIN_PLAYABLE_SIZE`.** Files between `SPC_MIN_PLAYABLE_SIZE` and `SPC_MIN_FULL_SIZE` are accepted with zero-filled IPL ROM and unused regions. Files above `SPC_MAX_ACCEPTED_SIZE` are rejected immediately, before any parsing.

### 1.2 Magic Number Validation

The header occupies bytes 0x00–0x20 (33 bytes) and must exactly equal the ASCII string:

```
SNES-SPC700 Sound File Data v0.30
```

Byte representation (33 bytes):

```
53 4E 45 53 2D 53 50 43 37 30 30 20 53 6F 75 6E
64 20 46 69 6C 65 20 44 61 74 61 20 76 30 2E 33
30
```

**Validation:** Compare the first 33 bytes against this constant using a byte-by-byte comparison (`Uint8Array` comparison). If the magic does not match, reject the file immediately — do not attempt to parse further.

```typescript
const SPC_MAGIC = new Uint8Array([
  0x53, 0x4e, 0x45, 0x53, 0x2d, 0x53, 0x50, 0x43, 0x37, 0x30, 0x30, 0x20, 0x53,
  0x6f, 0x75, 0x6e, 0x64, 0x20, 0x46, 0x69, 0x6c, 0x65, 0x20, 0x44, 0x61, 0x74,
  0x61, 0x20, 0x76, 0x30, 0x2e, 0x33, 0x30,
]);
```

### 1.3 Post-Magic Header Bytes

| Offset | Bytes | Field           | Validation                                                                                                                                                             |
| ------ | ----- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0x21   | 2     | Separator bytes | Should be `26, 26`. **Tolerate** any values — some dumpers write different values. Log a warning if not `26, 26`, but continue parsing.                                |
| 0x23   | 1     | Has ID666 tag   | `0x1A` = yes, `0x1B` = no. **Tolerate** any other value — treat as "unknown" and attempt to parse ID666 anyway (most files contain tags even when this byte is wrong). |
| 0x24   | 1     | Version minor   | No validation. Read and store but do not reject on any value. The only version observed in the wild is `0x1E` (decimal 30).                                            |

### 1.4 CPU Register Fields

| Offset | Size | Register           | Validation                                                                                                        |
| ------ | ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 0x25   | 2    | PC (little-endian) | Must be ≤ 0xFFFF (guaranteed by 16-bit read). No further validation — any address within the 64KB space is valid. |
| 0x27   | 1    | A                  | None. Any byte value is valid.                                                                                    |
| 0x28   | 1    | X                  | None.                                                                                                             |
| 0x29   | 1    | Y                  | None.                                                                                                             |
| 0x2A   | 1    | PSW                | None. Only bits 0–7 meaningful but the register is 8-bit, so all values are valid.                                |
| 0x2B   | 1    | SP                 | None. Stack grows downward from 0x1FF in page 1. Any initial value is valid.                                      |
| 0x2C   | 2    | Reserved           | Ignore. Do not validate.                                                                                          |

**Decision:** CPU register fields are always trusted as-is. Invalid register values will simply be loaded into the emulator and may cause the SPC program to behave unexpectedly, but that is the correct behavior — the parser's job is to faithfully represent the file, not to validate whether the SPC program will execute sensibly.

### 1.5 Truncated File Handling

If the file is at least `SPC_MIN_PLAYABLE_SIZE` (65,920) but shorter than `SPC_MIN_FULL_SIZE` (66,048):

1. Read all available data up to the file's actual length.
2. Zero-fill the missing tail bytes (unused region at 0x10180–0x101BF and/or IPL ROM at 0x101C0–0x101FF).
3. Emit a parsing warning: `"File is truncated ({actualSize} bytes, expected {SPC_MIN_FULL_SIZE}). Missing regions zero-filled."`.
4. Treat the file as playable.

If the file is shorter than `SPC_MIN_PLAYABLE_SIZE`, reject with a parsing error: `"File too small ({actualSize} bytes). Minimum required: {SPC_MIN_PLAYABLE_SIZE} bytes."`.

---

## 2. ID666 Tag Parsing

### 2.1 Tag Layout

ID666 tags are embedded in the header at fixed offsets. They use one of two formats — **text** or **binary** — but the format is **not reliably indicated** by any header field. The same offsets are used differently depending on the format.

#### Text Format Field Layout

| Offset | Size | Field                    | Type                                |
| ------ | ---- | ------------------------ | ----------------------------------- |
| 0x2E   | 32   | Song title               | String (null-terminated)            |
| 0x4E   | 32   | Game title               | String (null-terminated)            |
| 0x6E   | 16   | Dumper name              | String (null-terminated)            |
| 0x7E   | 32   | Comments                 | String (null-terminated)            |
| 0x9E   | 11   | Dump date                | String (MM/DD/YYYY or similar)      |
| 0xA9   | 3    | Song length              | ASCII decimal string (seconds)      |
| 0xAC   | 5    | Fade length              | ASCII decimal string (milliseconds) |
| 0xB1   | 32   | Artist                   | String (null-terminated)            |
| 0xD1   | 1    | Default channel disables | Bitmask                             |
| 0xD2   | 1    | Emulator used            | Enum byte                           |

#### Binary Format Field Layout

| Offset | Size | Field                    | Type                                                     |
| ------ | ---- | ------------------------ | -------------------------------------------------------- |
| 0x2E   | 32   | Song title               | String (null-terminated)                                 |
| 0x4E   | 32   | Game title               | String (null-terminated)                                 |
| 0x6E   | 16   | Dumper name              | String (null-terminated)                                 |
| 0x7E   | 32   | Comments                 | String (null-terminated)                                 |
| 0x9E   | 4    | Dump date                | 32-bit LE integer (YYYYMMDD or days since epoch, varies) |
| 0xA2   | 7    | Unused                   | —                                                        |
| 0xA9   | 3    | Song length              | 24-bit LE integer (seconds)                              |
| 0xAC   | 4    | Fade length              | 32-bit LE integer (milliseconds)                         |
| 0xB0   | 1    | Unused                   | —                                                        |
| 0xB1   | 32   | Artist                   | String (null-terminated)                                 |
| 0xD1   | 1    | Default channel disables | Bitmask                                                  |
| 0xD2   | 1    | Emulator used            | Enum byte                                                |

**Note:** String fields (title, game, dumper, comments, artist) use the same offsets and sizes in both formats. Only the date and numeric fields differ.

### 2.2 Text vs. Binary Format Detection

This is the most error-prone aspect of SPC parsing. No authoritative indicator exists. The following heuristic is used, based on analysis of detection strategies in spcplay, foo_input_spc, and other established SPC tools:

#### Detection Algorithm

```
function detectId666Format(data: Uint8Array): 'text' | 'binary' {
  // Strategy: examine the date field (0x9E–0xA8, 11 bytes) and the
  // numeric fields (song length at 0xA9, fade length at 0xAC).

  // Heuristic 1: Check the date field for ASCII digit characters.
  // In text format, this is a date string like "11/21/1999" or "1999/11/21".
  // In binary format, bytes 0x9E–0xA1 are a 32-bit integer, and bytes
  // 0xA2–0xA8 are unused (often zero).
  const dateBytes = data.slice(0x9E, 0xA9);

  // Count how many bytes in the date field are printable ASCII
  // (0x20–0x7E) or null (0x00).
  let printableCount = 0;
  for (const b of dateBytes) {
    if ((b >= 0x20 && b <= 0x7E) || b === 0x00) printableCount++;
  }

  // If the date field is mostly printable ASCII, it's text format.
  // If it contains non-printable bytes, it's likely binary.
  if (printableCount >= 9) {
    // Additional check: in text format, the song length field (0xA9, 3 bytes)
    // should contain ASCII digits or nulls.
    const lengthByte0 = data[0xA9];
    if (lengthByte0 === 0x00 || (lengthByte0 >= 0x30 && lengthByte0 <= 0x39)) {
      return 'text';
    }
  }

  // Heuristic 2: In binary format, the 7 unused bytes at 0xA2–0xA8
  // should typically be zero.
  const unusedBytes = data.slice(0xA2, 0xA9);
  let zeroCount = 0;
  for (const b of unusedBytes) {
    if (b === 0x00) zeroCount++;
  }
  if (zeroCount >= 5) {
    return 'binary';
  }

  // Heuristic 3: Check if the date field starts with a plausible
  // 32-bit date integer. Years 1990–2040 in YYYYMMDD format.
  // Use unsigned read to avoid sign issues if high byte >= 0x80.
  // (safeUint32LE returns unsigned via DataView.getUint32)
  const dateInt = safeUint32LE(data, 0x9E);
  if (dateInt !== null && dateInt >= 19900101 && dateInt <= 20401231) {
    return 'binary';
  }

  // Default fallback: assume text format (more common in the wild).
  return 'text';
}
```

**Rationale:** This multi-heuristic approach mirrors what established SPC players use. The date field is the strongest discriminator because its interpretation differs the most between formats. Text format is the default fallback because the majority of SPC files in circulation use text format (most were dumped with ZSNES or SNESAmp).

**Decision:** If detection is ambiguous, default to text format and emit a warning. The metadata may be incorrect, but playback is unaffected — metadata parsing errors never prevent playback.

### 2.3 Character Encoding

#### The Problem

The SPC file format predates Unicode adoption in the emulation community. String fields contain raw bytes with no encoding declaration. In practice:

- **English-language SPC files** (majority): ASCII or Latin-1.
- **Japanese-language SPC files**: Shift-JIS (Windows code page 932).
- **Modern dumps**: occasionally UTF-8, but rare.
- **Corrupt/garbage data**: bytes after the null terminator may contain remnant data from previous buffer contents.

#### Encoding Detection Strategy

```
function decodeId666String(bytes: Uint8Array): string {
  // Step 1: Find the null terminator. Treat all bytes after the first
  // 0x00 as padding — ignore them entirely.
  let nullIndex = bytes.indexOf(0x00);
  if (nullIndex === -1) nullIndex = bytes.length;
  const meaningful = bytes.slice(0, nullIndex);

  if (meaningful.length === 0) return '';

  // Step 2: Attempt UTF-8 decode. If the bytes are valid UTF-8, use
  // that. This handles ASCII (a strict subset of UTF-8) and modern
  // UTF-8 dumps.
  try {
    const utf8Result = new TextDecoder('utf-8', { fatal: true }).decode(meaningful);
    // Verify: if the result contains replacement characters, UTF-8
    // decoding silently replaced invalid sequences. With fatal: true,
    // this throws instead.
    return sanitizeForDisplay(utf8Result);
  } catch {
    // Not valid UTF-8 — fall through.
  }

  // Step 3: Attempt Shift-JIS decode. Shift-JIS is the most common
  // non-ASCII encoding in SPC files (Japanese game titles).
  try {
    const sjisResult = new TextDecoder('shift-jis', { fatal: true }).decode(meaningful);
    return sanitizeForDisplay(sjisResult);
  } catch {
    // Not valid Shift-JIS either — fall through.
  }

  // Step 4: Fallback to Latin-1 (ISO-8859-1). Latin-1 decodes every
  // byte value 0x00–0xFF to a Unicode code point, so it never fails.
  // This is the last resort.
  const latin1Result = new TextDecoder('iso-8859-1').decode(meaningful);
  return sanitizeForDisplay(latin1Result);
}
```

**Key decisions:**

1. **UTF-8 first, then Shift-JIS, then Latin-1.** UTF-8 is tried first because ASCII (the most common case) is valid UTF-8, so it handles the majority of files with a single pass. Shift-JIS is tried second because Japanese SPC files are far more common than Latin-1 European files. Latin-1 is the infallible fallback.

2. **Use `fatal: true`** for UTF-8 and Shift-JIS `TextDecoder`. This throws on invalid sequences rather than silently substituting U+FFFD, which would produce garbled output. The fallback cascade depends on clean failure signaling.

3. **Null termination is authoritative.** Everything after the first null byte is ignored, even if it contains printable characters. Some dumpers zero-fill remaining bytes; others leave garbage. The spec defines these fields as null-terminated C strings.

4. **No heuristic encoding detection beyond the cascade.** Libraries like `chardet` or ICU charset detection add bundle weight and complexity for minimal gain. The UTF-8 → Shift-JIS → Latin-1 cascade handles >99% of real SPC files correctly.

#### Browser Support for `TextDecoder('shift-jis')`

`TextDecoder` supports the `'shift-jis'` label (mapped to the Encoding Standard's "Shift_JIS" codec) in all target browsers (Chrome 38+, Safari 10.1+, Firefox 19+). This is not an exotic codec — it is required by the Encoding Standard.

### 2.4 Null-Termination and Padding

String fields have fixed sizes. The data within them follows one of these patterns:

| Pattern                                    | Example (hex, 8-byte field for "Hi") | How to handle                                    |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------ |
| Null-terminated, zero-padded               | `48 69 00 00 00 00 00 00`            | Read until first `0x00`. Standard case.          |
| Null-terminated, garbage-padded            | `48 69 00 FF A3 12 00 42`            | Read until first `0x00`. Ignore trailing bytes.  |
| No null terminator (field completely full) | `48 69 20 41 42 43 44 45`            | Read the entire field. Trim trailing whitespace. |
| All nulls (empty field)                    | `00 00 00 00 00 00 00 00`            | Return empty string `""`.                        |
| All spaces                                 | `20 20 20 20 20 20 20 20`            | Return empty string `""` (after trimming).       |

**Processing rule:**

1. Scan for the first `0x00` byte.
2. Take everything before it (or the entire field if no null found).
3. Decode with the encoding cascade (§2.3).
4. Trim trailing whitespace (spaces, `\t`, `\r`, `\n`).
5. If the result is empty or whitespace-only, return `""`.

### 2.5 Numeric Field Parsing

#### Song Length

| Format | Offset | Size    | Interpretation                                                                                  |
| ------ | ------ | ------- | ----------------------------------------------------------------------------------------------- |
| Text   | 0xA9   | 3 bytes | ASCII decimal string representing seconds. E.g., `"180"` = 180 seconds. Null-padded if shorter. |
| Binary | 0xA9   | 3 bytes | 24-bit little-endian integer representing seconds (raw integer, not ticks).                     |

**Design note:** The binary song length field at 0xA9 is treated as a raw seconds value. This matches the behavior of SNESAmp, foo_input_spc, and spcplay. The 1/64000th-second tick unit applies only to xid6 timing fields (IDs 0x30–0x33), not the ID666 binary song length.

**Text format parsing:**

```typescript
function parseTextSongLength(bytes: Uint8Array): number | null {
  // Extract up to null terminator
  let str = '';
  for (const b of bytes) {
    if (b === 0x00) break;
    if (b < 0x30 || b > 0x39) return null; // Non-digit = invalid
    str += String.fromCharCode(b);
  }
  if (str === '') return null;
  const seconds = parseInt(str, 10);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) return null;
  return seconds;
}
```

**Binary format parsing:**

```typescript
function parseBinarySongLength(bytes: Uint8Array): number | null {
  // 24-bit little-endian integer (seconds).
  // All operands are byte-width (0x00–0xFF), so shifts stay within
  // safe 32-bit range — no overflow concern.
  const seconds = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
  if (seconds === 0) return null; // 0 typically means "not set"
  if (seconds > 86400) return null; // Sanity cap: 24 hours
  return seconds;
}
```

#### Fade Length

| Format | Offset | Size    | Interpretation                                                              |
| ------ | ------ | ------- | --------------------------------------------------------------------------- |
| Text   | 0xAC   | 5 bytes | ASCII decimal string representing milliseconds. E.g., `"10000"` = 10s fade. |
| Binary | 0xAC   | 4 bytes | 32-bit little-endian integer representing milliseconds.                     |

**Text format parsing:**

```typescript
function parseTextFadeLength(bytes: Uint8Array): number | null {
  let str = '';
  for (const b of bytes) {
    if (b === 0x00) break;
    if (b < 0x30 || b > 0x39) return null;
    str += String.fromCharCode(b);
  }
  if (str === '') return null;
  const ms = parseInt(str, 10);
  if (!Number.isFinite(ms) || ms < 0 || ms > 600_000) return null; // Cap: 10 minutes
  return ms;
}
```

**Binary format parsing:**

```typescript
function parseBinaryFadeLength(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // DataView.getUint32 returns unsigned — no overflow concern.
  const ms = view.getUint32(0, true); // little-endian
  if (ms === 0) return null;
  if (ms > 600_000) return null; // Cap: 10 minutes
  return ms;
}
```

#### Default Values for Missing/Invalid Durations

If song length cannot be parsed or is null, default to **180 seconds** (3 minutes). This is the de facto standard used by most SPC players and matches common practice in the SPC music community (most SNES tracks loop and have no inherent end point).

If fade length cannot be parsed or is null, default to **10,000 milliseconds** (10 seconds).

### 2.6 Date Parsing

This field is notoriously inconsistent across SPC dumpers.

#### Text Format Date (offset 0x9E, 11 bytes)

Observed formats in the wild:

| Pattern       | Example       | Prevalence                 |
| ------------- | ------------- | -------------------------- |
| `MM/DD/YYYY`  | `11/21/1999`  | Most common                |
| `YYYY/MM/DD`  | `1999/11/21`  | Common (Japanese-style)    |
| `MM-DD-YYYY`  | `11-21-1999`  | Occasional                 |
| `YYYY-MM-DD`  | `1999-11-21`  | Occasional                 |
| `YYYYMMDD`    | `19991121`    | Occasional (no separators) |
| Partial date  | `1999`        | Some files have year only  |
| Empty/garbage | `00000000000` | Common                     |

**Parsing strategy:**

```typescript
function parseTextDate(bytes: Uint8Array): string | null {
  // Decode as ASCII, trim nulls and whitespace
  let str = '';
  for (const b of bytes) {
    if (b === 0x00) break;
    if (b >= 0x20 && b <= 0x7e) str += String.fromCharCode(b);
  }
  str = str.trim();
  if (str === '' || /^0+$/.test(str)) return null;

  // Try to extract year, month, day with flexible parsing.
  // Return as ISO 8601 string (YYYY-MM-DD) if fully parsed,
  // or the raw string if we can't parse it.

  // Pattern: YYYY/MM/DD or YYYY-MM-DD
  let match = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    return formatDate(
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
    );
  }

  // Pattern: MM/DD/YYYY or MM-DD-YYYY
  match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    return formatDate(
      parseInt(match[3]),
      parseInt(match[1]),
      parseInt(match[2]),
    );
  }

  // Pattern: YYYYMMDD
  match = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return formatDate(
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
    );
  }

  // Pattern: YYYY only
  match = str.match(/^(\d{4})$/);
  if (match) {
    const year = parseInt(match[1]);
    if (year >= 1990 && year <= 2040) return `${year}`;
  }

  // Unparseable — return raw string with a warning
  return str; // Caller should note this as "raw/unparsed"
}

function formatDate(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2040) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
```

#### Binary Format Date (offset 0x9E, 4 bytes)

Interpretations observed:

1. **YYYYMMDD as integer**: e.g., `19991121` = `0x01309F71` stored as 32-bit LE.
2. **Days since some epoch** (less common, used by rare dumpers).

**Strategy:** Read as 32-bit LE unsigned integer. If the value is in the range `19900101`–`20401231`, interpret as YYYYMMDD. Otherwise, return null.

```typescript
function parseBinaryDate(bytes: Uint8Array): string | null {
  // Use safeUint32LE for unsigned read — a plain bitwise-OR expression
  // like (data[off] | data[off+1] << 8 | data[off+2] << 16 | data[off+3] << 24)
  // produces a signed 32-bit result when the high byte >= 0x80, which would
  // yield a negative number and fail the range check below.
  const value = safeUint32LE(bytes, 0);
  if (value === null || value === 0) return null;

  if (value >= 19900101 && value <= 20401231) {
    const year = Math.floor(value / 10000);
    const month = Math.floor((value % 10000) / 100);
    const day = value % 100;
    return formatDate(year, month, day);
  }

  return null; // Unknown date encoding
}
```

### 2.7 Emulator Used Field

Offset 0xD2, 1 byte. Known values:

| Value | Emulator    |
| ----- | ----------- |
| 0x00  | Unknown     |
| 0x01  | ZSNES       |
| 0x02  | Snes9x      |
| 0x03  | ZST2SPC     |
| 0x04  | ETC (other) |
| 0x05  | SNEShout    |
| 0x06  | ZSNES / W   |
| 0x07  | Snes9x / W  |

**Strategy:** Map known values to display strings. Any unknown value maps to `"Unknown (0x{hex})"`. This field is informational only and never affects parsing or playback.

### 2.8 Default Channel Disables

Offset 0xD1, 1 byte bitmask. Bit N (0–7) set = voice N is disabled by default. This feeds into the mixer slice's initial voice mute state.

---

## 3. xid6 Extended Tag Parsing

### 3.1 Chunk Format

Extended tags start at offset 0x10200 (immediately after the standard SPC data). The xid6 block structure:

```
Offset 0x10200: 4 bytes — magic "xid6" (0x78 0x69 0x64 0x36)
Offset 0x10204: 4 bytes — total chunk data size (32-bit LE, excludes header)
Offset 0x10208: chunk data (repeated sub-chunks)
```

Each sub-chunk has a 4-byte header followed by optional data:

```
Bytes 0–1: ID (16-bit little-endian)
Byte 2:    type (determines data size and storage)
Byte 3:    for type 0x01, this byte contains the inline data value

If type < 0x10 (fixed-length inline data):
  - Type 0x01: 1-byte value stored in byte 3 of the header.
    Sub-chunk total: 4 bytes (header only).
  - Type 0x02: 16-bit value stored in 4 bytes immediately after the
    4-byte header (read as uint16 LE at header + 4).
    Sub-chunk total: 8 bytes (4-byte header + 4-byte data block).
  - Type 0x04: 32-bit value stored in 4 bytes immediately after the
    4-byte header (read as uint32 LE at header + 4).
    Sub-chunk total: 8 bytes (4-byte header + 4-byte data block).

If type >= 0x10 (variable-length data):
  Bytes 4–7: data length (32-bit LE)
  Bytes 8+:  data payload (length from above)
             Padded to 4-byte alignment.
```

**Sub-chunk types:**

| Type ID | Meaning                 | Data size | Storage                        |
| ------- | ----------------------- | --------- | ------------------------------ |
| 0x01    | Byte value              | 1 byte    | Inline in header byte 3        |
| 0x02    | 16-bit integer          | 2 bytes   | 4-byte data block after header |
| 0x04    | 32-bit integer          | 4 bytes   | 4-byte data block after header |
| 0x11    | Null-terminated string  | Variable  | Variable-length after header   |
| 0x12    | Integer (variable size) | Variable  | Variable-length after header   |

### 3.2 Known xid6 Tag IDs

| ID   | Type | Content                      | Notes                                                |
| ---- | ---- | ---------------------------- | ---------------------------------------------------- |
| 0x01 | 0x11 | Song name                    | Overrides ID666 title                                |
| 0x02 | 0x11 | Game name                    | Overrides ID666 game                                 |
| 0x03 | 0x11 | Artist name                  | Overrides ID666 artist                               |
| 0x04 | 0x11 | Dumper name                  | Overrides ID666 dumper                               |
| 0x05 | 0x04 | Dump date                    | 32-bit, YYYYMMDD format                              |
| 0x06 | 0x01 | Emulator used                | Same values as ID666                                 |
| 0x07 | 0x11 | Comments                     | Overrides ID666 comments                             |
| 0x10 | 0x11 | OST title                    | Official soundtrack title                            |
| 0x11 | 0x01 | OST disc                     | Disc number                                          |
| 0x12 | 0x12 | OST track                    | Track number (2-byte: high = track, low = 0 or char) |
| 0x13 | 0x11 | Publisher                    | Publisher name                                       |
| 0x14 | 0x04 | Copyright year               | 16-bit year in 32-bit field                          |
| 0x30 | 0x04 | Intro length                 | Ticks (1/64000 sec)                                  |
| 0x31 | 0x04 | Loop length                  | Ticks                                                |
| 0x32 | 0x04 | End length                   | Ticks (fade end)                                     |
| 0x33 | 0x04 | Fade length                  | Ticks                                                |
| 0x34 | 0x01 | Muted voices                 | 8-bit bitmask                                        |
| 0x35 | 0x04 | Loop count                   | Number of times to loop                              |
| 0x36 | 0x04 | Mixing (amplification) level | Signed 32-bit                                        |

### 3.3 String Encoding in xid6

The xid6 specification defines strings as UTF-8. However, in practice some xid6 tags contain Shift-JIS text. **Use the same encoding cascade as ID666 strings** (§2.3): UTF-8 → Shift-JIS → Latin-1.

### 3.4 Parsing Algorithm

```typescript
function parseXid6(data: Uint8Array, offset: number): Xid6Tags | null {
  // Check if there's enough data for the xid6 header
  if (offset + 8 > data.length) return null;

  // Check magic
  if (
    data[offset] !== 0x78 ||
    data[offset + 1] !== 0x69 ||
    data[offset + 2] !== 0x64 ||
    data[offset + 3] !== 0x36
  ) {
    return null; // No xid6 block present — not an error
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunkSize = view.getUint32(offset + 4, true);

  // Bound the chunk size to prevent reading past the buffer
  const maxChunkSize = data.length - offset - 8;
  const effectiveChunkSize = Math.min(chunkSize, maxChunkSize);

  // Also cap at an absolute maximum to prevent absurd allocations
  if (effectiveChunkSize > 65536) {
    // xid6 data should never be this large; likely corrupt
    return null;
  }

  const tags: Xid6Tags = {};
  let pos = offset + 8;
  const endPos = pos + effectiveChunkSize;
  const MAX_ITERATIONS = 1000; // Hard cap on sub-chunk count
  let iterations = 0;

  while (pos + 4 <= endPos && iterations < MAX_ITERATIONS) {
    iterations++;

    const id = view.getUint16(pos, true);
    const type = data[pos + 2];
    const fixedData = data[pos + 3];

    if (type < 0x10) {
      // Fixed-length inline data. The type byte indicates the data size.
      if (type === 0x01) {
        // 1-byte value: data is in byte 3 of the 4-byte header.
        applyXid6Tag(tags, id, type, fixedData);
        pos += 4;
      } else if (type === 0x02) {
        // 16-bit value: stored in 4 bytes after the 4-byte header.
        if (pos + 8 > endPos) break;
        const value = view.getUint16(pos + 4, true);
        applyXid6IntTag(tags, id, value);
        pos += 8;
      } else if (type === 0x04) {
        // 32-bit value: stored in 4 bytes after the 4-byte header.
        if (pos + 8 > endPos) break;
        const value = view.getUint32(pos + 4, true);
        applyXid6IntTag(tags, id, value);
        pos += 8;
      } else {
        // Unknown inline type — skip the 4-byte header only.
        pos += 4;
      }
    } else {
      // Variable-length
      if (pos + 8 > endPos) break; // Not enough room for length field
      const dataLen = view.getUint32(pos + 4, true);

      // Sanity check data length
      if (dataLen > 65536 || pos + 8 + dataLen > endPos) break;

      const tagData = data.slice(pos + 8, pos + 8 + dataLen);
      applyXid6VariableTag(tags, id, type, tagData);

      // Advance past data, aligned to 4 bytes
      const paddedLen = (dataLen + 3) & ~3;
      pos += 8 + paddedLen;
    }
  }

  return tags;
}
```

### 3.5 Unknown Tag IDs

Unknown tag IDs are **silently skipped**. The parser reads the type and length to advance past the sub-chunk correctly, but does not store the data. This ensures forward compatibility with future xid6 extensions without breaking the parser.

Emit a debug-level log: `"Unknown xid6 tag ID 0x{id} (type 0x{type}), skipping."`.

### 3.6 xid6 Overrides ID666

When both ID666 and xid6 provide a value for the same field (title, game, artist, dumper, comments, dump date), the **xid6 value takes precedence**. xid6 data is generally more accurate and better encoded (UTF-8 vs. ASCII/Shift-JIS).

Duration fields in xid6 (intro length, loop length, end length, fade length) replace the ID666 song length and fade length entirely when present. The total play time is computed differently:

- **ID666 only:** `playTime = songLength + (fadeLength / 1000)`
- **xid6 with timing:** `playTime = (introLength + (loopLength × loopCount) + endLength) / 64000 + fadeLength / 64000`

---

## 4. Error Tolerance Strategy

### 4.1 Error Classification

| Severity    | Meaning                                                        | User impact                                        | Examples                                                                                   |
| ----------- | -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Fatal**   | Cannot extract playable data                                   | File rejected, error shown                         | Wrong magic bytes, file < 65,920 bytes, file > 128 KB                                      |
| **Warning** | Metadata may be incorrect or missing, but playback is possible | Warning indicator in UI, degraded metadata display | Encoding detection ambiguous, date unparseable, truncated file tail, unknown emulator byte |
| **Info**    | Minor deviation from spec, no user impact                      | Logged at debug level only                         | Separator bytes ≠ 26,26; unknown xid6 tag IDs; has-ID666 byte is neither 0x1A nor 0x1B     |

### 4.2 Core Principle: Metadata Never Blocks Playback

**If the 64KB RAM and DSP registers can be extracted, the file is playable.** All metadata parsing failures (ID666, xid6, encoding errors, corrupt date strings) result in warnings, not errors. Missing metadata fields display as empty strings or "Unknown" in the UI.

The only conditions that produce a fatal error are:

1. Magic number mismatch (not an SPC file).
2. File too small to contain RAM + DSP registers.
3. File exceeds the size limit.

### 4.3 Known Malformations to Tolerate

Based on analysis of real SPC archives (SNES Music, Zophar's Domain, SMW Central):

| Malformation                                              | Prevalence  | Handling                                                   |
| --------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| Missing separator bytes (0x21–0x22)                       | Rare        | Ignore — these bytes are cosmetic                          |
| Has-ID666 byte set to 0x1B but tags present               | Occasional  | Parse tags anyway                                          |
| Has-ID666 byte set to values other than 0x1A/0x1B         | Rare        | Parse tags anyway                                          |
| Garbage after null terminators in string fields           | Very common | Ignore (stop at first null)                                |
| Song length = 0 (text or binary)                          | Common      | Use default (180s)                                         |
| Fade length = 0                                           | Common      | Use default (10,000ms)                                     |
| All-zero ID666 fields                                     | Common      | Display as empty                                           |
| Date field with non-date content                          | Occasional  | Return null, no error                                      |
| File truncated at exactly 0x10100 (missing DSP registers) | Very rare   | **Fatal** — DSP registers are required for playback        |
| IPL ROM missing (file ends at 0x101C0)                    | Rare        | Zero-fill IPL. Most SPCs don't use the IPL ROM after boot. |
| xid6 chunk size exceeds remaining file                    | Rare        | Clamp to available data                                    |
| xid6 sub-chunk data length misaligned                     | Rare        | Attempt to continue; break on read-past-end                |

### 4.4 Parsing Result Structure

The parser returns a result object using the `Result` type (per ADR-0015). Warnings are carried inside `SpcFile` itself, not on the result wrapper:

```typescript
type SpcParseResult = Result<SpcFile, SpcParseError>;
// Warnings live in SpcFile.warnings, not duplicated on the result.
```

This ensures the caller always knows whether parsing succeeded. Warnings are accessed via `spcFile.warnings` after unwrapping.

---

## 5. Security Considerations

### 5.1 Maximum File Size

Enforce `SPC_MAX_ACCEPTED_SIZE` (128 KB) as the first check before any parsing. This prevents:

- Memory exhaustion from large file uploads.
- Denial-of-service from pathologically large files.
- Buffer over-read from crafted files with misleading size fields.

Check the file size from the `File` object's `.size` property before calling `arrayBuffer()` or reading any data:

```typescript
function validateFileSize(file: File): SpcParseError | null {
  if (file.size > SPC_MAX_ACCEPTED_SIZE) {
    return spcParseError('SPC_TOO_LARGE', {
      fileSize: file.size,
      maxSize: SPC_MAX_ACCEPTED_SIZE,
    });
  }
  if (file.size < SPC_MIN_PLAYABLE_SIZE) {
    return spcParseError('SPC_TRUNCATED', {
      fileSize: file.size,
      minSize: SPC_MIN_PLAYABLE_SIZE,
    });
  }
  return null;
}
```

The caller uses the guard pattern:

```typescript
const sizeError = validateFileSize(file);
if (sizeError) {
  return { ok: false, error: sizeError };
}
```

### 5.2 No Dynamic Execution from File Data

No byte from the SPC file is ever:

- Passed to `eval()`, `Function()`, `setTimeout(string)`, or `new URL()` without validation.
- Used to construct HTML via `innerHTML`.
- Used as a JavaScript identifier, property name, or CSS value without sanitization.
- Interpreted as executable code in any context.

SPC data is pure binary input. String fields are decoded and displayed as text content only.

### 5.3 String Sanitization for Display

Even in a React application (which auto-escapes JSX), apply defense-in-depth sanitization to all decoded string fields before they enter the Zustand store:

```typescript
function sanitizeForDisplay(str: string): string {
  // Remove null bytes that made it through decoding
  let result = str.replace(/\0/g, '');

  // Remove control characters (0x00–0x1F and 0x7F).
  // This includes \t (0x09), \n (0x0A), \r (0x0D) — SPC metadata fields
  // are single-line strings, so tabs and newlines are stripped.
  result = result.replace(/[\x00-\x1F\x7F]/g, '');

  // Strip Unicode BiDi override/embedding characters that could be used
  // for text reordering attacks (e.g., displaying filenames or metadata
  // in misleading order).
  result = result.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');

  // Trim result
  result = result.trim();

  return result;
}
```

**Note:** We do NOT HTML-escape here. React's JSX rendering handles HTML escaping automatically. Manually double-escaping would display literal `&amp;` entities in the UI. The sanitization above is specifically about removing control characters (including tabs and newlines — SPC metadata fields are single-line), null bytes, and BiDi override characters that could cause display issues or be used for Unicode-based attacks.

### 5.4 Memory Allocation Bounds

- All `Uint8Array.slice()` calls are bounded by the file's actual length.
- No variable-length field (xid6 chunk data) may exceed 65,536 bytes.
- The xid6 parser has a hard iteration limit of 1,000 sub-chunks.
- All `DataView` reads specify explicit byte offsets and are bounds-checked against the buffer length before access.

### 5.5 Bounds-Checking Pattern

Every read from the `Uint8Array` must be guarded:

```typescript
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
  // A plain bitwise-OR expression (data[off] | data[off+1] << 8 | ...)
  // would produce a signed int32 when the high byte >= 0x80.
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  return view.getUint32(0, true);
}
```

These helpers are used throughout the parser to ensure no out-of-bounds reads.

---

## 6. TypeScript Types

### 6.1 Core SPC File Interface

```typescript
/** Complete parsed SPC file data. */
interface SpcFile {
  /** Raw SPC700 64KB RAM. Transferred to WASM for emulation. */
  readonly ram: Uint8Array; // Always exactly 65,536 bytes

  /** DSP register snapshot (128 bytes). Transferred to WASM for emulation. */
  readonly dspRegisters: Uint8Array; // Always exactly 128 bytes

  /** IPL ROM (64 bytes). May be zero-filled if file was truncated. */
  readonly iplRom: Uint8Array; // Always exactly 64 bytes

  /** SPC700 CPU initial register state. */
  readonly cpuRegisters: SpcCpuRegisters;

  /** Parsed metadata from ID666 and xid6 tags. */
  readonly metadata: SpcMetadata;

  /** Default channel disable bitmask from header. */
  readonly defaultChannelDisables: number; // 0x00–0xFF, bit N = voice N disabled

  /** Parsing warnings encountered (non-fatal issues). */
  readonly warnings: readonly SpcParseWarning[];
}

/** SPC700 CPU register state as stored in the file header. */
interface SpcCpuRegisters {
  readonly pc: number; // 16-bit program counter
  readonly a: number; // 8-bit accumulator
  readonly x: number; // 8-bit X index
  readonly y: number; // 8-bit Y index
  readonly sp: number; // 8-bit stack pointer
  readonly psw: number; // 8-bit processor status word
}
```

### 6.2 Metadata Interface

```typescript
/** Merged metadata from ID666 and xid6 (xid6 overrides). */
interface SpcMetadata {
  /** Song title. Empty string if not available. */
  readonly title: string;

  /** Game title. Empty string if not available. */
  readonly gameTitle: string;

  /** Artist/composer name. Empty string if not available. */
  readonly artist: string;

  /** Name of the person who dumped this SPC. Empty string if not available. */
  readonly dumperName: string;

  /** Comments. Empty string if not available. */
  readonly comments: string;

  /** Dump date, normalized to ISO 8601 (YYYY-MM-DD) when parseable.
   *  May be a raw string if only partially parseable, or null if absent. */
  readonly dumpDate: string | null;

  /** Emulator used for dumping. */
  readonly emulatorUsed: string;

  /** Song play duration in seconds (before fade starts).
   *  Default: 180 if not specified in file. */
  readonly songLengthSeconds: number;

  /** Fade duration in milliseconds.
   *  Default: 10000 if not specified in file. */
  readonly fadeLengthMs: number;

  /** OST (Official Soundtrack) title. Null if not available (xid6 only). */
  readonly ostTitle: string | null;

  /** OST disc number. Null if not available (xid6 only). */
  readonly ostDisc: number | null;

  /** OST track number. Null if not available (xid6 only). */
  readonly ostTrack: number | null;

  /** Publisher. Null if not available (xid6 only). */
  readonly publisher: string | null;

  /** Copyright year. Null if not available (xid6 only). */
  readonly copyrightYear: number | null;

  /**
   * Timing from xid6, if present. When available, these override
   * the simple songLength/fadeLength. All values in 1/64000th second ticks.
   */
  readonly xid6Timing: Xid6Timing | null;

  /** Source format detection result. */
  readonly id666Format: 'text' | 'binary';
}

/** Extended timing data from xid6 tags. */
interface Xid6Timing {
  /** Intro (non-looping) length in ticks. */
  readonly introLengthTicks: number;

  /** Single loop iteration length in ticks. */
  readonly loopLengthTicks: number;

  /** End (post-loop, pre-fade) length in ticks. */
  readonly endLengthTicks: number;

  /** Fade length in ticks. */
  readonly fadeLengthTicks: number;

  /** Number of loop iterations. Null when xid6 tag 0x35 is absent. */
  readonly loopCount: number | null;
}
```

### 6.3 Raw Tag Types

```typescript
/** Raw ID666 tag values before merging with xid6. */
interface Id666Tags {
  readonly title: string;
  readonly gameTitle: string;
  readonly dumperName: string;
  readonly comments: string;
  readonly dumpDate: string | null;
  readonly songLengthSeconds: number | null;
  readonly fadeLengthMs: number | null;
  readonly artist: string;
  readonly defaultChannelDisables: number;
  readonly emulatorUsed: number;
  readonly detectedFormat: 'text' | 'binary';
}

/** Raw xid6 tag values. Only fields present in the xid6 block are set. */
interface Xid6Tags {
  title?: string;
  gameTitle?: string;
  artist?: string;
  dumperName?: string;
  dumpDate?: string | null;
  emulatorUsed?: number;
  comments?: string;
  ostTitle?: string;
  ostDisc?: number;
  ostTrack?: number;
  publisher?: string;
  copyrightYear?: number;
  introLengthTicks?: number;
  loopLengthTicks?: number;
  endLengthTicks?: number;
  fadeLengthTicks?: number;
  mutedVoices?: number;
  loopCount?: number;
  amplificationLevel?: number;
}
```

### 6.4 Error and Warning Types

```typescript
/** Error codes for fatal parsing failures (SPC_ prefix per ADR-0015). */
type SpcParseErrorCode =
  | 'SPC_TRUNCATED'
  | 'SPC_TOO_LARGE'
  | 'SPC_INVALID_HEADER'
  | 'SPC_READ_ERROR';

/** Fatal parsing error — file cannot be loaded (per ADR-0015). */
interface SpcParseError {
  readonly code: SpcParseErrorCode;
  readonly message: string;
  /** Structured context for diagnostics (per ADR-0015). */
  readonly context?: Record<string, unknown>;
}

/**
 * Error factory function (per ADR-0015 Rule 5).
 * Centralizes error construction and enforces consistent messages.
 */
function spcParseError(
  code: SpcParseErrorCode,
  context?: Record<string, unknown>,
): SpcParseError {
  const messages: Record<SpcParseErrorCode, string> = {
    SPC_TRUNCATED: 'File is too small to be a valid SPC file.',
    SPC_TOO_LARGE: 'File exceeds the maximum accepted SPC file size.',
    SPC_INVALID_HEADER: 'File does not have a valid SPC header.',
    SPC_READ_ERROR: 'Failed to read file data.',
  };
  return { code, message: messages[code], ...(context ? { context } : {}) };
}

/** Warning codes for non-fatal issues (SPC_ prefix per ADR-0015). */
type SpcParseWarningCode =
  | 'SPC_TRUNCATED_FILE'
  | 'SPC_AMBIGUOUS_FORMAT'
  | 'SPC_ENCODING_FALLBACK'
  | 'SPC_UNPARSEABLE_DATE'
  | 'SPC_INVALID_DURATION'
  | 'SPC_UNKNOWN_XID6_TAG'
  | 'SPC_XID6_TRUNCATED'
  | 'SPC_MALFORMED_HEADER'
  | 'SPC_MISSING_TAGS';

/** Non-fatal parsing warning. */
interface SpcParseWarning {
  readonly code: SpcParseWarningCode;
  readonly message: string;
  /** Field that triggered the warning, if applicable. */
  readonly field?: string;
}

/** Parser output: success with SpcFile (which contains warnings), or failure.
 *  Warnings live in SpcFile.warnings, not on the result wrapper. */
type SpcParseResult = Result<SpcFile, SpcParseError>;
```

---

## 7. Data Flow

### 7.1 Where Parsing Runs

**SPC parsing runs on the main thread.**

Rationale:

- Parsing a 66–128 KB file is fast — the entire operation is bounded arithmetic and string decoding on a small buffer. Benchmarks of similar SPC parsers show <1ms for the full parse on modern hardware.
- Moving parsing to a Worker would add complexity (message serialization, transferable handling) without meaningful UX benefit.
- The parsed metadata immediately updates the Zustand store, which is only accessible on the main thread.

If profiling ever reveals parsing as a bottleneck (unlikely for single files; possible for batch import of hundreds of files), parsing can be moved to a Worker without API changes — the `parseSpcFile` function is pure and has no DOM dependencies.

**Future concern — batch/multi-file parsing:** The current design targets single-file parsing. Batch import (e.g., dragging a folder of SPC files) would benefit from Worker-based parallelism to avoid blocking the main thread during sequential parses of many files. This is deferred to a future design iteration; the pure-function architecture of `parseSpcFile` ensures it can be lifted into a Worker without API changes when needed.

### 7.2 High-Level Parse and Load Flow

```
User drops/selects file
  → File API: read File as ArrayBuffer
  → Validate file size (§5.1)
  → parseSpcFile(new Uint8Array(arrayBuffer)): SpcParseResult
       → Validate magic (§1.2)
       → Read CPU registers (§1.4)
       → Detect ID666 format (§2.2)
       → Parse ID666 tags (§2.3–2.6)
       → Extract RAM, DSP registers, IPL ROM
       → Parse xid6 if present (§3)
       → Merge metadata (xid6 overrides ID666)
       → Return SpcFile (with warnings inside SpcFile)
  → If ok: dispatch to Zustand store and audio engine
  → If error: display error to user
```

### 7.3 Data Flow to the Emulator

The emulator (snes-apu-spcp compiled to WASM, per ADR-0001) takes as input:

- 64 KB of SPC700 RAM
- 128 bytes of DSP register values
- CPU register initial values (PC, A, X, Y, SP, PSW)

Per ADR-0003 and ADR-0007, the loading flow is:

```
Main thread:
  1. parseSpcFile() → SpcFile
  2. Obtain WASM memory pointers via exported alloc functions
  3. Copy SpcFile.ram (64KB) into WASM linear memory
  4. Copy SpcFile.dspRegisters (128 bytes) into WASM linear memory
  5. Call dsp_init() with pointer and CPU register values
  6. Send compiled WebAssembly.Module to AudioWorklet via postMessage
  7. Worklet instantiates WASM module and begins rendering
```

**Transferable ArrayBuffers:** The raw `ArrayBuffer` from `File.arrayBuffer()` is not transferred — it is copied into WASM linear memory. Transfer is not beneficial here because the WASM module's linear memory is the final destination, and `WebAssembly.Memory` buffers cannot be transferred (they are not detachable). The 64 KB copy is negligible in cost.

### 7.4 Metadata Flow to the Store

After successful parsing, metadata flows to the Zustand `metadata` slice (per ADR-0005):

```typescript
// In the file-loading orchestration code:
const result = parseSpcFile(new Uint8Array(arrayBuffer));
if (!result.ok) {
  // Surface error to user (error handling strategy per ADR-0015)
  return;
}

const spcFile = result.value;

// Update Zustand store — cross-slice action (per ADR-0005)
// Warnings are accessed via spcFile.warnings.
useStore.getState().loadTrack({
  metadata: spcFile.metadata,
  defaultChannelDisables: spcFile.defaultChannelDisables,
  warnings: spcFile.warnings,
});
```

The `loadTrack` action is a cross-slice orchestration action that atomically updates:

- `metadata` slice: populates all tag fields
- `playback` slice: resets to stopped, sets active track
- `mixer` slice: applies `defaultChannelDisables` as initial voice mute state

### 7.5 Complete Data Flow Diagram

```
┌─────────────┐
│  User drops  │
│  .spc file   │
└──────┬──────┘
       │ File API
       ▼
┌─────────────────────┐
│  Size validation     │ → REJECT if out of bounds
│  (§5.1)             │
└──────┬──────────────┘
       │ ArrayBuffer
       ▼
┌─────────────────────┐
│  parseSpcFile()      │ → REJECT if magic fails
│  (main thread)       │
│                     │
│  ┌─────────────┐    │
│  │ Magic check  │    │
│  │ CPU regs     │    │
│  │ ID666 detect │    │
│  │ ID666 parse  │    │
│  │ RAM extract  │    │
│  │ DSP extract  │    │
│  │ xid6 parse   │    │
│  │ Merge meta   │    │
│  └─────────────┘    │
│                     │
│  Output: SpcFile    │
│  (warnings inside)  │
└──────┬──────────────┘
       │
       ├──────────────────────────────┐
       │                              │
       ▼                              ▼
┌──────────────┐            ┌──────────────────┐
│ Zustand store │            │ WASM linear mem   │
│               │            │                  │
│ metadata      │            │ RAM (64KB)       │
│   slice       │            │ DSP regs (128B)  │
│               │            │ CPU regs         │
│ playback      │            │                  │
│   slice       │            │ → dsp_init()     │
│               │            │                  │
│ mixer         │            │ → AudioWorklet   │
│   slice       │            │   postMessage    │
└──────────────┘            └──────────────────┘
```

---

## 8. Implementation Notes

### 8.1 Module Organization

Per the architecture doc's file organization plan:

```
src/core/
  spc-parser.ts          # Main parse function: parseSpcFile()
  spc-parser.test.ts     # Unit tests (colocated)
  spc-types.ts           # All TypeScript types from §6
  spc-constants.ts       # Magic bytes, offsets, size limits, defaults
  id666.ts               # ID666 tag parsing (text + binary format)
  id666.test.ts
  xid6.ts                # xid6 extended tag parsing
  xid6.test.ts
  encoding.ts            # String decoding, sanitization
  encoding.test.ts
```

### 8.2 Pure Function Design

`parseSpcFile` is a pure function: `(data: Uint8Array) → SpcParseResult`. It has no side effects, no DOM access, no imports from React or Zustand. This makes it trivially testable and movable to a Worker if needed.

### 8.3 Test Strategy

The parser requires thorough testing because it processes untrusted binary data:

- **Golden file tests:** Collect a corpus of real SPC files covering text format, binary format, Shift-JIS titles, xid6 tags, truncated files, and edge cases. Parse each and assert extracted metadata against known-good values.
- **Crafted binary tests:** Construct `Uint8Array` buffers programmatically to test specific edge cases: zero-length strings, maximum-length strings, field-full-no-null, all-zero fields, corrupt xid6, integer overflow in length fields, every encoding fallback path.
- **Fuzz-adjacent tests:** Generate random bytes with a valid magic header and assert the parser never throws — it must always return either a success result or a structured error.
- **Encoding tests:** Test the UTF-8 → Shift-JIS → Latin-1 cascade with known byte sequences for each encoding, including sequences that are valid in one encoding but not another.

### 8.4 Performance Expectations

Parsing a single SPC file (66 KB, no xid6) should complete in <1ms on modern hardware. The parser performs:

- 33-byte comparison (magic)
- ~10 single-byte reads (registers)
- ~5 string decodes of 16–32 bytes each
- 3 short numeric parses
- 1 date parse
- 3 large `Uint8Array.slice()` calls (64KB, 128B, 64B)

No optimization is expected to be necessary. The dominant cost is the 64KB RAM slice, which is a single memcpy-equivalent operation.

---

## Appendix A: Offset Quick Reference

| Offset  | Size  | Content                           |
| ------- | ----- | --------------------------------- |
| 0x0000  | 33    | Magic header string               |
| 0x0021  | 2     | Separator bytes (26, 26)          |
| 0x0023  | 1     | Has ID666 (0x1A=yes, 0x1B=no)     |
| 0x0024  | 1     | Version minor                     |
| 0x0025  | 2     | SPC700 PC                         |
| 0x0027  | 1     | SPC700 A                          |
| 0x0028  | 1     | SPC700 X                          |
| 0x0029  | 1     | SPC700 Y                          |
| 0x002A  | 1     | SPC700 PSW                        |
| 0x002B  | 1     | SPC700 SP                         |
| 0x002C  | 2     | Reserved                          |
| 0x002E  | 32    | Title                             |
| 0x004E  | 32    | Game title                        |
| 0x006E  | 16    | Dumper name                       |
| 0x007E  | 32    | Comments                          |
| 0x009E  | 11    | Dump date (text) / 4+7 (binary)   |
| 0x00A9  | 3     | Song length                       |
| 0x00AC  | 5     | Fade length (text) / 4+1 (binary) |
| 0x00B1  | 32    | Artist                            |
| 0x00D1  | 1     | Default channel disables          |
| 0x00D2  | 1     | Emulator used                     |
| 0x00D3  | 45    | Reserved                          |
| 0x0100  | 65536 | SPC700 RAM                        |
| 0x10100 | 128   | DSP registers                     |
| 0x10180 | 64    | Unused / extra RAM                |
| 0x101C0 | 64    | IPL ROM                           |
| 0x10200 | ≥8    | xid6 header (if present)          |

## Appendix B: Emulator Used Values

| Byte | Name       |
| ---- | ---------- |
| 0x00 | Unknown    |
| 0x01 | ZSNES      |
| 0x02 | Snes9x     |
| 0x03 | ZST2SPC    |
| 0x04 | ETC        |
| 0x05 | SNEShout   |
| 0x06 | ZSNES / W  |
| 0x07 | Snes9x / W |

## Appendix C: xid6 Tag ID Quick Reference

| ID   | Name           | Type    | Storage         |
| ---- | -------------- | ------- | --------------- |
| 0x01 | Song name      | String  | Variable        |
| 0x02 | Game name      | String  | Variable        |
| 0x03 | Artist         | String  | Variable        |
| 0x04 | Dumper         | String  | Variable        |
| 0x05 | Dump date      | Integer | Inline (32-bit) |
| 0x06 | Emulator       | Integer | Inline (byte)   |
| 0x07 | Comments       | String  | Variable        |
| 0x10 | OST title      | String  | Variable        |
| 0x11 | OST disc       | Integer | Inline (byte)   |
| 0x12 | OST track      | Integer | Variable        |
| 0x13 | Publisher      | String  | Variable        |
| 0x14 | Copyright year | Integer | Inline (32-bit) |
| 0x30 | Intro length   | Integer | Inline (32-bit) |
| 0x31 | Loop length    | Integer | Inline (32-bit) |
| 0x32 | End length     | Integer | Inline (32-bit) |
| 0x33 | Fade length    | Integer | Inline (32-bit) |
| 0x34 | Muted voices   | Integer | Inline (byte)   |
| 0x35 | Loop count     | Integer | Inline (32-bit) |
| 0x36 | Mixing level   | Integer | Inline (32-bit) |
