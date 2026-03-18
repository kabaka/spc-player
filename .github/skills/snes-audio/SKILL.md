---
name: snes-audio
description: S-DSP and SPC700 audio subsystem — BRR decoding, Gaussian interpolation, ADSR, echo, noise, and pitch modulation.
---

# SNES Audio Subsystem

Use this skill when implementing or reviewing S-DSP emulation, SPC700 CPU emulation, or any SNES audio processing.

## Architecture

The SNES audio subsystem consists of:

- **SPC700**: 8-bit CPU running the sound driver. Executes from 64KB RAM.
- **S-DSP**: digital signal processor generating audio. 8 voices, 32 kHz stereo output.
- **BRR decoder**: decompresses 4-bit ADPCM samples to 16-bit PCM.
- **IPL ROM**: 64-byte boot ROM for initial program transfer from the main CPU.

## S-DSP Processing Pipeline (per sample)

1. For each of the 8 voices:
   a. Decode BRR sample block (if new samples needed).
   b. Apply Gaussian interpolation (4-point, using 512-entry lookup table).
   c. Apply envelope (ADSR or GAIN mode).
   d. Apply voice volume (left/right).
   e. Optionally apply pitch modulation from previous voice.
2. Mix all voices to stereo output.
3. Apply echo processing:
   a. Read from echo buffer (circular, configurable delay).
   b. Apply 8-tap FIR filter.
   c. Mix echo with main output.
   d. Write new echo sample (voice output × echo enable mask + feedback).
4. Apply main volume.
5. Output 16-bit stereo sample.

## BRR (Bit Rate Reduction)

- 9 bytes per block: 1 header + 8 data bytes = 16 samples.
- Header: 2-bit filter, 4-bit shift/range, end flag, loop flag.
- Four filter modes: direct, 1-tap, 2-tap (two variants).
- Loop point stored in sample directory (pointer table at DIR×256 in RAM).

## ADSR / GAIN Envelope

ADSR mode (when ADSR1 bit 7 set):

- Attack rate: 4-bit (0–15), determines attack speed.
- Decay rate: 3-bit (0–7).
- Sustain level: 3-bit (0–7), maps to level/8.
- Sustain rate: 5-bit (0–31), determines release speed.

GAIN mode (when ADSR1 bit 7 clear):

- Direct set, linear increase, bent-line increase, linear decrease, exponential decrease.

## Gaussian Interpolation

Uses a fixed 512-entry symmetric table. Interpolates between 4 consecutive BRR-decoded samples based on sub-sample position. The table is well-documented in bsnes/higan source.

## Echo

- Circular buffer in SPC RAM at ESA×256, length EDL×2048 bytes.
- 8-tap FIR filter with signed 8-bit coefficients.
- Feedback loop with signed volume.
- Echo write can be disabled (FLG bit 5) to preserve RAM contents.

## References

See `references/` for DSP register details and timing information.
