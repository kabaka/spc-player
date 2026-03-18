# SPC Format Quick Reference

## Key Resources

- **SNES Dev Wiki — SPC file format**: https://wiki.superfamicom.org/spc-file-format
- **SNESMusic.org SPC format spec**: community-maintained specification
- **bsnes/higan source**: reference implementation for SPC loading
- **SPC_DSP by blargg (Shay Green)**: widely-used reference DSP implementation

## ID666 Text vs Binary Detection

The ID666 tag format (text or binary) is not explicitly marked. Common heuristics:

1. Examine the date field at offset 0x9E:
   - If it contains ASCII digits and separators ('/', '-'), it's likely text format.
   - If it contains small binary values, it's likely binary format.

2. Examine the song length at offset 0xA9:
   - Text format: ASCII digits representing seconds.
   - Binary format: 3-byte little-endian integer.

3. Cross-check: if text interpretation of one field fails, try binary for all fields.

## DSP Register Map (Condensed)

Voice registers (8 voices, 16-byte stride each starting at 0x00):

| Offset | Name | Description |
| ------ | ---- | ----------- |
| +0x00 | VOLL | Left volume |
| +0x01 | VOLR | Right volume |
| +0x02-03 | P | Pitch (14-bit, little-endian) |
| +0x04 | SRCN | Source (sample) number |
| +0x05 | ADSR1 | ADSR settings 1 |
| +0x06 | ADSR2 | ADSR settings 2 |
| +0x07 | GAIN | GAIN mode settings |
| +0x08 | ENVX | Current envelope value (read-only) |
| +0x09 | OUTX | Current sample output (read-only) |

Global registers:

| Offset | Name | Description |
| ------ | ---- | ----------- |
| 0x0C | MVOLL | Main volume left |
| 0x1C | MVOLR | Main volume right |
| 0x2C | EVOLL | Echo volume left |
| 0x3C | EVOLR | Echo volume right |
| 0x4C | KON | Key on (write-only) |
| 0x5C | KOFF | Key off |
| 0x6C | FLG | Flags (noise clock, echo write, mute, reset) |
| 0x7C | ENDX | Voice end flags (read-only) |
| 0x0D | EFB | Echo feedback volume |
| 0x2D | PMON | Pitch modulation enable |
| 0x3D | NON | Noise enable |
| 0x4D | EON | Echo enable |
| 0x5D | DIR | Sample directory offset (×256) |
| 0x6D | ESA | Echo buffer start (×256) |
| 0x7D | EDL | Echo delay (4-bit, ×16ms) |
| 0x0F-7F | FIR | Echo FIR filter coefficients (8 taps) |
