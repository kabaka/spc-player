# SNES Audio Reference — Key Constants and Tables

## Gaussian Interpolation Table

The Gaussian interpolation table is a 512-entry symmetric table. Each entry is a signed 12-bit value. The table is indexed by the fractional part of the sample position (12-bit, 0–4095 mapped to 0–255 table index).

Four table values are used per interpolation:

```text
out = (gauss[255-i] * sample[n-3] +
       gauss[511-i] * sample[n-2] +
       gauss[256+i] * sample[n-1] +
       gauss[i]     * sample[n]) >> 11
```

Where `i` is the interpolation index (upper 8 bits of fractional position).

Reference implementations: bsnes/higan `SPC_DSP::run()`, blargg's `SPC_DSP.cpp`.

## BRR Filter Coefficients

| Filter | Coefficient 1 | Coefficient 2 |
| ------ | ------------- | ------------- |
| 0      | 0             | 0             |
| 1      | 15/16         | 0             |
| 2      | 61/32         | -15/16        |
| 3      | 115/64        | -13/16        |

Applied as: `sample = (nibble << shift) + (prev1 * c1) + (prev2 * c2)`

Note: actual implementation uses fixed-point arithmetic with specific clipping behavior.

## ADSR Rate Table

Attack, decay, and sustain rates index into a timing table that determines how many 32 kHz samples pass between envelope updates. The table has 32 entries.

Rate 0 = infinity (no change). Rate 31 = fastest.

## Noise LFSR

The noise generator uses a 15-bit LFSR with polynomial: `bit0 = bit1 XOR bit12`. The output is the top bit of the LFSR, sign-extended to 16 bits. Clock rate is controlled by FLG bits 0–4.

## Echo FIR

Eight signed 8-bit coefficients (C0–C7) at DSP registers $0F, $1F, $2F, $3F, $4F, $5F, $6F, $7F.

```text
echo_output = sum(fir[i] * echo_buffer[oldest + i]) >> 6
```

Where `oldest` is the oldest sample in the echo ring buffer.

## Key Emulation References

- bsnes/higan by byuu — cycle-accurate SNES emulation
- ares by Near — successor to higan
- SPC_DSP by blargg (Shay Green) — clean, portable DSP implementation
- snes9x — widely-used emulator with DSP implementation
