---
name: audio-fundamentals
description: PCM audio concepts, sample rates, bit depth, dithering, resampling, and digital audio theory.
---

# Audio Fundamentals

Use this skill when working with audio data, sample rate conversion, bit depth, or audio quality decisions.

## PCM Audio

- Audio is represented as a sequence of amplitude samples at a fixed rate.
- Sample rate: number of samples per second (Hz). Higher = more bandwidth.
- Bit depth: precision of each sample. Higher = more dynamic range.
- Channels: mono (1), stereo (2).

## Key Sample Rates

| Rate      | Use                             |
| --------- | ------------------------------- |
| 32,000 Hz | SNES DSP native output          |
| 44,100 Hz | CD quality, common web default  |
| 48,000 Hz | DVD, most modern audio hardware |
| 96,000 Hz | High-resolution audio           |

## Resampling

Converting from 32 kHz (native) to output rate (44.1/48 kHz) requires interpolation.

- **Nearest-neighbor**: fast, poor quality (aliasing).
- **Linear**: fast, acceptable quality.
- **Sinc interpolation**: high quality, more CPU. Variants include windowed sinc (Lanczos, Kaiser).
- **Polyphase filter**: efficient implementation of sinc for fixed-ratio conversion.

For SPC Player: use at least linear for real-time, sinc for export.

## Bit Depth

- S-DSP produces 16-bit signed integer samples.
- Web Audio API uses 32-bit float internally.
- Export formats: 16-bit int (WAV/FLAC standard), 24-bit int (high quality), 32-bit float.
- Converting 16-bit int to float: divide by 32768.0.

## Dithering

When reducing bit depth (e.g., float to 16-bit for export), add dithering to avoid quantization distortion. TPDF (Triangular Probability Density Function) dithering is standard.

## Clipping

- Samples must stay within [-1.0, 1.0] (float) or [-32768, 32767] (16-bit int).
- Hard clipping introduces distortion. Normalize or soft-clip if levels exceed range.
- S-DSP can produce samples that overflow — emulate hardware clipping behavior.

## Latency

- Audio latency = buffer size / sample rate.
- Smaller buffers = lower latency but higher CPU cost and risk of underrun (glitches).
- Target: 256–512 samples at 48 kHz = 5–10ms.
- AudioWorklet processes 128 frames at a time by default.
