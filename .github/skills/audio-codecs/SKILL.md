---
name: audio-codecs
description: Browser-compatible audio encoding — WAV, FLAC, OGG Vorbis, MP3 — for SPC export functionality.
---

# Audio Codecs

Use this skill when implementing SPC-to-audio export features.

## Export Format Matrix

| Format     | Container | Lossy | Browser Encode | File Size | Metadata        |
| ---------- | --------- | ----- | -------------- | --------- | --------------- |
| WAV        | RIFF      | No    | Native (easy)  | Large     | Minimal         |
| FLAC       | FLAC/OGG  | No    | Library needed | Medium    | Vorbis comments |
| OGG Vorbis | OGG       | Yes   | Library needed | Small     | Vorbis comments |
| MP3        | MP3       | Yes   | Library needed | Small     | ID3v2           |

## WAV Encoding

WAV is the simplest to encode — just write a RIFF header + raw PCM data.

```
RIFF header (44 bytes):
  "RIFF" + file size + "WAVE"
  "fmt " + 16 + format(1=PCM) + channels + sampleRate + byteRate + blockAlign + bitsPerSample
  "data" + data size + raw PCM samples (little-endian)
```

- Always use little-endian byte order.
- 16-bit PCM is the standard choice.
- No external libraries needed.

## FLAC Encoding

- Use a WASM-compiled FLAC encoder (e.g., libFLAC compiled to WASM).
- Compression levels 0–8; level 5 is a good default (balanced speed/size).
- Supports Vorbis comment metadata for embedding track info.

## OGG Vorbis Encoding

- Use a WASM-compiled libvorbis or pure JS implementation.
- Quality settings: -1 to 10. Quality 6 (~192kbps) is a good default.
- Supports Vorbis comment metadata natively.

## MP3 Encoding

- Use a WASM-compiled LAME encoder.
- VBR quality 0–9 (0 = best). V2 (~190kbps) is a good default.
- ID3v2 tags for metadata.
- Note: MP3 patents have expired; no licensing concerns.

## Implementation Pattern

1. Render SPC audio to a PCM buffer (Float32Array or Int16Array).
2. Pass buffer to the selected encoder.
3. Collect encoded output as a Blob.
4. Trigger download via `URL.createObjectURL()` + `<a download>`.

## Metadata to Include

- Title (from ID666/xid6 tag)
- Artist / Game
- Duration
- Dumper info
- Comment: "Exported by SPC Player"

## Performance

- Encoding can be CPU-intensive. Run in a Web Worker to avoid blocking the main thread.
- Show progress for long renders.
- Allow cancellation of in-progress exports.
