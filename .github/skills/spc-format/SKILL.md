---
name: spc-format
description: SPC file format structure, ID666 tags, xid6 extended tags, memory layout, and parsing requirements.
---

# SPC File Format

Use this skill when parsing, validating, or displaying SPC file data. Cross-reference with actual SPC format documentation for any details not covered here.

## File Structure

| Offset | Size | Content |
| ------ | ---- | ------- |
| 0x00 | 33 | Header: "SNES-SPC700 Sound File Data v0.30" |
| 0x21 | 2 | 26, 26 |
| 0x23 | 1 | Has ID666 tag (0x1A = yes, 0x1B = no) |
| 0x24 | 1 | Version minor |
| 0x25 | 2 | SPC700 PC register |
| 0x27 | 1 | A register |
| 0x28 | 1 | X register |
| 0x29 | 1 | Y register |
| 0x2A | 1 | PSW (flags) |
| 0x2B | 1 | SP (stack pointer) |
| 0x2C | 2 | Reserved |
| 0x2E | 32 | ID666 title |
| 0x4E | 32 | ID666 game title |
| 0x6E | 16 | ID666 dumper name |
| 0x7E | 32 | ID666 comments |
| 0x9E | 11 | ID666 dump date |
| 0xA9 | 3 | ID666 song length (seconds, text or binary) |
| 0xAC | 5 | ID666 fade length (milliseconds, text or binary) |
| 0xB1 | 32 | ID666 artist |
| 0xD1 | 1 | Default channel disables |
| 0xD2 | 1 | Emulator used for dump |
| 0xD3 | 45 | Reserved |
| 0x100 | 65536 | SPC700 64KB RAM |
| 0x10100 | 128 | DSP registers |
| 0x10180 | 64 | Unused (extra RAM or IPL region) |
| 0x101C0 | 64 | IPL ROM |

## ID666 Encoding

- Text format vs. binary format is ambiguous in the spec. Detection heuristics are needed:
  - Check if date field looks like text (ASCII digits) or binary.
  - Check if length fields parse as text numbers or binary integers.
- String fields may be null-terminated or space-padded.
- Character encoding is typically ASCII or Shift-JIS. Handle both.

## xid6 (Extended ID666)

Extended tags appear after offset 0x10200 if present. Structured as a chunk-based format:

- 4-byte header: "xid6"
- 4-byte chunk size
- Chunks: ID (2 bytes), type (1 byte), data length (1 byte for fixed, 4 bytes for variable), data.

Provides: OST title, publisher, copyright year, intro length, loop length, end length, and more.

## Parsing Safety

- Validate header magic bytes before parsing.
- Bounds-check all offset calculations.
- Sanitize string fields for display (escape HTML entities if rendering in DOM).
- Handle missing or corrupted ID666 gracefully (show "Unknown" for missing fields).
- Detect and handle both text and binary ID666 formats.

## References

See `references/` for detailed format documentation.
