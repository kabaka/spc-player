# SNES Hardware Reference

## Key Technical References

- [Super Famicom Development Wiki](https://wiki.superfamicom.org/)
- bsnes/higan source code — most accurate SNES emulator
- ares emulator — successor to higan
- fullsnes by nocash — comprehensive SNES hardware documentation
- anomie's SNES docs — detailed register documentation

## SPC700 Instruction Timing

Most SPC700 instructions take 2–8 cycles. Key cycles:

- MOV: 3–5 cycles depending on addressing mode.
- ADC/SBC: 3–5 cycles.
- Branch: 2 cycles (not taken), 4 cycles (taken).
- CALL: 8 cycles. RET: 5 cycles.
- MUL: 9 cycles. DIV: 12 cycles.

Exact cycle counts are important for accurate timer emulation and DSP synchronization.

## IPL ROM Function

The 64-byte IPL ROM performs initial program loading:

1. Waits for port 0 transfer request from main CPU.
2. Receives transfer address and data via ports.
3. Writes data to SPC RAM.
4. Jumps to entry point when transfer is complete.

During SPC file playback, the IPL ROM is typically present but execution starts at the SPC700 PC from the file header, not from the IPL entry point. Some sound drivers disable IPL ROM mapping.

## Common Sound Drivers

- **N-SPC** (Kankichi-kun): used by many first-party Nintendo games. Written by Kenji Yamamoto.
- **Custom drivers**: many third-party games used custom sound drivers with varying capabilities.
- Identifying the sound driver can help understand SPC behavior and anticipate quirks.
