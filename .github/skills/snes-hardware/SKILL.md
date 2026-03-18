---
name: snes-hardware
description: SNES system architecture, memory map, timing, and hardware behavior relevant to audio emulation.
---

# SNES Hardware

Use this skill when dealing with SNES system-level concerns that affect audio emulation accuracy.

## System Overview

- **Main CPU**: Ricoh 5A22 (65C816-based), ~3.58 MHz (NTSC) / ~3.55 MHz (PAL).
- **Audio CPU**: Sony SPC700, ~1.024 MHz.
- **Audio DSP**: Sony S-DSP, sample rate 32 kHz.
- **Audio RAM**: 64 KB shared between SPC700 and DSP.
- **Communication**: 4 bidirectional I/O ports between main CPU and SPC700.

## SPC700 CPU

- 8-bit CPU with 16-bit address space (64 KB).
- Instruction set similar to 6502 but with differences (different mnemonics, different addressing modes).
- Three 8-bit timers (T0, T1 at ~8 kHz; T2 at ~64 kHz).
- Stack in RAM page 1 (0x0100–0x01FF).
- IPL ROM mapped at 0xFFC0–0xFFFF (can be switched out via control register).

## Audio Memory Map

| Range | Content |
| ----- | ------- |
| 0x0000–0x00EF | Zero page (direct page) |
| 0x00F0–0x00FF | Hardware registers (ports, timers, control) |
| 0x0100–0x01FF | Stack |
| 0x0200–0xFFBF | General-purpose RAM |
| 0xFFC0–0xFFFF | IPL ROM or RAM (switchable) |

## Key Registers

| Address | Name | Description |
| ------- | ---- | ----------- |
| 0x00F0 | TEST | Test register (write-only, undocumented) |
| 0x00F1 | CONTROL | Timer enable, IPL ROM enable, port clear |
| 0x00F2 | DSPADDR | DSP register address |
| 0x00F3 | DSPDATA | DSP register data |
| 0x00F4–0x00F7 | CPUIO0–3 | I/O ports (communication with main CPU) |
| 0x00FA–0x00FC | TnDIV | Timer divisors |
| 0x00FD–0x00FF | TnOUT | Timer outputs (read-only, clears on read) |

## Timing

- SPC700 clock: 1,024,000 Hz.
- DSP sample rate: 32,000 Hz (every 32 SPC700 cycles).
- Timer 0 and 1: 8,000 Hz base, divided by TnDIV+1.
- Timer 2: 64,000 Hz base, divided by T2DIV+1.

## Relevance to SPC Playback

For SPC file playback, we only need to emulate:

- SPC700 CPU (to execute the sound driver code in RAM).
- S-DSP (to generate audio output).
- The three timers (sound drivers use these for tempo).
- I/O ports can be ignored (no main CPU communication during standalone playback).

## References

See `references/` for detailed hardware documentation.
